<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\LicenseResource;
use App\Http\Resources\OrderResource;
use App\Models\Order;
use App\Models\Store;
use App\Models\SubscriptionInvoice;
use App\Models\SubscriptionPlan;
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
 * API اشتراک تاکسینو: تعرفه‌ها، محاسبهٔ قیمت، خرید/تمدید، فاکتورها و وضعیت اشتراک.
 *
 * هیچ محاسبهٔ مالی در کلاینت انجام نمی‌شود؛ همه از `PricingEngine` در سرور می‌آید.
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
        $refMonthly = $this->plans->referenceMonthlyPrice();

        return response()->json([
            'product_name' => config('billing.product_name', 'تاکسینو'),
            'brand_name' => config('billing.brand_name', 'کارن سافت'),
            'slogan' => config('billing.slogan', 'همه‌چیز تحت کنترل شما'),
            'plans' => $this->plans->all(onlyActive: true)
                ->map(fn ($plan) => $this->plans->serialize($plan, $refMonthly))
                ->values()
                ->all(),
            'gateways' => $this->serializedGateways(),
            'default_gateway' => $this->resolvedDefaultGateway(),
            'allowed_months' => PricingEngine::ALLOWED_MONTHS,
            'currency' => config('billing.currency', 'toman'),
            'currency_label' => config('billing.currency_label', 'تومان'),
            'tax_percent' => (int) config('billing.tax_percent', 0),
            'trial_days' => (int) config('billing.trial_days', 14),
            'public_registration' => (bool) config('billing.public_registration', false),
            'support' => config('billing.support'),
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
            'seats' => ['nullable', 'integer', 'min:1', 'max:200'],
            'months' => ['nullable', 'integer'],
            'coupon_code' => ['nullable', 'string', 'max:40'],
        ]);

        $plan = SubscriptionPlan::where('code', strtolower(trim((string) $data['plan_code'])))->first();
        $defaultMonths = $plan?->is_lifetime ? 1 : max(1, (int) ($plan?->months_count ?: 1));

        $quote = $this->checkout->quote(
            (string) $data['plan_code'],
            isset($data['seats']) ? (int) $data['seats'] : 1,
            isset($data['months']) ? (int) $data['months'] : $defaultMonths,
            $data['coupon_code'] ?? null,
        );

        return response()->json(['quote' => $quote]);
    }

    /** وضعیت اشتراک فروشگاه کاربر + سفارش‌ها + فاکتورها + تعرفه‌ها. */
    public function show(Request $request): JsonResponse
    {
        $user = $request->user();
        $store = $user->store;

        abort_unless($store !== null, 422, 'حساب مدیر کل به آژانس خاصی متصل نیست.');

        $license = $store->license()->first();
        $pendingOrder = Order::query()
            ->where('store_id', $store->id)
            ->where('status', Order::STATUS_PENDING)
            ->latest()
            ->first();

        $refMonthly = $this->plans->referenceMonthlyPrice();

        return response()->json([
            'product_name' => config('billing.product_name', 'تاکسینو'),
            'brand_name' => config('billing.brand_name', 'کارن سافت'),
            'tax_percent' => (int) config('billing.tax_percent', 0),
            'license' => $license ? new LicenseResource($license) : null,
            'usage' => $this->seats->usage($store),
            'orders' => OrderResource::collection(
                Order::query()
                    ->where('store_id', $store->id)
                    ->with('invoice')
                    ->latest()
                    ->limit(25)
                    ->get()
            ),
            'invoices' => SubscriptionInvoice::query()
                ->where('store_id', $store->id)
                ->latest('issued_at')
                ->limit(25)
                ->get()
                ->map(fn (SubscriptionInvoice $invoice) => [
                    'number' => $invoice->number,
                    'order_id' => $invoice->order_id,
                    'plan_code' => $invoice->plan_code,
                    'plan_name' => $invoice->plan_name,
                    'seats' => (int) $invoice->seats,
                    'months' => (int) $invoice->months,
                    'subtotal' => (int) $invoice->subtotal,
                    'total' => (int) $invoice->total,
                    'discount' => (int) $invoice->discount,
                    'issued_at' => $invoice->issued_at?->toIso8601String(),
                    'voided_at' => $invoice->voided_at?->toIso8601String(),
                    'is_voided' => $invoice->isVoided(),
                ])
                ->values()
                ->all(),
            'plans' => $this->plans->all(onlyActive: true)
                ->map(fn ($plan) => $this->plans->serialize($plan, $refMonthly))
                ->values()
                ->all(),
            'gateways' => $this->serializedGateways(),
            'default_gateway' => $this->resolvedDefaultGateway(),
            'allowed_months' => PricingEngine::ALLOWED_MONTHS,
            'currency' => config('billing.currency', 'toman'),
            'currency_label' => config('billing.currency_label', 'تومان'),
            'trial_days' => (int) config('billing.trial_days', 14),
            'pending_order' => $pendingOrder ? new OrderResource($pendingOrder) : null,
            'bank' => config('billing.bank'),
            'support' => config('billing.support'),
        ]);
    }

    /**
     * شروع خرید/تمدید/ارتقا — مبلغ منحصراً از موتور قیمت‌گذاری سرور خوانده می‌شود.
     *
     * @throws Throwable
     */
    public function checkout(Request $request): JsonResponse
    {
        $user = $request->user();
        $store = $user->store;

        abort_unless($store !== null, 422, 'آژانس برای این کاربر تعریف نشده است.');

        $data = $request->validate([
            'plan_code' => ['required', 'string', 'max:40'],
            'seats' => ['nullable', 'integer', 'min:1', 'max:200'],
            'months' => ['nullable', 'integer'],
            'coupon_code' => ['nullable', 'string', 'max:40'],
            'gateway' => ['nullable', 'string', 'max:40'],
        ]);

        $plan = SubscriptionPlan::where('code', strtolower(trim((string) $data['plan_code'])))->first();
        $defaultMonths = $plan?->is_lifetime ? 1 : max(1, (int) ($plan?->months_count ?: 1));
        $defaultSeats = max(1, (int) ($store->license?->seats() ?? 1));

        $payload = [
            'plan_code' => (string) $data['plan_code'],
            'seats' => isset($data['seats']) ? (int) $data['seats'] : $defaultSeats,
            'months' => isset($data['months']) ? (int) $data['months'] : $defaultMonths,
            'coupon_code' => $data['coupon_code'] ?? null,
            'gateway' => $data['gateway'] ?? $this->resolvedDefaultGateway(),
        ];

        $result = $this->checkout->start($store, $user, $payload);

        return response()->json([
            'order' => new OrderResource($result['order']),
            'redirect_url' => $result['redirect_url'],
            'instructions' => $result['instructions'],
        ], 201);
    }

    /**
     * بازگشت از درگاه پرداخت — همیشه و منحصراً در سرور تأیید می‌شود.
     */
    public function callback(Request $request): RedirectResponse
    {
        $orderId = (int) $request->query('order', 0);
        $order = Order::find($orderId);

        if ($order === null) {
            return redirect('/?billing=missing#subscription');
        }

        $result = $this->checkout->verifyAndComplete($order, $request->query());
        $status = $result['ok'] ? 'paid' : 'failed';

        return redirect("/?billing={$status}&order={$order->id}#subscription");
    }

    /** دریافت کامل یک فاکتور رسمی برای چاپ یا نمایش. */
    public function invoice(Request $request, string $number): JsonResponse
    {
        $store = $request->user()->store;

        $invoice = SubscriptionInvoice::query()
            ->where('store_id', $store?->id)
            ->where('number', $number)
            ->firstOrFail();

        return response()->json([
            'invoice' => [
                'number' => $invoice->number,
                'order_id' => $invoice->order_id,
                'plan_code' => $invoice->plan_code,
                'plan_name' => $invoice->plan_name,
                'seats' => (int) $invoice->seats,
                'months' => (int) $invoice->months,
                'subtotal' => (int) $invoice->subtotal,
                'discount' => (int) $invoice->discount,
                'total' => (int) $invoice->total,
                'currency' => $invoice->currency,
                'snapshot' => $invoice->snapshot,
                'issued_at' => $invoice->issued_at?->toIso8601String(),
                'voided_at' => $invoice->voided_at?->toIso8601String(),
                'is_voided' => $invoice->isVoided(),
                'store' => ['name' => $store?->name],
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

    /**
     * وضعیت اشتراک برای سرصفحهٔ برنامه + بررسی وضعیت سرور سفارش پس از بازگشت از درگاه.
     */
    public function status(Request $request): JsonResponse
    {
        $store = $request->user()->store;
        $license = $store?->license()->first();
        $orderId = (int) $request->query('order', 0);

        $order = ($orderId > 0 && $store !== null)
            ? Order::query()
                ->with('invoice')
                ->where('id', $orderId)
                ->where('store_id', $store->id)
                ->first()
            : null;

        return response()->json([
            'subscription' => $license ? [
                'plan_code' => $license->plan_code,
                'plan_name' => $license->planLabel(),
                'tier' => $license->tier,
                'seats' => $license->seats(),
                'status' => $license->effectiveStatus(),
                'is_trial' => (bool) $license->is_trial,
                'is_lifetime' => (bool) $license->is_lifetime,
                'starts_at' => $license->starts_at?->toIso8601String(),
                'expires_at' => $license->is_lifetime ? null : $license->expires_at?->toIso8601String(),
                'days_remaining' => $license->daysRemaining(),
            ] : null,
            'license' => $license ? new LicenseResource($license) : null,
            'order' => $order ? new OrderResource($order) : null,
            'usage' => $store ? $this->seats->usage($store) : null,
        ]);
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function serializedGateways(): array
    {
        $available = $this->gateways->available();
        $zarinpalSandbox = (bool) config('billing.gateways.zarinpal.sandbox', false);

        return array_map(function (array $gw) use ($zarinpalSandbox) {
            $mode = $gw['key'] === 'zarinpal'
                ? ($zarinpalSandbox ? 'sandbox' : 'live')
                : 'manual';

            return [
                ...$gw,
                'mode' => $mode,
            ];
        }, $available);
    }

    private function resolvedDefaultGateway(): string
    {
        $configured = (string) config('billing.gateway', 'manual');

        return $this->gateways->isAvailable($configured) ? $configured : 'manual';
    }
}
