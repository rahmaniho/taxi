<?php

namespace App\Services\Billing;

use App\Models\Order;

/**
 * درگاه دستی: کارت به کارت یا واریز بانکی.
 *
 * سفارش «در انتظار تأیید» می‌ماند تا مدیر پس از دیدن رسید، آن را در پنل
 * مدیر تأیید کند. این درگاه همیشه در دسترس است تا فروش بدون قرارداد درگاه
 * آنلاین هم ممکن باشد (مهم برای شروع کار و مشتریان قدیمی).
 */
class ManualGateway implements PaymentGateway
{
    public function key(): string
    {
        return 'manual';
    }

    public function label(): string
    {
        return (string) config('billing.gateways.manual.label', 'کارت به کارت');
    }

    public function request(Order $order, array $context = []): array
    {
        return [
            'authority' => null,
            'redirect_url' => null,
            'instructions' => $this->instructions($order),
        ];
    }

    public function verify(Order $order, array $params = []): array
    {
        // پرداخت دستی تأیید خودکار ندارد؛ فقط مدیر می‌تواند آن را ثبت کند.
        return [
            'ok' => false,
            'reference' => null,
            'message' => 'پرداخت‌های کارت‌به‌کارت باید توسط پشتیبانی تأیید شوند.',
        ];
    }

    /** متن دستور واریز با شمارهٔ سفارش تا تطبیق رسید ساده باشد. */
    public function instructions(Order $order): string
    {
        $bank = (array) config('billing.bank', []);
        $parts = [];

        if (! empty($bank['holder'])) {
            $parts[] = 'به نام: '.$bank['holder'];
        }
        if (! empty($bank['card'])) {
            $parts[] = 'شماره کارت: '.$bank['card'];
        }
        if (! empty($bank['account'])) {
            $parts[] = 'شماره حساب: '.$bank['account'];
        }
        if (! empty($bank['sheba'])) {
            $parts[] = 'شبا: '.$bank['sheba'];
        }

        $parts[] = 'مبلغ: '.number_format($order->amount).' تومان';
        $parts[] = 'شناسه سفارش: #'.$order->id.' (این شناسه را در توضیح واریز بنویسید)';

        return implode(' — ', $parts);
    }
}
