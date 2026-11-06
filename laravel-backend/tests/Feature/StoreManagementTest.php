<?php

use App\Models\License;
use App\Models\Store;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('lets a manager create a store with a lifetime license', function () {
    $manager = User::factory()->manager()->create();

    $this->actingAs($manager)
        ->postJson('/api/manager/stores', [
            'name' => 'فروشگاه یک',
            'owner_name' => 'علی',
            'phone' => '09120000000',
            'email' => 'store1@test.local',
            'password' => 'secret123',
            'license' => [
                'tier' => 'pro',
                'is_lifetime' => true,
                'is_active' => true,
            ],
        ])
        ->assertCreated()
        ->assertJsonPath('store.license.is_lifetime', true)
        ->assertJsonPath('store.license.is_valid', true)
        ->assertJsonPath('store.license.expires_at', null);

    $this->assertDatabaseHas('stores', ['name' => 'فروشگاه یک']);
    $this->assertDatabaseHas('users', ['email' => 'store1@test.local', 'role' => 'store']);
});

it('requires an expiry for a non-lifetime license', function () {
    $manager = User::factory()->manager()->create();

    $this->actingAs($manager)
        ->postJson('/api/manager/stores', [
            'name' => 'فروشگاه دو',
            'email' => 'store2@test.local',
            'password' => 'secret123',
            'license' => [
                'tier' => 'proplus',
                'is_lifetime' => false,
            ],
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors('license.expires_at');
});

it('creates a store with a time-limited license and marks it valid', function () {
    $manager = User::factory()->manager()->create();

    $response = $this->actingAs($manager)->postJson('/api/manager/stores', [
        'name' => 'فروشگاه سه',
        'email' => 'store3@test.local',
        'password' => 'secret123',
        'license' => [
            'tier' => 'pro',
            'is_lifetime' => false,
            'expires_at' => now()->addDays(30)->toIso8601String(),
        ],
    ]);

    $response->assertCreated()
        ->assertJsonPath('store.license.is_lifetime', false)
        ->assertJsonPath('store.license.is_valid', true);

    expect($response->json('store.license.days_remaining'))->toBeGreaterThan(25);
});

it('updates a license to lifetime', function () {
    $manager = User::factory()->manager()->create();
    $store = Store::factory()->create();
    License::factory()->expiringSoon()->for($store)->create();

    $this->actingAs($manager)
        ->putJson("/api/manager/stores/{$store->id}/license", [
            'tier' => 'pro',
            'is_lifetime' => true,
            'is_active' => true,
            'reason' => 'ارتقا به مادام‌العمر به درخواست مشتری',
        ])
        ->assertOk()
        ->assertJsonPath('store.license.is_lifetime', true);

    expect($store->fresh()->license->is_lifetime)->toBeTrue();
});

it('forbids store users from manager routes', function () {
    $store = Store::factory()->create();
    $user = User::factory()->forStore($store)->create();

    $this->actingAs($user)->getJson('/api/manager/stores')->assertForbidden();
});

it('archives the store instead of deleting its data', function () {
    $manager = User::factory()->manager()->create();
    $store = Store::factory()->create();
    User::factory()->forStore($store)->create();

    $this->actingAs($manager)
        ->deleteJson("/api/manager/stores/{$store->id}")
        ->assertOk()
        ->assertJsonPath('archived', true);

    // داده‌ها دست‌نخورده می‌مانند و فقط دسترسی بسته می‌شود
    $this->assertDatabaseHas('stores', ['id' => $store->id]);
    expect($store->fresh()->archived_at)->not->toBeNull()
        ->and($store->fresh()->is_active)->toBeFalse();

    $this->assertDatabaseHas('audit_logs', ['action' => 'store_archived', 'store_id' => $store->id]);
});

it('restores an archived store', function () {
    $manager = User::factory()->manager()->create();
    $store = Store::factory()->create(['archived_at' => now(), 'is_active' => false]);

    $this->actingAs($manager)
        ->postJson("/api/manager/stores/{$store->id}/restore")
        ->assertOk();

    expect($store->fresh()->archived_at)->toBeNull()
        ->and($store->fresh()->is_active)->toBeTrue();
});

it('purges an archived store only after typing its exact name', function () {
    $manager = User::factory()->manager()->create();
    $store = Store::factory()->create(['archived_at' => now(), 'is_active' => false]);

    // بدون آرشیو، حذف دائمی مجاز نیست
    $active = Store::factory()->create();
    $this->actingAs($manager)
        ->deleteJson("/api/manager/stores/{$active->id}", ['mode' => 'purge', 'confirm_name' => $active->name])
        ->assertStatus(422);

    // نام اشتباه
    $this->actingAs($manager)
        ->deleteJson("/api/manager/stores/{$store->id}", ['mode' => 'purge', 'confirm_name' => 'اشتباه'])
        ->assertStatus(422);

    $this->actingAs($manager)
        ->deleteJson("/api/manager/stores/{$store->id}", ['mode' => 'purge', 'confirm_name' => $store->name])
        ->assertOk()
        ->assertJsonPath('purged', true);

    $this->assertDatabaseMissing('stores', ['id' => $store->id]);
    $this->assertDatabaseHas('audit_logs', ['action' => 'store_purged']);
});

it('blocks login for users of an archived store', function () {
    $store = Store::factory()->create(['archived_at' => now(), 'is_active' => false]);
    $user = User::factory()->forStore($store)->create([
        'email' => 'archived-'.uniqid().'@test.local',
        'password' => Hash::make('password'),
    ]);

    $this->postJson('/api/login', ['email' => $user->email, 'password' => 'password'])
        ->assertStatus(422);

    $this->assertDatabaseHas('audit_logs', ['action' => 'login_blocked']);
});

it('lets the manager change plan and seats with a reason and keeps seat floor', function () {
    $manager = User::factory()->manager()->create();
    $store = Store::factory()->create();
    User::factory()->forStore($store)->create(['is_active' => true]);
    User::factory()->forStore($store)->create(['is_active' => true]);
    License::factory()->for($store)->create(['seats' => 5, 'plan_code' => 'pro']);

    // سقف کمتر از کاربران فعال
    $this->actingAs($manager)
        ->putJson("/api/manager/stores/{$store->id}/license", [
            'plan_code' => 'pro',
            'seats' => 1,
            'expires_at' => now()->addMonth()->toDateString(),
            'reason' => 'کاهش اشتباهی سقف',
        ])
        ->assertStatus(422);

    $this->actingAs($manager)
        ->putJson("/api/manager/stores/{$store->id}/license", [
            'plan_code' => 'proplus',
            'seats' => 8,
            'expires_at' => now()->addMonth()->toDateString(),
            'reason' => 'ارتقای توافقی تیم',
        ])
        ->assertOk()
        ->assertJsonPath('store.license.seats', 8);

    expect($store->fresh()->license->plan_code)->toBe('proplus')
        ->and($store->fresh()->license->tier)->toBe('proplus');

    $this->assertDatabaseHas('subscription_history', [
        'store_id' => $store->id,
        'action' => 'admin_license_updated',
        'reason' => 'ارتقای توافقی تیم',
    ]);
});

it('paginates and filters the store list', function () {
    $manager = User::factory()->manager()->create();

    Store::factory()->count(3)->create();
    Store::factory()->create(['name' => 'فروشگاه آرشیوی', 'archived_at' => now()]);

    $page = $this->actingAs($manager)->getJson('/api/manager/stores?limit=2')->assertOk();

    expect($page->json('stores'))->toHaveCount(2)
        ->and($page->json('meta.total'))->toBe(3)
        ->and($page->json('totals.archived'))->toBe(1);

    $archived = $this->actingAs($manager)->getJson('/api/manager/stores?status=archived')->assertOk();
    expect($archived->json('stores'))->toHaveCount(1);

    $search = $this->actingAs($manager)->getJson('/api/manager/stores?q='.urlencode('آرشیوی'))->assertOk();
    expect($search->json('stores'))->toHaveCount(0); // پیش‌فرض فقط فعال‌ها
});
