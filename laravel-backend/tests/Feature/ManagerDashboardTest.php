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
        'tier' => 'proplus',
        'plan_code' => 'yearly',
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
        'plan' => 'yearly',
        'tier' => 'proplus',
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
        'plan' => 'monthly',
        'tier' => 'proplus',
        'months' => 1,
        'seats' => 1,
        'amount' => 60_000,
        'subtotal' => 60_000,
        'status' => Order::STATUS_PENDING,
        'gateway' => 'manual',
    ]);

    $response = $this->actingAs(dashboardManager())->getJson('/api/manager/dashboard')->assertOk();

    expect($response->json('kpis.revenue_month'))->toBe(1_080_000)
        ->and($response->json('kpis.revenue_year'))->toBe(1_080_000)
        ->and($response->json('kpis.revenue_total'))->toBe(1_080_000)
        ->and($response->json('kpis.orders_pending'))->toBe(1)
        ->and($response->json('kpis.subs_active'))->toBe(1)
        ->and($response->json('kpis.stores_total'))->toBe(1)
        ->and($response->json('kpis.mrr'))->toBe(100_000) // پلن رسمی یک‌ساله: ۱٬۲۰۰٬۰۰۰ ÷ ۱۲ ماه
        ->and($response->json('kpis.currency'))->toBe('toman')
        ->and($response->json('recent_orders'))->toHaveCount(2);

    $breakdown = collect($response->json('plan_breakdown'));
    expect($breakdown)->toHaveCount(5) // پنج پلن رسمی تاکسینو
        ->and($breakdown->firstWhere('plan_code', 'yearly')['revenue'])->toBe(1_080_000)
        ->and($breakdown->firstWhere('plan_code', 'yearly')['total'])->toBe(1);
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
