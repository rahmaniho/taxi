<?php

use App\Models\License;
use App\Models\Order;
use App\Models\Store;
use App\Models\SubscriptionCoupon;
use App\Models\SubscriptionInvoice;
use App\Models\SubscriptionPlan;
use App\Models\User;
use App\Services\Billing\PaymentGatewayManager;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Tests\Support\FakeGateway;

uses(RefreshDatabase::class);

/** آژانس با کاربر آمادهٔ خرید. */
function subscriptionStoreUser(array $licenseAttributes = []): array
{
    $store = Store::factory()->create();
    $user = User::factory()->forStore($store)->create([
        'email' => 'sub-'.uniqid().'@test.local',
        'password' => Hash::make('password'),
    ]);

    if ($licenseAttributes !== []) {
        License::create([
            'store_id' => $store->id,
            'tier' => 'proplus',
            'plan_code' => 'monthly',
            'seats' => 1,
            'status' => 'active',
            'is_active' => true,
            'starts_at' => now()->subDays(20),
            'expires_at' => now()->addDays(10),
            ...$licenseAttributes,
        ]);
    }

    return [$store, $user];
}

function fakeSubscriptionGateway(bool $approve = true): FakeGateway
{
    $fake = new FakeGateway;
    $fake->approve = $approve;

    app(PaymentGatewayManager::class)->extend('manual', fn () => $fake);

    return $fake;
}

/** خرید کامل و بازگشت موفق از درگاه. */
function purchase(User $user, array $payload): Order
{
    $orderId = (int) test()->actingAs($user)
        ->postJson('/api/subscription/checkout', $payload)
        ->assertCreated()
        ->json('order.id');

    test()->get("/api/billing/callback?order={$orderId}&Status=OK")->assertRedirect();

    return Order::findOrFail($orderId);
}

it('تعرفهٔ رسمی ۵ پلن تاکسینو را دقیق و به تومان منتشر می‌کند', function () {
    $response = $this->getJson('/api/subscription/plans')->assertOk();

    $plans = collect($response->json('plans'))->keyBy('code');

    expect($plans)->toHaveCount(5)
        ->and($plans['monthly']['total_price'])->toBe(150_000)
        ->and($plans['monthly']['duration_days'])->toBe(30)
        ->and($plans['quarterly']['total_price'])->toBe(420_000)
        ->and($plans['quarterly']['duration_days'])->toBe(90)
        ->and($plans['quarterly']['monthly_equivalent'])->toBe(140_000)
        ->and($plans['quarterly']['savings'])->toBe(30_000)
        ->and($plans['semiannual']['total_price'])->toBe(780_000)
        ->and($plans['semiannual']['duration_days'])->toBe(180)
        ->and($plans['semiannual']['monthly_equivalent'])->toBe(130_000)
        ->and($plans['semiannual']['savings'])->toBe(120_000)
        ->and($plans['yearly']['total_price'])->toBe(1_200_000)
        ->and($plans['yearly']['duration_days'])->toBe(365)
        ->and($plans['yearly']['monthly_equivalent'])->toBe(100_000)
        ->and($plans['yearly']['savings'])->toBe(600_000)
        ->and($plans['yearly']['is_featured'])->toBeTrue()
        ->and($plans['lifetime']['total_price'])->toBe(7_000_000)
        ->and($plans['lifetime']['is_lifetime'])->toBeTrue()
        ->and($plans['lifetime']['duration_days'])->toBeNull()
        ->and($response->json('currency'))->toBe('toman')
        ->and($response->json('support.phone'))->toBe('+989152521166');
});

it('قیمت هر ۵ پلن را در سرور محاسبه می‌کند و جزئیات کامل می‌دهد', function () {
    $yearly = $this->getJson('/api/subscription/quote?plan_code=yearly')->assertOk()->json('quote');
    expect($yearly['subtotal'])->toBe(1_200_000)
        ->and($yearly['duration_days'])->toBe(365)
        ->and($yearly['monthly_equivalent'])->toBe(100_000)
        ->and($yearly['discount'])->toBe(0)
        ->and($yearly['total'])->toBe(1_200_000);

    $lifetime = $this->getJson('/api/subscription/quote?plan_code=lifetime')->assertOk()->json('quote');
    expect($lifetime['total'])->toBe(7_000_000)
        ->and($lifetime['is_lifetime'])->toBeTrue()
        ->and($lifetime['duration_days'])->toBeNull();
});

