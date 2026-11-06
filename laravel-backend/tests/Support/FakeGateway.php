<?php

namespace Tests\Support;

use App\Models\Order;
use App\Services\Billing\PaymentGateway;

/**
 * درگاه ساختگی برای تست مسیر پول.
 *
 * رفتار درگاه واقعی را شبیه‌سازی می‌کند: آدرس هدایت می‌دهد و نتیجهٔ تأیید
 * قابل تنظیم است، بدون تماس شبکه‌ای.
 */
class FakeGateway implements PaymentGateway
{
    public bool $approve = true;

    public ?string $message = null;

    public int $requestCount = 0;

    public int $verifyCount = 0;

    public function __construct(
        private readonly string $key = 'manual',
        private readonly string $label = 'درگاه آزمایشی',
    ) {}

    public function key(): string
    {
        return $this->key;
    }

    public function label(): string
    {
        return $this->label;
    }

    public function request(Order $order, array $context = []): array
    {
        $this->requestCount++;

        return [
            'authority' => 'AUTH-'.$order->id,
            'redirect_url' => 'https://pay.test/'.$order->id,
            'instructions' => null,
        ];
    }

    public function verify(Order $order, array $params = []): array
    {
        $this->verifyCount++;

        if (! $this->approve) {
            return ['ok' => false, 'reference' => null, 'message' => $this->message ?? 'پرداخت تأیید نشد.'];
        }

        return ['ok' => true, 'reference' => 'REF-'.$order->id, 'message' => null];
    }
}
