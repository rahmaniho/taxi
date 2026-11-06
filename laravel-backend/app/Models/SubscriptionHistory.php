<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * تاریخچهٔ تغییرات اشتراک (تمدید، ارتقا، تغییر کاربران، تعلیق...).
 */
class SubscriptionHistory extends Model
{
    public $timestamps = false;

    protected $table = 'subscription_history';

    protected $fillable = [
        'store_id',
        'license_id',
        'action',
        'reason',
        'payload',
        'actor_id',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'created_at' => 'datetime',
        ];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function license(): BelongsTo
    {
        return $this->belongsTo(License::class);
    }
}
