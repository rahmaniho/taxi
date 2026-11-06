<?php

namespace App\Services\Billing;

use App\Models\SubscriptionCoupon;
use Illuminate\Validation\ValidationException;

/**
 * پیدا کردن و مصرف کد تخفیف. اعتبار کوپن (زمان، سقف استفاده، پلن) در مدل است.
 */
class CouponService
{
    /**
     * @return SubscriptionCoupon|null
     *
     * @throws ValidationException
     */
    public function resolve(?string $code, ?string $planCode = null): ?SubscriptionCoupon
    {
        $code = $code !== null ? trim($code) : '';

        if ($code === '') {
            return null;
        }

        $coupon = SubscriptionCoupon::where('code', mb_strtoupper($code))->first();

        if ($coupon === null) {
            throw ValidationException::withMessages(['coupon_code' => ['کد تخفیف معتبر نیست.']]);
        }

        if (! $coupon->isUsableAt(null, $planCode)) {
            throw ValidationException::withMessages([
                'coupon_code' => ['این کد تخفیف منقضی یا غیرفعال است یا برای این پلن نیست.'],
            ]);
        }

        return $coupon;
    }

    /** پس از پرداخت موفق: مصرف کوپن ثبت می‌شود. */
    public function redeem(?string $code): void
    {
        if ($code === null || $code === '') {
            return;
        }

        SubscriptionCoupon::where('code', $code)->increment('used_count');
    }
}
