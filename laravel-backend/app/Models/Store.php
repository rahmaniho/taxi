<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Store extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'slug',
        'owner_name',
        'phone',
        'address',
        'is_active',
        'archived_at',
        'license_reminder_stage',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'archived_at' => 'datetime',
            'license_reminder_stage' => 'integer',
        ];
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function license(): HasOne
    {
        return $this->hasOne(License::class);
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }

    public function invoices(): HasMany
    {
        return $this->hasMany(SubscriptionInvoice::class);
    }

    public function subscriptionHistory(): HasMany
    {
        return $this->hasMany(SubscriptionHistory::class);
    }

    public function syncState(): HasOne
    {
        return $this->hasOne(AgencySyncState::class);
    }

    /** آیا فروشگاه آرشیو شده است؟ (داده‌ها حفظ می‌شوند و دسترسی بسته است) */
    public function isArchived(): bool
    {
        return $this->archived_at !== null;
    }

    /** تعداد کاربران فعال (کاربران غیرفعال اشتراک مصرف نمی‌کنند). */
    public function activeUserCount(): int
    {
        return $this->users()->where('is_active', true)->count();
    }

    /** سقف کاربران مجاز بر اساس لایسنس فعلی. */
    public function seatsAllowed(): int
    {
        $license = $this->license;

        return $license ? $license->seats() : 0;
    }
}
