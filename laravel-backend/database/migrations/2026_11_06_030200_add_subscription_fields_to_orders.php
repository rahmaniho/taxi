<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * سفارش‌ها به «سفارش اشتراک» کامل تبدیل می‌شوند: تعداد کاربر، قیمت واحد
     * لحظهٔ خرید، تخفیف و نوع سفارش. مبلغ نهایی همیشه از همین ستون‌ها ساخته
     * می‌شود، نه از تعرفهٔ فعلی پلن.
     */
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->string('type', 20)->default('new')->index(); // new | renewal | upgrade | seats
            $table->unsignedSmallInteger('seats')->default(1);
            $table->unsignedSmallInteger('extra_users')->default(0);
            $table->unsignedBigInteger('base_monthly')->default(0);
            $table->unsignedBigInteger('extra_user_monthly')->default(0);
            $table->unsignedBigInteger('subtotal')->default(0);
            $table->unsignedBigInteger('discount')->default(0);
            $table->string('coupon_code', 40)->nullable();
            $table->json('price_snapshot')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn([
                'type', 'seats', 'extra_users', 'base_monthly', 'extra_user_monthly',
                'subtotal', 'discount', 'coupon_code', 'price_snapshot',
            ]);
        });
    }
};
