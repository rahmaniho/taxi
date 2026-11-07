<?php

namespace App\Http\Controllers\Api\Manager;

use App\Http\Controllers\Controller;
use App\Models\License;
use App\Models\Order;
use App\Models\SubscriptionHistory;
use App\Models\SubscriptionInvoice;
use App\Models\SubscriptionPayment;
use App\Services\Billing\LicenseService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

/**
 * مدیریت مشترکین (هر آژانس یک اشتراک دارد): فهرست، فیلتر، جزئیات، تمدید دستی، تغییر وضعیت و سقف کاربر.
 */
class SubscriberController extends Controller
{
    public function __construct(private readonly LicenseService $licenses) {}

    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'status' => ['nullable', 'in:all,active,expired,pending,suspended,canceled,renewal_pending'],
            'plan' => ['nullable', 'string', 'max:40'],
            'q' => ['nullable', 'string', 'max:120'],
            'search' => ['nullable', 'string', 'max:120'],
            'expiring_in_days' => ['nullable', 'integer', 'min:0', 'max:365'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:200'],
            'page' => ['nullable', 'integer', 'min:1', 'max:100000'],
            'sort' => ['nullable', 'in:expires_at,-expires_at,created_at,-created_at,seats,-seats'],
        ]);

        $perPage = (int) ($filters['limit'] ?? 25);
        $sort = $filters['sort'] ?? 'expires_at';
        $column = ltrim($sort, '-');
        $direction = str_starts_with($sort, '-') ? 'desc' : 'asc';
        $searchTerm = trim((string) ($filters['q'] ?? $filters['search'] ?? ''));
        $statusFilter = ($filters['status'] ?? null) === 'all' ? null : ($filters['status'] ?? null);

        $query = License::query()
            ->with([
                'store' => fn ($q) => $q
                    ->with(['users:id,store_id,name,email,phone,is_active'])
                    ->withCount([
                        'users',
                        'users as active_users_count' => fn ($inner) => $inner->where('is_active', true),
                    ]),
            ])
            ->when($filters['plan'] ?? null, fn (Builder $q, $plan) => $q->where('plan_code', $plan))
            ->when($statusFilter, fn (Builder $q, $status) => $this->applyStatusFilter($q, $status))
            ->when(isset($filters['expiring_in_days']), function (Builder $q) use ($filters) {
                $days = (int) $filters['expiring_in_days'];
                $q->where('is_lifetime', false)
                    ->whereNotNull('expires_at')
                    ->whereBetween('expires_at', [now(), now()->addDays($days)]);
            })
            ->when($searchTerm !== '', function (Builder $q) use ($searchTerm) {
                $like = '%'.$searchTerm.'%';
                $q->whereHas('store', function (Builder $store) use ($like) {
                    $store->where('name', 'like', $like)
                        ->orWhere('owner_name', 'like', $like)
                        ->orWhere('phone', 'like', $like)
                        ->orWhereHas('users', fn (Builder $u) => $u->where('email', 'like', $like)->orWhere('phone', 'like', $like));
                });
            })
            ->orderBy($column, $direction);

        $page = $query->paginate($perPage, ['*'], 'page', (int) ($filters['page'] ?? 1));

        return response()->json([
            'subscribers' => collect($page->items())->map(fn (License $lic) => $this->serialize($lic))->values()->all(),
            'meta' => [
                'page' => $page->currentPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
                'last_page' => $page->lastPage(),
            ],
            'stats' => $this->stats(),
        ]);
    }

    public function show(string $licenseKey): JsonResponse
    {
        $license = $this->resolveLicense($licenseKey);

        $license->load(['store' => fn ($q) => $q->withCount([
            'users',
            'users as active_users_count' => fn ($inner) => $inner->where('is_active', true),
        ])]);

        $payments = Order::query()
            ->where('store_id', $license->store_id)
            ->latest()
            ->limit(25)
            ->get()
            ->map(fn (Order $order) => [
                'id' => $order->id,
                'plan' => $order->plan,
                'plan_label' => is_array($order->meta) ? ($order->meta['plan_label'] ?? $order->plan) : $order->plan,
                'type' => $order->type,
                'seats' => (int) $order->seats,
                'months' => (int) $order->months,
                'is_lifetime' => (bool) $order->is_lifetime,
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

        $invoices = SubscriptionInvoice::query()
            ->where('store_id', $license->store_id)
            ->orderByDesc('issued_at')
            ->limit(25)
            ->get()
            ->map(fn (SubscriptionInvoice $inv) => [
                'number' => $inv->number,
                'plan_name' => $inv->plan_name,
                'total' => (int) $inv->total,
                'issued_at' => $inv->issued_at?->toIso8601String(),
                'is_voided' => $inv->isVoided(),
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
            ->get(['id', 'name', 'email', 'phone', 'is_active', 'last_login_at'])
            ->map(fn ($user) => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'phone' => $user->phone,
                'is_active' => (bool) $user->is_active,
                'last_login_at' => $user->last_login_at?->toIso8601String(),
            ])
            ->values()
            ->all() ?? [];

        return response()->json([
            'subscriber' => $this->serialize($license),
            'store' => [
                'id' => $license->store?->id,
                'name' => $license->store?->name,
                'phone' => $license->store?->phone,
            ],
            'payments' => $payments,
            'attempts' => $attempts,
            'invoices' => $invoices,
            'history' => $history,
            'users' => $users,
        ]);
    }

    /**
     * تمدید/اصلاح دستی اشتراک با دلیل.
     *
     * @throws Throwable
     */
    public function extend(Request $request, string $licenseKey): JsonResponse
    {
        $license = $this->resolveLicense($licenseKey);

        $data = $request->validate([
            'months' => ['required', 'integer', 'min:1', 'max:120'],
            'seats' => ['nullable', 'integer', 'min:1', 'max:200'],
            'max_users' => ['nullable', 'integer', 'min:1', 'max:200'],
            'plan_code' => ['nullable', 'string', 'max:40', 'exists:subscription_plans,code'],
            'reason' => ['required', 'string', 'min:3', 'max:300'],
        ], [
            'reason.required' => 'دلیل تمدید/اصلاح الزامی است و در تاریخچه ثبت می‌شود.',
        ]);

        $months = max(1, (int) $data['months']);
        $seats = isset($data['seats'])
            ? (int) $data['seats']
            : (isset($data['max_users']) ? (int) $data['max_users'] : null);

        $updated = $this->licenses->extendManually(
            $license->store,
            $months,
            $seats,
            (string) $data['reason'],
            $request->user(),
            $data['plan_code'] ?? null,
        );

        return response()->json(['subscriber' => $this->serialize($updated->load('store'))]);
    }

    /**
     * @throws Throwable
     */
    public function status(Request $request, string $licenseKey): JsonResponse
    {
        $license = $this->resolveLicense($licenseKey);

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
     * @throws Throwable
     */
    public function seats(Request $request, string $licenseKey): JsonResponse
    {
        $license = $this->resolveLicense($licenseKey);

        $data = $request->validate([
            'seats' => ['required', 'integer', 'min:1', 'max:200'],
            'reason' => ['required', 'string', 'min:3', 'max:300'],
        ]);

        $updated = $this->licenses->setSeats(
            $license->store,
            (int) $data['seats'],
            (string) $data['reason'],
            $request->user(),
        );

        return response()->json(['subscriber' => $this->serialize($updated->load('store'))]);
    }

    private function resolveLicense(string $licenseKey): License
    {
        if (ctype_digit($licenseKey)) {
            $byId = License::find((int) $licenseKey);
            if ($byId !== null) {
                return $byId;
            }

            $byStore = License::where('store_id', (int) $licenseKey)->first();
            if ($byStore !== null) {
                return $byStore;
            }
        }

        abort(404, 'اشتراک مورد نظر یافت نشد.');
    }

    /** @param  Builder<License>  $query */
    private function applyStatusFilter(Builder $query, string $status): void
    {
        match ($status) {
            'active' => $query
                ->where('is_active', true)
                ->where('status', License::STATUS_ACTIVE)
                ->where(fn ($q) => $q->where('is_lifetime', true)->orWhere('expires_at', '>', now())),
            'expired' => $query
                ->where('is_lifetime', false)
                ->whereNotNull('expires_at')
                ->where('expires_at', '<=', now()),
            default => $query->where('status', $status),
        };
    }

    /**
     * @return array<string, int>
     */
    private function stats(): array
    {
        $now = now();

        return [
            'total' => License::query()->count(),
            'active' => License::query()
                ->where('is_active', true)
                ->where('status', License::STATUS_ACTIVE)
                ->where(fn ($q) => $q->where('is_lifetime', true)->orWhere('expires_at', '>', $now))
                ->count(),
            'expired' => License::query()
                ->where('is_lifetime', false)
                ->whereNotNull('expires_at')
                ->where('expires_at', '<=', $now)
                ->count(),
            'expiring_7' => License::query()
                ->where('is_active', true)
                ->where('status', License::STATUS_ACTIVE)
                ->where('is_lifetime', false)
                ->whereBetween('expires_at', [$now, $now->copy()->addDays(7)])
                ->count(),
            'suspended' => License::query()->where('status', License::STATUS_SUSPENDED)->count(),
            'pending_orders' => Order::query()->where('status', Order::STATUS_PENDING)->count(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function serialize(License $license): array
    {
        $store = $license->store;
        $isLifetime = (bool) $license->is_lifetime;
        $primaryUser = $store && $store->relationLoaded('users') ? $store->users->first() : null;
        $lastOrder = Order::query()
            ->where('store_id', $license->store_id)
            ->where('status', Order::STATUS_PAID)
            ->latest('paid_at')
            ->latest('id')
            ->first(['reference_id', 'paid_at', 'amount']);

        return [
            'id' => $license->id,
            'store_id' => $license->store_id,
            'store_name' => $store?->name,
            'owner_name' => $store?->owner_name,
            'phone' => $store?->phone,
            'email' => $primaryUser?->email,
            'store' => $store ? [
                'id' => $store->id,
                'name' => $store->name,
                'owner_name' => $store->owner_name,
                'phone' => $store->phone,
                'email' => $primaryUser?->email,
            ] : null,
            'plan_code' => $license->plan_code,
            'plan_name' => $license->planLabel(),
            'tier' => $license->tier,
            'seats' => $license->seats(),
            'max_users' => $license->seats(),
            'active_users' => (int) ($store->active_users_count ?? 0),
            'total_users' => (int) ($store->users_count ?? 0),
            'status' => $license->effectiveStatus(),
            'is_active' => (bool) $license->is_active,
            'is_lifetime' => $isLifetime,
            'is_trial' => (bool) $license->is_trial,
            'is_valid' => $license->isCurrentlyValid(),
            'starts_at' => $license->starts_at?->toIso8601String(),
            'expires_at' => $isLifetime ? null : $license->expires_at?->toIso8601String(),
            'days_remaining' => $license->daysRemaining(),
            'notes' => $license->notes,
            'last_transaction' => $lastOrder?->reference_id,
            'last_paid_at' => $lastOrder?->paid_at?->toIso8601String(),
        ];
    }
}
