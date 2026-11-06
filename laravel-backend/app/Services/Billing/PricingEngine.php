<?php

namespace App\Services\Billing;

use App\Models\SubscriptionCoupon;
use App\Models\SubscriptionPlan;

/**
 * تنها منبع معتبر قیمت.
 *
 * فرمول رسمی کارن‌سافت:
 *   هزینهٔ ماهانه = قیمت پایهٔ پلن + (کاربران اضافه × هزینهٔ هر کاربر اضافه)
 *   مبلغ کل      = هزینهٔ ماهانه × تعداد ماه
 *   مبلغ نهایی   = مبلغ کل − تخفیف
 *
 * «کاربر اضافه» = تعداد کاربران منهای یک (کاربر اول در قیمت پایه است).
 * اشتراک سالانه تخفیف خودکار ندارد؛ سال = ۱۲ ماه و هر ماه دقیقاً همان قیمت ماهانه.
 */
class PricingEngine
{
    /** مدت‌های مجاز اشتراک (ماه) */
    public const ALLOWED_MONTHS = [1, 2, 3, 4, 6, 9, 12, 18, 24];

    public const MAX_SEATS_CEILING = 200;

    /**
     * @return array{
     *   plan_code: string, plan_name: string, tier: string, seats: int, extra_users: int,
     *   months: int, is_lifetime: bool, base_monthly: int, extra_user_monthly: int,
     *   extra_monthly: int, monthly_total: int, base_total: int, extra_total: int,
     *   subtotal: int, discount: int, total: int, coupon_code: string|null, currency: string
     * }
     */
    public function quote(SubscriptionPlan $plan, int $seats, int $months, ?SubscriptionCoupon $coupon = null): array
    {
        $this->assertSeats($plan, $seats);
        $this->assertMonths($months);

        $extraUsers = max(0, $seats - 1);
        $extraMonthly = (int) $plan->extra_user_monthly * $extraUsers;
        $monthlyTotal = (int) $plan->base_monthly + $extraMonthly;

        $baseTotal = (int) $plan->base_monthly * $months;
        $extraTotal = $extraMonthly * $months;
        $subtotal = $baseTotal + $extraTotal;

        $discount = $coupon !== null ? $coupon->discountFor($subtotal) : 0;
        $discount = max(0, min($subtotal, $discount));

        return [
            'plan_code' => (string) $plan->code,
            'plan_name' => (string) $plan->name,
            'tier' => (string) $plan->tier,
            'seats' => $seats,
            'extra_users' => $extraUsers,
            'months' => $months,
            'is_lifetime' => (bool) $plan->is_lifetime,
            'base_monthly' => (int) $plan->base_monthly,
            'extra_user_monthly' => (int) $plan->extra_user_monthly,
            'extra_monthly' => $extraMonthly,
            'monthly_total' => $monthlyTotal,
            'base_total' => $baseTotal,
            'extra_total' => $extraTotal,
            'subtotal' => $subtotal,
            'discount' => $discount,
            'total' => max(0, $subtotal - $discount),
            'coupon_code' => $coupon?->code,
            'currency' => (string) config('billing.currency', 'toman'),
        ];
    }

    public function assertSeats(SubscriptionPlan $plan, int $seats): void
    {
        $min = max(1, (int) $plan->min_seats);
        $max = min(self::MAX_SEATS_CEILING, max($min, (int) $plan->max_seats));

        if ($seats < $min || $seats > $max) {
            throw new PricingException("تعداد کاربران برای پلن «{$plan->name}» باید بین {$min} و {$max} باشد.");
        }
    }

    public function assertMonths(int $months): void
    {
        if (! in_array($months, self::ALLOWED_MONTHS, true)) {
            $allowed = implode('، ', self::ALLOWED_MONTHS);

            throw new PricingException("مدت اشتراک باید یکی از این مقادیر باشد: {$allowed} ماه.");
        }
    }
}
