<?php

namespace App\Services\Billing;

use App\Models\SubscriptionCoupon;
use App\Models\SubscriptionPlan;

/**
 * تنها منبع معتبر قیمت در سرور (Single Source of Truth).
 *
 * پشتیبانی از دو مدل تعرفه:
 * ۱) پلن‌های بستهٔ رسمی تاکسینو (`total_price` مشخص یا `is_lifetime = true`):
 *    - یک‌ماهه (۳۰ روز): ۱۵۰٬۰۰۰ تومان
 *    - سه‌ماهه (۹۰ روز): ۴۲۰٬۰۰۰ تومان (معادل ماهانه ۱۴۰٬۰۰۰ تومان)
 *    - شش‌ماهه (۱۸۰ روز): ۷۸۰٬۰۰۰ تومان (معادل ماهانه ۱۳۰٬۰۰۰ تومان)
 *    - یک‌ساله (۳۶۵ روز): ۱٬۲۰۰٬۰۰۰ تومان (معادل ماهانه ۱۰۰٬۰۰۰ تومان)
 *    - مادام‌العمر (نامحدود): ۷٬۰۰۰٬۰۰۰ تومان (یک‌باره)
 * ۲) پلن‌های سیت‌محور ماهانه (`total_price === null`):
 *    هزینهٔ ماهانه = قیمت پایهٔ پلن + (کاربران اضافه × هزینهٔ هر کاربر اضافه)
 */
class PricingEngine
{
    /** مدت‌های مجاز اشتراک (ماه) برای پلن‌های ماه‌محور */
    public const ALLOWED_MONTHS = [1, 2, 3, 4, 6, 9, 12, 18, 24];

    public const MAX_SEATS_CEILING = 200;

    /**
     * @return array<string, mixed>
     */
    public function quote(SubscriptionPlan $plan, int $seats = 1, int $months = 1, ?SubscriptionCoupon $coupon = null): array
    {
        $this->assertSeats($plan, $seats);

        $isLifetime = (bool) $plan->is_lifetime;
        $isPackagePlan = $plan->total_price !== null || $isLifetime;

        $extraUsers = max(0, $seats - 1);
        $extraMonthly = (int) $plan->extra_user_monthly * $extraUsers;

        if ($isLifetime) {
            $effectiveMonths = 1;
            $durationDays = null;
            $baseTotal = $plan->packagePrice();
            $extraTotal = $extraMonthly;
            $monthlyTotal = $baseTotal + $extraMonthly;
            $monthlyEquivalent = null;
        } elseif ($isPackagePlan) {
            $effectiveMonths = max(1, (int) ($plan->months_count ?: $months));
            $durationDays = $plan->duration_days !== null
                ? (int) $plan->duration_days
                : ($effectiveMonths * 30);
            $baseTotal = (int) $plan->total_price;
            $extraTotal = $extraMonthly * $effectiveMonths;
            $monthlyEquivalent = (int) round(($baseTotal + $extraTotal) / $effectiveMonths);
            $monthlyTotal = $monthlyEquivalent;
        } else {
            $this->assertMonths($months);
            $effectiveMonths = $months;
            $durationDays = $months * 30;
            $monthlyTotal = (int) $plan->base_monthly + $extraMonthly;
            $baseTotal = (int) $plan->base_monthly * $months;
            $extraTotal = $extraMonthly * $months;
            $monthlyEquivalent = $monthlyTotal;
        }

        $subtotal = $baseTotal + $extraTotal;

        $discount = $coupon !== null ? $coupon->discountFor($subtotal) : 0;
        $discount = max(0, min($subtotal, $discount));

        $afterDiscount = max(0, $subtotal - $discount);
        $taxPercent = max(0, (int) config('billing.tax_percent', 0));
        $tax = $taxPercent > 0 ? (int) round(($afterDiscount * $taxPercent) / 100) : 0;
        $total = $afterDiscount + $tax;

        return [
            'product_name' => (string) config('billing.product_name', 'تاکسینو'),
            'plan_code' => (string) $plan->code,
            'plan_name' => (string) $plan->name,
            'tier' => (string) $plan->tier,
            'seats' => $seats,
            'extra_users' => $extraUsers,
            'months' => $effectiveMonths,
            'duration_days' => $durationDays,
            'is_lifetime' => $isLifetime,
            'base_monthly' => (int) $plan->base_monthly,
            'extra_user_monthly' => (int) $plan->extra_user_monthly,
            'extra_monthly' => $extraMonthly,
            'monthly_total' => $monthlyTotal,
            'monthly_equivalent' => $monthlyEquivalent,
            'base_total' => $baseTotal,
            'extra_total' => $extraTotal,
            'subtotal' => $subtotal,
            'discount' => $discount,
            'tax_percent' => $taxPercent,
            'tax' => $tax,
            'total' => $total,
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
