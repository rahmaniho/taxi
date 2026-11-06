<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * سفارش خرید/تمدید لایسنس.
 *
 * چرخهٔ عمر: pending → paid (یا failed/canceled). تنها راه رسیدن به paid،
 * مسیر پرداخت تأییدشده است (درگاه یا تأیید دستی مدیر) تا مبلغ و لایسنس
 * همیشه با هم همخوان باشند.
 */
class Order extends Model
{
    use HasFactory;

    public const STATUS_PENDING = 'pending';

    public const STATUS_PAID = 'paid';

    public const STATUS_FAILED = 'failed';

    public const STATUS_CANCELED = 'canceled';

    /** پرداخت تأییدشده که مدیر آن را باطل کرده است (رکورد حفظ می‌شود). */
    public const STATUS_VOIDED = 'voided';

    public const TYPE_NEW = 'new';

    public const TYPE_RENEWAL = 'renewal';

    public const TYPE_UPGRADE = 'upgrade';

    public const TYPE_SEATS = 'seats';

    protected $fillable = [
        'store_id',
        'user_id',
        'plan',
        'tier',
        'type',
        'months',
        'seats',
        'extra_users',
        'base_monthly',
        'extra_user_monthly',
        'subtotal',
        'discount',
        'coupon_code',
        'price_snapshot',
        'is_lifetime',
        'amount',
        'status',
        'gateway',
        'gateway_ref',
        'reference_id',
        'paid_at',
        'voided_at',
        'void_reason',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'months' => 'integer',
            'seats' => 'integer',
            'extra_users' => 'integer',
            'base_monthly' => 'integer',
            'extra_user_monthly' => 'integer',
            'subtotal' => 'integer',
            'discount' => 'integer',
            'amount' => 'integer',
            'price_snapshot' => 'array',
            'is_lifetime' => 'boolean',
            'paid_at' => 'datetime',
            'voided_at' => 'datetime',
            'meta' => 'array',
        ];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function invoice(): HasOne
    {
        return $this->hasOne(SubscriptionInvoice::class);
    }

    /** @return HasMany<SubscriptionPayment, $this> */
    public function payments(): HasMany
    {
        return $this->hasMany(SubscriptionPayment::class);
    }

    public function isPending(): bool
    {
        return $this->status === self::STATUS_PENDING;
    }

    public function isVoided(): bool
    {
        return $this->status === self::STATUS_VOIDED;
    }

    public function isPaid(): bool
    {
        return $this->status === self::STATUS_PAID;
    }

    /** @param  Builder<Order>  $query */
    public function scopePending(Builder $query): void
    {
        $query->where('status', self::STATUS_PENDING);
    }
}
