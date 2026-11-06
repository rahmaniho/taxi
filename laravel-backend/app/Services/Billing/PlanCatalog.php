<?php

namespace App\Services\Billing;

use App\Models\SubscriptionPlan;
use App\Models\SubscriptionPlanPrice;
use App\Models\User;
use App\Support\AuditLogger;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * کاتالوگ پلن‌ها — منبع آن جدول `subscription_plans` است، نه کد.
 *
 * مدیر می‌تواند تعرفه‌ها را بدون تغییر کد عوض کند. هر تغییر قیمت یک ردیف در
 * `subscription_plan_prices` می‌سازد و در دفتر رویدادها هم ثبت می‌شود؛
 * سفارش‌های قبلی چون قیمت واحد خودشان را نگه داشته‌اند تغییر نمی‌کنند.
 */
class PlanCatalog
{
    /**
     * @return \Illuminate\Database\Eloquent\Collection<int, SubscriptionPlan>
     */
    public function all(bool $onlyActive = false): \Illuminate\Database\Eloquent\Collection
    {
        return SubscriptionPlan::query()
            ->when($onlyActive, fn ($query) => $query->where('is_active', true))
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();
    }

    public function find(string $code, bool $onlyActive = true): ?SubscriptionPlan
    {
        return SubscriptionPlan::query()
            ->where('code', $code)
            ->when($onlyActive, fn ($query) => $query->where('is_active', true))
            ->first();
    }

    /**
     * خروجی استاندارد برای رابط کاربری و API.
     *
     * @return array<string, mixed>
     */
    public function serialize(SubscriptionPlan $plan): array
    {
        return [
            'code' => $plan->code,
            'name' => $plan->name,
            'tier' => $plan->tier,
            'description' => $plan->description,
            'base_monthly' => (int) $plan->base_monthly,
            'extra_user_monthly' => (int) $plan->extra_user_monthly,
            'min_seats' => (int) $plan->min_seats,
            'max_seats' => (int) $plan->max_seats,
            'is_lifetime' => (bool) $plan->is_lifetime,
            'is_active' => (bool) $plan->is_active,
            'features' => $plan->featureList(),
            'sort_order' => (int) $plan->sort_order,
        ];
    }

    /**
     * @param  array<string, mixed>  $data
     *
     * @throws ValidationException
     */
    public function create(array $data, ?User $actor = null): SubscriptionPlan
    {
        $this->assertUniqueCode((string) $data['code']);
        $this->assertPriceRange($data);

        return DB::transaction(function () use ($data, $actor) {
            $plan = SubscriptionPlan::create([
                'code' => mb_strtolower((string) $data['code']),
                'name' => (string) $data['name'],
                'tier' => (string) ($data['tier'] ?? 'pro'),
                'description' => $data['description'] ?? null,
                'base_monthly' => (int) $data['base_monthly'],
                'extra_user_monthly' => (int) $data['extra_user_monthly'],
                'min_seats' => (int) ($data['min_seats'] ?? 1),
                'max_seats' => (int) ($data['max_seats'] ?? 50),
                'is_lifetime' => (bool) ($data['is_lifetime'] ?? false),
                'features' => $this->normalizeFeatures($data['features'] ?? []),
                'is_active' => (bool) ($data['is_active'] ?? true),
                'sort_order' => (int) ($data['sort_order'] ?? 0),
            ]);

            $this->logPrice($plan, $actor, 'تعرفهٔ اولیه');

            AuditLogger::record('plan_created', [
                'subject_type' => 'plan',
                'subject_key' => $plan->code,
                'meta' => [
                    'base_monthly' => $plan->base_monthly,
                    'extra_user_monthly' => $plan->extra_user_monthly,
                ],
            ]);

            return $plan;
        });
    }

