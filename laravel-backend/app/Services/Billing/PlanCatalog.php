<?php

namespace App\Services\Billing;

use App\Models\SubscriptionPlan;
use App\Models\SubscriptionPlanPrice;
use App\Models\User;
use App\Support\AuditLogger;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * کاتالوگ تعرفه‌ها — خواندن از دیتابیس + ثبت تاریخچهٔ تغییر قیمت.
 *
 * تغییر قیمت فقط روی خریدهای جدید اثر دارد؛ هر سفارش در لحظهٔ ثبت، قیمت
 * لحظهٔ خرید را داخل خودش (`price_snapshot`, `amount`) قفل می‌کند.
 */
class PlanCatalog
{
    private const LEGACY_CODES = ['basic', 'pro', 'proplus'];

    /** @return Collection<int, SubscriptionPlan> */
    public function active(): Collection
    {
        return SubscriptionPlan::query()
            ->active()
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();
    }

    /** @return Collection<int, SubscriptionPlan> */
    public function all(bool $onlyActive = false): Collection
    {
        if ($onlyActive) {
            return $this->active();
        }

        return SubscriptionPlan::query()
            ->where(function ($query) {
                $query->whereNotIn('code', self::LEGACY_CODES)
                    ->orWhere('is_active', true);
            })
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();
    }

    public function find(string $code, bool $onlyActive = true): ?SubscriptionPlan
    {
        return SubscriptionPlan::query()
            ->when($onlyActive, fn ($q) => $q->active())
            ->where('code', strtolower(trim($code)))
            ->first();
    }

    public function findActive(string $code): ?SubscriptionPlan
    {
        return $this->find($code, true);
    }

    public function referenceMonthlyPrice(): int
    {
        $monthly = SubscriptionPlan::query()
            ->where('code', 'monthly')
            ->first();

        if ($monthly !== null) {
            return $monthly->packagePrice();
        }

        return 150_000;
    }

    /**
     * @param  array<string, mixed>  $attributes
     *
     * @throws Throwable
     */
    public function create(array $attributes, ?User $actor = null): SubscriptionPlan
    {
        return DB::transaction(function () use ($attributes, $actor) {
            $code = strtolower(trim((string) $attributes['code']));
            $isLifetime = (bool) ($attributes['is_lifetime'] ?? false);
            $monthsCount = $isLifetime ? 0 : (int) ($attributes['months_count'] ?? 1);
            $durationDays = $isLifetime
                ? null
                : (isset($attributes['duration_days']) ? (int) $attributes['duration_days'] : ($monthsCount > 0 ? $monthsCount * 30 : 30));

            $totalPrice = isset($attributes['total_price'])
                ? (int) $attributes['total_price']
                : null;

            $baseMonthly = isset($attributes['base_monthly'])
                ? (int) $attributes['base_monthly']
                : ($totalPrice !== null
                    ? ($isLifetime ? $totalPrice : (int) round($totalPrice / max(1, $monthsCount)))
                    : 0);

            $plan = SubscriptionPlan::create([
                'code' => $code,
                'name' => (string) $attributes['name'],
                'tier' => (string) ($attributes['tier'] ?? 'proplus'),
                'description' => $attributes['description'] ?? null,
                'duration_days' => $durationDays,
                'months_count' => $monthsCount,
                'total_price' => $totalPrice,
                'base_monthly' => $baseMonthly,
                'extra_user_monthly' => (int) ($attributes['extra_user_monthly'] ?? 0),
                'min_seats' => max(1, (int) ($attributes['min_seats'] ?? 1)),
                'max_seats' => max(1, (int) ($attributes['max_seats'] ?? 50)),
                'is_lifetime' => $isLifetime,
                'badge' => $attributes['badge'] ?? null,
                'is_featured' => (bool) ($attributes['is_featured'] ?? false),
                'features' => array_values((array) ($attributes['features'] ?? [])),
                'is_active' => (bool) ($attributes['is_active'] ?? true),
                'sort_order' => (int) ($attributes['sort_order'] ?? 100),
            ]);

            $this->logPriceChange($plan, 'ثبت اولیهٔ تعرفه', $actor);

            AuditLogger::record('plan_created', [
                'user_id' => $actor?->id,
                'subject_type' => 'plan',
                'subject_key' => $plan->code,
                'meta' => [
                    'total_price' => $plan->total_price,
                    'base_monthly' => $plan->base_monthly,
                    'extra_user_monthly' => $plan->extra_user_monthly,
                ],
            ]);

            return $plan;
        });
    }