it('پلن یا تعداد کاربر نامعتبر را رد می‌کند', function () {
    $this->getJson('/api/subscription/quote?plan_code=yearly&seats=500')
        ->assertStatus(422);

    $this->getJson('/api/subscription/quote?plan_code=unknown&seats=1&months=12')
        ->assertStatus(422);
});

it('مبلغ سفارش را از تعرفهٔ سرور می‌گیرد نه از ورودی کاربر', function () {
    [$store, $user] = subscriptionStoreUser();
    fakeSubscriptionGateway();

    $this->actingAs($user)->postJson('/api/subscription/checkout', [
        'plan_code' => 'monthly',
        'seats' => 1,
        'months' => 1,
        'amount' => 1_000, // تلاش برای دست‌کاری مبلغ — نادیده گرفته می‌شود
        'total' => 1_000,
    ])->assertCreated()->assertJsonPath('order.amount', 150_000);

    $this->assertDatabaseHas('orders', [
        'store_id' => $store->id,
        'plan' => 'monthly',
        'seats' => 1,
        'amount' => 150_000,
        'status' => 'pending',
    ]);

    // تا پرداخت تأیید نشده هیچ اشتراکی صادر نمی‌شود.
    expect($store->license()->exists())->toBeFalse();
});

it('پس از پرداخت موفق، اشتراک فعال و فاکتور صادر می‌شود', function () {
    [$store, $user] = subscriptionStoreUser();
    fakeSubscriptionGateway();

    $order = purchase($user, ['plan_code' => 'yearly', 'seats' => 3]);

    expect($order->status)->toBe(Order::STATUS_PAID)
        ->and($order->amount)->toBe(1_200_000)
        ->and($order->type)->toBe(Order::TYPE_NEW)
        ->and($order->reference_id)->toBe('REF-'.$order->id);

    $license = $store->license()->firstOrFail();
    expect($license->plan_code)->toBe('yearly')
        ->and($license->seats())->toBe(3)
        ->and($license->status)->toBe('active')
        ->and($license->isCurrentlyValid())->toBeTrue()
        ->and($license->daysRemaining())->toBeGreaterThanOrEqual(364);

    $invoice = SubscriptionInvoice::where('order_id', $order->id)->firstOrFail();
    expect($invoice->total)->toBe(1_200_000)
        ->and($invoice->number)->toStartWith('KS-');

    $this->assertDatabaseHas('audit_logs', ['action' => 'order_paid', 'store_id' => $store->id]);
    $this->assertDatabaseHas('subscription_history', ['store_id' => $store->id, 'action' => 'subscription_started']);

    $this->assertDatabaseHas('subscription_payments', [
        'order_id' => $order->id,
        'store_id' => $store->id,
        'gateway' => 'manual',
        'amount' => 1_200_000,
        'status' => 'paid',
        'reference_id' => 'REF-'.$order->id,
    ]);
});

it('پرداخت تکراری، اشتراک را دو بار تمدید نمی‌کند', function () {
    [$store, $user] = subscriptionStoreUser();
    $fake = fakeSubscriptionGateway();

    $order = purchase($user, ['plan_code' => 'monthly', 'seats' => 1]);
    $expiry = $store->license()->first()->expires_at->toIso8601String();

    $this->get("/api/billing/callback?order={$order->id}&Status=OK");

    expect($store->license()->first()->expires_at->toIso8601String())->toBe($expiry)
        ->and($fake->verifyCount)->toBe(1)
        ->and(SubscriptionInvoice::count())->toBe(1);
});

it('پرداخت ناموفق، اشتراک و فاکتور نمی‌سازد', function () {
    [$store, $user] = subscriptionStoreUser();
    fakeSubscriptionGateway(approve: false);

    $orderId = (int) $this->actingAs($user)
        ->postJson('/api/subscription/checkout', ['plan_code' => 'monthly', 'seats' => 1])
        ->json('order.id');

    $this->get("/api/billing/callback?order={$orderId}&Status=OK")->assertRedirect();

    expect(Order::findOrFail($orderId)->status)->toBe(Order::STATUS_FAILED)
        ->and($store->license()->exists())->toBeFalse()
        ->and(SubscriptionInvoice::count())->toBe(0);

    $this->assertDatabaseHas('subscription_payments', [
        'order_id' => $orderId,
        'status' => 'failed',
    ]);
});

