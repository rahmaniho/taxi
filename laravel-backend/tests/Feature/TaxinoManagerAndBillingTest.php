<?php

use App\Models\Order;
use App\Models\SubscriptionPlan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('activates subscription immediately when manager creates an agency and returns users in store list', function () {
    $manager = User::factory()->manager()->create();

    $created = $this->actingAs($manager)->postJson('/api/manager/stores', [
        'name' => 'آژانس تاکسی امید',
        'owner_name' => 'امید رحمانی',
        'phone' => '۰۹۱۵۲۵۲۱۱۶۶',
        'email' => 'omid@taxi.ir',
        'password' => 'secret1234',
        'plan_code' => 'semiannual',
        'days' => 180,
        'max_users' => 4,
    ])->assertCreated();

    expect($created->json('store.license.is_valid'))->toBeTrue()
        ->and($created->json('store.license.plan_code'))->toBe('semiannual')
        ->and($created->json('store.license.plan_name'))->toBe('شش‌ماهه')
        ->and($created->json('store.license.seats'))->toBe(4)
        ->and($created->json('store.email'))->toBe('omid@taxi.ir')
        ->and($created->json('store.users.0.email'))->toBe('omid@taxi.ir');

    $list = $this->actingAs($manager)->getJson('/api/manager/stores')->assertOk();
    expect($list->json('stores'))->toHaveCount(1)
        ->and($list->json('stores.0.name'))->toBe('آژانس تاکسی امید')
        ->and($list->json('stores.0.users.0.email'))->toBe('omid@taxi.ir')
        ->and($list->json('stores.0.license.is_valid'))->toBeTrue();

    // آژانس بلافاصله با شماره موبایل یا ایمیل وارد می‌شود و اشتراکش فعال است
    $login = $this->postJson('/api/login', [
        'email' => '09152521166',
        'password' => 'secret1234',
    ])->assertOk();

    expect($login->json('user.store.license.is_valid'))->toBeTrue()
        ->and($login->json('user.store.license.plan_name'))->toBe('شش‌ماهه');
});

it('lets manager edit official plan total_price in Toman without altering historical orders', function () {
    $manager = User::factory()->manager()->create();

    $created = $this->actingAs($manager)->postJson('/api/manager/stores', [
        'name' => 'آژانس بهار',
        'email' => 'bahar@taxi.ir',
        'password' => 'secret1234',
        'plan_code' => 'monthly',
        'days' => 30,
    ])->assertCreated();

    $storeId = (int) $created->json('store.id');
    $storeUser = User::where('store_id', $storeId)->firstOrFail();

    $orderRes = $this->actingAs($storeUser)->postJson('/api/subscription/checkout', [
        'plan_code' => 'quarterly',
        'gateway' => 'manual',
    ])->assertCreated();

    $orderId = (int) $orderRes->json('order.id');
    expect($orderRes->json('order.amount'))->toBe(420_000);

    // مدیر کل قیمت پلن سه‌ماهه را به ۴۵۰٬۰۰۰ تومان تغییر می‌دهد
    $this->actingAs($manager)->putJson('/api/manager/plans/quarterly', [
        'total_price' => 450_000,
        'price_note' => 'اصلاح تعرفه فصلی',
    ])->assertOk()
        ->assertJsonPath('plan.total_price', 450_000)
        ->assertJsonPath('plan.monthly_equivalent', 150_000);

    // سفارش قبلی دقیقاً همان ۴۲۰٬۰۰۰ تومان می‌ماند
    expect(Order::findOrFail($orderId)->amount)->toBe(420_000);

    // خرید جدید با قیمت جدید ۴۵۰٬۰۰۰ تومان ثبت می‌شود
    $newQuote = $this->getJson('/api/subscription/quote?plan_code=quarterly')->assertOk();
    expect($newQuote->json('quote.total'))->toBe(450_000);

    expect(SubscriptionPlan::where('code', 'quarterly')->value('total_price'))->toBe(450_000);
});
