<?php

namespace App\Services\Billing;

use App\Models\License;
use App\Models\Order;
use App\Models\Store;
use App\Models\SubscriptionHistory;
use App\Models\SubscriptionPlan;
use App\Models\User;
use App\Support\AuditLogger;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * اشتراک فروشگاه = لایسنس فروشگاه.
 *
 * سیاست‌های شفاف (بدون دریافت مبلغ پنهان):
 * 1. تمدید در دورهٔ فعال: از تاریخ پایان فعلی ادامه می‌یابد (روزهای باقی‌مانده سوخت نمی‌شود).
 * 2. تمدید پس از انقضا: از لحظهٔ پرداخت محاسبه می‌شود.
 * 3. ارتقای پلن در میانهٔ دوره: سطح جدید **بلافاصله** اعمال می‌شود، روزهای باقی‌مانده
 *    حفظ می‌شود و مدت خریداری‌شده به پایان فعلی اضافه می‌گردد. هیچ مابه‌التفاوتی
 *    برای باقی‌ماندهٔ دوره دریافت نمی‌شود (به نفع مشتری).
 * 4. تنزل پلن خودکار نداریم؛ خرید بستهٔ پایین‌تر، سطح فعلی را پایین نمی‌آورد.
 * 5. کاهش سقف کاربران، کاربران موجود را حذف نمی‌کند؛ فقط افزودن کاربر جدید را می‌بندد.
 */
class LicenseService
{
    private const TIER_RANK = ['pro' => 2, 'proplus' => 3];

    public function startTrial(Store $store, ?int $createdBy = null, ?int $days = null, int $seats = 1): License
    {
        $days = $days ?? (int) config('billing.trial_days', 14);

        $license = $store->license()->updateOrCreate([], [
            'tier' => 'pro',
            'plan_code' => 'basic',
            'seats' => max(1, $seats),
            'status' => License::STATUS_ACTIVE,
            'is_lifetime' => false,
            'is_active' => true,
            'is_trial' => true,
            'starts_at' => now(),
            'expires_at' => now()->addDays(max(1, $days)),
            'notes' => 'دورهٔ آزمایشی رایگان',
            'created_by' => $createdBy,
        ]);

        $this->recordHistory($store, $license, 'trial_started', [
            'days' => $days,
            'seats' => $license->seats,
        ], null, $createdBy);
        $this->resetReminders($store);

        return $license;
    }

    /**
     * اعمال یک سفارش پرداخت‌شده روی اشتراک.
     *
     * @throws \Throwable
     */
    public function applyOrder(Order $order): License
    {
        return DB::transaction(function () use ($order) {
            $store = $order->store;
            $license = $store->license()->first();
            $plan = SubscriptionPlan::where('code', $order->plan)->first();

            $tier = $this->resolveTier($license, (string) $order->tier);
            $seats = max(1, (int) $order->seats);
            $months = max(1, (int) $order->months);

            $isLifetime = (bool) $order->is_lifetime || (bool) $plan?->is_lifetime;

            if ($isLifetime) {
                $attributes = [
                    'tier' => $tier,
                    'plan_code' => $order->plan,
                    'seats' => $seats,
                    'status' => License::STATUS_ACTIVE,
                    'is_lifetime' => true,
                    'is_active' => true,
                    'is_trial' => false,
                    'starts_at' => $license?->starts_at ?? now(),
                    'expires_at' => null,
                    'notes' => 'اشتراک مادام‌العمر',
                ];
            } else {
                $attributes = [
                    'tier' => $tier,
                    'plan_code' => $order->plan,
                    'seats' => $seats,
                    'status' => License::STATUS_ACTIVE,
                    'is_lifetime' => false,
                    'is_active' => true,
                    'is_trial' => false,
                    'starts_at' => $license?->starts_at ?? now(),
                    'expires_at' => $this->renewalBase($license)->addMonths($months),
                    'notes' => 'اشتراک فعال',
                ];
            }

            if ($order->user_id !== null) {
                $attributes['created_by'] = $order->user_id;
            }

            $license = $store->license()->updateOrCreate([], $attributes);
            $this->resetReminders($store);

            $action = match ($order->type) {
                Order::TYPE_UPGRADE => 'subscription_upgraded',
                Order::TYPE_SEATS => 'subscription_seats_changed',
                Order::TYPE_RENEWAL => 'subscription_renewed',
                default => 'subscription_started',
            };

            $this->recordHistory($store, $license, $action, [
                'order_id' => $order->id,
                'plan_code' => $order->plan,
                'seats' => $seats,
                'months' => $months,
                'amount' => $order->amount,
                'expires_at' => $license->expires_at?->toIso8601String(),
            ], null, $order->user_id);

            return $license;
        });
    }

