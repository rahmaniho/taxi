<?php

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

it('logs a manager in with valid credentials', function () {
    $manager = User::factory()->manager()->create([
        'email' => 'manager@test.local',
        'password' => Hash::make('secret123'),
    ]);

    $this->postJson('/api/login', [
        'email' => 'manager@test.local',
        'password' => 'secret123',
    ])
        ->assertOk()
        ->assertJsonPath('user.role', 'manager')
        ->assertJsonPath('user.store_id', null);

    $this->assertAuthenticatedAs($manager);
});

it('logs a store user in and exposes its store', function () {
    $store = Store::factory()->create(['name' => 'فروشگاه نمونه']);
    $user = User::factory()->forStore($store)->create([
        'email' => 'store@test.local',
        'password' => Hash::make('secret123'),
    ]);

    $this->postJson('/api/login', [
        'email' => 'store@test.local',
        'password' => 'secret123',
    ])
        ->assertOk()
        ->assertJsonPath('user.role', 'store')
        ->assertJsonPath('user.store.name', 'فروشگاه نمونه');

    $this->assertAuthenticatedAs($user);
});

it('rejects wrong credentials', function () {
    User::factory()->create([
        'email' => 'user@test.local',
        'password' => Hash::make('secret123'),
    ]);

    $this->postJson('/api/login', [
        'email' => 'user@test.local',
        'password' => 'nope',
    ])
        ->assertStatus(422)
        ->assertJsonValidationErrors('email');
});

it('rejects inactive accounts', function () {
    User::factory()->create([
        'email' => 'off@test.local',
        'password' => Hash::make('secret123'),
        'is_active' => false,
    ]);

    $this->postJson('/api/login', [
        'email' => 'off@test.local',
        'password' => 'secret123',
    ])
        ->assertStatus(422)
        ->assertJsonValidationErrors('email');
});

it('returns the authenticated user from /api/me', function () {
    $manager = User::factory()->manager()->create();

    $this->actingAs($manager)
        ->getJson('/api/me')
        ->assertOk()
        ->assertJsonPath('user.id', $manager->id);
});

it('logs a store user in using the agency mobile number (including Persian digits)', function () {
    $store = Store::factory()->create([
        'name' => 'آژانس تاکسینو تهران',
        'phone' => '0912-345-6789',
    ]);
    $user = User::factory()->forStore($store)->create([
        'email' => 'tehran@taxino.ir',
        'password' => Hash::make('secret123'),
    ]);

    $this->postJson('/api/login', [
        'email' => '۰۹۱۲۳۴۵۶۷۸۹',
        'password' => 'secret123',
    ])
        ->assertOk()
        ->assertJsonPath('user.role', 'store')
        ->assertJsonPath('user.store.name', 'آژانس تاکسینو تهران');

    $this->assertAuthenticatedAs($user);
});

it('requires authentication for protected endpoints', function () {
    $this->getJson('/api/me')->assertUnauthorized();
    $this->getJson('/api/manager/stores')->assertUnauthorized();
});
