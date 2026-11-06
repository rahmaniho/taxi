<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * لایسنس همان اشتراک است؛ فقط اطلاعات پلن، سقف کاربران و وضعیت مدیریتی
     * اضافه می‌شود. `is_active` برای سازگاری با کد فعلی حفظ و با `status`
     * هم‌گام نگه داشته می‌شود.
     */
    public function up(): void
    {
        Schema::table('licenses', function (Blueprint $table) {
            $table->string('plan_code', 40)->nullable()->index();
            $table->unsignedSmallInteger('seats')->default(1);
            // active | pending | suspended | canceled  (expired از تاریخ محاسبه می‌شود)
            $table->string('status', 20)->default('active')->index();
        });
    }

    public function down(): void
    {
        Schema::table('licenses', function (Blueprint $table) {
            $table->dropColumn(['plan_code', 'seats', 'status']);
        });
    }
};
