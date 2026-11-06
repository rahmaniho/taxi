<?php

use App\Models\License;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

function makeAgencyWithLicense(string $name, bool $expired = false): array
{
    $store = Store::factory()->create(['name' => $name, 'is_active' => true]);
    $user = User::factory()->create([
        'role' => User::ROLE_STORE,
        'store_id' => $store->id,
        'is_active' => true,
    ]);
    $license = License::factory()->create([
        'store_id' => $store->id,
        'status' => $expired ? 'expired' : 'active',
        'is_active' => true,
        'is_lifetime' => false,
        'expires_at' => $expired ? now()->subDays(2) : now()->addDays(60),
    ]);

    return [$store, $user, $license];
}

it('merges offline records, custom logo, and tombstones across devices while isolating stores', function () {
    [, $userA] = makeAgencyWithLicense('آژانس الف');
    [, $userB] = makeAgencyWithLicense('آژانس ب');

    $this->actingAs($userA)
        ->getJson('/api/sync')
        ->assertOk()
        ->assertJsonPath('empty', true)
        ->assertJsonPath('revision', 0);

    // دستگاه اول (آفلاین بوده و سفر ۱ + لوگوی آژانس را ثبت کرده)
    $push1 = $this->actingAs($userA)->postJson('/api/sync', [
        'base_revision' => 0,
        'data' => [
            'trips' => [
                ['id' => 't1', 'passengerName' => 'مسافر اول', 'fare' => 150000, 'rev' => 1, 'updatedAt' => '2026-11-07T08:00:00Z'],
                ['id' => 't-del', 'passengerName' => 'حذف‌شدنی', 'fare' => 90000, 'rev' => 1, 'updatedAt' => '2026-11-07T08:00:00Z'],
            ],
            'settings' => [
                'companyName' => 'آژانس تاکسی الف',
                'logo' => ['data' => 'data:image/png;base64,iVBORw0KGgo=', 'originalName' => 'logo.png'],
            ],
            'settingsUpdatedAt' => '2026-11-07T08:05:00Z',
            'meta' => ['counters' => ['trip' => 2]],
        ],
    ])->assertOk();

    $rev1 = $push1->json('revision');
    expect($rev1)->toBe(1)
        ->and($push1->json('data.settings.logo.originalName'))->toBe('logo.png');

    // بهینه‌سازی since_revision
    $this->actingAs($userA)
        ->getJson("/api/sync?since_revision={$rev1}")
        ->assertOk()
        ->assertJsonPath('unchanged', true);

    // دستگاه دوم (سفر ۲ را آفلاین ثبت کرده و t-del را حذف کرده است)
    $push2 = $this->actingAs($userA)->postJson('/api/sync', [
        'base_revision' => 0,
        'data' => [
            'trips' => [
                ['id' => 't2', 'passengerName' => 'مسافر دوم', 'fare' => 220000, 'rev' => 1, 'updatedAt' => '2026-11-07T09:00:00Z'],
            ],
            'meta' => [
                'counters' => ['trip' => 5],
                'tombstones' => [
                    'trips' => ['t-del' => '2026-11-07T09:10:00Z'],
                ],
            ],
        ],
    ])->assertOk();

    $tripIds = collect($push2->json('data.trips'))->pluck('id')->sort()->values()->all();
    expect($tripIds)->toBe(['t1', 't2'])
        ->and($push2->json('data.meta.counters.trip'))->toBe(5)
        ->and($push2->json('data.settings.logo.originalName'))->toBe('logo.png');

    // آژانس دوم به داده‌های آژانس اول دسترسی ندارد
    $this->actingAs($userB)
        ->getJson('/api/sync')
        ->assertOk()
        ->assertJsonPath('empty', true);
});

it('blocks cloud sync writes when subscription is expired while still allowing pull', function () {
    [$store, $user, $license] = makeAgencyWithLicense('آژانس منقضی', false);

    $this->actingAs($user)->postJson('/api/sync', [
        'data' => [
            'trips' => [['id' => 't1', 'passengerName' => 'قبل از انقضا', 'updatedAt' => '2026-11-07T07:00:00Z']],
        ],
    ])->assertOk();

    $license->update(['status' => 'expired', 'expires_at' => now()->subDay()]);

    $this->actingAs($user->fresh())
        ->postJson('/api/sync', ['data' => ['trips' => []]])
        ->assertStatus(403);

    $this->actingAs($user->fresh())
        ->getJson('/api/sync')
        ->assertOk()
        ->assertJsonPath('data.trips.0.passengerName', 'قبل از انقضا');
});
