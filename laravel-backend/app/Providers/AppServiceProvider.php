<?php

namespace App\Providers;

use App\Services\Billing\PaymentGatewayManager;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->usePublicPath(
            base_path(config('app.public_folder_path'))
        );

        // یک نمونهٔ مشترک تا درگاه‌های ثبت‌شده (extend) در کل درخواست معتبر بمانند.
        $this->app->singleton(PaymentGatewayManager::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
