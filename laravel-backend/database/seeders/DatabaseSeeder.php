<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    /**
     * ساخت حساب مدیر کل — فقط با مقادیر محیطی.
     *
     * هیچ رمز پیش‌فرضی در کد نیست: اگر متغیرهای ایمیل و رمز مدیر تنظیم نشده
     * باشند، این Seeder هیچ حسابی نمی‌سازد تا پنل با رمز عمومی باز نشود.
     */
    public function run(): void
    {
        $email = (string) env('TAXI_MANAGER_EMAIL', env('KARO_MANAGER_EMAIL', ''));
        $password = (string) env('TAXI_MANAGER_PASSWORD', env('KARO_MANAGER_PASSWORD', ''));

        if ($email === '' || $password === '') {
            $this->command?->warn(
                'TAXI_MANAGER_EMAIL و TAXI_MANAGER_PASSWORD تنظیم نشده‌اند؛ حساب مدیری ساخته نشد.',
            );

            return;
        }

        User::updateOrCreate(
            ['email' => $email],
            [
                'name' => (string) env('TAXI_MANAGER_NAME', env('KARO_MANAGER_NAME', 'مدیر کل')),
                'role' => User::ROLE_MANAGER,
                'store_id' => null,
                'is_active' => true,
                'password' => Hash::make($password),
            ],
        );
    }
}