    /**
     * تمدید/اصلاح دستی توسط مدیر (با دلیل الزامی).
     *
     * @throws \Throwable
     */
    public function extendManually(
        Store $store,
        int $months,
        ?int $seats,
        string $reason,
        User $actor,
        ?string $planCode = null,
    ): License {
        return DB::transaction(function () use ($store, $months, $seats, $reason, $actor, $planCode) {
            $license = $store->license()->first();
            $plan = $planCode !== null ? SubscriptionPlan::where('code', $planCode)->first() : null;

            $attributes = [
                'status' => License::STATUS_ACTIVE,
                'is_active' => true,
                'is_lifetime' => false,
                'expires_at' => $this->renewalBase($license)->addMonths(max(1, $months)),
                'starts_at' => $license?->starts_at ?? now(),
                'created_by' => $actor->id,
            ];

            if ($seats !== null) {
                $attributes['seats'] = max(1, $seats);
            }

            if ($plan !== null) {
                $attributes['plan_code'] = $plan->code;
                $attributes['tier'] = $plan->tier;
            }

            $license = $store->license()->updateOrCreate([], $attributes);
            $this->resetReminders($store);

            $this->recordHistoryInTransaction($store, $license, 'subscription_manual_extended', [
                'months' => $months,
                'seats' => $license->seats,
                'expires_at' => $license->expires_at?->toIso8601String(),
            ], $reason, $actor->id);

            return $license;
        });
    }

    /**
     * تغییر وضعیت مدیریتی اشتراک (تعلیق/فعال‌سازی/لغو) با دلیل.
     *
     * @throws \Throwable
     */
    public function setStatus(Store $store, string $status, string $reason, User $actor): License
    {
        return DB::transaction(function () use ($store, $status, $reason, $actor) {
            $license = $store->license()->firstOrFail();
            $from = $license->effectiveStatus();

            $license->forceFill([
                'status' => $status,
                'is_active' => $status === License::STATUS_ACTIVE,
            ])->save();

            $this->recordHistoryInTransaction($store, $license, 'subscription_status_changed', [
                'from' => $from,
                'to' => $status,
                'reason' => $reason,
            ], $reason, $actor->id);

            return $license->refresh();
        });
    }

    /** تغییر تنها سقف کاربران (بدون تغییر مدت). */
    public function setSeats(Store $store, int $seats, User $actor, string $reason): License
    {
        $license = $store->license()->firstOrFail();
        $from = $license->seats();

        $license->forceFill(['seats' => max(1, $seats)])->save();

        $this->recordHistory($store, $license, 'subscription_seats_changed', [
            'from' => $from,
            'to' => $license->seats,
        ], $reason, $actor->id);

        return $license->refresh();
    }

