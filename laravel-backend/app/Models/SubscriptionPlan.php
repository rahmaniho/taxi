<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * تعرفهٔ یک پلن اشتراک تاکسینو.
 *
 * همهٔ قیمت‌ها به تومان ذخیره می‌شوند:
 *   total_price        → قیمت کل بستهٔ اشتراک (مثلاً ۱۵۰٬۰۰۰، ۴۲۰٬۰۰۰، ۷۸۰٬۰۰۰، ۱٬۲۰۰٬۰۰۰، ۷٬۰۰۰٬۰۰۰ تومان)
 *   duration_days      → مدت اعتبار به روز (۳۰، ۹۰، ۱۸۰، ۳۶۵ یا null برای مادام‌العمر)
 *   months_count       → معادل ماهانهٔ بسته (۱، ۳، ۶، ۱۲ یا ۰ برای مادام‌العمر)
 *   base_monthly       → پایهٔ ماهانه (برای بسته‌های سیت‌محور یا معادل ماهانه)
 *   extra_user_monthly → هزینهٔ هر کاربر اضافه در ماه
 */
class SubscriptionPlan extends Model
{
    use HasFactory;

    protected $fillable = [
        'code',
        'name',
        'tier',
        'description',
        'duration_days',
        'months_count',
        'total_price',
        'base_monthly',
        'extra_user_monthly',
        'min_seats',
        'max_seats',
        'is_lifetime',
        'badge',
        'is_featured',
        'features',
        'is_active',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'duration_days' => 'integer',
            'months_count' => 'integer',
            'total_price' => 'integer',
            'base_monthly' => 'integer',
            'extra_user_monthly' => 'integer',
            'min_seats' => 'integer',
            'max_seats' => 'integer',
            'is_lifetime' => 'boolean',
            'is_featured' => 'boolean',
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

    /** قیمت کل بسته برای پلن‌های دوره‌ای/مادام‌العمر ثابت. */
    public function packagePrice(): int
    {
        return $this->total_price !== null ? (int) $this->total_price : (int) $this->base_monthly;
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
