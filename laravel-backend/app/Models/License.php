<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class License extends Model
{
    use HasFactory;

    public const STATUS_ACTIVE = 'active';

    public const STATUS_PENDING = 'pending';

    public const STATUS_SUSPENDED = 'suspended';

    public const STATUS_CANCELED = 'canceled';

    public const STATUS_EXPIRED = 'expired';

    public const STATUS_RENEWAL_PENDING = 'renewal_pending';

    protected $fillable = [
        'store_id',
        'tier',
        'is_lifetime',
        'is_active',
        'is_trial',
        'plan_code',
        'seats',
        'status',
        'starts_at',
        'expires_at',
        'notes',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'is_lifetime' => 'boolean',
            'is_active' => 'boolean',
            'is_trial' => 'boolean',
            'seats' => 'integer',
            'starts_at' => 'datetime',
            'expires_at' => 'datetime',
        ];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** آیا لایسنس همین حالا معتبر و فعال است؟ */
    public function isCurrentlyValid(): bool
    {
        if (! $this->is_active || in_array($this->status, [self::STATUS_SUSPENDED, self::STATUS_CANCELED], true)) {
            return false;
        }

        if ($this->is_lifetime) {
            return true;
        }

        return $this->expires_at !== null && $this->expires_at->isFuture();
    }

    public function isExpired(): bool
    {
        return ! $this->is_lifetime
            && $this->expires_at !== null
            && $this->expires_at->isPast();
    }

    /**
     * وضعیت مؤثر برای نمایش: وضعیت مدیریتی + انقضا.
     */
    public function effectiveStatus(): string
    {
        if ($this->status === self::STATUS_SUSPENDED || $this->status === self::STATUS_CANCELED) {
            return $this->status;
        }

        if ($this->is_lifetime) {
            return self::STATUS_ACTIVE;
        }

        if ($this->expires_at !== null && $this->expires_at->isPast()) {
            return self::STATUS_EXPIRED;
        }

        return $this->status ?: self::STATUS_ACTIVE;
    }

    public function seats(): int
    {
        return max(1, (int) $this->seats);
    }

    public function daysRemaining(): ?int
    {
        if ($this->is_lifetime || $this->expires_at === null) {
            return null;
        }

        return (int) max(0, now()->diffInDays($this->expires_at, false));
    }
}