    /**
     * ویرایش کامل لایسنس توسط مدیر کل (پلن، سطح، سقف کاربران، انقضا، وضعیت).
     *
     * قواعد:
     * - سقف کاربران هرگز کمتر از تعداد کاربران فعال پذیرفته نمی‌شود.
     * - تاریخ شروع دورهٔ فعلی حفظ می‌شود (بازنویسی نمی‌شود).
     * - پلن انتخابی، سطح (tier) را تعیین می‌کند تا داده ناسازگار ساخته نشود.
     * - دلیل تغییر در تاریخچهٔ اشتراک و دفتر رویدادها ثبت می‌شود.
     *
     * @param  array{plan_code?: string|null, tier?: string|null, seats?: int|null, is_lifetime?: bool, is_active?: bool, starts_at?: string|null, expires_at?: string|null, notes?: string|null}  $data
     *
     * @throws \Illuminate\Validation\ValidationException|\Throwable
     */
    public function adminOverride(
        Store $store,
        array $data,
        User $actor,
        string $reason,
        string $fieldPrefix = '',
    ): License {
        return DB::transaction(function () use ($store, $data, $actor, $reason, $fieldPrefix) {
            $license = $store->license()->first();
            $activeUsers = $store->activeUserCount();

            $isLifetime = (bool) ($data['is_lifetime'] ?? $license?->is_lifetime ?? false);
            $seats = isset($data['seats']) ? (int) $data['seats'] : ($license?->seats() ?? 1);

            if ($seats < $activeUsers) {
                throw ValidationException::withMessages([
                    $fieldPrefix.'seats' => ["این فروشگاه {$activeUsers} کاربر فعال دارد؛ سقف کاربران نمی‌تواند کمتر از آن باشد."],
                ]);
            }

            $plan = null;
            if (! empty($data['plan_code'])) {
                $plan = SubscriptionPlan::where('code', $data['plan_code'])->first();
            }

            $expiresAt = $data['expires_at'] ?? $license?->expires_at;

            if (! $isLifetime && ! $expiresAt) {
                throw ValidationException::withMessages([
                    $fieldPrefix.'expires_at' => ['برای اشتراک زمان‌دار، تاریخ انقضا لازم است.'],
                ]);
            }

            $status = array_key_exists('is_active', $data)
                ? ($data['is_active'] ? License::STATUS_ACTIVE : License::STATUS_SUSPENDED)
                : ($license?->status ?? License::STATUS_ACTIVE);

            $before = [
                'tier' => $license?->tier,
                'plan_code' => $license?->plan_code,
                'seats' => $license?->seats(),
                'is_lifetime' => $license?->is_lifetime,
                'status' => $license?->status,
                'expires_at' => $license?->expires_at?->toIso8601String(),
            ];

            $attributes = [
                'tier' => $plan?->tier ?? ($data['tier'] ?? $license?->tier ?? 'pro'),
                'plan_code' => $plan?->code ?? ($data['plan_code'] ?? $license?->plan_code),
                'seats' => max(1, $seats),
                'status' => $status,
                'is_lifetime' => $isLifetime,
                'is_active' => $status === License::STATUS_ACTIVE,
                'is_trial' => $license?->is_trial ?? false,
                'starts_at' => $data['starts_at'] ?? $license?->starts_at ?? now(),
                'expires_at' => $isLifetime ? null : $expiresAt,
                'notes' => $data['notes'] ?? $license?->notes,
                'created_by' => $actor->id,
            ];

            $license = $store->license()->updateOrCreate([], $attributes);
            $this->resetReminders($store);

            $this->recordHistoryInTransaction($store, $license, 'admin_license_updated', [
                'before' => $before,
                'after' => [
                    'tier' => $license->tier,
                    'plan_code' => $license->plan_code,
                    'seats' => $license->seats(),
                    'is_lifetime' => (bool) $license->is_lifetime,
                    'status' => $license->status,
                    'expires_at' => $license->expires_at?->toIso8601String(),
                ],
                'reason' => $reason,
            ], $reason, $actor->id);

            return $license->refresh();
        });
    }

    /**
     * نقطهٔ شروع تمدید: اگر اشتراک معتبر است از پایانش، وگرنه از اکنون.
     */
    private function renewalBase(?License $license): Carbon
    {
        if (
            $license !== null
            && ! $license->is_lifetime
            && $license->is_active
            && $license->expires_at !== null
            && $license->expires_at->isFuture()
        ) {
            return $license->expires_at->copy();
        }

        return now();
    }

    /** ارتقا مجاز است، تنزل خودکار نه (و مادام‌العمر دست‌نخورده می‌ماند). */
    private function resolveTier(?License $license, string $planTier): string
    {
        if ($license === null) {
            return $planTier;
        }

        if (($license->is_lifetime || $license->isCurrentlyValid())
            && (self::TIER_RANK[$license->tier] ?? 0) > (self::TIER_RANK[$planTier] ?? 0)) {
            return (string) $license->tier;
        }

        return $planTier;
    }

    private function resetReminders(Store $store): void
    {
        if ((int) $store->license_reminder_stage !== 0) {
            $store->forceFill(['license_reminder_stage' => 0])->save();
        }
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function recordHistory(
        Store $store,
        License $license,
        string $action,
        array $payload,
        ?string $reason = null,
        ?int $actorId = null,
    ): void {
        $this->recordHistoryInTransaction($store, $license, $action, $payload, $reason, $actorId);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function recordHistoryInTransaction(
        Store $store,
        License $license,
        string $action,
        array $payload,
        ?string $reason = null,
        ?int $actorId = null,
    ): void {
        SubscriptionHistory::create([
            'store_id' => $store->id,
            'license_id' => $license->id,
            'action' => $action,
            'reason' => $reason,
            'payload' => $payload,
            'actor_id' => $actorId,
            'created_at' => now(),
        ]);

        AuditLogger::record($action, [
            'store_id' => $store->id,
            'user_id' => $actorId,
            'subject_type' => 'license',
            'subject_key' => $license->id,
            'meta' => $payload,
        ]);
    }
}
