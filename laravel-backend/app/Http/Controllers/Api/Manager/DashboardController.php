<?php

namespace App\Http\Controllers\Api\Manager;

use App\Http\Controllers\Controller;
use App\Http\Resources\OrderResource;
use App\Models\License;
use App\Models\Order;
use App\Models\Store;
use App\Models\SubscriptionCoupon;
use App\Models\SubscriptionPlan;
use App\Support\Jalali;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * داشبورد مدیریتی: شاخص‌های کلیدی، روند درآمد، ترکیب پلن‌ها و فهرست‌های اقدام‌محور.
 *
 * همهٔ محاسبات سمت سرور و از دادهٔ واقعی سفارش‌ها/لایسنس‌ها است؛ هیچ عدد نمایشی
 * ساختگی در UI نیست. MRR بر مبنای «تعرفهٔ جاریِ پلن × سقف کاربران» برآورد می‌شود.
 */
class DashboardController extends Controller
{
    public function index(): JsonResponse
    {
        $now = Carbon::now();
        $monthStart = $now->copy()->startOfMonth();
        $prevMonthStart = $monthStart->copy()->subMonth();
        $yearStart = $now->copy()->startOfYear();

        $paid = Order::query()->where('status', Order::STATUS_PAID);

        $revenueMonth = (int) (clone $paid)->where('paid_at', '>=', $monthStart)->sum('amount');
        $revenuePrevMonth = (int) (clone $paid)
            ->whereBetween('paid_at', [$prevMonthStart, $monthStart->copy()->subSecond()])
            ->sum('amount');
        $revenueYear = (int) (clone $paid)->where('paid_at', '>=', $yearStart)->sum('amount');
        $revenueToday = (int) (clone $paid)->where('paid_at', '>=', $now->copy()->startOfDay())->sum('amount');

        $ordersPending = (int) Order::query()->where('status', Order::STATUS_PENDING)->count();
        $ordersPendingAmount = (int) Order::query()->where('status', Order::STATUS_PENDING)->sum('amount');

        $licenses = License::query();
        $activeLicenses = (clone $licenses)
            ->where('is_active', true)
            ->whereNotIn('status', [License::STATUS_SUSPENDED, License::STATUS_CANCELED])
            ->where(fn ($q) => $q->where('is_lifetime', true)->orWhere('expires_at', '>', $now));
        $subsActive = (int) (clone $activeLicenses)->count();
        $subsTrial = (int) (clone $activeLicenses)->where('is_trial', true)->count();
        $subsExpiring = (int) (clone $activeLicenses)
            ->where('is_lifetime', false)
            ->whereBetween('expires_at', [$now, $now->copy()->addDays(7)])
            ->count();
        $subsExpired = (int) License::query()
            ->where('is_lifetime', false)
            ->whereNotNull('expires_at')
            ->where('expires_at', '<', $now)
            ->count();
        $subsSuspended = (int) License::query()->where('status', License::STATUS_SUSPENDED)->count();

        $storesTotal = (int) Store::query()->whereNull('archived_at')->count();
        $storesArchived = (int) Store::query()->whereNotNull('archived_at')->count();
        $storesNewThisMonth = (int) Store::query()->where('created_at', '>=', $monthStart)->count();

        $growth = $revenuePrevMonth > 0
            ? round((($revenueMonth - $revenuePrevMonth) / $revenuePrevMonth) * 100, 1)
            : ($revenueMonth > 0 ? 100.0 : 0.0);

        return response()->json([
            'generated_at' => $now->toIso8601String(),
            'kpis' => [
                'revenue_today' => $revenueToday,
                'revenue_month' => $revenueMonth,
                'revenue_prev_month' => $revenuePrevMonth,
                'revenue_year' => $revenueYear,
                'growth_month_pct' => $growth,
                'mrr' => $this->estimateMrr($now),
                'arr' => $this->estimateMrr($now) * 12,
                'orders_pending' => $ordersPending,
                'orders_pending_amount' => $ordersPendingAmount,
                'subs_active' => $subsActive,
                'subs_trial' => $subsTrial,
                'subs_expiring_7' => $subsExpiring,
                'subs_expired' => $subsExpired,
                'subs_suspended' => $subsSuspended,
                'stores_total' => $storesTotal,
                'stores_archived' => $storesArchived,
                'stores_new_month' => $storesNewThisMonth,
            ],
            'revenue_trend' => $this->revenueTrend($now),
            'plan_breakdown' => $this->planBreakdown(),
            'status_breakdown' => [
                ['key' => 'active', 'label' => 'فعال', 'value' => $subsActive - $subsTrial],
                ['key' => 'trial', 'label' => 'آزمایشی', 'value' => $subsTrial],
                ['key' => 'expiring', 'label' => 'نزدیک انقضا', 'value' => $subsExpiring],
                ['key' => 'expired', 'label' => 'منقضی', 'value' => $subsExpired],
                ['key' => 'suspended', 'label' => 'تعلیق', 'value' => $subsSuspended],
            ],
            'recent_orders' => OrderResource::collection(
                Order::query()
                    ->with(['store:id,name', 'invoice:id,order_id,number'])
                    ->latest()
                    ->limit(8)
                    ->get(),
            ),
            'expiring_soon' => $this->expiringSoon($now),
            'top_coupons' => $this->topCoupons(),
            'actions' => [
                'pending_orders' => $ordersPending,
                'expiring_soon' => $subsExpiring,
                'expired_without_renewal' => $subsExpired,
            ],
        ]);
    }

