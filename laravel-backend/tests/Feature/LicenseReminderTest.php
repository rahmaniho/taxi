<?php

use App\Mail\LicenseExpiringMail;
use App\Models\License;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;

uses(RefreshDatabase::class);

/** فروشگاهی با لایسنس منقضی‌شونده در N روز. */
function reminderStore(int $days, ?bool $lifetime = false): array
{
    $store = Store::factory()->create(['license_reminder_stage' => 0]);

    User::factory()->forStore($store)->create(['email' => 'owner-'.uniqid().'@test.local']);

    $license = License::create([
        'store_id' => $store->id,
        'tier' => 'pro',
        'plan_code' => 'pro',
        'seats' => 1,
        'status' => 'active',
        'is_active' => true,
        'is_lifetime' => $lifetime,
        'starts_at' => now()->subMonths(11),
        'expires_at' => $lifetime ? null : now()->addDays($days),
    ]);

    return [$store, $license];
}

it('برای اشتراک دور از انقضا هیچ یادآوری نمی‌فرستد', function () {
    Mail::fake();
    [$store] = reminderStore(20);

    $this->artisan('karo:licenses:remind')->assertSuccessful();

    Mail::assertNothingSent();
    expect($store->fresh()->license_reminder_stage)->toBe(0);
});

it('در ۷ روز مانده یک یادآوری می‌فرستد و تکرار نمی‌کند', function () {
    Mail::fake();
    [$store] = reminderStore(5);

    $this->artisan('karo:licenses:remind')->assertSuccessful();

    Mail::assertSent(LicenseExpiringMail::class, 1);
    expect($store->fresh()->license_reminder_stage)->toBe(1);

    $this->artisan('karo:licenses:remind')->assertSuccessful();
    Mail::assertSent(LicenseExpiringMail::class, 1);
});

it('در ۳ و ۱ روز مانده و روز انقضا یادآوری‌ها را پله‌پله می‌فرستد', function () {
    Mail::fake();
    [$store, $license] = reminderStore(3);

    $this->artisan('karo:licenses:remind')->assertSuccessful();
    expect($store->fresh()->license_reminder_stage)->toBe(2);

    $license->forceFill(['expires_at' => now()->addDay()])->save();
    $this->artisan('karo:licenses:remind')->assertSuccessful();
    expect($store->fresh()->license_reminder_stage)->toBe(3);

    $license->forceFill(['expires_at' => now()])->save();
    $this->artisan('karo:licenses:remind')->assertSuccessful();
    expect($store->fresh()->license_reminder_stage)->toBe(4);

    Mail::assertSent(LicenseExpiringMail::class, 3);
});

it('پس از انقضا اطلاع انقضا می‌فرستد و در تاریخچه ثبت می‌کند', function () {
    Mail::fake();
    [$store] = reminderStore(-2);

    $this->artisan('karo:licenses:remind')->assertSuccessful();

    Mail::assertSent(LicenseExpiringMail::class, 1);
    expect($store->fresh()->license_reminder_stage)->toBe(4);

    $this->assertDatabaseHas('audit_logs', [
        'action' => 'license_expired_notice',
        'store_id' => $store->id,
    ]);
});

it('لایسنس مادام‌العمر و بدون انقضا یادآوری ندارد', function () {
    Mail::fake();
    reminderStore(0, true);

    $this->artisan('karo:licenses:remind')->assertSuccessful();

    Mail::assertNothingSent();
});

it('حالت پیش‌نمایش چیزی ارسال یا علامت‌گذاری نمی‌کند', function () {
    Mail::fake();
    [$store] = reminderStore(5);

    $this->artisan('karo:licenses:remind', ['--dry-run' => true])->assertSuccessful();

    Mail::assertNothingSent();
    expect($store->fresh()->license_reminder_stage)->toBe(0);
});