    /**
     * @param  array<string, mixed>  $attributes
     *
     * @throws Throwable
     */
    public function update(SubscriptionPlan $plan, array $attributes, ?User $actor = null): SubscriptionPlan
    {
        return DB::transaction(function () use ($plan, $attributes, $actor) {
            $oldTotal = $plan->total_price;
            $oldBase = (int) $plan->base_monthly;
            $oldExtra = (int) $plan->extra_user_monthly;

            $isLifetime = array_key_exists('is_lifetime', $attributes)
                ? (bool) $attributes['is_lifetime']
                : (bool) $plan->is_lifetime;

            $monthsCount = array_key_exists('months_count', $attributes)
                ? (int) $attributes['months_count']
                : (int) ($plan->months_count ?? 1);

            $totalPrice = array_key_exists('total_price', $attributes) && $attributes['total_price'] !== null
                ? (int) $attributes['total_price']
                : $plan->total_price;

            $baseMonthly = array_key_exists('base_monthly', $attributes) && $attributes['base_monthly'] !== null
                ? (int) $attributes['base_monthly']
                : (int) $plan->base_monthly;

            if (array_key_exists('total_price', $attributes) && $attributes['total_price'] !== null && ! array_key_exists('base_monthly', $attributes)) {
                $baseMonthly = $isLifetime
                    ? $totalPrice
                    : (int) round($totalPrice / max(1, $monthsCount));
            } elseif (array_key_exists('base_monthly', $attributes) && ! array_key_exists('total_price', $attributes) && $plan->total_price !== null) {
                $totalPrice = $isLifetime
                    ? $baseMonthly
                    : $baseMonthly * max(1, $monthsCount);
            }

            $plan->fill([
                'name' => $attributes['name'] ?? $plan->name,
                'tier' => $attributes['tier'] ?? $plan->tier,
                'description' => array_key_exists('description', $attributes) ? $attributes['description'] : $plan->description,
                'duration_days' => $isLifetime
                    ? null
                    : (array_key_exists('duration_days', $attributes) ? $attributes['duration_days'] : $plan->duration_days),
                'months_count' => $isLifetime ? 0 : $monthsCount,
                'total_price' => $totalPrice,
                'base_monthly' => $baseMonthly,
                'extra_user_monthly' => isset($attributes['extra_user_monthly']) ? (int) $attributes['extra_user_monthly'] : $plan->extra_user_monthly,
                'min_seats' => isset($attributes['min_seats']) ? max(1, (int) $attributes['min_seats']) : $plan->min_seats,
                'max_seats' => isset($attributes['max_seats']) ? max(1, (int) $attributes['max_seats']) : $plan->max_seats,
                'is_lifetime' => $isLifetime,
                'badge' => array_key_exists('badge', $attributes) ? $attributes['badge'] : $plan->badge,
                'is_featured' => isset($attributes['is_featured']) ? (bool) $attributes['is_featured'] : $plan->is_featured,
                'features' => isset($attributes['features']) ? array_values((array) $attributes['features']) : $plan->features,
                'is_active' => isset($attributes['is_active']) ? (bool) $attributes['is_active'] : $plan->is_active,
                'sort_order' => isset($attributes['sort_order']) ? (int) $attributes['sort_order'] : $plan->sort_order,
            ])->save();

            $priceChanged = $oldTotal !== $plan->total_price
                || $oldBase !== (int) $plan->base_monthly
                || $oldExtra !== (int) $plan->extra_user_monthly;

            if ($priceChanged) {
                $this->logPriceChange($plan, (string) ($attributes['price_note'] ?? 'ویرایش تعرفه توسط مدیر'), $actor);
            }

            AuditLogger::record('plan_updated', [
                'user_id' => $actor?->id,
                'subject_type' => 'plan',
                'subject_key' => $plan->code,
                'meta' => [
                    'price_changed' => $priceChanged,
                    'old_total_price' => $oldTotal,
                    'new_total_price' => $plan->total_price,
                    'old_base_monthly' => $oldBase,
                    'new_base_monthly' => (int) $plan->base_monthly,
                    'old_extra_user_monthly' => $oldExtra,
                    'new_extra_user_monthly' => (int) $plan->extra_user_monthly,
                    'is_active' => (bool) $plan->is_active,
                ],
            ]);

            return $plan->refresh();
        });
    }

