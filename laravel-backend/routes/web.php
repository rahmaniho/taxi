<?php

use App\Http\Controllers\Api\AuditController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BillingController;
use App\Http\Controllers\Api\LicenseController;
use App\Http\Controllers\Api\Manager\CouponController;
use App\Http\Controllers\Api\Manager\DashboardController;
use App\Http\Controllers\Api\Manager\ManagerAccountController;
use App\Http\Controllers\Api\Manager\OrderController;
use App\Http\Controllers\Api\Manager\PlanController;
use App\Http\Controllers\Api\Manager\StoreController;
use App\Http\Controllers\Api\Manager\SubscriberController;
use App\Http\Controllers\Api\RegistrationController;
use App\Http\Controllers\Api\TeamController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API احراز هویت و اشتراک (نشست لاراول + CSRF)
|--------------------------------------------------------------------------
|
| سرور صرفاً احراز هویت، مدیریت اشتراک‌ها و پنل مدیر کل را بر عهده دارد؛
| داده‌های عملیاتی آژانس (سفرها، رانندگان، مشترکین و حسابداری) به‌صورت کاملاً
| آفلاین در مرورگر کاربر (localStorage + IndexedDB) نگهداری می‌شوند.
|
*/

Route::prefix('api')->group(function () {
    // دریافت/تازه‌سازی توکن CSRF برای کلاینت PWA کش‌شده در Service Worker
    Route::get('csrf', fn () => response()->json([
        'ok' => true,
        'csrf_token' => csrf_token(),
    ]))->middleware('throttle:120,1')->name('api.csrf');

    Route::post('login', [AuthController::class, 'login'])
        ->middleware('throttle:10,1')
        ->name('api.login');

    // ————— ثبت‌نام و تعرفه‌ها (ثبت‌نام عمومی به‌صورت پیش‌فرض غیرفعال است) —————
    Route::post('register', [RegistrationController::class, 'store'])
        ->middleware('throttle:10,60')
        ->name('api.register');

    Route::get('subscription/plans', [BillingController::class, 'plans'])
        ->middleware('throttle:120,1')
        ->name('api.plans');

    Route::get('subscription/quote', [BillingController::class, 'quote'])
        ->middleware('throttle:120,1')
        ->name('api.subscription.quote');

    Route::get('billing/callback', [BillingController::class, 'callback'])
        ->name('api.billing.callback');

    Route::middleware('auth')->group(function () {
        Route::post('logout', [AuthController::class, 'logout'])->name('api.logout');
        Route::get('me', [AuthController::class, 'me'])->name('api.me');
        Route::get('license', [LicenseController::class, 'show'])->name('api.license');
        Route::get('audit', [AuditController::class, 'mine'])->name('api.audit');

        // ————— وضعیت اشتراک و کاربران آژانس —————
        Route::middleware('store.user')->group(function () {
            Route::get('subscription', [BillingController::class, 'show'])->name('api.subscription');
            Route::get('subscription/status', [BillingController::class, 'status'])->name('api.subscription.status');
            Route::post('subscription/checkout', [BillingController::class, 'checkout'])
                ->middleware('throttle:15,1')
                ->name('api.subscription.checkout');
            Route::get('subscription/invoices/{number}', [BillingController::class, 'invoice'])
                ->name('api.subscription.invoice');

            Route::get('team', [TeamController::class, 'index'])->name('api.team');
            Route::post('team', [TeamController::class, 'store'])->name('api.team.store');
            Route::put('team/{member}', [TeamController::class, 'update'])->name('api.team.update');
            Route::delete('team/{member}', [TeamController::class, 'destroy'])->name('api.team.destroy');
            Route::post('team/{member}/restore', [TeamController::class, 'restore'])->name('api.team.restore');
        });

        // ————— مدیر کل: داشبورد، آژانس‌ها، اشتراک‌ها، تعرفه‌ها، پرداخت‌ها و مدیران —————
        Route::middleware(['manager', 'throttle:180,1'])->prefix('manager')->group(function () {
            Route::get('dashboard', [DashboardController::class, 'index']);

            Route::get('managers', [ManagerAccountController::class, 'index']);
            Route::post('managers', [ManagerAccountController::class, 'store'])
                ->middleware('throttle:30,1');
            Route::put('managers/{manager}', [ManagerAccountController::class, 'update'])
                ->middleware('throttle:30,1');
            Route::delete('managers/{manager}', [ManagerAccountController::class, 'destroy'])
                ->middleware('throttle:30,1');

            Route::get('stores', [StoreController::class, 'index']);
            Route::post('stores', [StoreController::class, 'store'])
                ->middleware('throttle:30,1');
            Route::get('stores/{store}', [StoreController::class, 'show']);
            Route::put('stores/{store}', [StoreController::class, 'update'])
                ->middleware('throttle:60,1');
            Route::delete('stores/{store}', [StoreController::class, 'destroy'])
                ->middleware('throttle:20,1');
            Route::post('stores/{store}/restore', [StoreController::class, 'restore'])
                ->middleware('throttle:30,1');
            Route::put('stores/{store}/license', [StoreController::class, 'updateLicense'])
                ->middleware('throttle:60,1');

            Route::get('audit', [AuditController::class, 'index']);
            Route::get('audit/actions', [AuditController::class, 'actions']);

            Route::get('orders', [OrderController::class, 'index']);
            Route::post('orders/{order}/approve', [OrderController::class, 'approve'])
                ->middleware('throttle:30,1');
            Route::post('orders/{order}/reject', [OrderController::class, 'reject'])
                ->middleware('throttle:30,1');
            Route::post('orders/{order}/void', [OrderController::class, 'void'])
                ->middleware('throttle:20,1');

            Route::post('subscription/trial', [BillingController::class, 'grantTrial'])
                ->middleware('throttle:30,1');

            Route::get('plans', [PlanController::class, 'index']);
            Route::post('plans', [PlanController::class, 'store'])
                ->middleware('throttle:30,1');
            Route::put('plans/{plan:code}', [PlanController::class, 'update'])
                ->middleware('throttle:30,1');
            Route::patch('plans/{plan:code}/toggle', [PlanController::class, 'toggle'])
                ->middleware('throttle:30,1');
            Route::get('plans/{plan:code}/prices', [PlanController::class, 'prices']);

            Route::get('coupons', [CouponController::class, 'index']);
            Route::post('coupons', [CouponController::class, 'store'])
                ->middleware('throttle:30,1');
            Route::put('coupons/{coupon}', [CouponController::class, 'update'])
                ->middleware('throttle:30,1');
            Route::delete('coupons/{coupon}', [CouponController::class, 'destroy'])
                ->middleware('throttle:30,1');

            Route::get('subscribers', [SubscriberController::class, 'index']);
            Route::get('subscribers/{license}', [SubscriberController::class, 'show']);
            Route::post('subscribers/{license}/extend', [SubscriberController::class, 'extend'])
                ->middleware('throttle:40,1');
            Route::post('subscribers/{license}/status', [SubscriberController::class, 'status'])
                ->middleware('throttle:40,1');
            Route::post('subscribers/{license}/seats', [SubscriberController::class, 'seats'])
                ->middleware('throttle:40,1');
        });
    });
});

/*
|--------------------------------------------------------------------------
| تحویل PWA آفلاین‌محور (تاکسی کارن)
|--------------------------------------------------------------------------
*/

$serveTaxiPwa = function () {
    $path = public_path('taxi.html');
    if (! is_file($path)) {
        $fallback = base_path('../taxi.html');
        $path = is_file($fallback) ? $fallback : $path;
    }

    abort_unless(is_file($path), 404, 'فایل برنامهٔ تاکسی کارن یافت نشد.');

    return response(file_get_contents($path), 200, [
        'Content-Type' => 'text/html; charset=utf-8',
        'Cache-Control' => 'no-cache',
    ]);
};

Route::get('/', $serveTaxiPwa)->name('app');

Route::get('/{any}', $serveTaxiPwa)
    ->where('any', '^(?!api|up|icons|sw\.js|manifest\.json|taxi\.html|storage|media|_ignition).*$')
    ->name('app.fallback');
