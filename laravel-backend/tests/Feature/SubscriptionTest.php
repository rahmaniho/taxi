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

/** فروشگاه با کاربر آمادهٔ خرید. */
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
            'tier' => 'pro',
            'plan_code' => 'pro',
            'seats' => 1,
            'status' => 'active',
            'is_active' => true,
            'starts_at' => now()->subMonths(2),
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

it('تعرفهٔ رسمی سه پلن را عمومی منتشر می‌کند', function () {
    $response = $this->getJson('/api/subscription/plans')->assertOk();

    $plans = collect($response->json('plans'))->keyBy('code');

    expect($plans)->toHaveCount(3)
        ->and($plans['basic']['base_monthly'])->toBe(30_000)
        ->and($plans['basic']['extra_user_monthly'])->toBe(15_000)
        ->and($plans['pro']['base_monthly'])->toBe(60_000)
        ->and($plans['pro']['extra_user_monthly'])->toBe(15_000)
        ->and($plans['proplus']['base_monthly'])->toBe(120_000)
        ->and($plans['proplus']['extra_user_monthly'])->toBe(20_000)
        ->and($response->json('allowed_months'))->toBe([1, 2, 3, 4, 6, 9, 12, 18, 24])
        ->and($response->json('currency'))->toBe('toman');
});

it('قیمت را در سرور محاسبه می‌کند و جزئیات کامل می‌دهد', function () {
    $response = $this->getJson('/api/subscription/quote?plan_code=pro&seats=5&months=12')->assertOk();

    $quote = $response->json('quote');

    expect($quote['base_monthly'])->toBe(60_000)
        ->and($quote['extra_users'])->toBe(4)
        ->and($quote['extra_monthly'])->toBe(60_000)
        ->and($quote['monthly_total'])->toBe(120_000)
        ->and($quote['base_total'])->toBe(720_000)
        ->and($quote['extra_total'])->toBe(720_000)
        ->and($quote['subtotal'])->toBe(1_440_000)
        ->and($quote['discount'])->toBe(0)
        ->and($quote['total'])->toBe(1_440_000);
});

it('مدت یا تعداد کاربر نامعتبر را رد می‌کند', function () {
    $this->getJson('/api/subscription/quote?plan_code=pro&seats=2&months=5')
        ->assertStatus(422);

    $this->getJson('/api/subscription/quote?plan_code=basic&seats=500&months=12')
        ->assertStatus(422);

    $this->getJson('/api/subscription/quote?plan_code=unknown&seats=1&months=12')
        ->assertStatus(422);
});

it('مبلغ سفارش را از تعرفهٔ سرور می‌گیرد نه از ورودی کاربر', function () {
    [$store, $user] = subscriptionStoreUser();
    fakeSubscriptionGateway();

    $this->actingAs($user)->postJson('/api/subscription/checkout', [
        'plan_code' => 'basic',
        'seats' => 1,
        'months' => 1,
        'amount' => 1_000, // تلاش برای دست‌کاری مبلغ — نادیده گرفته می‌شود
        'total' => 1_000,
    ])->assertCreated()->assertJsonPath('order.amount', 30_000);

    $this->assertDatabaseHas('orders', [
        'store_id' => $store->id,
        'plan' => 'basic',
        'seats' => 1,
        'amount' => 30_000,
        'status' => 'pending',
    ]);

    // تا پرداخت تأیید نشده هیچ اشتراکی صادر نمی‌شود.
    expect($store->license()->exists())->toBeFalse();
});

