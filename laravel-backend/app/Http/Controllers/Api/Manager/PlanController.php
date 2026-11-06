<?php

namespace App\Http\Controllers\Api\Manager;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\SubscriptionPlan;
use App\Services\Billing\PlanCatalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * مدیریت تعرفه‌ها — ایجاد، ویرایش قیمت، فعال/غیرفعال، تاریخچهٔ قیمت و فروش هر پلن.
 *
 * این مسیر فقط برای مدیر کل است (`manager` middleware).
 */
class PlanController extends Controller
{
    public function __construct(private readonly PlanCatalog $plans) {}

    public function index(): JsonResponse
    {
        $plans = $this->plans->all();

        $sales = Order::query()
            ->select('plan', DB::raw('count(*) as orders_count'), DB::raw('coalesce(sum(amount),0) as revenue'))
            ->where('status', Order::STATUS_PAID)
            ->groupBy('plan')
            ->get()
            ->keyBy('plan');

        return response()->json([
            'plans' => $plans->map(function (SubscriptionPlan $plan) use ($sales) {
                $stat = $sales->get($plan->code);

                return [
                    ...$this->plans->serialize($plan),
                    'sales' => [
                        'orders' => (int) ($stat->orders_count ?? 0),
                        'revenue' => (int) ($stat->revenue ?? 0),
                    ],
                ];
            })->values()->all(),
        ]);
    }

    /**
     * @throws Throwable
     */
    public function store(Request $request): JsonResponse
    {
        $plan = $this->plans->create($this->validated($request), $request->user());

        return response()->json(['plan' => $this->plans->serialize($plan)], 201);
    }

    /**
     * @throws Throwable
     */
    public function update(Request $request, SubscriptionPlan $plan): JsonResponse
    {
        $updated = $this->plans->update($plan, $this->validated($request, true, $plan), $request->user());

        return response()->json(['plan' => $this->plans->serialize($updated)]);
    }

    public function toggle(Request $request, SubscriptionPlan $plan): JsonResponse
    {
        $data = $request->validate(['is_active' => ['required', 'boolean']]);
        $updated = $this->plans->setActive($plan, (bool) $data['is_active']);

        return response()->json(['plan' => $this->plans->serialize($updated)]);
    }

    public function prices(SubscriptionPlan $plan): JsonResponse
    {
        return response()->json([
            'history' => $this->plans->priceHistory($plan->code)->map(fn ($row) => [
                'base_monthly' => (int) $row->base_monthly,
                'extra_user_monthly' => (int) $row->extra_user_monthly,
                'note' => $row->note,
                'changed_at' => $row->changed_at?->toIso8601String(),
            ])->values()->all(),
        ]);
    }

    /**
     * @return array<string, mixed>
     *
     * @throws ValidationException
     */
    private function validated(Request $request, bool $partial = false, ?SubscriptionPlan $plan = null): array
    {
        $required = $partial ? 'sometimes' : 'required';

        $data = $request->validate([
            'code' => [$partial ? 'sometimes' : 'required', 'string', 'max:40', 'regex:/^[a-z0-9_-]+$/'],
            'name' => [$required, 'string', 'max:80'],
            'tier' => ['sometimes', 'in:pro,proplus'],
            'description' => ['nullable', 'string', 'max:200'],
            'base_monthly' => [$required, 'integer', 'min:0', 'max:1000000000'],
            'extra_user_monthly' => [$required, 'integer', 'min:0', 'max:1000000000'],
            'min_seats' => ['sometimes', 'integer', 'min:1', 'max:200'],
            'max_seats' => ['sometimes', 'integer', 'min:1', 'max:200'],
            'is_lifetime' => ['sometimes', 'boolean'],
            'is_active' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:9999'],
            'features' => ['sometimes', 'array', 'max:20'],
            'features.*' => ['string', 'max:120'],
            'price_note' => ['sometimes', 'nullable', 'string', 'max:200'],
        ], [
            'code.regex' => 'کد پلن فقط می‌تواند شامل حروف لاتین کوچک، عدد، خط تیره و زیرخط باشد.',
        ]);

        $min = (int) ($data['min_seats'] ?? $plan?->min_seats ?? 1);
        $max = (int) ($data['max_seats'] ?? $plan?->max_seats ?? 50);

        if ($min > $max) {
            throw ValidationException::withMessages([
                'max_seats' => ['حداکثر کاربران نمی‌تواند کمتر از حداقل کاربران باشد.'],
            ]);
        }

        return $data;
    }
}
