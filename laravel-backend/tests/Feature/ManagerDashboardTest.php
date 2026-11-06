<?php

use App\Models\License;
use App\Models\Order;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

function dashboardManager(): User
{
    return User::factory()->manager()->create();
}

function dashboardStore(array $licenseAttributes = []): array
{
    $store = Store::factory()->create(['name' => 'فروشگاه '.uniqid()]);
    User::factory()->forStore($store)->create(['email' => 'dash-'.uniqid().'@test.local']);

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

it('داشبورد شاخص‌های واقعی درآمد و مشترکان را برمی‌گرداند', function () {
    [$store, $license] = dashboardStore();

    Order::create([
        'store_id' => $store->id,
        'plan' => 'pro',
        'tier' => 'pro',
        'months' => 12,
        'seats' => 3,
        'amount' => 1_080_000,
        'subtotal' => 1_080_000,
        'status' => Order::STATUS_PAID,
        'gateway' => 'zarinpal',
        'paid_at' => now(),
    ]);

    Order::create([
        'store_id' => $store->id,
        'plan' => 'pro',
        'tier' => 'pro',
        'months' => 1,
        'seats' => 1,
        'amount' => 60_000,
        'subtotal' => 60_000,
        'status' => Order::STATUS_PENDING,
        'gateway' => 'manual',
    ]);

    $response = $this->actingAs(dashboardManager())->getJson('/api/manager/dashboard')->assertOk();

    expect($response->json('kpis.revenue_month'))->toBe(1_080_000)
        ->and($response->json('kpis.orders_pending'))->toBe(1)
        ->and($response->json('kpis.orders_pending_amount'))->toBe(60_000)
        ->and($response->json('kpis.subs_active'))->toBe(1)
        ->and($response->json('kpis.stores_total'))->toBe(1)
        ->and($response->json('kpis.mrr'))->toBe(90_000) // 60k + ۲ کاربر اضافه × 15k
        ->and($response->json('revenue_trend'))->toHaveCount(12)
        ->and($response->json('plan_breakdown'))->toHaveCount(3);

    expect(collect($response->json('revenue_trend'))->sum('amount'))->toBe(1_080_000);
});

it('لایسنس آزمایشی در MRR شمرده نمی‌شود و انقضای نزدیک گزارش می‌شود', function () {
    dashboardStore(['is_trial' => true]);
    dashboardStore(['expires_at' => now()->addDays(3)]);

    $response = $this->actingAs(dashboardManager())->getJson('/api/manager/dashboard')->assertOk();

    expect($response->json('kpis.subs_trial'))->toBe(1)
        ->and($response->json('kpis.subs_expiring_7'))->toBe(1)
        ->and($response->json('expiring_soon'))->toHaveCount(1);
});

it('کاربر فروشگاه به داشبورد مدیریتی دسترسی ندارد', function () {
    $store = Store::factory()->create();
    $user = User::factory()->forStore($store)->create();

    $this->actingAs($user)->getJson('/api/manager/dashboard')->assertForbidden();
});
