<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * فیلدهای لازم برای دورهٔ آزمایشی و یادآوری تمدید.
     */
    public function up(): void
    {
        Schema::table('licenses', function (Blueprint $table) {
            // لایسنسی که با ثبت‌نام آنلاین صادر شده (دورهٔ آزمایشی)
            $table->boolean('is_trial')->default(false);
        });

        Schema::table('stores', function (Blueprint $table) {
            // چندمین یادآوری تمدید برای این فروشگاه فرستاده شده است
            // (۰ = هیچ، ۱ = هشدار ۷ روز، ۲ = هشدار ۳ روز، ۳ = هشدار ۱ روز، ۴ = روز انقضا/انقضا)
            $table->unsignedTinyInteger('license_reminder_stage')->default(0);
        });
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn('license_reminder_stage');
        });

        Schema::table('licenses', function (Blueprint $table) {
            $table->dropColumn('is_trial');
        });
    }
};
