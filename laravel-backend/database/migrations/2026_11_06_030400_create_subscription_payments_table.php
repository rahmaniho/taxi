<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * هر تلاش پرداخت برای یک سفارش اشتراک.
 *
 * یک سفارش می‌تواند چند تلاش داشته باشد (پرداخت ناموفق، تلاش دوباره)؛ ردیف
 * تأییدشده مرجع «پرداخت» است و کلید یکتای درگاه جلوی ثبت تکراری را می‌گیرد.
 * هیچ دادهٔ کارت/رمز درگاه اینجا ذخیره نمی‌شود؛ فقط شناسهٔ مرجع و وضعیت.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('subscription_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->string('gateway', 40);
            $table->unsignedBigInteger('amount');
            $table->string('currency', 8)->default('toman');
            $table->string('status', 20)->default('pending')->index(); // pending | paid | failed | canceled
            $table->string('authority', 120)->nullable(); // شناسهٔ درخواست نزد درگاه
            $table->string('reference_id', 120)->nullable()->index(); // شمارهٔ پیگیری/تأیید درگاه
            $table->json('payload')->nullable(); // فقط داده‌های غیرحساس (کد وضعیت، پیام درگاه)
            $table->timestamp('verified_at')->nullable();
            $table->timestamps();

            $table->index(['order_id', 'status']);
            $table->index(['store_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('subscription_payments');
    }
};
