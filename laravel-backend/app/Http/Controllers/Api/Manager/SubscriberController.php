<?php

namespace App\Http\Controllers\Api\Manager;

use App\Http\Controllers\Controller;
use App\Http\Resources\LicenseResource;
use App\Models\License;
use App\Models\Order;
use App\Models\SubscriptionHistory;
use App\Models\SubscriptionPayment;
use App\Services\Billing\LicenseService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * مدیریت مشترکان: فهرست با فیلتر/جست‌وجو/صفحه‌بندی، سابقه، تمدید، تغییر وضعیت و سقف.
 *
 * فیلتر وضعیت در سطح SQL اعمال می‌شود (نه بعد از limit) تا نتیجه با دادهٔ زیاد
 * هم درست بماند. آخرین پرداخت هر مشترک با زیرکوئری خوانده می‌شود (بدون N+1).
 */
class SubscriberController extends Controller
{
    public function __construct(private readonly LicenseService $licenses) {}

    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:120'],
            'status' => ['nullable', 'in:active,expired,pending,suspended,canceled,renewal_pending'],
            'plan_code' => ['nullable', 'string', 'max:40'],
            'include_archived' => ['nullable', 'boolean'],
            'sort' => ['nullable', 'in:expires_at,-expires_at,created_at,-created_at,seats,-seats'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1', 'max:100000'],
        ]);

        $sort = $filters['sort'] ?? '-created_at';
        $column = ltrim($sort, '-') === 'seats' ? 'seats' : (ltrim($sort, '-') === 'expires_at' ? 'expires_at' : 'created_at');
        $direction = str_starts_with($sort, '-') ? 'desc' : 'asc';

        $query = License::query()
            ->select('licenses.*')
            ->with(['store' => fn ($relation) => $relation->withCount([
                'users as active_users_count' => fn ($q) => $q->where('is_active', true),
            ])])
            ->addSelect([
                'last_order_amount' => Order::query()
                    ->select('amount')
                    ->whereColumn('orders.store_id', 'licenses.store_id')
                    ->where('status', Order::STATUS_PAID)
                    ->latest('id')
                    ->limit(1),
                'last_order_reference' => Order::query()
                    ->select('reference_id')
                    ->whereColumn('orders.store_id', 'licenses.store_id')
                    ->where('status', Order::STATUS_PAID)
                    ->latest('id')
                    ->limit(1),
            ])
            ->when($filters['plan_code'] ?? null, fn ($q, $plan) => $q->where('plan_code', $plan))
            ->when(! ($filters['include_archived'] ?? false), fn ($q) => $q->whereHas('store', fn ($store) => $store->whereNull('archived_at')))
            ->when($filters['q'] ?? null, function ($q, $term) {
                $like = '%'.$term.'%';
                $q->where(fn ($inner) => $inner
                    ->where('plan_code', 'like', $like)
                    ->orWhereHas('store', fn ($store) => $store
                        ->where('name', 'like', $like)
                        ->orWhere('phone', 'like', $like)
                        ->orWhere('owner_name', 'like', $like)
                        ->orWhereHas('users', fn ($user) => $user->where('email', 'like', $like))));
            });

        $this->applyStatusFilter($query, $filters['status'] ?? null);

        $page = $query->orderBy($column, $direction)
            ->paginate((int) ($filters['limit'] ?? 12), ['*'], 'page', (int) ($filters['page'] ?? 1));

        return response()->json([
            'subscribers' => collect($page->items())->map(fn (License $license) => $this->serialize($license))->all(),
            'meta' => [
                'page' => $page->currentPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
                'last_page' => $page->lastPage(),
            ],
            'stats' => $this->stats(),
        ]);
    }

    public function show(License $license): JsonResponse
    {
        $license->load(['store' => fn ($relation) => $relation->withCount([
            'users as active_users_count' => fn ($q) => $q->where('is_active', true),
        ])]);

        $payments = Order::query()
            ->where('store_id', $license->store_id)
            ->latest()
            ->limit(20)
            ->get()
            ->map(fn (Order $order) => [
                'id' => $order->id,
                'plan' => $order->plan,
                'type' => $order->type,
                'seats' => (int) $order->seats,
                'months' => (int) $order->months,
                'amount' => (int) $order->amount,
                'status' => $order->status,
                'gateway' => $order->gateway,
                'reference_id' => $order->reference_id,
                'paid_at' => $order->paid_at?->toIso8601String(),
                'voided_at' => $order->voided_at?->toIso8601String(),
                'void_reason' => $order->void_reason,
                'created_at' => $order->created_at?->toIso8601String(),
            ])
            ->values()
            ->all();

        $attempts = SubscriptionPayment::query()
            ->where('store_id', $license->store_id)
            ->latest()
            ->limit(50)
            ->get()
            ->map(fn (SubscriptionPayment $payment) => [
                'id' => $payment->id,
                'order_id' => $payment->order_id,
                'gateway' => $payment->gateway,
                'amount' => (int) $payment->amount,
                'status' => $payment->status,
                'reference_id' => $payment->reference_id,
                'verified_at' => $payment->verified_at?->toIso8601String(),
                'created_at' => $payment->created_at?->toIso8601String(),
            ])
            ->values()
            ->all();

        $history = SubscriptionHistory::query()
            ->where('store_id', $license->store_id)
            ->orderByDesc('id')
            ->limit(50)
            ->get()
            ->map(fn (SubscriptionHistory $row) => [
                'id' => $row->id,
                'action' => $row->action,
                'reason' => $row->reason,
                'payload' => $row->payload,
                'actor_id' => $row->actor_id,
                'created_at' => $row->created_at?->toIso8601String(),
            ])
            ->values()
            ->all();

        $users = $license->store?->users()
            ->orderBy('id')
            ->get(['id', 'name', 'email', 'is_active', 'last_login_at'])
            ->map(fn ($user) => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'is_active' => (bool) $user->is_active,
                'last_login_at' => $user->last_login_at?->toIso8601String(),
            ])
            ->values()
            ->all() ?? [];

        return response()->json([
            'subscriber' => $this->serialize($license),
            'payments' => $payments,
            'attempts' => $attempts,
            'history' => $history,
            'users' => $users,
        ]);
    }

    /**
     * تمدید/اصلاح دستی اشتراک با دلیل.
     *
     * @throws Throwable
     */
    public function extend(Request $request, License $license): JsonResponse
    {
        $data = $request->validate([
            'months' => ['required', 'integer', 'min:1', 'max:60'],
            'seats' => ['nullable', 'integer', 'min:1', 'max:200'],
            'plan_code' => ['nullable', 'string', 'max:40', 'exists:subscription_plans,code'],
            'reason' => ['required', 'string', 'min:3', 'max:300'],
        ], [
            'reason.required' => 'دلیل تمدید/اصلاح الزامی است و در تاریخچه ثبت می‌شود.',
        ]);

        $updated = $this->licenses->extendManually(
            $license->store,
            (int) $data['months'],
            isset($data['seats']) ? (int) $data['seats'] : null,
            (string) $data['reason'],
            $request->user(),
            $data['plan_code'] ?? null,
        );

        return response()->json(['subscriber' => $this->serialize($updated->load('store'))]);
    }

    /**
     * @throws Throwable
     */
    public function status(Request $request, License $license): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', 'in:active,suspended,canceled'],
            'reason' => ['required', 'string', 'min:3', 'max:300'],
        ]);

        $updated = $this->licenses->setStatus(
            $license->store,
            (string) $data['status'],
            (string) $data['reason'],
            $request->user(),
        );

        return response()->json(['subscriber' => $this->serialize($updated->load('store'))]);
    }

    /**
     * @throws ValidationException
     */
    public function seats(Request $request, License $license): JsonResponse
    {
        $data = $request->validate([
            'seats' => ['required', 'integer', 'min:1', 'max:200'],
            'reason' => ['required', 'string', 'min:3', 'max:300'],
        ]);

        $usage = $license->store->activeUserCount();

        if ((int) $data['seats'] < $usage) {
            throw ValidationException::withMessages([
                'seats' => ["این فروشگاه {$usage} کاربر فعال دارد؛ سقف نمی‌تواند کمتر از آن باشد."],
            ]);
        }

        $updated = $this->licenses->setSeats($license->store, (int) $data['seats'], $request->user(), (string) $data['reason']);

        return response()->json(['subscriber' => $this->serialize($updated->load('store'))]);
    }

    /**
     * وضعیت مؤثر در سطح SQL — برای فیلتر درست و سریع.
     *
     * @param  \Illuminate\Database\Eloquent\Builder<License>  $query
     */
    private function applyStatusFilter($query, ?string $status): void
    {
        if ($status === null) {
            return;
        }

        match ($status) {
            License::STATUS_SUSPENDED => $query->where('status', License::STATUS_SUSPENDED),
            License::STATUS_CANCELED => $query->where('status', License::STATUS_CANCELED),
            License::STATUS_PENDING => $query->where('status', License::STATUS_PENDING),
            License::STATUS_RENEWAL_PENDING => $query->where('status', License::STATUS_RENEWAL_PENDING),
            License::STATUS_EXPIRED => $query
                ->whereNotIn('status', [License::STATUS_SUSPENDED, License::STATUS_CANCELED])
                ->where('is_lifetime', false)
                ->whereNotNull('expires_at')
                ->where('expires_at', '<', now()),
            default => $query
                ->whereNotIn('status', [License::STATUS_SUSPENDED, License::STATUS_CANCELED])
                ->where(fn ($q) => $q->where('is_lifetime', true)->orWhere('expires_at', '>', now())),
        };
    }

    /**
     * آمار کلی (بدون فروشگاه‌های آرشیوشده).
     *
     * @return array<string, int>
     */
    private function stats(): array
    {
        $base = fn () => License::query()
            ->whereHas('store', fn ($store) => $store->whereNull('archived_at'));

        $paid = Order::query()->where('status', Order::STATUS_PAID);

        return [
            'total' => (int) (clone $base())->count(),
            'active' => (int) (clone $base())
                ->where('is_active', true)
                ->whereNotIn('status', [License::STATUS_SUSPENDED, License::STATUS_CANCELED])
                ->where(fn ($q) => $q->where('is_lifetime', true)->orWhere('expires_at', '>', now()))
                ->count(),
            'trial' => (int) (clone $base())->where('is_trial', true)->where('is_active', true)->count(),
            'expiring_soon' => (int) (clone $base())
                ->where('is_active', true)
                ->where('is_lifetime', false)
                ->whereBetween('expires_at', [now(), now()->copy()->addDays(7)])
                ->count(),
            'expired' => (int) (clone $base())
                ->where('is_lifetime', false)
                ->whereNotNull('expires_at')
                ->where('expires_at', '<', now())
                ->count(),
            'suspended' => (int) (clone $base())->where('status', License::STATUS_SUSPENDED)->count(),
            'revenue_total' => (int) (clone $paid)->sum('amount'),
            'revenue_month' => (int) (clone $paid)->where('paid_at', '>=', now()->startOfMonth())->sum('amount'),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function serialize(License $license): array
    {
        $store = $license->store;

        $lastReference = $license->last_order_reference ?? null;
        $lastAmount = $license->last_order_amount ?? null;

        if ($lastReference === null && $lastAmount === null) {
            $latest = Order::query()
                ->where('store_id', $license->store_id)
                ->where('status', Order::STATUS_PAID)
                ->latest('id')
                ->first(['amount', 'reference_id']);

            $lastReference = $latest?->reference_id;
            $lastAmount = $latest?->amount;
        }

        return [
            'license_id' => $license->id,
            'store_id' => $license->store_id,
            'store_name' => $store?->name,
            'owner_name' => $store?->owner_name,
            'phone' => $store?->phone,
            'store_archived' => $store?->archived_at !== null,
            'plan_code' => $license->plan_code,
            'tier' => $license->tier,
            'seats' => $license->seats(),
            'active_users' => (int) ($store->active_users_count ?? $store?->activeUserCount() ?? 0),
            'status' => $license->effectiveStatus(),
            'is_active' => (bool) $license->is_active,
            'is_trial' => (bool) $license->is_trial,
            'is_lifetime' => (bool) $license->is_lifetime,
            'starts_at' => $license->starts_at?->toIso8601String(),
            'expires_at' => $license->expires_at?->toIso8601String(),
            'days_remaining' => $license->daysRemaining(),
            'last_transaction' => $lastReference,
            'last_amount' => $lastAmount !== null ? (int) $lastAmount : null,
            'license' => new LicenseResource($license),
        ];
    }
}