it('تمدید از تاریخ پایان فعلی ادامه می‌یابد (۳۰ روز اضافه به سررسید فعلی)', function () {
    [$store, $user] = subscriptionStoreUser(['expires_at' => now()->addDays(10)]);
    fakeSubscriptionGateway();

    $expected = $store->license()->first()->expires_at->copy()->addDays(30)->toDateString();

    $order = purchase($user, ['plan_code' => 'monthly', 'seats' => 1]);

    expect($order->type)->toBe(Order::TYPE_RENEWAL)
        ->and($store->license()->first()->expires_at->toDateString())->toBe($expected);
});

it('اشتراک منقضی از لحظهٔ پرداخت شروع می‌شود', function () {
    [$store, $user] = subscriptionStoreUser(['expires_at' => now()->subDays(5)]);
    fakeSubscriptionGateway();

    purchase($user, ['plan_code' => 'quarterly', 'seats' => 1]);

    $license = $store->license()->first();
    expect($license->daysRemaining())->toBeGreaterThanOrEqual(89)
        ->and($license->status)->toBe('active');
});

it('ارتقا به مادام‌العمر فوری اعمال می‌شود و تاریخ انقضا حذف می‌گردد', function () {
    [$store, $user] = subscriptionStoreUser([
        'plan_code' => 'monthly',
        'tier' => 'proplus',
        'seats' => 2,
        'expires_at' => now()->addDays(10),
    ]);
    fakeSubscriptionGateway();

    $order = purchase($user, ['plan_code' => 'lifetime', 'seats' => 2]);

    $license = $store->license()->first();
    expect($order->type)->toBe(Order::TYPE_UPGRADE)
        ->and($order->amount)->toBe(7_000_000)
        ->and($license->is_lifetime)->toBeTrue()
        ->and($license->plan_code)->toBe('lifetime')
        ->and($license->expires_at)->toBeNull();
});

it('خرید کاربر بیشتر، نوع سفارش را «افزایش کاربر» می‌کند', function () {
    [$store, $user] = subscriptionStoreUser(['seats' => 2, 'plan_code' => 'semiannual']);
    fakeSubscriptionGateway();

    $order = purchase($user, ['plan_code' => 'semiannual', 'seats' => 4]);

    expect($order->type)->toBe(Order::TYPE_SEATS)
        ->and($order->amount)->toBe(780_000)
        ->and($store->license()->first()->seats())->toBe(4);
});

it('تغییر تعرفه توسط مدیر، مبلغ سفارش‌های قبلی را تغییر نمی‌دهد', function () {
    [$store, $user] = subscriptionStoreUser();
    fakeSubscriptionGateway();

    $order = purchase($user, ['plan_code' => 'yearly', 'seats' => 3]);

    SubscriptionPlan::where('code', 'yearly')->update([
        'total_price' => 1_800_000,
        'base_monthly' => 150_000,
    ]);

    expect($order->fresh()->amount)->toBe(1_200_000)
        ->and(SubscriptionInvoice::where('order_id', $order->id)->first()->total)->toBe(1_200_000);
});

it('کد تخفیف معتبر اعمال و مصرف می‌شود', function () {
    [, $user] = subscriptionStoreUser();
    fakeSubscriptionGateway();

    SubscriptionCoupon::create([
        'code' => 'OFF10',
        'type' => 'percent',
        'value' => 10,
        'is_active' => true,
    ]);

    $order = purchase($user, [
        'plan_code' => 'yearly',
        'seats' => 1,
        'coupon_code' => 'OFF10',
    ]);

    expect($order->subtotal)->toBe(1_200_000)
        ->and($order->discount)->toBe(120_000)
        ->and($order->amount)->toBe(1_080_000)
        ->and($order->coupon_code)->toBe('OFF10');

    expect(SubscriptionCoupon::where('code', 'OFF10')->first()->used_count)->toBe(1);
});

