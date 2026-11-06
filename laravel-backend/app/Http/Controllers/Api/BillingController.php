<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\LicenseResource;
use App\Http\Resources\OrderResource;
use App\Models\License;
use App\Models\Order;
use App\Models\Store;
use App\Models\SubscriptionInvoice;
use App\Services\Billing\CheckoutService;
use App\Services\Billing\LicenseService;
use App\Services\Billing\PaymentGatewayManager;
use App\Services\Billing\PlanCatalog;
use App\Services\Billing\PricingEngine;
use App\Services\Billing\SeatLimitService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * API اشتراک: تعرفه‌ها، محاسبهٔ قیمت، خرید/تمدید، فاکتورها و صدور دورهٔ آزمایشی.
 *
 * هیچ محاسبهٔ مالی در این کلاس انجام نمی‌شود؛ همه از `PricingEngine` می‌آید.
 */
class BillingController extends Controller
{
    public function __construct(
        private readonly PlanCatalog $plans,
        private readonly PaymentGatewayManager $gateways,
        private readonly CheckoutService $checkout,
        private readonly LicenseService $licenses,
        private readonly SeatLimitService $seats,
    ) {}

    /** پلن‌ها، روش‌های پرداخت و پارامترهای مجاز — عمومی. */
    public function plans(): JsonResponse
    {
        return response()->json([
            'plans' => $this->plans->all(onlyActive: true)
                ->map(fn ($plan) => $this->plans->serialize($plan))
                ->values()
                ->all(),
            'gateways' => $this->gateways->available(),
            'allowed_months' => PricingEngine::ALLOWED_MONTHS,
            'currency' => config('billing.currency', 'toman'),
            'currency_label' => config('billing.currency_label', 'تومان'),
            'trial_days' => (int) config('billing.trial_days', 14),
            'public_registration' => (bool) config('billing.public_registration', true),
        ]);
    }

    /**
     * محاسبهٔ قیمت (پیش‌فاکتور) — همان موتور قیمت‌گذاری پرداخت.
     *
     * @throws ValidationException
     */
    public function quote(Request $request): JsonResponse
    {
        $data = $request->validate([
            'plan_code' => ['required', 'string', 'max:40'],
            'seats' => ['required', 'integer', 'min:1', 'max:200'],
            'months' => ['required', 'integer'],
            'coupon_code' => ['nullable', 'string', 'max:40'],
        ]);

        $quote = $this->checkout->quote(
            $data['plan_code'],
            (int) $data['seats'],
            (int) $data['months'],
            $data['coupon_code'] ?? null,
        );

        return response()->json(['quote' => $quote]);
    }

    /** وضعیت اشتراک فروشگاه کاربر + سفارش‌ها + فاکتورها. */
    public function show(Request $request): JsonResponse
    {
        $user = $request->user();
        $store = $user->store;
        $license = $store->license()->first();
        $pendingOrder = Order::query()
            ->where('store_id', $store->id)
            ->where('status', Order::STATUS_PENDING)
            ->latest()
            ->first();

        return response()->json([
            'license' => $license ? new LicenseResource($license) : null,
            'usage' => $this->seats->usage($store),
            'orders' => OrderResource::collection(
                Order::query()
                    ->where('store_id', $store->id)
                    ->with('invoice')
                    ->latest()
                    ->limit(20)
                    ->get()
            ),
            'invoices' => SubscriptionInvoice::query()
                ->where('store_id', $store->id)
                ->latest('issued_at')
                ->limit(20)
                ->get()
                ->map(fn (SubscriptionInvoice $invoice) => [
                    'number' => $invoice->number,
                    'total' => (int) $invoice->total,
                    'discount' => (int) $invoice->discount,
                    'issued_at' => $invoice->issued_at?->toIso8601String(),
                ])
                ->values()
                ->all(),
            'plans' => $this->plans->all(onlyActive: true)
                ->map(fn ($plan) => $this->plans->serialize($plan))
                ->values()
                ->all(),
            'gateways' => $this->gateways->available(),
            'allowed_months' => PricingEngine::ALLOWED_MONTHS,
            'currency' => config('billing.currency', 'toman'),
            'currency_label' => config('billing.currency_label', 'تومان'),
            'trial_days' => (int) config('billing.trial_days', 14),
            'pending_order' => $pendingOrder ? new OrderResource($pendingOrder) : null,
        ]);
    }