    /**
     * @param  array<string, mixed>  $data
     *
     * @throws ValidationException
     */
    public function update(SubscriptionPlan $plan, array $data, ?User $actor = null): SubscriptionPlan
    {
        $this->assertPriceRange($data);

        $priceChanged = (int) ($data['base_monthly'] ?? $plan->base_monthly) !== (int) $plan->base_monthly
            || (int) ($data['extra_user_monthly'] ?? $plan->extra_user_monthly) !== (int) $plan->extra_user_monthly;

        return DB::transaction(function () use ($plan, $data, $actor, $priceChanged) {
            $plan->fill([
                'name' => (string) ($data['name'] ?? $plan->name),
                'tier' => (string) ($data['tier'] ?? $plan->tier),
                'description' => array_key_exists('description', $data) ? $data['description'] : $plan->description,
                'base_monthly' => (int) ($data['base_monthly'] ?? $plan->base_monthly),
                'extra_user_monthly' => (int) ($data['extra_user_monthly'] ?? $plan->extra_user_monthly),
                'min_seats' => (int) ($data['min_seats'] ?? $plan->min_seats),
                'max_seats' => (int) ($data['max_seats'] ?? $plan->max_seats),
                'is_lifetime' => (bool) ($data['is_lifetime'] ?? $plan->is_lifetime),
                'is_active' => (bool) ($data['is_active'] ?? $plan->is_active),
                'sort_order' => (int) ($data['sort_order'] ?? $plan->sort_order),
            ]);

            if (array_key_exists('features', $data)) {
                $plan->features = $this->normalizeFeatures($data['features']);
            }

            $plan->save();

            if ($priceChanged) {
                $this->logPrice($plan, $actor, (string) ($data['price_note'] ?? 'تغییر تعرفه توسط مدیر'));
            }

            AuditLogger::record('plan_updated', [
                'subject_type' => 'plan',
                'subject_key' => $plan->code,
                'meta' => [
                    'base_monthly' => $plan->base_monthly,
                    'extra_user_monthly' => $plan->extra_user_monthly,
                    'is_active' => $plan->is_active,
                    'price_changed' => $priceChanged,
                ],
            ]);

            return $plan->refresh();
        });
    }

    public function setActive(SubscriptionPlan $plan, bool $active): SubscriptionPlan
    {
        $plan->forceFill(['is_active' => $active])->save();

        AuditLogger::record($active ? 'plan_activated' : 'plan_deactivated', [
            'subject_type' => 'plan',
            'subject_key' => $plan->code,
        ]);

        return $plan;
    }

    /**
     * @return \Illuminate\Database\Eloquent\Collection<int, SubscriptionPlanPrice>
     */
    public function priceHistory(string $planCode): \Illuminate\Database\Eloquent\Collection
    {
        return SubscriptionPlanPrice::query()
            ->where('plan_code', $planCode)
            ->orderByDesc('changed_at')
            ->orderByDesc('id')
            ->limit(50)
            ->get();
    }

    /**
     * @throws ValidationException
     */
    private function assertUniqueCode(string $code): void
    {
        if ($code === '' || SubscriptionPlan::where('code', mb_strtolower($code))->exists()) {
            throw ValidationException::withMessages([
                'code' => ['کد پلن خالی است یا قبلاً استفاده شده است.'],
            ]);
        }
    }

    /**
     * @param  array<string, mixed>  $data
     *
     * @throws ValidationException
     */
    private function assertPriceRange(array $data): void
    {
        foreach (['base_monthly', 'extra_user_monthly'] as $field) {
            if (isset($data[$field]) && ((int) $data[$field] < 0 || (int) $data[$field] > 1_000_000_000)) {
                throw ValidationException::withMessages([$field => ['مبلغ خارج از محدودهٔ مجاز است.']]);
            }
        }
    }

    private function logPrice(SubscriptionPlan $plan, ?User $actor, string $note): void
    {
        SubscriptionPlanPrice::create([
            'plan_code' => $plan->code,
            'base_monthly' => (int) $plan->base_monthly,
            'extra_user_monthly' => (int) $plan->extra_user_monthly,
            'note' => $note,
            'changed_by' => $actor?->id,
            'changed_at' => now(),
        ]);
    }

    /**
     * @param  mixed  $features
     * @return list<string>
     */
    private function normalizeFeatures(mixed $features): array
    {
        if (! is_array($features)) {
            return [];
        }

        return array_values(array_filter(
            array_map(fn ($item) => is_string($item) ? trim($item) : '', $features),
            fn (string $item) => $item !== '',
        ));
    }
}
