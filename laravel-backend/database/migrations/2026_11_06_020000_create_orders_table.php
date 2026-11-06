<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * سفارش‌های خرید/تمدید لایسنس (مسیر پول).
     *
     * هر سفارش یک پلن و مبلغ دارد و پس از تأیید پرداخت (درگاه یا مدیر) به
     * لایسنس فروشگاه اعمال می‌شود. سفارش‌ها حذف نمی‌شوند تا سابقهٔ مالی بماند.
     */
    public function up(): void
    {
        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();

            // کلید پلن در config/billing.php — مثل pro_yearly
            $table->string('plan', 40);
            $table->string('tier', 20);
            $table->unsignedSmallInteger('months')->default(0);
            $table->boolean('is_lifetime')->default(false);
            $table->bigInteger('amount');

            // pending | paid | failed | canceled
            $table->string('status', 20)->default('pending')->index();
            $table->string('gateway', 40);
            $table->string('gateway_ref', 120)->nullable();
            $table->string('reference_id', 120)->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->index(['store_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('orders');
    }
};
