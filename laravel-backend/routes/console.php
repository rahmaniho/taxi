<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// یادآوری روزانهٔ تمدید اشتراک (نیازمند cron روی سرور: * * * * * php artisan schedule:run)
Schedule::command('taxi:licenses:remind')->dailyAt('09:00');
