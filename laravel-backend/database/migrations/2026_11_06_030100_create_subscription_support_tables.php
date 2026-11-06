<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * تاریخچهٔ تعرفه‌ها، کوپن‌ها، فاکتورها و تاریخچهٔ تغییرات اشتراک.
     *
     * اصل حسابرسی: هر تغییر تعرفه یک ردیف تاریخچه می‌سازد و هر سفارش، قیمت
     * واحد خودش (base/extra) را در خودش نگه می‌دارد؛ بنابراین تغییر تعرفه هیچ
     * اثر بازنویسی روی سفارش‌های قبلی ندارد.
     */
    public function up(): void
    {
        Schema::create('subscription_plan_prices', function (Blueprint $table) {
            $table->id();
            $table->string('plan_code', 40)->index();
            $table->unsignedBigInteger('base_monthly');
            $table->unsignedBigInteger('extra_user_monthly');
            $table->string('note', 200)->nullable();
            $table->foreignId('changed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('changed_at')->index();
            $table->timestamps();
        });

        Schema::create('subscription_coupons', function (Blueprint $table) {
            $table->id();
            $table->string('code', 40)->unique();
            $table->string('type', 10); // percent | fixed
            $table->unsignedBigInteger('value');
            $table->string('plan_code', 40)->nullable()->index(); // خالی = همهٔ پلن‌ها
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('ends_at')->nullable();
            $table->unsignedInteger('max_uses')->nullable();
            $table->unsignedInteger('used_count')->default(0);
            $table->boolean('is_active')->default(true)->index();
            $table->text('description')->nullable();
            $table->timestamps();
        });

        Schema::create('subscription_invoices', function (Blueprint $table) {
            $table->id();
            $table->string('number', 40)->unique();
            $table->foreignId('order_id')->unique()->constrained('orders')->cascadeOnDelete();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->unsignedBigInteger('subtotal');
            $table->unsignedBigInteger('discount')->default(0);
            $table->unsignedBigInteger('total');
            $table->json('lines')->nullable();
            $table->timestamp('issued_at')->index();
            $table->timestamps();
        });

        Schema::create('subscription_history', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('license_id')->nullable()->constrained('licenses')->nullOnDelete();
            $table->string('action', 40)->index();
            $table->string('reason', 300)->nullable();
            $table->json('payload')->nullable();
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('created_at')->nullable()->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('subscription_history');
        Schema::dropIfExists('subscription_invoices');
        Schema::dropIfExists('subscription_coupons');
        Schema::dropIfExists('subscription_plan_prices');
    }
};
