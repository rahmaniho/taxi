<?php

namespace App\Services\Billing;

use App\Models\Order;
use App\Models\Store;
use App\Models\SubscriptionCoupon;
use App\Models\SubscriptionPayment;
use App\Models\SubscriptionHistory;
use App\Models\SubscriptionPlan;
use App\Models\User;
use App\Services\Billing\Exceptions\PaymentGatewayException;
use App\Support\AuditLogger;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * چرخهٔ کامل خرید اشتراک: قیمت‌گذاری سمت سرور → سفارش → درگاه → تأیید → فعال‌سازی + فاکتور.
 *
 * اصول:
 * - مبلغ همیشه در سرور از تعرفهٔ لحظهٔ خرید محاسبه و در سفارش «قفل» می‌شود.
 * - مبلغ ارسالی مرورگر هرگز قابل اعتماد نیست و اصلاً دریافت نمی‌شود.
 * - تا پرداخت تأیید نشده، هیچ لایسنسی تغییر نمی‌کند.
 * - تأیید تکراری یک سفارش، اشتراک را دو بار تمدید نمی‌کند (قفل ردیف + idempotent).
 */
class CheckoutService
{
    public function __construct(
        private readonly PlanCatalog $plans,
        private readonly PricingEngine $pricing,
        private readonly CouponService $coupons,
        private readonly PaymentGatewayManager $gateways,
        private readonly LicenseService $licenses,
        private readonly InvoiceService $invoices,
    ) {}

    /**
     * پیش‌فاکتور/محاسبهٔ قیمت — همان موتور قیمت‌گذاری که در پرداخت استفاده می‌شود.
     *
     * @return array<string, mixed>
     *
     * @throws ValidationException
     */
    public function quote(string $planCode, int $seats, int $months, ?string $couponCode = null): array
    {
        [$plan, $coupon] = $this->resolveInputs($planCode, $couponCode);

        try {
            return $this->pricing->quote($plan, $seats, $months, $coupon);
        } catch (PricingException $exception) {
            throw ValidationException::withMessages([
                'seats' => [$exception->getMessage()],
            ]);
        }
    }

