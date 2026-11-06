<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * تعرفهٔ یک پلن اشتراک.
 *
 * همهٔ قیمت‌ها «ماهانه و به تومان» هستند:
 *   base_monthly       → یک کاربر، یک ماه
 *   extra_user_monthly → هر کاربر از دوم به بعد، یک ماه
 */
class SubscriptionPlan extends Model
{
    use HasFactory;

    protected $fillable = [
        'code',
        'name',
        'tier',
        'description',
        'base_monthly',
        'extra_user_monthly',
        'min_seats',
        'max_seats',
        'is_lifetime',
        'features',
        'is_active',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'base_monthly' => 'integer',
            'extra_user_monthly' => 'integer',
            'min_seats' => 'integer',
            'max_seats' => 'integer',
            'is_lifetime' => 'boolean',
            'is_active' => 'boolean',
            'sort_order' => 'integer',
            'features' => 'array',
        ];
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class, 'plan', 'code');
    }

    /** @param  Builder<SubscriptionPlan>  $query */
    public function scopeActive(Builder $query): void
    {
        $query->where('is_active', true);
    }

    /** قیمت ماهانهٔ کل برای تعداد کاربر مشخص (بدون ضرب در ماه). */
    public function monthlyFor(int $seats): int
    {
        $extra = max(0, $seats - 1);

        return $this->base_monthly + ($this->extra_user_monthly * $extra);
    }

    /**
     * @return list<string>
     */
    public function featureList(): array
    {
        $features = $this->features;

        return is_array($features) ? array_values(array_filter($features, 'is_string')) : [];
    }
}
