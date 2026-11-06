<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * تاریخچهٔ تعرفه‌ها — برای حسابرسی تغییر قیمت‌ها.
 */
class SubscriptionPlanPrice extends Model
{
    protected $fillable = [
        'plan_code',
        'base_monthly',
        'extra_user_monthly',
        'note',
        'changed_by',
        'changed_at',
    ];

    protected function casts(): array
    {
        return [
            'base_monthly' => 'integer',
            'extra_user_monthly' => 'integer',
            'changed_at' => 'datetime',
        ];
    }
}
