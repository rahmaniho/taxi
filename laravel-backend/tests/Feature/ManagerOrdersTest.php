<?php

use App\Models\License;
use App\Models\Order;
use App\Models\Store;
use App\Models\SubscriptionInvoice;
use App\Models\SubscriptionPayment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

function ordersManager(): User
{
    return User::factory()->manager()->create();
}

function ordersStore(): Store
{
    $store = Store::factory()->create();
    User::factory()->forStore($store)->create(['email' => 'orders-'.uniqid().'@test.local']);

    return $store;
}

function pendingOrder(Store $store): Order
{
    return Order::create([
        'store_id' => $store->id,
        'plan' => 'pro',
        'tier' => 'pro',
        'type' => Order::TYPE_NEW,
        'months' => 1,
        'seats' => 1,
        'extra_users' => 0,
        'base_monthly' => 60_000,
        'extra_user_monthly' => 15_000,
        'subtotal' => 60_000,
        'discount' => 0,
        'amount' => 60_000,
        'status' => Order::STATUS_PENDING,
        'gateway' => 'manual',
    ]);
}

it('تأیید پرداخت دستی بدون شمارهٔ پیگیری رد می‌شود', function () {
    $order = pendingOrder(ordersStore());
    $manager = ordersManager();

    $this->actingAs($manager)
        ->postJson("/api/manager/orders/{$order->id}/approve", [])
        ->assertStatus(422)
        ->assertJsonValidationErrors('reference');

    expect($order->fresh()->status)->toBe(Order::STATUS_PENDING);
});

it('تأیید پرداخت دستی با پیگیری، اشتراک و فاکتور می‌سازد', function () {
    $store = ordersStore();
    $order = pendingOrder($store);
    $manager = ordersManager();

    $this->actingAs($manager)
        ->postJson("/api/manager/orders/{$order->id}/approve", [
            'reference' => 'BANK-445566',
            'note' => 'رسید واتساپ بررسی شد',
        ])
        ->assertOk()
        ->assertJsonPath('order.status', 'paid');

    $order->refresh();

    expect($order->status)->toBe(Order::STATUS_PAID)
        ->and($order->reference_id)->toBe('BANK-445566');

    expect($store->fresh()->license)->not->toBeNull();
    $this->assertDatabaseHas('subscription_invoices', ['order_id' => $order->id]);
    $this->assertDatabaseHas('subscription_payments', [
        'order_id' => $order->id,
        'status' => SubscriptionPayment::STATUS_PAID,
        'reference_id' => 'BANK-445566',
    ]);
    $this->assertDatabaseHas('audit_logs', ['action' => 'order_manually_approved']);
});

it('تأیید دوبارهٔ همان سفارش انجام نمی‌شود', function () {
    $store = ordersStore();
    $order = pendingOrder($store);
    $manager = ordersManager();

    $this->actingAs($manager)
        ->postJson("/api/manager/orders/{$order->id}/approve", ['reference' => 'BANK-1'])
        ->assertOk();

    $this->actingAs($manager)
        ->postJson("/api/manager/orders/{$order->id}/approve", ['reference' => 'BANK-2'])
        ->assertStatus(422);

    expect(SubscriptionInvoice::count())->toBe(1);
});

it('رد سفارش دلیل می‌خواهد', function () {
    $order = pendingOrder(ordersStore());
    $manager = ordersManager();

    $this->actingAs($manager)
        ->postJson("/api/manager/orders/{$order->id}/reject", [])
        ->assertStatus(422);

    $this->actingAs($manager)
        ->postJson("/api/manager/orders/{$order->id}/reject", ['reason' => 'رسید نامعتبر بود'])
        ->assertOk()
        ->assertJsonPath('order.status', 'canceled');
});

it('ابطال پرداخت با دلیل، فاکتور را باطل می‌کند و اشتراک را خودکار قطع نمی‌کند', function () {
    $store = ordersStore();
    $order = pendingOrder($store);
    $manager = ordersManager();

    $this->actingAs($manager)
        ->postJson("/api/manager/orders/{$order->id}/approve", ['reference' => 'BANK-7788'])
        ->assertOk();

    $license = $store->fresh()->license;
    $expiry = $license->expires_at?->toIso8601String();

    $this->actingAs($manager)
        ->postJson("/api/manager/orders/{$order->id}/void", [])
        ->assertStatus(422);

    $this->actingAs($manager)
        ->postJson("/api/manager/orders/{$order->id}/void", ['reason' => 'پرداخت تکراری مشتری'])
        ->assertOk()
        ->assertJsonPath('order.status', 'voided');

    $order->refresh();

    expect($order->status)->toBe(Order::STATUS_VOIDED)
        ->and($order->void_reason)->toBe('پرداخت تکراری مشتری');

    expect(SubscriptionInvoice::where('order_id', $order->id)->first()->voided_at)->not->toBeNull();
    expect($store->fresh()->license->expires_at?->toIso8601String())->toBe($expiry);

    $this->assertDatabaseHas('subscription_history', [
        'store_id' => $store->id,
        'action' => 'payment_voided',
        'reason' => 'پرداخت تکراری مشتری',
    ]);
    $this->assertDatabaseHas('audit_logs', ['action' => 'order_voided']);
});

it('سفارش در انتظار قابل ابطال نیست', function () {
    $order = pendingOrder(ordersStore());

    $this->actingAs(ordersManager())
        ->postJson("/api/manager/orders/{$order->id}/void", ['reason' => 'آزمون'])
        ->assertStatus(422);
});

it('کاربر فروشگاه به عملیات پرداخت دسترسی ندارد', function () {
    $store = ordersStore();
    $order = pendingOrder($store);
    $user = User::where('store_id', $store->id)->firstOrFail();

    $this->actingAs($user)
        ->postJson("/api/manager/orders/{$order->id}/approve", ['reference' => 'BANK-9'])
        ->assertForbidden();

    $this->actingAs($user)->getJson('/api/manager/orders')->assertForbidden();
});

it('فهرست سفارش‌ها صفحه‌بندی و فیلتر می‌شود', function () {
    $store = ordersStore();
    pendingOrder($store);
    pendingOrder($store);

    $response = $this->actingAs(ordersManager())
        ->getJson('/api/manager/orders?status=pending&limit=1')
        ->assertOk();

    expect($response->json('orders'))->toHaveCount(1)
        ->and($response->json('meta.total'))->toBe(2)
        ->and($response->json('totals.pending'))->toBe(2);
});
