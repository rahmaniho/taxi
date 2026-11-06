<?php

namespace App\Services\Billing;

use App\Models\Order;
use App\Models\SubscriptionInvoice;
use App\Support\Jalali;

/**
 * صدور فاکتور برای سفارش پرداخت‌شده.
 *
 * شمارهٔ فاکتور یکتاست و از شناسهٔ سفارش ساخته می‌شود، پس صدور دوباره برای
 * یک سفارش همان فاکتور را برمی‌گرداند (بدون شمارهٔ تکراری یا شکاف).
 */
class InvoiceService
{
    public function issue(Order $order): SubscriptionInvoice
    {
        $existing = SubscriptionInvoice::where('order_id', $order->id)->first();

        if ($existing !== null) {
            return $existing;
        }

        return SubscriptionInvoice::create([
            'number' => $this->number($order),
            'order_id' => $order->id,
            'store_id' => $order->store_id,
            'subtotal' => (int) ($order->subtotal ?: $order->amount),
            'discount' => (int) $order->discount,
            'total' => (int) $order->amount,
            'lines' => [
                ['label' => 'اشتراک '.$order->plan.' — '.$order->seats.' کاربر', 'months' => $order->months, 'amount' => (int) $order->subtotal],
                ['label' => 'تخفیف', 'months' => null, 'amount' => -1 * (int) $order->discount],
            ],
            'issued_at' => now(),
        ]);
    }

    private function number(Order $order): string
    {
        [$jalaliYear] = Jalali::toJalali(
            (int) now()->format('Y'),
            (int) now()->format('n'),
            (int) now()->format('j'),
        );

        return sprintf('KS-%d-%06d', $jalaliYear, $order->id);
    }
}