    /**
     * @param  array{plan_code: string, seats: int, months: int, coupon_code?: string|null, gateway?: string|null}  $payload
     * @return array{order: Order, redirect_url: string|null, instructions: string|null}
     *
     * @throws ValidationException|Throwable
     */
    public function start(Store $store, User $user, array $payload): array
    {
        $planCode = (string) $payload['plan_code'];
        $seats = (int) $payload['seats'];
        $months = (int) $payload['months'];
        $couponCode = $payload['coupon_code'] ?? null;

        [$plan, $coupon] = $this->resolveInputs($planCode, $couponCode);

        try {
            $quote = $this->pricing->quote($plan, $seats, $months, $coupon);
        } catch (PricingException $exception) {
            throw ValidationException::withMessages(['seats' => [$exception->getMessage()]]);
        }

        $gatewayKey = (string) ($payload['gateway'] ?? config('billing.gateway', 'manual'));

        if (! $this->gateways->isAvailable($gatewayKey)) {
            throw ValidationException::withMessages(['gateway' => ['این روش پرداخت در دسترس نیست.']]);
        }

        $type = $this->resolveType($store, $plan, $seats);

        $order = Order::create([
            'store_id' => $store->id,
            'user_id' => $user->id,
            'plan' => $quote['plan_code'],
            'tier' => $quote['tier'],
            'type' => $type,
            'months' => $quote['months'],
            'seats' => $quote['seats'],
            'extra_users' => $quote['extra_users'],
            'base_monthly' => $quote['base_monthly'],
            'extra_user_monthly' => $quote['extra_user_monthly'],
            'subtotal' => $quote['subtotal'],
            'discount' => $quote['discount'],
            'coupon_code' => $quote['coupon_code'],
            'price_snapshot' => $quote,
            'is_lifetime' => $quote['is_lifetime'],
            'amount' => $quote['total'],
            'status' => Order::STATUS_PENDING,
            'gateway' => $gatewayKey,
            'meta' => ['plan_label' => $quote['plan_name']],
        ]);

        $gateway = $this->gateways->driver($gatewayKey);

        $payment = SubscriptionPayment::create([
            'order_id' => $order->id,
            'store_id' => $store->id,
            'gateway' => $gatewayKey,
            'amount' => $quote['total'],
            'currency' => 'toman',
            'status' => SubscriptionPayment::STATUS_PENDING,
        ]);

        try {
            $result = $gateway->request($order, [
                'email' => $user->email,
                'callback_url' => route('api.billing.callback', ['order' => $order->id]),
                'description' => $quote['plan_name'].' — '.$quote['seats'].' کاربر — '.$quote['months'].' ماه',
            ]);
        } catch (Throwable $exception) {
            $order->forceFill([
                'status' => Order::STATUS_FAILED,
                'meta' => [
                    'plan_label' => $quote['plan_name'],
                    'error' => $exception->getMessage(),
                ],
            ])->save();

            $payment->forceFill([
                'status' => SubscriptionPayment::STATUS_FAILED,
                'payload' => ['error' => $exception->getMessage()],
            ])->save();

            AuditLogger::record('order_failed', [
                'store_id' => $store->id,
                'subject_type' => 'order',
                'subject_key' => $order->id,
                'meta' => ['gateway' => $gatewayKey, 'plan' => $planCode, 'error' => $exception->getMessage()],
            ]);

            throw ValidationException::withMessages([
                'gateway' => [$exception instanceof PaymentGatewayException
                    ? $exception->getMessage()
                    : 'اتصال به درگاه پرداخت ناموفق بود. دوباره تلاش کنید.'],
            ]);
        }

        $payment->forceFill([
            'authority' => $result['authority'],
        ])->save();

        $order->forceFill([
            'gateway_ref' => $result['authority'],
            'meta' => array_filter([
                'plan_label' => $quote['plan_name'],
                'instructions' => $result['instructions'],
            ], fn ($value) => $value !== null),
        ])->save();

        AuditLogger::record('order_created', [
            'store_id' => $store->id,
            'subject_type' => 'order',
            'subject_key' => $order->id,
            'meta' => [
                'gateway' => $gatewayKey,
                'plan' => $planCode,
                'seats' => $seats,
                'months' => $months,
                'amount' => $quote['total'],
                'type' => $type,
            ],
        ]);

        return [
            'order' => $order->refresh(),
            'redirect_url' => $result['redirect_url'],
            'instructions' => $result['instructions'],
        ];
    }

    /**
     * تأیید پرداخت پس از بازگشت از درگاه.
     *
     * @param  array<string, mixed>  $params
     * @return array{ok: bool, order: Order, message: string|null}
     */
    public function verifyAndComplete(Order $order, array $params = []): array
    {
        if ($order->isPaid()) {
            return ['ok' => true, 'order' => $order, 'message' => null];
        }

        if (! $order->isPending()) {
            return [
                'ok' => false,
                'order' => $order,
                'message' => 'این سفارش دیگر قابل پرداخت نیست.',
            ];
        }

        $gateway = $this->gateways->driver($order->gateway);
        $result = $gateway->verify($order, $params);

        if (! $result['ok']) {
            $order->forceFill([
                'status' => Order::STATUS_FAILED,
                'meta' => array_filter([
                    ...((array) $order->meta),
                    'error' => $result['message'],
                ], fn ($value) => $value !== null),
            ])->save();

            $this->failPendingPayment($order, $result['message']);

            AuditLogger::record('order_failed', [
                'store_id' => $order->store_id,
                'subject_type' => 'order',
                'subject_key' => $order->id,
                'meta' => ['gateway' => $order->gateway, 'error' => $result['message']],
            ]);

            return ['ok' => false, 'order' => $order->refresh(), 'message' => $result['message']];
        }

        return [
            'ok' => true,
            'order' => $this->complete($order, $result['reference']),
            'message' => null,
        ];
    }

