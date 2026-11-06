<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * پلن‌های اشتراک (تعرفه‌ها) — منبع واحد قیمت در سرور.
     *
     * قیمت‌ها به تومان و «ماهانه» ذخیره می‌شوند:
     *   base_monthly       = قیمت یک کاربر برای یک ماه
     *   extra_user_monthly = هزینهٔ هر کاربرِ اضافه (از کاربر دوم به بعد) در ماه
     */
    public function up(): void
    {
        Schema::create('subscription_plans', function (Blueprint $table) {
            $table->id();
            $table->string('code', 40)->unique();
            $table->string('name', 80);
            $table->string('tier', 20)->default('pro'); // pro | proplus
            $table->string('description', 200)->nullable();

            $table->unsignedBigInteger('base_monthly')->default(0);
            $table->unsignedBigInteger('extra_user_monthly')->default(0);
            $table->unsignedSmallInteger('min_seats')->default(1);
            $table->unsignedSmallInteger('max_seats')->default(50);

            $table->boolean('is_lifetime')->default(false);
            $table->json('features')->nullable();
            $table->boolean('is_active')->default(true)->index();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        $now = now();
        DB::table('subscription_plans')->insert([
            [
                'code' => 'basic',
                'name' => 'پایه',
                'tier' => 'pro',
                'description' => 'ثبت سفر، صف انتظار، رانندگان و مشترکین، کارکرد کامل آفلاین',
                'base_monthly' => 30_000,
                'extra_user_monthly' => 15_000,
                'min_seats' => 1,
                'max_seats' => 50,
                'is_lifetime' => false,
                'features' => json_encode([
                    'ثبت سفر، صف انتظار و نوبت‌دهی رانندگان',
                    'مدیریت رانندگان، خودروها و مشترکین',
                    'کارکرد کامل آفلاین روی دستگاه',
                    'چاپ رسید سفر و پشتیبان‌گیری JSON',
                ], JSON_UNESCAPED_UNICODE),
                'is_active' => true,
                'sort_order' => 10,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'code' => 'pro',
                'name' => 'حرفه‌ای',
                'tier' => 'pro',
                'description' => 'همهٔ امکانات پایه + حسابداری کامل ۸ تب، اسناد چاپی و بکاپ رمزنگاری‌شده',
                'base_monthly' => 60_000,
                'extra_user_monthly' => 15_000,
                'min_seats' => 1,
                'max_seats' => 50,
                'is_lifetime' => false,
                'features' => json_encode([
                    'همهٔ امکانات نسخهٔ پایه',
                    'حسابداری کامل، سود و زیان و بستن ماه',
                    'تسویهٔ گروهی رانندگان و فاکتور مشترکین',
                    'پشتیبان رمزگذاری‌شده (AES-GCM)',
                ], JSON_UNESCAPED_UNICODE),
                'is_active' => true,
                'sort_order' => 20,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'code' => 'proplus',
                'name' => 'حرفه‌ای پلاس',
                'tier' => 'proplus',
                'description' => 'همهٔ امکانات حرفه‌ای + چند اپراتور، صندوق شیفت و پشتیبانی اولویت‌دار',
                'base_monthly' => 120_000,
                'extra_user_monthly' => 20_000,
                'min_seats' => 1,
                'max_seats' => 50,
                'is_lifetime' => false,
                'features' => json_encode([
                    'همهٔ امکانات نسخهٔ حرفه‌ای',
                    'مدیریت چند اپراتور، نقش‌ها و تحویل شیفت',
                    'بستهٔ همگام‌سازی بین دستگاه‌ها',
                    'پشتیبانی اختصاصی و اولویت‌دار',
                ], JSON_UNESCAPED_UNICODE),
                'is_active' => true,
                'sort_order' => 30,
                'created_at' => $now,
                'updated_at' => $now,
            ],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('subscription_plans');
    }
};
