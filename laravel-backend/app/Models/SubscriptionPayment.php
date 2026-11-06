<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * یک تلاش پرداخت برای سفارش اشتراک.
 *
 * هیچ دادهٔ حساس کارت/رمز درگاه در این مدل ذخیره نمی‌شود؛ تنها شناسهٔ مرجع
 * درگاه، مبلغ، وضعیت و پیام غیرحساس درگاه.
 */
class SubscriptionPayment extends Model
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_PAID = 'paid';

    public const STATUS_FAILED = 'failed';

    public const STATUS_CANCELED = 'canceled';

    protected $fillable = [
        'order_id',
        'store_id',
        'gateway',
        'amount',
        'currency',
        'status',
        'authority',
        'reference_id',
        'payload',
        'verified_at',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'integer',
            'payload' => 'array',
            'verified_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Order, $this> */
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    /** @return BelongsTo<Store, $this> */
    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }
}