    /**
     * ثبت پرداخت، فعال‌سازی اشتراک و صدور فاکتور — تنها مسیر «paid شدن» سفارش.
     *
     * @throws Throwable
     */
    public function complete(Order $order, ?string $reference = null): Order
    {
        return DB::transaction(function () use ($order, $reference) {
            /** @var Order $locked */
            $locked = Order::query()->whereKey($order->getKey())->lockForUpdate()->firstOrFail();

            if ($locked->isPaid()) {
                return $locked;
            }

            $license = $this->licenses->applyOrder($locked);

            $locked->forceFill([
                'status' => Order::STATUS_PAID,
                'paid_at' => now(),
                'reference_id' => $reference ?? $locked->reference_id,
            ])->save();

            $this->settlePendingPayment($locked, $locked->reference_id);

            $invoice = $this->invoices->issue($locked);
            $this->coupons->redeem($locked->coupon_code);

            AuditLogger::record('order_paid', [
                'store_id' => $locked->store_id,
                'subject_type' => 'order',
                'subject_key' => $locked->id,
                'meta' => [
                    'plan' => $locked->plan,
                    'seats' => $locked->seats,
                    'months' => $locked->months,
                    'amount' => $locked->amount,
                    'gateway' => $locked->gateway,
                    'reference' => $locked->reference_id,
                    'invoice' => $invoice->number,
                ],
            ]);

            AuditLogger::record('license_renewed', [
                'store_id' => $locked->store_id,
                'subject_type' => 'license',
                'subject_key' => $license->id,
                'meta' => [
                    'tier' => $license->tier,
                    'plan_code' => $license->plan_code,
                    'seats' => $license->seats,
                    'is_lifetime' => (bool) $license->is_lifetime,
                    'expires_at' => $license->expires_at?->toIso8601String(),
                    'order_id' => $locked->id,
                ],
            ]);

            return $locked->refresh();
        });
    }

    /**
     * ابطال یک پرداخت تأییدشده (void) — بدون حذف رکورد.
     *
     * سیاست شفاف: ابطال، سفارش و فاکتور را «باطل» علامت می‌زند و در تاریخچه ثبت می‌کند،
     * اما اشتراک را خودکار قطع نمی‌کند تا مشتری بی‌خبر نماند؛ مدیر می‌تواند بعد از آن
     * با دلیل، اشتراک را تعلیق کند. تأیید دوبارهٔ سفارش باطل‌شده ممکن نیست.
     *
     * @throws Throwable
     */
    public function voidOrder(Order $order, string $reason, User $actor): Order
    {
        return DB::transaction(function () use ($order, $reason, $actor) {
            /** @var Order $locked */
            $locked = Order::query()->whereKey($order->getKey())->lockForUpdate()->firstOrFail();

            if ($locked->isVoided()) {
                return $locked;
            }

            if (! $locked->isPaid()) {
                throw ValidationException::withMessages([
                    'order' => ['فقط پرداخت تأییدشده قابل ابطال است.'],
                ]);
            }

            $locked->forceFill([
                'status' => Order::STATUS_VOIDED,
                'voided_at' => now(),
                'void_reason' => $reason,
            ])->save();

            $locked->invoice()->update(['voided_at' => now()]);

            SubscriptionHistory::create([
                'store_id' => $locked->store_id,
                'license_id' => $locked->store->license?->id,
                'action' => 'payment_voided',
                'reason' => $reason,
                'payload' => [
                    'order_id' => $locked->id,
                    'amount' => (int) $locked->amount,
                    'invoice' => $locked->invoice?->number,
                ],
                'actor_id' => $actor->id,
                'created_at' => now(),
            ]);

            AuditLogger::record('order_voided', [
                'store_id' => $locked->store_id,
                'user_id' => $actor->id,
                'subject_type' => 'order',
                'subject_key' => $locked->id,
                'meta' => [
                    'reason' => $reason,
                    'amount' => (int) $locked->amount,
                    'gateway' => $locked->gateway,
                    'reference' => $locked->reference_id,
                    'invoice' => $locked->invoice?->number,
                ],
            ]);

            return $locked->refresh();
        });
    }

