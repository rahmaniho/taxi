<?php

use App\Models\SubscriptionCoupon;
use App\Models\SubscriptionPlan;
use App\Services\Billing\PricingEngine;
use App\Services\Billing\PricingException;

/**
 * تست واحد موتور قیمت‌گذاری — با همان اعداد رسمی تعرفهٔ کارن‌سافت.
 */
function planFor(string $code): SubscriptionPlan
{
    return match ($code) {
        'basic' => new SubscriptionPlan([
            'code' => 'basic', 'name' => 'پایه', 'tier' => 'pro',
            'base_monthly' => 30_000, 'extra_user_monthly' => 15_000,
            'min_seats' => 1, 'max_seats' => 50, 'is_lifetime' => false,
        ]),
        'pro' => new SubscriptionPlan([
            'code' => 'pro', 'name' => 'حرفه‌ای', 'tier' => 'pro',
            'base_monthly' => 60_000, 'extra_user_monthly' => 15_000,
            'min_seats' => 1, 'max_seats' => 50, 'is_lifetime' => false,
        ]),
        'proplus' => new SubscriptionPlan([
            'code' => 'proplus', 'name' => 'حرفه‌ای پلاس', 'tier' => 'proplus',
            'base_monthly' => 120_000, 'extra_user_monthly' => 20_000,
            'min_seats' => 1, 'max_seats' => 50, 'is_lifetime' => false,
        ]),
    };
}

function quoteFor(string $code, int $seats, int $months, ?SubscriptionCoupon $coupon = null): array
{
    return (new PricingEngine)->quote(planFor($code), $seats, $months, $coupon);
}

it('قیمت پایه را دقیقاً مطابق تعرفه محاسبه می‌کند', function () {
    expect(quoteFor('basic', 1, 1)['total'])->toBe(30_000)
        ->and(quoteFor('basic', 1, 12)['total'])->toBe(360_000)
        ->and(quoteFor('basic', 2, 1)['total'])->toBe(45_000)
        ->and(quoteFor('basic', 5, 12)['total'])->toBe(1_080_000);
});

it('قیمت نسخهٔ حرفه‌ای را دقیقاً مطابق تعرفه محاسبه می‌کند', function () {
    expect(quoteFor('pro', 1, 1)['total'])->toBe(60_000)
        ->and(quoteFor('pro', 1, 12)['total'])->toBe(720_000)
        ->and(quoteFor('pro', 2, 1)['total'])->toBe(75_000)
        ->and(quoteFor('pro', 5, 12)['total'])->toBe(1_440_000);
});

it('قیمت نسخهٔ حرفه‌ای پلاس را دقیقاً مطابق تعرفه محاسبه می‌کند', function () {
    expect(quoteFor('proplus', 1, 1)['total'])->toBe(120_000)
        ->and(quoteFor('proplus', 1, 12)['total'])->toBe(1_440_000)
        ->and(quoteFor('proplus', 2, 1)['total'])->toBe(140_000)
        ->and(quoteFor('proplus', 5, 12)['total'])->toBe(2_400_000);
});

it('کاربر اول در قیمت پایه است و کاربران بعدی هزینهٔ اضافه دارند', function () {
    $quote = quoteFor('basic', 10, 1);

    expect($quote['extra_users'])->toBe(9)
        ->and($quote['extra_monthly'])->toBe(135_000)
        ->and($quote['base_total'])->toBe(30_000)
        ->and($quote['extra_total'])->toBe(135_000)
        ->and($quote['total'])->toBe(165_000);

    expect(quoteFor('pro', 10, 1)['total'])->toBe(195_000)
        ->and(quoteFor('proplus', 10, 1)['total'])->toBe(300_000);
});

it('سالانه دقیقاً ۱۲ برابر ماهانه است (بدون تخفیف خودکار)', function () {
    expect(quoteFor('pro', 5, 12)['total'])->toBe(quoteFor('pro', 5, 1)['total'] * 12);
});

it('همهٔ مدت‌های مجاز را می‌پذیرد و مدت نامعتبر را رد می‌کند', function () {
    foreach (PricingEngine::ALLOWED_MONTHS as $months) {
        expect(quoteFor('pro', 3, $months)['months'])->toBe($months);
    }

    expect(fn () => quoteFor('pro', 3, 5))->toThrow(PricingException::class)
        ->and(fn () => quoteFor('pro', 3, 0))->toThrow(PricingException::class)
        ->and(fn () => quoteFor('pro', 3, 25))->toThrow(PricingException::class);
});

it('تعداد کاربر خارج از بازهٔ پلن را رد می‌کند', function () {
    $plan = planFor('pro');
    $plan->max_seats = 3;

    expect(fn () => (new PricingEngine)->quote($plan, 4, 1))->toThrow(PricingException::class);
    expect((new PricingEngine)->quote($plan, 3, 1)['total'])->toBe(90_000);
});

it('تخفیف درصدی و ثابت را درست اعمال می‌کند', function () {
    $percent = new SubscriptionCoupon(['code' => 'OFF10', 'type' => 'percent', 'value' => 10]);
    $fixed = new SubscriptionCoupon(['code' => 'MINUS50K', 'type' => 'fixed', 'value' => 50_000]);

    $quote = quoteFor('pro', 5, 12, $percent);
    expect($quote['subtotal'])->toBe(1_440_000)
        ->and($quote['discount'])->toBe(144_000)
        ->and($quote['total'])->toBe(1_296_000);

    expect(quoteFor('pro', 1, 1, $fixed)['total'])->toBe(10_000);
});

it('تخفیف بیشتر از مبلغ را منفی نمی‌کند', function () {
    $fixed = new SubscriptionCoupon(['code' => 'BIG', 'type' => 'fixed', 'value' => 999_000]);

    expect(quoteFor('basic', 1, 1, $fixed)['total'])->toBe(0);
});
