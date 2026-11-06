<?php

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

it('مدیر کل می‌تواند مدیر جدید بسازد و رمز او هش می‌شود', function () {
    $manager = User::factory()->manager()->create();

    $response = $this->actingAs($manager)->postJson('/api/manager/managers', [
        'name' => 'مدیر دوم',
        'email' => 'second-manager@test.local',
        'password' => 'strong-pass-9',
    ])->assertCreated();

    expect($response->json('manager.email'))->toBe('second-manager@test.local');

    $created = User::where('email', 'second-manager@test.local')->firstOrFail();
    expect($created->role)->toBe(User::ROLE_MANAGER)
        ->and(Hash::check('strong-pass-9', $created->password))->toBeTrue();

    $this->assertDatabaseHas('audit_logs', ['action' => 'manager_created', 'subject_key' => $created->id]);
});

it('ایمیل تکراری و رمز کوتاه رد می‌شود', function () {
    $manager = User::factory()->manager()->create();
    User::factory()->manager()->create(['email' => 'dup@test.local']);

    $this->actingAs($manager)->postJson('/api/manager/managers', [
        'name' => 'تکراری',
        'email' => 'dup@test.local',
        'password' => 'strong-pass-9',
    ])->assertStatus(422)->assertJsonValidationErrors('email');

    $this->actingAs($manager)->postJson('/api/manager/managers', [
        'name' => 'رمز کوتاه',
        'email' => 'short@test.local',
        'password' => '1234',
    ])->assertStatus(422)->assertJsonValidationErrors('password');
});

it('مدیر کل نمی‌تواند حساب خودش را غیرفعال کند', function () {
    $manager = User::factory()->manager()->create();

    $this->actingAs($manager)
        ->deleteJson("/api/manager/managers/{$manager->id}")
        ->assertStatus(422);

    $this->actingAs($manager)
        ->putJson("/api/manager/managers/{$manager->id}", ['is_active' => false])
        ->assertStatus(422);

    expect($manager->fresh()->is_active)->toBeTrue();
});

it('غیرفعال‌سازی مدیر دیگر ثبت می‌شود و ورودش را می‌بندد', function () {
    $manager = User::factory()->manager()->create();
    $other = User::factory()->manager()->create([
        'email' => 'other-manager@test.local',
        'password' => Hash::make('password'),
    ]);

    $this->actingAs($manager)
        ->deleteJson("/api/manager/managers/{$other->id}")
        ->assertOk()
        ->assertJsonPath('manager.is_active', false);

    expect($other->fresh()->is_active)->toBeFalse();
    $this->assertDatabaseHas('audit_logs', ['action' => 'manager_deactivated', 'subject_key' => $other->id]);

    $this->postJson('/api/login', ['email' => 'other-manager@test.local', 'password' => 'password'])
        ->assertStatus(422);
});

it('کاربر فروشگاه به مدیریت حساب‌های مدیر دسترسی ندارد', function () {
    $store = Store::factory()->create();
    $user = User::factory()->forStore($store)->create();

    $this->actingAs($user)->getJson('/api/manager/managers')->assertForbidden();
    $this->actingAs($user)->postJson('/api/manager/managers', [
        'name' => 'نفوذی',
        'email' => 'intruder@test.local',
        'password' => 'strong-pass-9',
    ])->assertForbidden();
});