it('کد تخفیف منقضی یا ناموجود را رد می‌کند', function () {
    [, $user] = subscriptionStoreUser();

    SubscriptionCoupon::create([
        'code' => 'OLD',
        'type' => 'percent',
        'value' => 20,
        'is_active' => true,
        'ends_at' => now()->subDay(),
    ]);

    $this->actingAs($user)->postJson('/api/subscription/checkout', [
        'plan_code' => 'monthly', 'seats' => 1, 'coupon_code' => 'OLD',
    ])->assertStatus(422)->assertJsonValidationErrors('coupon_code');

    $this->actingAs($user)->postJson('/api/subscription/checkout', [
        'plan_code' => 'monthly', 'seats' => 1, 'coupon_code' => 'NOPE',
    ])->assertStatus(422)->assertJsonValidationErrors('coupon_code');
});

it('پلن غیرفعال قابل خرید نیست', function () {
    [, $user] = subscriptionStoreUser();
    SubscriptionPlan::where('code', 'monthly')->update(['is_active' => false]);

    $this->actingAs($user)->postJson('/api/subscription/checkout', [
        'plan_code' => 'monthly', 'seats' => 1,
    ])->assertStatus(422)->assertJsonValidationErrors('plan_code');
});

it('فاکتور فقط برای فروشگاه خود کاربر در دسترس است', function () {
    [, $userA] = subscriptionStoreUser();
    [, $userB] = subscriptionStoreUser();
    fakeSubscriptionGateway();

    $order = purchase($userA, ['plan_code' => 'monthly', 'seats' => 1]);
    $number = SubscriptionInvoice::where('order_id', $order->id)->first()->number;

    $this->actingAs($userA)->getJson("/api/subscription/invoices/{$number}")
        ->assertOk()
        ->assertJsonPath('invoice.number', $number);

    $this->actingAs($userB)->getJson("/api/subscription/invoices/{$number}")->assertNotFound();
});

it('اشتراک مادام‌العمر ۷٬۰۰۰٬۰۰۰ تومان بدون تاریخ انقضا ثبت می‌شود', function () {
    [, $user] = subscriptionStoreUser();
    fakeSubscriptionGateway();

    $order = purchase($user, ['plan_code' => 'lifetime', 'seats' => 1]);

    expect($order->is_lifetime)->toBeTrue()
        ->and($order->amount)->toBe(7_000_000);

    $license = $order->store->license;
    expect($license->is_lifetime)->toBeTrue()
        ->and($license->expires_at)->toBeNull()
        ->and($license->daysRemaining())->toBeNull()
        ->and($license->isCurrentlyValid())->toBeTrue();
});

it('درگاه زرین‌پال مبلغ را ریالی (×۱۰) می‌فرستد و کد پیگیری را ذخیره می‌کند', function () {
    config([
        'billing.gateway' => 'zarinpal',
        'billing.gateways.zarinpal.enabled' => true,
        'billing.gateways.zarinpal.merchant_id' => 'MERCHANT-TEST',
        'billing.gateways.zarinpal.base_url' => 'https://payment.zarinpal.test',
    ]);

    Http::fake([
        'https://payment.zarinpal.test/pg/v4/payment/request.json' => Http::response([
            'data' => ['code' => 100, 'authority' => 'A'.str_repeat('0', 35)],
            'errors' => [],
        ]),
        'https://payment.zarinpal.test/pg/v4/payment/verify.json' => Http::response([
            'data' => ['code' => 100, 'ref_id' => 987654321],
            'errors' => [],
        ]),
    ]);

    [$store, $user] = subscriptionStoreUser();

    $response = $this->actingAs($user)->postJson('/api/subscription/checkout', [
        'plan_code' => 'yearly', 'seats' => 3, 'gateway' => 'zarinpal',
    ])->assertCreated();

    Http::assertSent(fn ($request) => str_ends_with($request->url(), '/payment/request.json')
        && (int) $request['amount'] === 12_000_000 // ۱٬۲۰۰٬۰۰۰ تومان ⇒ ۱۲٬۰۰۰٬۰۰۰ ریال
        && $request['currency'] === 'IRR');

    $orderId = (int) $response->json('order.id');
    $this->get("/api/billing/callback?order={$orderId}&Authority=A".str_repeat('0', 35).'&Status=OK')
        ->assertRedirect();

    expect(Order::findOrFail($orderId)->reference_id)->toBe('987654321')
        ->and($store->license()->first()->isCurrentlyValid())->toBeTrue();
});
