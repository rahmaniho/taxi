<?php

use App\Models\License;
use App\Models\Order;
use App\Models\Store;
use App\Models\SubscriptionCoupon;
use App\Models\SubscriptionHistory;
use App\Models\SubscriptionPlan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

function adminUser(): User
{
    return User::factory()->manager()->create();
}

function subscriberStore(array $licenseAttributes = []): array
{
    $store = Store::factory()->create(['name' => 'فروشگاه '.uniqid(), 'phone' => '0912'.random_int(1000000, 9999999)]);
    User::factory()->forStore($store)->create(['email' => 'sub-store-'.uniqid().'@test.local']);

    $license = License::create([
        'store_id' => $store->id,
        'tier' => 'pro',
        'plan_code' => 'pro',
        'seats' => 3,
        'status' => 'active',
        'is_active' => true,
        'starts_at' => now()->subMonth(),
        'expires_at' => now()->addDays(20),
        ...$licenseAttributes,
    ]);

    return [$store, $license];
}

it('مدیر فهرست پلن‌ها، فروش و درآمد هر پلن را می‌بیند', function () {
    [$store, $license] = subscriberStore();

    Order::create([
        'store_id' => $store->id,
        'plan' => 'pro',
        'tier' => 'pro',
        'months' => 12,
        'seats' => 2,
        'amount' => 900_000,
        'subtotal' => 900_000,
        'status' => Order::STATUS_PAID,
        'gateway' => 'manual',
        'paid_at' => now(),
    ]);

    $response = $this->actingAs(adminUser())->getJson('/api/manager/plans')->assertOk();

    $plans = collect($response->json('plans'))->keyBy('code');

    expect($plans)->toHaveCount(3)
        ->and($plans['pro']['sales']['orders'])->toBe(1)
        ->and($plans['pro']['sales']['revenue'])->toBe(900_000)
        ->and($plans['basic']['sales']['revenue'])->toBe(0)
        ->and($license->fresh()->plan_code)->toBe('pro');
});

it('مدیر می‌تواند پلن بسازد و تعرفهٔ آن را تغییر دهد (با ثبت تاریخچه)', function () {
    $manager = adminUser();

    $this->actingAs($manager)->postJson('/api/manager/plans', [
        'code' => 'team',
        'name' => 'تیمی',
        'tier' => 'proplus',
        'base_monthly' => 200_000,
        'extra_user_monthly' => 25_000,
        'min_seats' => 1,
        'max_seats' => 30,
        'features' => ['چند کاربر', 'پشتیبانی اختصاصی'],
    ])->assertCreated()->assertJsonPath('plan.code', 'team');

    $this->actingAs($manager)->putJson('/api/manager/plans/team', [
        'base_monthly' => 250_000,
        'extra_user_monthly' => 30_000,
        'price_note' => 'افزایش تعرفه سال ۱۴۰۵',
    ])->assertOk()->assertJsonPath('plan.base_monthly', 250_000);

    $history = $this->actingAs($manager)->getJson('/api/manager/plans/team/prices')->assertOk();

    expect($history->json('history'))->toHaveCount(2)
        ->and($history->json('history.0.base_monthly'))->toBe(250_000)
        ->and($history->json('history.0.note'))->toBe('افزایش تعرفه سال ۱۴۰۵');
});

it('پلن غیرفعال از فروش خارج می‌شود ولی داده‌اش می‌ماند', function () {
    $manager = adminUser();
    $plan = SubscriptionPlan::where('code', 'basic')->firstOrFail();

    $this->actingAs($manager)->patchJson("/api/manager/plans/{$plan->code}/toggle", ['is_active' => false])
        ->assertOk()
        ->assertJsonPath('plan.is_active', false);

    $this->getJson('/api/subscription/plans')->assertOk()->assertJsonCount(2, 'plans');
    expect($plan->fresh())->not->toBeNull();
});