    /**
     * MRR تقریبی: مجموع مبلغ ماهانهٔ پلن هر لایسنس فعال بر اساس سقف کاربران.
     * لایسنس‌های آزمایشی و معلق شمرده نمی‌شوند.
     */
    private function estimateMrr(Carbon $now): int
    {
        $plans = SubscriptionPlan::query()
            ->get(['code', 'base_monthly', 'extra_user_monthly'])
            ->keyBy('code');

        $rows = License::query()
            ->where('is_active', true)
            ->where('is_trial', false)
            ->whereNotIn('status', [License::STATUS_SUSPENDED, License::STATUS_CANCELED])
            ->where(fn ($q) => $q->where('is_lifetime', true)->orWhere('expires_at', '>', $now))
            ->get(['plan_code', 'seats']);

        $total = 0;
        foreach ($rows as $license) {
            $plan = $plans->get($license->plan_code);
            if ($plan === null) {
                continue;
            }

            $extra = max(0, (int) $license->seats - 1);
            $total += (int) $plan->base_monthly + $extra * (int) $plan->extra_user_monthly;
        }

        return $total;
    }

    /**
     * روند درآمد ۱۲ ماه اخیر (میلادی) با برچسب شمسی.
     *
     * @return list<array{month: string, label: string, amount: int, orders: int}>
     */
    private function revenueTrend(Carbon $now): array
    {
        $start = $now->copy()->startOfMonth()->subMonths(11);

        $rows = Order::query()
            ->where('status', Order::STATUS_PAID)
            ->where('paid_at', '>=', $start)
            ->get(['amount', 'paid_at'])
            ->groupBy(fn (Order $order) => $order->paid_at?->format('Y-m'));

        $trend = [];
        for ($i = 11; $i >= 0; $i--) {
            $month = $now->copy()->startOfMonth()->subMonths($i);
            $key = $month->format('Y-m');
            $bucket = $rows->get($key, collect());

            $trend[] = [
                'month' => $key,
                'label' => Jalali::monthLabel($month),
                'amount' => (int) $bucket->sum('amount'),
                'orders' => $bucket->count(),
            ];
        }

        return $trend;
    }

    /**
     * @return list<array{plan: string, name: string, orders: int, revenue: int, subscribers: int}>
     */
    private function planBreakdown(): array
    {
        $plans = SubscriptionPlan::query()->orderBy('sort_order')->get();

        $sales = Order::query()
            ->select('plan', DB::raw('count(*) as orders_count'), DB::raw('coalesce(sum(amount),0) as revenue'))
            ->where('status', Order::STATUS_PAID)
            ->groupBy('plan')
            ->get()
            ->keyBy('plan');

        $subs = License::query()
            ->select('plan_code', DB::raw('count(*) as subscribers'))
            ->where('is_active', true)
            ->groupBy('plan_code')
            ->pluck('subscribers', 'plan_code');

        return $plans->map(function (SubscriptionPlan $plan) use ($sales, $subs) {
            $stat = $sales->get($plan->code);

            return [
                'plan' => $plan->code,
                'name' => $plan->name,
                'orders' => (int) ($stat->orders_count ?? 0),
                'revenue' => (int) ($stat->revenue ?? 0),
                'subscribers' => (int) ($subs[$plan->code] ?? 0),
            ];
        })->values()->all();
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function expiringSoon(Carbon $now): array
    {
        return License::query()
            ->with('store:id,name,archived_at')
            ->where('is_active', true)
            ->where('is_lifetime', false)
            ->whereNotNull('expires_at')
            ->whereBetween('expires_at', [$now, $now->copy()->addDays(14)])
            ->orderBy('expires_at')
            ->limit(6)
            ->get()
            ->map(fn (License $license) => [
                'license_id' => $license->id,
                'store_id' => $license->store_id,
                'store_name' => $license->store?->name,
                'plan_code' => $license->plan_code,
                'seats' => $license->seats(),
                'expires_at' => $license->expires_at?->toIso8601String(),
                'days_remaining' => $license->daysRemaining(),
                'is_trial' => (bool) $license->is_trial,
            ])
            ->values()
            ->all();
    }

    /**
     * @return list<array{code: string, uses: int, revenue: int}>
     */
    private function topCoupons(): array
    {
        return Order::query()
            ->select(
                'coupon_code',
                DB::raw('count(*) as uses'),
                DB::raw('coalesce(sum(amount),0) as revenue'),
            )
            ->where('status', Order::STATUS_PAID)
            ->whereNotNull('coupon_code')
            ->groupBy('coupon_code')
            ->orderByDesc('uses')
            ->limit(5)
            ->get()
            ->map(fn ($row) => [
                'code' => (string) $row->coupon_code,
                'uses' => (int) $row->uses,
                'revenue' => (int) $row->revenue,
            ])
            ->values()
            ->all();
    }
}
