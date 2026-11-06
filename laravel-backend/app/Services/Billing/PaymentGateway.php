<?php

namespace App\Services\Billing;

use App\Models\Order;
use App\Services\Billing\Exceptions\PaymentGatewayException;

/**
 * قرارداد مشترک درگاه‌های پرداخت.
 *
 * هر درگاه دو کار می‌کند: «درخواست پرداخت» (سفارش را به درگاه می‌فرستد) و
 * «تأیید پرداخت» (پس از بازگشت کاربر، صحت پرداخت را از درگاه می‌پرسد).
 * اعمال لایسنس هرگز در درگاه انجام نمی‌شود؛ فقط سرویس سفارش.
 */
interface PaymentGateway
{
    public function key(): string;

    public function label(): string;

    /**
     * درخواست پرداخت برای یک سفارش.
     *
     * اگر درگاه آدرس هدایت (redirect) دارد، آن را برمی‌گرداند؛ درگاه دستی
     * (کارت به کارت) آدرس ندارد و فقط توضیح واریز برمی‌گرداند.
     *
     * @param  array{callback_url?: string, email?: string|null, description?: string}  $context
     * @return array{authority: string|null, redirect_url: string|null, instructions: string|null}
     *
     * @throws PaymentGatewayException
     */
    public function request(Order $order, array $context = []): array;

    /**
     * تأیید پرداخت پس از بازگشت از درگاه.
     *
     * @param  array<string, mixed>  $params
     * @return array{ok: bool, reference: string|null, message: string|null}
     */
    public function verify(Order $order, array $params): array;
}