it('مدیر کد تخفیف می‌سازد، ویرایش و حذف می‌کند', function () {
    $manager = adminUser();

    $created = $this->actingAs($manager)->postJson('/api/manager/coupons', [
        'code' => 'nowruz',
        'type' => 'percent',
        'value' => 15,
        'max_uses' => 50,
        'description' => 'جشنواره نوروز',
    ])->assertCreated();

    $id = (int) $created->json('coupon.id');
    expect($created->json('coupon.code'))->toBe('NOWRUZ');

    $this->actingAs($manager)->putJson("/api/manager/coupons/{$id}", ['value' => 20])
        ->assertOk()
        ->assertJsonPath('coupon.value', 20);

    $this->actingAs($manager)->deleteJson("/api/manager/coupons/{$id}")->assertOk();
    expect(SubscriptionCoupon::count())->toBe(0);
});

it('درصد تخفیف بیشتر از ۱۰۰ پذیرفته نمی‌شود', function () {
    $this->actingAs(adminUser())->postJson('/api/manager/coupons', [
        'code' => 'BAD',
        'type' => 'percent',
        'value' => 150,
    ])->assertStatus(422);
});

it('فهرست مشترکان با جست‌وجو و فیلتر وضعیت کار می‌کند', function () {
    [$storeA] = subscriberStore(['expires_at' => now()->addDays(10)]);
    subscriberStore(['expires_at' => now()->subDay()]);

    $manager = adminUser();

    $all = $this->actingAs($manager)->getJson('/api/manager/subscribers')->assertOk();
    expect($all->json('subscribers'))->toHaveCount(2)
        ->and($all->json('stats.total'))->toBe(2);

    $filtered = $this->actingAs($manager)->getJson('/api/manager/subscribers?status=expired')->assertOk();
    expect($filtered->json('subscribers'))->toHaveCount(1)
        ->and($filtered->json('subscribers.0.status'))->toBe('expired');

    $search = $this->actingAs($manager)->getJson('/api/manager/subscribers?q='.urlencode($storeA->name))->assertOk();
    expect($search->json('subscribers'))->toHaveCount(1)
        ->and($search->json('subscribers.0.store_name'))->toBe($storeA->name);
});

it('مدیر اشتراک را با دلیل تمدید می‌کند و همه‌چیز ثبت می‌شود', function () {
    [$store, $license] = subscriberStore(['expires_at' => now()->addDays(10)]);
    $manager = adminUser();

    $expected = $license->expires_at->copy()->addMonths(2)->toDateString();

    $this->actingAs($manager)->postJson("/api/manager/subscribers/{$license->id}/extend", [
        'months' => 2,
        'seats' => 5,
        'reason' => 'پشتیبانی تلفنی — تسویه دستی',
    ])->assertOk()
        ->assertJsonPath('subscriber.seats', 5)
        ->assertJsonPath('subscriber.status', 'active');

    $license->refresh();
    expect($license->expires_at->toDateString())->toBe($expected)
        ->and($license->seats)->toBe(5);

    $this->assertDatabaseHas('subscription_history', [
        'store_id' => $store->id,
        'action' => 'subscription_manual_extended',
        'reason' => 'پشتیبانی تلفنی — تسویه دستی',
        'actor_id' => $manager->id,
    ]);

    $this->assertDatabaseHas('audit_logs', [
        'action' => 'subscription_manual_extended',
        'store_id' => $store->id,
        'user_id' => $manager->id,
    ]);
});

it('تمدید دستی بدون دلیل رد می‌شود', function () {
    [, $license] = subscriberStore();

    $this->actingAs(adminUser())->postJson("/api/manager/subscribers/{$license->id}/extend", [
        'months' => 1,
    ])->assertStatus(422)->assertJsonValidationErrors('reason');
});

