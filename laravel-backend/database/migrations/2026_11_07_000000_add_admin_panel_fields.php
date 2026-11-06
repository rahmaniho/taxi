<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * فیلدهای لازم برای پنل مدیریت حرفه‌ای:
 * - آرشیو فروشگاه به‌جای حذف فوری (دادهٔ مالی حفظ می‌شود)
 * - ابطال پرداخت (void) با دلیل، بدون حذف رکورد
 * - نشانه‌گذاری فاکتور باطل‌شده
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->timestamp('archived_at')->nullable()->index();
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->timestamp('voided_at')->nullable();
            $table->string('void_reason', 300)->nullable();
            $table->index(['status', 'paid_at']);
        });

        Schema::table('subscription_invoices', function (Blueprint $table) {
            $table->timestamp('voided_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn('archived_at');
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->dropIndex(['status', 'paid_at']);
            $table->dropColumn(['voided_at', 'void_reason']);
        });

        Schema::table('subscription_invoices', function (Blueprint $table) {
            $table->dropColumn('voided_at');
        });
    }
};
