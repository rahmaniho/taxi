<?php

namespace App\Http\Controllers\Api\Manager;

use App\Http\Controllers\Controller;
use App\Models\License;
use App\Models\Order;
use App\Models\Store;
use App\Models\SubscriptionPlan;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/**
 * پیشخوان مدیر کل — شاخص‌های عملیاتی، درآمد، گزارش فروش هر پلن و فهرست‌های هشدار.
 */
class DashboardController extends Controller
{
    public function index(): JsonResponse
    {
        $now = now();
        $monthStart = $now->copy()->startOfMonth();
        $yearStart = $now->copy()->startOfYear();

        $storesTotal = Store::query()->whereNull('archived_at')->count();
        $storesArchived = Store::query()->whereNotNull('archived_at')->count();
        $usersActive = User::query()
            ->where('role', User::ROLE_STORE)
            ->where('is_active', true)
            ->count();

        $activeLicenses = License::query()
            ->where('is_active', true)
            ->where('status', License::STATUS_ACTIVE)
            ->where(fn ($q) => $q->where('is_lifetime', true)->orWhere('expires_at', '>', $now));

        $subsActive = (clone $activeLicenses)->count();
        $subsLifetime = (clone $activeLicenses)->where('is_lifetime', true)->count();
        $subsTrial = (clone $activeLicenses)->where('is_trial', true)->count();

        $subsExpired = License::query()
            ->where('is_lifetime', false)
            ->whereNotNull('expires_at')
            ->where('expires_at', '<=', $now)
            ->count();

        $subsSuspended = License::query()
            ->where('status', License::STATUS_SUSPENDED)
            ->count();

        $expiring7 = License::query()
            ->where('is_active', true)
            ->where('status', License::STATUS_ACTIVE)
            ->where('is_lifetime', false)
            ->whereBetween('expires_at', [$now, $now->copy()->addDays(7)])
            ->count();

        $expiring30 = License::query()
            ->where('is_active', true)
            ->where('status', License::STATUS_ACTIVE)
            ->where('is_lifetime', false)
            ->whereBetween('expires_at', [$now, $now->copy()->addDays(30)])
            ->count();

        $revenueMonth = (int) Order::query()
            ->where('status', Order::STATUS_PAID)
            ->where('paid_at', '>=', $monthStart)
            ->sum('amount');

        $revenueYear = (int) Order::query()
            ->where('status', Order::STATUS_PAID)
            ->where('paid_at', '>=', $yearStart)
            ->sum('amount');

        $revenueAllTime = (int) Order::query()
            ->where('status', Order::STATUS_PAID)
            ->sum('amount');

        $ordersPending = Order::query()
            ->where('status', Order::STATUS_PENDING)
            ->count();

        $mrr = $this->estimateMrr($now);

        $expiringSoon = License::query()
            ->with(['store:id,name,phone,owner_name', 'store.users:id,store_id,email'])
            ->where('is_active', true)
            ->where('status', License::STATUS_ACTIVE)
            ->where('is_lifetime', false)
            ->whereBetween('expires_at', [$now, $now->copy()->addDays(14)])
            ->orderBy('expires_at')
            ->limit(10)
            ->get()
            ->map(fn (License $license) => [
                'license_id' => $license->id,
                'store_id' => $license->store_id,
                'store_name' => $license->store?->name,
                'phone' => $license->store?->phone,
                'email' => $license->store?->users?->first()?->email,
                'plan_code' => $license->plan_code,
                'plan_name' => $license->planLabel(),
                'seats' => $license->seats(),
                'expires_at' => $license->expires_at?->toIso8601String(),
                'days_remaining' => $license->daysRemaining(),
            ])
            ->values()
            ->all();

        $planNames = SubscriptionPlan::query()->pluck('name', 'code')->all();

        $salesByPlan = Order::query()
            ->select('plan', DB::raw('count(*) as orders_count'), DB::raw('coalesce(sum(amount),0) as revenue'))
            ->where('status', Order::STATUS_PAID)
            ->groupBy('plan')
            ->get()
            ->keyBy('plan');

        $activeByPlan = (clone $activeLicenses)
            ->select('plan_code', DB::raw('count(*) as total'), DB::raw('coalesce(sum(seats),0) as seats'))
            ->groupBy('plan_code')
            ->get()
            ->keyBy('plan_code');

        $allCodes = collect(array_keys($planNames))
            ->merge($activeByPlan->keys())
            ->merge($salesByPlan->keys())
            ->filter()
            ->unique()
            ->values();

        $byPlan = $allCodes->map(function (string $code) use ($planNames, $activeByPlan, $salesByPlan) {
            $activeRow = $activeByPlan->get($code);
            $salesRow = $salesByPlan->get($code);

            return [
                'plan_code' => $code,
                'plan_name' => $planNames[$code] ?? $code,
                'total' => (int) ($activeRow->total ?? 0),
                'seats' => (int) ($activeRow->seats ?? 0),
                'orders' => (int) ($salesRow->orders_count ?? 0),
                'revenue' => (int) ($salesRow->revenue ?? 0),
            ];
        })->filter(fn (array $row) => $row['total'] > 0 || $row['orders'] > 0 || in_array($row['plan_code'], ['monthly', 'quarterly', 'semiannual', 'yearly', 'lifetime'], true))
            ->values()
            ->all();

        $recentOrders = Order::query()
            ->with('store:id,name')
            ->latest()
            ->limit(8)
            ->get()
            ->map(function (Order $order) use ($planNames) {
                $meta = is_array($order->meta) ? $order->meta : [];

                return [
                    'id' => $order->id,
                    'store_id' => $order->store_id,
                    'store_name' => $order->store?->name,
                    'plan' => $order->plan,
                    'plan_name' => $meta['plan_label'] ?? $planNames[$order->plan] ?? $order->plan,
                    'seats' => (int) $order->seats,
                    'months' => (int) $order->months,
                    'amount' => (int) $order->amount,
                    'status' => $order->status,
                    'gateway' => $order->gateway,
                    'reference_id' => $order->reference_id,
                    'created_at' => $order->created_at?->toIso8601String(),
                    'paid_at' => $order->paid_at?->toIso8601String(),
                ];
            })
            ->values()
            ->all();

        return response()->json([
            'kpis' => [
                'stores_total' => $storesTotal,
                'stores_archived' => $storesArchived,
                'users_active' => $usersActive,
                'subs_active' => $subsActive,
                'subs_lifetime' => $subsLifetime,
                'subs_trial' => $subsTrial,
                'subs_expired' => $subsExpired,
                'subs_suspended' => $subsSuspended,
                'subs_expiring_7' => $expiring7,
                'subs_expiring_30' => $expiring30,
                'orders_pending' => $ordersPending,
                'revenue_month' => $revenueMonth,
                'revenue_year' => $revenueYear,
                'revenue_total' => $revenueAllTime,
                'mrr' => $mrr,
                'currency' => config('billing.currency', 'toman'),
            ],
            'expiring_soon' => $expiringSoon,
            'plan_breakdown' => $byPlan,
            'recent_orders' => $recentOrders,
        ]);
    }

    /**
     * تخمین درآمد تکرارشوندهٔ ماهانه (MRR) از روی اشتراک‌های فعالِ غیرآزمایشی و غیرمادام‌العمر.
     */
    private function estimateMrr(\Illuminate\Support\Carbon $now): int
    {
        $plans = SubscriptionPlan::query()->get()->keyBy('code');

        $licenses = License::query()
            ->where('is_active', true)
            ->where('status', License::STATUS_ACTIVE)
            ->where('is_lifetime', false)
            ->where('is_trial', false)
            ->where('expires_at', '>', $now)
            ->get(['plan_code', 'seats']);

        $total = 0;

        foreach ($licenses as $license) {
            $plan = $plans->get((string) $license->plan_code);
            if ($plan !== null) {
                if ($plan->total_price !== null) {
                    $months = max(1, (int) ($plan->months_count ?: 1));
                    $total += (int) round((int) $plan->total_price / $months);
                } else {
                    $total += $plan->monthlyFor($license->seats());
                }
            }
        }

        return $total;
    }
}
