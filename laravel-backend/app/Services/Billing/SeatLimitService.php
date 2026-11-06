<?php

namespace App\Services\Billing;

use App\Models\Store;
use Illuminate\Validation\ValidationException;

/**
 * کنترل ظرفیت کاربران.
 *
 * قاعده: تعداد کاربران فعال (is_active=true) نباید از سقف لایسنس بیشتر شود.
 * کاربران غیرفعال ظرفیت مصرف نمی‌کنند. مالک/مدیر حساب هم کاربر حساب می‌شود.
 */
class SeatLimitService
{
    /**
     * @return array{used: int, allowed: int, remaining: int, can_add: bool}
     */
    public function usage(Store $store): array
    {
        $used = $store->activeUserCount();
        $allowed = $store->seatsAllowed();
        $remaining = max(0, $allowed - $used);

        return [
            'used' => $used,
            'allowed' => $allowed,
            'remaining' => $remaining,
            'can_add' => $allowed > 0 && $used < $allowed,
        ];
    }

    /**
     * @throws ValidationException
     */
    public function assertCanAdd(Store $store): void
    {
        $usage = $this->usage($store);

        if ($usage['allowed'] === 0) {
            throw ValidationException::withMessages([
                'seats' => ['این فروشگاه لایسنس فعالی ندارد؛ ابتدا اشتراک را فعال کنید.'],
            ]);
        }

        if (! $usage['can_add']) {
            throw ValidationException::withMessages([
                'seats' => [
                    "سقف کاربران اشتراک شما {$usage['allowed']} نفر است و همین حالا {$usage['used']} کاربر فعال دارید. "
                    .'برای افزودن کاربر جدید، تعداد کاربران اشتراک را افزایش دهید.',
                ],
            ]);
        }
    }
}
