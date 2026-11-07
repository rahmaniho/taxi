<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * ارتقای کاتالوگ اشتراک به ۵ پلن رسمی تاکسینو (TAXINO — کارن سافت).
     *
     * تمام مبالغ به تومان ذخیره می‌شوند و هنگام ایجاد سفارش، قیمت لحظهٔ خرید
     * در `orders.price_snapshot` و `orders.amount` قفل می‌شود تا تغییر تعرفهٔ آینده
     * سفارش‌های قبلی را دگرگون نکند.
     */
    public function up(): void
    {
        Schema::table('subscription_plans', function (Blueprint $table) {
            $table->unsignedInteger('duration_days')->nullable()->after('description');
            $table->unsignedSmallInteger('months_count')->nullable()->after('duration_days');
            $table->unsignedBigInteger('total_price')->nullable()->after('months_count');
            $table->string('badge', 120)->nullable()->after('is_lifetime');
            $table->boolean('is_featured')->default(false)->after('badge');
        });

        // غیرفعال‌سازی پلن‌های نمونهٔ اولیه تا کاتالوگ فروش فقط ۵ پلن رسمی تاکسینو را نشان دهد
        // و هم‌زمان یکپارچگی ارجاع لایسنس‌ها/سفارش‌های قبلی حفظ شود.
        DB::table('subscription_plans')
            ->whereIn('code', ['basic', 'pro', 'proplus'])
            ->update(['is_active' => false, 'sort_order' => 900]);

        $now = now();
        $commonFeatures = [
            'ثبت سفر، صف انتظار و نوبت‌دهی هوشمند رانندگان',
            'حسابداری کامل، صورت‌حساب مشترکین و تسویه رانندگان',
            'کارکرد آفلاین روی دستگاه + همگام‌سازی ابری آژانس',
            'چاپ رسید، گزارش‌های مالی و پشتیبان‌گیری رمزنگاری‌شده',
        ];

        $officialPlans = [
            [
                'code' => 'monthly',
                'name' => 'یک‌ماهه',
                'tier' => 'proplus',
                'description' => 'مناسب شروع استفاده از تاکسینو و تجربه امکانات نرم‌افزار.',
                'duration_days' => 30,
                'months_count' => 1,
                'total_price' => 150_000,
                'base_monthly' => 150_000,
                'extra_user_monthly' => 0,
                'min_seats' => 1,
                'max_seats' => 50,
                'is_lifetime' => false,
                'badge' => null,
                'is_featured' => false,
                'features' => json_encode($commonFeatures, JSON_UNESCAPED_UNICODE),
                'is_active' => true,
                'sort_order' => 10,
            ],
            [
                'code' => 'quarterly',
                'name' => 'سه‌ماهه',
                'tier' => 'proplus',
                'description' => 'انتخابی اقتصادی برای استفاده میان‌مدت.',
                'duration_days' => 90,
                'months_count' => 3,
                'total_price' => 420_000,
                'base_monthly' => 140_000,
                'extra_user_monthly' => 0,
                'min_seats' => 1,
                'max_seats' => 50,
                'is_lifetime' => false,
                'badge' => '۳۰٬۰۰۰ تومان صرفه‌جویی',
                'is_featured' => false,
                'features' => json_encode($commonFeatures, JSON_UNESCAPED_UNICODE),
                'is_active' => true,
                'sort_order' => 20,
            ],
            [
                'code' => 'semiannual',
                'name' => 'شش‌ماهه',
                'tier' => 'proplus',
                'description' => 'مناسب دفاتر تاکسی تلفنی که به دنبال مدیریت اقتصادی‌تر اشتراک هستند.',
                'duration_days' => 180,
                'months_count' => 6,
                'total_price' => 780_000,
                'base_monthly' => 130_000,
                'extra_user_monthly' => 0,
                'min_seats' => 1,
                'max_seats' => 50,
                'is_lifetime' => false,
                'badge' => '۱۲۰٬۰۰۰ تومان صرفه‌جویی',
                'is_featured' => false,
                'features' => json_encode($commonFeatures, JSON_UNESCAPED_UNICODE),
                'is_active' => true,
                'sort_order' => 30,
            ],
            [
                'code' => 'yearly',
                'name' => 'یک‌ساله',
                'tier' => 'proplus',
                'description' => 'بهترین انتخاب برای استفاده مستمر و بدون دغدغه تمدید ماهانه.',
                'duration_days' => 365,
                'months_count' => 12,
                'total_price' => 1_200_000,
                'base_monthly' => 100_000,
                'extra_user_monthly' => 0,
                'min_seats' => 1,
                'max_seats' => 50,
                'is_lifetime' => false,
                'badge' => 'پیشنهاد ویژه · بهترین انتخاب',
                'is_featured' => true,
                'features' => json_encode($commonFeatures, JSON_UNESCAPED_UNICODE),
                'is_active' => true,
                'sort_order' => 40,
            ],
            [
                'code' => 'lifetime',
                'name' => 'مادام‌العمر',
                'tier' => 'proplus',
                'description' => 'پرداخت یک‌باره و استفاده دائمی از نسخه خریداری‌شده مطابق شرایط لایسنس.',
                'duration_days' => null,
                'months_count' => 0,
                'total_price' => 7_000_000,
                'base_monthly' => 7_000_000,
                'extra_user_monthly' => 0,
                'min_seats' => 1,
                'max_seats' => 50,
                'is_lifetime' => true,
                'badge' => 'پرداخت یک‌باره | بدون تمدید دوره‌ای',
                'is_featured' => false,
                'features' => json_encode([
                    'دسترسی دائمی به نسخه خریداری‌شده مطابق شرایط لایسنس',
                    'پرداخت یک‌باره بدون نیاز به تمدید ماهانه یا سالانه',
                    'کارکرد آفلاین روی دستگاه + همگام‌سازی ابری آژانس',
                    'شرایط به‌روزرسانی و پشتیبانی مطابق شرایط محصول',
                ], JSON_UNESCAPED_UNICODE),
                'is_active' => true,
                'sort_order' => 50,
            ],
        ];

        foreach ($officialPlans as $plan) {
            DB::table('subscription_plans')->updateOrInsert(
                ['code' => $plan['code']],
                [...$plan, 'created_at' => $now, 'updated_at' => $now],
            );
        }
    }

    public function down(): void
    {
        DB::table('subscription_plans')
            ->whereIn('code', ['monthly', 'quarterly', 'semiannual', 'yearly', 'lifetime'])
            ->delete();

        DB::table('subscription_plans')
            ->whereIn('code', ['basic', 'pro', 'proplus'])
            ->update(['is_active' => true]);

        Schema::table('subscription_plans', function (Blueprint $table) {
            $table->dropColumn(['duration_days', 'months_count', 'total_price', 'badge', 'is_featured']);
        });
    }
};