    /** لغو سفارش در انتظار (رسید نامعتبر یا انصراف). */
    public function cancel(Order $order, ?string $reason = null): Order
    {
        if (! $order->isPending()) {
            return $order;
        }

        $order->forceFill([
            'status' => Order::STATUS_CANCELED,
            'meta' => array_filter([
                ...((array) $order->meta),
                'cancel_reason' => $reason,
            ], fn ($value) => $value !== null),
        ])->save();

        AuditLogger::record('order_canceled', [
            'store_id' => $order->store_id,
            'subject_type' => 'order',
            'subject_key' => $order->id,
            'meta' => ['reason' => $reason],
        ]);

        return $order->refresh();
    }

    /**
     * آخرین تلاش پرداخت در انتظار را «پرداخت‌شده» علامت می‌زند.
     * اگر درگاه شمارهٔ مرجع داده باشد و قبلاً ثبت شده باشد، ردیف تکراری ساخته نمی‌شود.
     */
    private function settlePendingPayment(Order $order, ?string $reference): void
    {
        $payment = $order->payments()

            ->where('status', SubscriptionPayment::STATUS_PENDING)
            ->latest('id')
            ->first();

        if ($payment === null) {
            // تأیید دستی بدون تلاش قبلی (مثلاً سفارش ثبت‌شده توسط مدیر) هم باید رکورد پرداخت داشته باشد.
            SubscriptionPayment::create([
                'order_id' => $order->id,
                'store_id' => $order->store_id,
                'gateway' => $order->gateway,
                'amount' => (int) $order->amount,
                'currency' => 'toman',
                'status' => SubscriptionPayment::STATUS_PAID,
                'authority' => $order->gateway_ref,
                'reference_id' => $reference,
                'payload' => ['source' => 'manual_approval'],
                'verified_at' => now(),
            ]);

            return;
        }

        $payment->forceFill([
            'status' => SubscriptionPayment::STATUS_PAID,
            'reference_id' => $reference ?? $payment->reference_id,
            'verified_at' => now(),
        ])->save();
    }

    /** تلاش پرداخت جاری را ناموفق ثبت می‌کند تا سابقهٔ تراکنش کامل بماند. */
    private function failPendingPayment(Order $order, ?string $message): void
    {
        $payment = $order->payments()
            ->where('status', SubscriptionPayment::STATUS_PENDING)
            ->latest('id')
            ->first();

        $payment?->forceFill([
            'status' => SubscriptionPayment::STATUS_FAILED,
            'payload' => array_filter(['error' => $message], fn ($value) => $value !== null),
        ])->save();
    }

    /**
     * نوع سفارش بر اساس وضعیت فعلی اشتراک — برای گزارش و انتخاب مسیر اجرا.
     */
    public function resolveType(Store $store, SubscriptionPlan $plan, int $seats): string
    {
        $license = $store->license;

        if ($license === null || ! $license->isCurrentlyValid()) {
            return Order::TYPE_NEW;
        }

        $ranks = ['pro' => 2, 'proplus' => 3];

        if (($ranks[$plan->tier] ?? 0) > ($ranks[$license->tier] ?? 0)) {
            return Order::TYPE_UPGRADE;
        }

        if ($seats > $license->seats()) {
            return Order::TYPE_SEATS;
        }

        return Order::TYPE_RENEWAL;
    }

    /**
     * @return array{0: SubscriptionPlan, 1: SubscriptionCoupon|null}
     *
     * @throws ValidationException
     */
    private function resolveInputs(string $planCode, ?string $couponCode): array
    {
        $plan = $this->plans->find($planCode);

        if ($plan === null) {
            throw ValidationException::withMessages(['plan_code' => ['پلن انتخاب‌شده معتبر یا فعال نیست.']]);
        }

        return [$plan, $this->coupons->resolve($couponCode, $plan->code)];
    }
}