it('پس از پرداخت موفق، اشتراک فعال و فاکتور صادر می‌شود', function () {
    [$store, $user] = subscriptionStoreUser();
    fakeSubscriptionGateway();

    $order = purchase($user, ['plan_code' => 'pro', 'seats' => 5, 'months' => 12]);

    expect($order->status)->toBe(Order::STATUS_PAID)
        ->and($order->amount)->toBe(1_440_000)
        ->and($order->type)->toBe(Order::TYPE_NEW)
        ->and($order->reference_id)->toBe('REF-'.$order->id);

    $license = $store->license()->firstOrFail();
    expect($license->plan_code)->toBe('pro')
        ->and($license->tier)->toBe('pro')
        ->and($license->seats())->toBe(5)
        ->and($license->status)->toBe('active')
        ->and($license->isCurrentlyValid())->toBeTrue()
        ->and($license->daysRemaining())->toBeGreaterThanOrEqual(364);

    $invoice = SubscriptionInvoice::where('order_id', $order->id)->firstOrFail();
    expect($invoice->total)->toBe(1_440_000)
        ->and($invoice->number)->toStartWith('KS-');

    $this->assertDatabaseHas('audit_logs', ['action' => 'order_paid', 'store_id' => $store->id]);
    $this->assertDatabaseHas('subscription_history', ['store_id' => $store->id, 'action' => 'subscription_started']);

    // هر تلاش پرداخت در جدول تراکنش‌ها نگه داشته می‌شود
    $this->assertDatabaseHas('subscription_payments', [
        'order_id' => $order->id,
        'store_id' => $store->id,
        'gateway' => 'manual',
        'amount' => 1_440_000,
        'status' => 'paid',
        'reference_id' => 'REF-'.$order->id,
    ]);
});

it('پرداخت تکراری، اشتراک را دو بار تمدید نمی‌کند', function () {
    [$store, $user] = subscriptionStoreUser();
    $fake = fakeSubscriptionGateway();

    $order = purchase($user, ['plan_code' => 'pro', 'seats' => 1, 'months' => 1]);
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
        ->postJson('/api/subscription/checkout', ['plan_code' => 'pro', 'seats' => 1, 'months' => 1])
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

it('تمدید از تاریخ پایان فعلی ادامه می‌یابد', function () {
    [$store, $user] = subscriptionStoreUser(['expires_at' => now()->addDays(10)]);
    fakeSubscriptionGateway();

    $expected = $store->license()->first()->expires_at->copy()->addMonth()->toDateString();

    $order = purchase($user, ['plan_code' => 'pro', 'seats' => 1, 'months' => 1]);

    expect($order->type)->toBe(Order::TYPE_RENEWAL)
        ->and($store->license()->first()->expires_at->toDateString())->toBe($expected);
});

it('اشتراک منقضی از لحظهٔ پرداخت شروع می‌شود', function () {
    [$store, $user] = subscriptionStoreUser(['expires_at' => now()->subDays(5)]);
    fakeSubscriptionGateway();

    purchase($user, ['plan_code' => 'pro', 'seats' => 1, 'months' => 3]);

    $license = $store->license()->first();
    expect($license->daysRemaining())->toBeGreaterThanOrEqual(89)
        ->and($license->status)->toBe('active');
});

it('ارتقای پلن سطح را فوری بالا می‌برد و روزهای باقی‌مانده را حفظ می‌کند', function () {
    [$store, $user] = subscriptionStoreUser([
        'plan_code' => 'basic',
        'tier' => 'pro',
        'seats' => 2,
        'expires_at' => now()->addDays(10),
    ]);
    fakeSubscriptionGateway();

    $expected = $store->license()->first()->expires_at->copy()->addMonth()->toDateString();

    $order = purchase($user, ['plan_code' => 'proplus', 'seats' => 2, 'months' => 1]);

    $license = $store->license()->first();
    expect($order->type)->toBe(Order::TYPE_UPGRADE)
        ->and($license->tier)->toBe('proplus')
        ->and($license->plan_code)->toBe('proplus')
        ->and($license->expires_at->toDateString())->toBe($expected);
});

it('خرید کاربر بیشتر، نوع سفارش را «افزایش کاربر» می‌کند', function () {
    [$store, $user] = subscriptionStoreUser(['seats' => 2, 'plan_code' => 'pro']);
    fakeSubscriptionGateway();

    $order = purchase($user, ['plan_code' => 'pro', 'seats' => 4, 'months' => 1]);

    expect($order->type)->toBe(Order::TYPE_SEATS)
        ->and($store->license()->first()->seats())->toBe(4);
});

it('تغییر تعرفه، مبلغ سفارش‌های قبلی را تغییر نمی‌دهد', function () {
    [$store, $user] = subscriptionStoreUser();
    fakeSubscriptionGateway();

    $order = purchase($user, ['plan_code' => 'pro', 'seats' => 3, 'months' => 12]);

    SubscriptionPlan::where('code', 'pro')->update([
        'base_monthly' => 90_000,
        'extra_user_monthly' => 30_000,
    ]);

    expect($order->fresh()->amount)->toBe(1_080_000)
        ->and($order->fresh()->base_monthly)->toBe(60_000)
        ->and(SubscriptionInvoice::where('order_id', $order->id)->first()->total)->toBe(1_080_000);
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
        'plan_code' => 'pro',
        'seats' => 5,
        'months' => 12,
        'coupon_code' => 'OFF10',
    ]);

    expect($order->subtotal)->toBe(1_440_000)
        ->and($order->discount)->toBe(144_000)
        ->and($order->amount)->toBe(1_296_000)
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
        'plan_code' => 'pro', 'seats' => 1, 'months' => 1, 'coupon_code' => 'OLD',
    ])->assertStatus(422)->assertJsonValidationErrors('coupon_code');

    $this->actingAs($user)->postJson('/api/subscription/checkout', [
        'plan_code' => 'pro', 'seats' => 1, 'months' => 1, 'coupon_code' => 'NOPE',
    ])->assertStatus(422)->assertJsonValidationErrors('coupon_code');
});

