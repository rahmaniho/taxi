<?php

namespace App\Services\Billing;

use App\Models\Order;
use App\Services\Billing\Exceptions\PaymentGatewayException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

/**
 * درگاه زرین‌پال (API نسخهٔ ۴).
 *
 * مبلغ در دیتابیس تومان است و زرین‌پال ریال می‌خواهد؛ تبدیل ×۱۰ در همین
 * کلاس انجام می‌شود تا بقیهٔ کد با یک واحد کار کند.
 *
 * برای تست/راه‌اندازی، `ZARINPAL_SANDBOX=true` آدرس سندباکس را انتخاب می‌کند.
 */
class ZarinpalGateway implements PaymentGateway
{
    private const CODE_OK = 100;

    private const CODE_ALREADY_VERIFIED = 101;

    public function key(): string
    {
        return 'zarinpal';
    }

    public function label(): string
    {
        return (string) config('billing.gateways.zarinpal.label', 'زرین‌پال');
    }

    public function request(Order $order, array $context = []): array
    {
        $merchantId = $this->merchantId();

        $payload = [
            'merchant_id' => $merchantId,
            'amount' => $this->amountInRials($order),
            'callback_url' => (string) ($context['callback_url'] ?? route('api.billing.callback', ['order' => $order->id])),
            'description' => (string) ($context['description'] ?? "خرید/تمدید اشتراک کارو — سفارش #{$order->id}"),
            'currency' => 'IRR',
        ];

        if (! empty($context['email'])) {
            $payload['metadata'] = ['email' => $context['email']];
        }

        try {
            $response = Http::acceptJson()->asJson()->timeout(20)
                ->post($this->baseUrl().'/pg/v4/payment/request.json', $payload);
        } catch (ConnectionException $exception) {
            throw new PaymentGatewayException('اتصال به درگاه زرین‌پال برقرار نشد. دوباره تلاش کنید.');
        }

        $code = (int) $response->json('data.code', 0);
        $authority = (string) $response->json('data.authority', '');

        if ($code !== self::CODE_OK || $authority === '') {
            throw new PaymentGatewayException($this->errorMessage($response->json(), 'درخواست پرداخت از درگاه پذیرفته نشد.'));
        }

        return [
            'authority' => $authority,
            'redirect_url' => $this->baseUrl().'/pg/StartPay/'.$authority,
            'instructions' => null,
        ];
    }

    public function verify(Order $order, array $params = []): array
    {
        $authority = (string) ($params['Authority'] ?? $params['authority'] ?? $order->gateway_ref ?? '');

        if ($authority === '') {
            return ['ok' => false, 'reference' => null, 'message' => 'کد پیگیری درگاه در بازگشت پرداخت پیدا نشد.'];
        }

        // کاربر در درگاه «انصراف» داده است.
        $status = strtoupper((string) ($params['Status'] ?? 'OK'));
        if ($status !== '' && $status !== 'OK') {
            return ['ok' => false, 'reference' => null, 'message' => 'پرداخت توسط کاربر لغو شد.'];
        }

        try {
            $response = Http::acceptJson()->asJson()->timeout(20)
                ->post($this->baseUrl().'/pg/v4/payment/verify.json', [
                    'merchant_id' => $this->merchantId(),
                    'amount' => $this->amountInRials($order),
                    'authority' => $authority,
                ]);
        } catch (ConnectionException $exception) {
            return [
                'ok' => false,
                'reference' => null,
                'message' => 'ارتباط با درگاه برای تأیید پرداخت برقرار نشد؛ اگر مبلغ کسر شده، با پشتیبانی تماس بگیرید.',
            ];
        }

        $code = (int) $response->json('data.code', 0);

        if ($code !== self::CODE_OK && $code !== self::CODE_ALREADY_VERIFIED) {
            return [
                'ok' => false,
                'reference' => null,
                'message' => $this->errorMessage($response->json(), 'پرداخت تأیید نشد.'),
            ];
        }

        $refId = $response->json('data.ref_id');

        return [
            'ok' => true,
            'reference' => $refId !== null ? (string) $refId : null,
            'message' => null,
        ];
    }

    private function merchantId(): string
    {
        $merchantId = (string) config('billing.gateways.zarinpal.merchant_id', '');

        if ($merchantId === '') {
            throw new PaymentGatewayException('شناسهٔ پذیرندهٔ زرین‌پال تنظیم نشده است (ZARINPAL_MERCHANT_ID).');
        }

        return $merchantId;
    }

    private function baseUrl(): string
    {
        return rtrim((string) config('billing.gateways.zarinpal.base_url', 'https://payment.zarinpal.com'), '/');
    }

    private function amountInRials(Order $order): int
    {
        return (int) $order->amount * (int) config('billing.toman_to_rials', 10);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function errorMessage(array $payload, string $fallback): string
    {
        $errors = $payload['errors'] ?? null;

        if (is_array($errors)) {
            $message = $errors['message'] ?? null;
            if (is_string($message) && $message !== '') {
                return $message;
            }
        }

        return $fallback;
    }
}
