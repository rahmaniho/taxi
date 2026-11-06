<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // لایسنس فروشگاه‌محور: مدیر کل برای هر فروشگاه یک لایسنس تعریف می‌کند.
        // is_lifetime=true یعنی مادام‌العمر و expires_at نادیده گرفته می‌شود.
        Schema::create('licenses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->unique()->constrained('stores')->cascadeOnDelete();

            // pro = نسخه‌ی حرفه‌ای، proplus = نسخه‌ی کامل
            $table->string('tier', 20)->default('pro');
            $table->boolean('is_lifetime')->default(false);
            $table->boolean('is_active')->default(true)->index();

            $table->dateTime('starts_at')->nullable();
            $table->dateTime('expires_at')->nullable()->index();

            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('licenses');
    }
};
