<?php

use App\Models\License;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

/** فروشگاه با لایسنس N کاربره و مالک. */
function teamStore(int $seats, int $activeUsers = 1): array
{
    $store = Store::factory()->create();

    $owner = User::factory()->forStore($store)->create([
        'email' => 'owner-'.uniqid().'@test.local',
        'password' => Hash::make('password'),
    ]);

    for ($i = 1; $i < $activeUsers; $i++) {
        User::factory()->forStore($store)->create(['email' => 'member-'.$i.'-'.uniqid().'@test.local']);
    }

    License::create([
        'store_id' => $store->id,
        'tier' => 'pro',
        'plan_code' => 'pro',
        'seats' => $seats,
        'status' => 'active',
        'is_active' => true,
        'starts_at' => now(),
        'expires_at' => now()->addMonth(),
    ]);

    return [$store, $owner];
}

it('مصرف ظرفیت را نشان می‌دهد', function () {
    [, $owner] = teamStore(seats: 5, activeUsers: 2);

    $response = $this->actingAs($owner)->getJson('/api/team')->assertOk();

    expect($response->json('usage'))->toBe([
        'used' => 2,
        'allowed' => 5,
        'remaining' => 3,
        'can_add' => true,
    ])->and($response->json('members'))->toHaveCount(2);
});

it('تا سقف اشتراک کاربر اضافه می‌شود', function () {
    [$store, $owner] = teamStore(seats: 2, activeUsers: 1);

    $this->actingAs($owner)->postJson('/api/team', [
        'name' => 'کاربر دوم',
        'email' => 'second-'.uniqid().'@test.local',
        'password' => 'secret-pass',
    ])->assertCreated()->assertJsonPath('usage.can_add', false);

    expect($store->activeUserCount())->toBe(2);

    $this->assertDatabaseHas('audit_logs', ['action' => 'team_user_created', 'store_id' => $store->id]);
});

it('افزودن کاربر بیش از سقف در بک‌اند مسدود می‌شود', function () {
    [$store, $owner] = teamStore(seats: 2, activeUsers: 2);

    $this->actingAs($owner)->postJson('/api/team', [
        'name' => 'کاربر سوم',
        'email' => 'third-'.uniqid().'@test.local',
        'password' => 'secret-pass',
    ])->assertStatus(422)->assertJsonValidationErrors('seats');

    expect($store->activeUserCount())->toBe(2)
        ->and(User::where('store_id', $store->id)->count())->toBe(2);
});

it('غیرفعال‌کردن کاربر ظرفیت را آزاد می‌کند', function () {
    [$store, $owner] = teamStore(seats: 2, activeUsers: 2);

    $member = User::where('store_id', $store->id)->where('id', '!=', $owner->id)->firstOrFail();

    $this->actingAs($owner)->deleteJson("/api/team/{$member->id}")
        ->assertOk()
        ->assertJsonPath('usage.can_add', true);

    expect($member->fresh()->is_active)->toBeFalse()
        ->and($store->activeUserCount())->toBe(1);

    // کاربر حذف نشده، فقط غیرفعال است (داده و سابقه می‌ماند).
    $this->assertDatabaseHas('users', ['id' => $member->id]);
});

it('فعال‌سازی دوبارهٔ کاربر هم کنترل ظرفیت دارد', function () {
    [$store, $owner] = teamStore(seats: 2, activeUsers: 2);

    $member = User::where('store_id', $store->id)->where('id', '!=', $owner->id)->firstOrFail();
    $member->forceFill(['is_active' => false])->save();

    $this->actingAs($owner)->postJson("/api/team/{$member->id}/restore")->assertOk();
    expect($member->fresh()->is_active)->toBeTrue();

    $member->refresh()->forceFill(['is_active' => false])->save();
    User::factory()->forStore($store)->create(['email' => 'extra-'.uniqid().'@test.local']);

    $this->actingAs($owner)->postJson("/api/team/{$member->id}/restore")->assertStatus(422);
    expect($member->fresh()->is_active)->toBeFalse();
});

it('فروشگاهی که لایسنس ندارد نمی‌تواند کاربر اضافه کند', function () {
    $store = Store::factory()->create();
    $owner = User::factory()->forStore($store)->create(['email' => 'no-license-'.uniqid().'@test.local']);

    $this->actingAs($owner)->postJson('/api/team', [
        'name' => 'کاربر',
        'email' => 'blocked-'.uniqid().'@test.local',
        'password' => 'secret-pass',
    ])->assertStatus(422)->assertJsonValidationErrors('seats');
});

it('کاربران یک فروشگاه به تیم فروشگاه دیگر دسترسی ندارند', function () {
    [, $ownerA] = teamStore(seats: 3);
    [$storeB] = teamStore(seats: 3);

    $memberB = User::where('store_id', $storeB->id)->firstOrFail();

    $this->actingAs($ownerA)->deleteJson("/api/team/{$memberB->id}")->assertNotFound();
    expect($memberB->fresh()->is_active)->toBeTrue();
});

it('کاربر بدون فروشگاه به بخش تیم دسترسی ندارد', function () {
    $manager = User::factory()->manager()->create();

    $this->actingAs($manager)->getJson('/api/team')->assertForbidden();
});
