<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * کد تخفیف.
 *
 * type=percent → value درصد (۰ تا ۱۰۰)
 * type=fixed   → value مبلغ ثابت تومان
 */
class SubscriptionCoupon extends Model
{
    public const TYPE_PERCENT = 'percent';

    public const TYPE_FIXED = 'fixed';

    protected $fillable = [
        'code',
        'type',
        'value',
        'plan_code',
        'starts_at',
        'ends_at',
        'max_uses',
        'used_count',
        'is_active',
        'description',
    ];

    protected function casts(): array
    {
        return [
            'value' => 'integer',
            'max_uses' => 'integer',
            'used_count' => 'integer',
            'is_active' => 'boolean',
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
        ];
    }

    public function isUsableAt(?\DateTimeInterface $moment, ?string $planCode = null): bool
    {
        $at = $moment ?? now();

        if (! $this->is_active) {
            return false;
        }

        if ($this->starts_at !== null && $this->starts_at->isFuture()) {
            return false;
        }

        if ($this->ends_at !== null && $this->ends_at->isPast()) {
            return false;
        }

        if ($this->max_uses !== null && $this->used_count >= $this->max_uses) {
            return false;
        }

        if ($this->plan_code !== null && $planCode !== null && $this->plan_code !== $planCode) {
            return false;
        }

        return true;
    }

    /** مبلغ تخفیف برای یک مبلغ پایه. */
    public function discountFor(int $subtotal): int
    {
        if ($subtotal <= 0) {
            return 0;
        }

        if ($this->type === self::TYPE_PERCENT) {
            $percent = max(0, min(100, $this->value));

            return (int) round($subtotal * $percent / 100);
        }

        return min($subtotal, max(0, $this->value));
    }
}