    /**
     * شروع خرید/تمدید/ارتقا.
     *
     * @throws Throwable
     */
    public function checkout(Request $request): JsonResponse
    {
        $data = $request->validate([
            'plan_code' => ['required', 'string', 'max:40'],
            'seats' => ['required', 'integer', 'min:1', 'max:200'],
            'months' => ['required', 'integer'],
            'coupon_code' => ['nullable', 'string', 'max:40'],
            'gateway' => ['nullable', 'string', 'max:40'],
        ]);

        $user = $request->user();
        $result = $this->checkout->start($user->store, $user, $data);

        return response()->json([
            'order' => new OrderResource($result['order']),
            'redirect_url' => $result['redirect_url'],
            'instructions' => $result['instructions'],
        ], 201);
    }

    /**
     * بازگشت از درگاه. اعتبارسنجی همیشه سمت سرور است.
     */
    public function callback(Request $request): RedirectResponse
    {
        $orderId = (int) $request->query('order', 0);
        $order = $orderId > 0 ? Order::find($orderId) : null;

        if ($order === null) {
            return redirect('/subscription?payment=invalid');
        }

        try {
            $result = $this->checkout->verifyAndComplete($order, $request->query());
        } catch (Throwable) {
            return redirect('/subscription?payment=error&order='.$order->id);
        }

        return redirect(
            '/subscription?payment='.($result['ok'] ? 'success' : 'failed').'&order='.$order->id
        );
    }

    /** فاکتور فروشگاه خود کاربر. */
    public function invoice(Request $request, string $number): JsonResponse
    {
        $invoice = SubscriptionInvoice::query()
            ->where('number', $number)
            ->where('store_id', (int) $request->user()->store_id)
            ->with('order')
            ->firstOrFail();

        return response()->json([
            'invoice' => [
                'number' => $invoice->number,
                'subtotal' => (int) $invoice->subtotal,
                'discount' => (int) $invoice->discount,
                'total' => (int) $invoice->total,
                'issued_at' => $invoice->issued_at?->toIso8601String(),
                'lines' => $invoice->lines,
                'order' => $invoice->order ? new OrderResource($invoice->order) : null,
                'store' => ['name' => $request->user()->store?->name],
            ],
        ]);
    }

    /**
     * صدور دستی دورهٔ آزمایشی (فقط مدیر).
     *
     * @throws ValidationException
     */
    public function grantTrial(Request $request): JsonResponse
    {
        $data = $request->validate([
            'store_id' => ['required', 'integer', 'exists:stores,id'],
            'days' => ['nullable', 'integer', 'min:1', 'max:365'],
            'seats' => ['nullable', 'integer', 'min:1', 'max:200'],
        ]);

        $store = Store::findOrFail($data['store_id']);
        $license = $this->licenses->startTrial(
            $store,
            (int) $request->user()->id,
            $data['days'] ?? null,
            (int) ($data['seats'] ?? 1),
        );

        return response()->json(['license' => new LicenseResource($license)]);
    }

    /** وضعیت اشتراک برای سرصفحهٔ برنامه (بدون داده‌های حساس). */
    public function status(Request $request): JsonResponse
    {
        $store = $request->user()->store;
        $license = $store?->license()->first();

        return response()->json([
            'subscription' => $license ? [
                'plan_code' => $license->plan_code,
                'tier' => $license->tier,
                'seats' => $license->seats(),
                'status' => $license->effectiveStatus(),
                'is_trial' => (bool) $license->is_trial,
                'is_lifetime' => (bool) $license->is_lifetime,
                'expires_at' => $license->expires_at?->toIso8601String(),
                'days_remaining' => $license->daysRemaining(),
            ] : null,
            'usage' => $store ? $this->seats->usage($store) : null,
        ]);
    }
}
