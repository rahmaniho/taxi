<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    /**
     * ساخت حساب مدیر کل — فقط با مقادیر محیطی/پیکربندی.
     *
     * هیچ رمز پیش‌فرضی در کد نیست: اگر متغیرهای ایمیل و رمز مدیر تنظیم نشده
     * باشند، این Seeder هیچ حسابی نمی‌سازد تا پنل با رمز عمومی باز نشود.
     */
    public function run(): void
    {
        $email = trim((string) (
            config('billing.manager.email')
            ?: getenv('TAXI_MANAGER_EMAIL')
            ?: getenv('TAXI_ADMIN_EMAIL')
            ?: getenv('KARO_MANAGER_EMAIL')
            ?: ''
        ));
        $password = (string) (
            config('billing.manager.password')
            ?: getenv('TAXI_MANAGER_PASSWORD')
            ?: getenv('TAXI_ADMIN_PASSWORD')
            ?: getenv('KARO_MANAGER_PASSWORD')
            ?: ''
        );
        $name = trim((string) (
            config('billing.manager.name')
            ?: getenv('TAXI_MANAGER_NAME')
            ?: getenv('TAXI_ADMIN_NAME')
            ?: 'مدیر کل'
        ));

        if ($email === '' || $password === '') {
            $this->command?->warn(
                'TAXI_MANAGER_EMAIL و TAXI_MANAGER_PASSWORD تنظیم نشده‌اند؛ حساب مدیری ساخته نشد.',
            );

            return;
        }

        User::updateOrCreate(
            ['email' => $email],
            [
                'name' => $name !== '' ? $name : 'مدیر کل',
                'role' => User::ROLE_MANAGER,
                'store_id' => null,
                'is_active' => true,
                'password' => Hash::make($password),
            ],
        );
    }
}