it('پلن غیرفعال قابل خرید نیست', function () {
    [, $user] = subscriptionStoreUser();
    SubscriptionPlan::where('code', 'basic')->update(['is_active' => false]);

    $this->actingAs($user)->postJson('/api/subscription/checkout', [
        'plan_code' => 'basic', 'seats' => 1, 'months' => 1,
    ])->assertStatus(422)->assertJsonValidationErrors('plan_code');
});

it('فاکتور فقط برای فروشگاه خود کاربر در دسترس است', function () {
    [, $userA] = subscriptionStoreUser();
    [, $userB] = subscriptionStoreUser();
    fakeSubscriptionGateway();

    $order = purchase($userA, ['plan_code' => 'pro', 'seats' => 1, 'months' => 1]);
    $number = SubscriptionInvoice::where('order_id', $order->id)->first()->number;

    $this->actingAs($userA)->getJson("/api/subscription/invoices/{$number}")
        ->assertOk()
        ->assertJsonPath('invoice.number', $number);

    $this->actingAs($userB)->getJson("/api/subscription/invoices/{$number}")->assertNotFound();
});

it('اشتراک مادام‌العمر بدون تاریخ انقضا ثبت می‌شود', function () {
    [, $user] = subscriptionStoreUser();
    fakeSubscriptionGateway();

    SubscriptionPlan::create([
        'code' => 'life',
        'name' => 'مادام‌العمر',
        'tier' => 'proplus',
        'base_monthly' => 20_000_000,
        'extra_user_monthly' => 0,
        'min_seats' => 1,
        'max_seats' => 5,
        'is_lifetime' => true,
        'is_active' => true,
    ]);

    $order = purchase($user, ['plan_code' => 'life', 'seats' => 1, 'months' => 1]);

    expect($order->is_lifetime)->toBeTrue()
        ->and($order->amount)->toBe(20_000_000);

    $license = $order->store->license;
    expect($license->is_lifetime)->toBeTrue()
        ->and($license->expires_at)->toBeNull()
        ->and($license->isCurrentlyValid())->toBeTrue();
});

it('درگاه زرین‌پال مبلغ را ریالی می‌فرستد و کد پیگیری را ذخیره می‌کند', function () {
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
        'plan_code' => 'pro', 'seats' => 5, 'months' => 12, 'gateway' => 'zarinpal',
    ])->assertCreated();

    Http::assertSent(fn ($request) => str_ends_with($request->url(), '/payment/request.json')
        && (int) $request['amount'] === 14_400_000 // ۱٬۴۴۰٬۰۰۰ تومان ⇒ ۱۴٬۴۰۰٬۰۰۰ ریال
        && $request['currency'] === 'IRR');

    $orderId = (int) $response->json('order.id');
    $this->get("/api/billing/callback?order={$orderId}&Authority=A".str_repeat('0', 35).'&Status=OK')
        ->assertRedirect();

    expect(Order::findOrFail($orderId)->reference_id)->toBe('987654321')
        ->and($store->license()->first()->isCurrentlyValid())->toBeTrue();
});
