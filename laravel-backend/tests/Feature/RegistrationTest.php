<?php

use App\Models\License;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('closes public self-registration by default so only managers create agencies', function () {
    expect(config('billing.public_registration'))->toBeFalse();

    $this->postJson('/api/register', [
        'store_name' => 'آژانس بسته',
        'email' => 'closed@test.local',
        'password' => 'secret-pass',
        'password_confirmation' => 'secret-pass',
        'terms' => true,
    ])->assertStatus(422);

    expect(Store::where('name', 'آژانس بسته')->exists())->toBeFalse();
});

it('registers an agency with a trial license when public registration is enabled', function () {
    config(['billing.public_registration' => true]);

    $response = $this->postJson('/api/register', [
        'store_name' => 'آژانس ستاره',
        'owner_name' => 'مریم احمدی',
        'phone' => '09120000000',
        'email' => 'maryam@test.local',
        'password' => 'secret-pass',
        'password_confirmation' => 'secret-pass',
        'terms' => true,
    ])->assertCreated();

    expect($response->json('user.email'))->toBe('maryam@test.local')
        ->and($response->json('user.role'))->toBe('store')
        ->and($response->json('user.store.name'))->toBe('آژانس ستاره');

    $store = Store::where('name', 'آژانس ستاره')->firstOrFail();
    $user = User::where('email', 'maryam@test.local')->firstOrFail();

    expect($user->store_id)->toBe($store->id);

    $license = $store->license()->firstOrFail();
    expect($license->is_trial)->toBeTrue()
        ->and($license->tier)->toBe('pro')
        ->and($license->isCurrentlyValid())->toBeTrue()
        ->and($license->daysRemaining())->toBeGreaterThanOrEqual(13);

    $this->getJson('/api/me')->assertOk()->assertJsonPath('user.id', $user->id);

    $this->assertDatabaseHas('audit_logs', [
        'action' => 'store_self_registered',
        'store_id' => $store->id,
        'user_id' => $user->id,
    ]);
});

it('rejects a duplicate email when public registration is enabled', function () {
    config(['billing.public_registration' => true]);
    User::factory()->create(['email' => 'taken@test.local']);

    $this->postJson('/api/register', [
        'store_name' => 'آژانس تکراری',
        'email' => 'taken@test.local',
        'password' => 'secret-pass',
        'password_confirmation' => 'secret-pass',
        'terms' => true,
    ])->assertStatus(422)->assertJsonValidationErrors('email');
});

it('requires a strong enough password and accepted terms', function () {
    config(['billing.public_registration' => true]);

    $this->postJson('/api/register', [
        'store_name' => 'آژانس ضعیف',
        'email' => 'weak@test.local',
        'password' => '123',
        'password_confirmation' => '123',
    ])->assertStatus(422)->assertJsonValidationErrors(['password', 'terms']);
});