it('مدیر می‌تواند اشتراک را تعلیق و دوباره فعال کند', function () {
    [$store, $license] = subscriberStore();
    $manager = adminUser();

    $this->actingAs($manager)->postJson("/api/manager/subscribers/{$license->id}/status", [
        'status' => 'suspended',
        'reason' => 'بدهی معوق',
    ])->assertOk()->assertJsonPath('subscriber.status', 'suspended');

    expect($license->fresh()->isCurrentlyValid())->toBeFalse()
        ->and($license->fresh()->is_active)->toBeFalse();

    $this->actingAs($manager)->postJson("/api/manager/subscribers/{$license->id}/status", [
        'status' => 'active',
        'reason' => 'تسویه شد',
    ])->assertOk()->assertJsonPath('subscriber.status', 'active');

    expect($license->fresh()->isCurrentlyValid())->toBeTrue();
    expect(SubscriptionHistory::where('store_id', $store->id)->count())->toBe(2);
});

it('سقف کاربران کمتر از کاربران فعال پذیرفته نمی‌شود', function () {
    [$store, $license] = subscriberStore(['seats' => 5]);

    foreach ([1, 2, 3] as $i) {
        User::factory()->forStore($store)->create(['email' => "extra-{$i}-".uniqid().'@test.local']);
    }

    $this->actingAs(adminUser())->postJson("/api/manager/subscribers/{$license->id}/seats", [
        'seats' => 2,
        'reason' => 'کاهش ظرفیت',
    ])->assertStatus(422)->assertJsonValidationErrors('seats');

    $this->actingAs(adminUser())->postJson("/api/manager/subscribers/{$license->id}/seats", [
        'seats' => 6,
        'reason' => 'افزایش ظرفیت',
    ])->assertOk()->assertJsonPath('subscriber.seats', 6);
});

it('سابقهٔ مشترک شامل پرداخت‌ها و تاریخچه است', function () {
    [$store, $license] = subscriberStore();

    Order::create([
        'store_id' => $store->id,
        'plan' => 'pro',
        'tier' => 'pro',
        'months' => 1,
        'seats' => 3,
        'amount' => 90_000,
        'subtotal' => 90_000,
        'status' => Order::STATUS_PAID,
        'gateway' => 'manual',
        'reference_id' => 'REF-42',
        'paid_at' => now(),
    ]);

    SubscriptionHistory::create([
        'store_id' => $store->id,
        'license_id' => $license->id,
        'action' => 'subscription_started',
        'payload' => ['months' => 1],
        'created_at' => now(),
    ]);

    $response = $this->actingAs(adminUser())->getJson("/api/manager/subscribers/{$license->id}")->assertOk();

    expect($response->json('payments.0.reference_id'))->toBe('REF-42')
        ->and($response->json('payments.0.amount'))->toBe(90_000)
        ->and($response->json('history.0.action'))->toBe('subscription_started')
        ->and($response->json('subscriber.last_transaction'))->toBe('REF-42');
});

it('کاربر فروشگاه به بخش مدیریت پلن‌ها و مشترکان دسترسی ندارد', function () {
    [$store] = subscriberStore();
    $storeUser = User::where('store_id', $store->id)->firstOrFail();

    $this->actingAs($storeUser)->getJson('/api/manager/plans')->assertForbidden();
    $this->actingAs($storeUser)->getJson('/api/manager/subscribers')->assertForbidden();
    $this->actingAs($storeUser)->postJson('/api/manager/coupons', [
        'code' => 'X', 'type' => 'percent', 'value' => 5,
    ])->assertForbidden();
});

it('حداکثر کاربران نمی‌تواند کمتر از حداقل باشد', function () {
    $manager = adminUser();

    $this->actingAs($manager)->postJson('/api/manager/plans', [
        'code' => 'broken-plan',
        'name' => 'پلن اشتباه',
        'tier' => 'pro',
        'base_monthly' => 10_000,
        'extra_user_monthly' => 5_000,
        'min_seats' => 10,
        'max_seats' => 2,
    ])->assertStatus(422)->assertJsonValidationErrors('max_seats');
});