    public function setActive(SubscriptionPlan $plan, bool $active, ?User $actor = null): SubscriptionPlan
    {
        $plan->forceFill(['is_active' => $active])->save();

        AuditLogger::record($active ? 'plan_activated' : 'plan_deactivated', [
            'user_id' => $actor?->id,
            'subject_type' => 'plan',
            'subject_key' => $plan->code,
        ]);

        return $plan;
    }

    /** @return Collection<int, SubscriptionPlanPrice> */
    public function priceHistory(string $planCode): Collection
    {
        return SubscriptionPlanPrice::query()
            ->where('plan_code', $planCode)
            ->orderByDesc('changed_at')
            ->orderByDesc('id')
            ->limit(50)
            ->get();
    }

    /**
     * خروجی استاندارد یک پلن برای API عمومی و مدیریتی.
     *
     * @return array<string, mixed>
     */
    public function serialize(SubscriptionPlan $plan, ?int $referenceMonthlyPrice = null): array
    {
        $isLifetime = (bool) $plan->is_lifetime;
        $totalPrice = $plan->packagePrice();
        $monthsCount = $isLifetime ? 0 : max(1, (int) ($plan->months_count ?: 1));
        $durationDays = $isLifetime
            ? null
            : ($plan->duration_days !== null ? (int) $plan->duration_days : ($monthsCount * 30));

        $monthlyEquivalent = $isLifetime
            ? null
            : ($monthsCount > 0 ? (int) round($totalPrice / $monthsCount) : (int) $plan->base_monthly);

        $refMonthly = $referenceMonthlyPrice ?? $this->referenceMonthlyPrice();
        $savings = (! $isLifetime && $monthsCount > 1)
            ? max(0, ($refMonthly * $monthsCount) - $totalPrice)
            : 0;

        return [
            'id' => (int) $plan->id,
            'code' => (string) $plan->code,
            'name' => (string) $plan->name,
            'tier' => (string) $plan->tier,
            'description' => $plan->description,
            'duration_days' => $durationDays,
            'months_count' => $monthsCount,
            'price' => $totalPrice,
            'total_price' => $totalPrice,
            'monthly_equivalent' => $monthlyEquivalent,
            'savings' => $savings,
            'base_monthly' => (int) $plan->base_monthly,
            'extra_user_monthly' => (int) $plan->extra_user_monthly,
            'min_seats' => (int) $plan->min_seats,
            'max_seats' => (int) $plan->max_seats,
            'is_lifetime' => $isLifetime,
            'badge' => $plan->badge,
            'is_featured' => (bool) $plan->is_featured,
            'payment_type' => $isLifetime ? 'یک‌باره' : 'دوره‌ای',
            'renewal_type' => $isLifetime ? 'بدون نیاز به تمدید دوره‌ای' : 'قابل تمدید در پایان دوره',
            'updates_policy' => 'طبق شرایط محصول',
            'support_policy' => 'طبق شرایط محصول',
            'features' => $plan->featureList(),
            'is_active' => (bool) $plan->is_active,
            'sort_order' => (int) $plan->sort_order,
        ];
    }

    private function logPriceChange(SubscriptionPlan $plan, string $note, ?User $actor): void
    {
        $storedPrice = $plan->total_price !== null ? (int) $plan->total_price : (int) $plan->base_monthly;

        SubscriptionPlanPrice::create([
            'plan_code' => $plan->code,
            'base_monthly' => $storedPrice,
            'extra_user_monthly' => (int) $plan->extra_user_monthly,
            'note' => $note,
            'changed_by' => $actor?->id,
            'changed_at' => now(),
        ]);
    }
}
