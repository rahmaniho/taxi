<?php

namespace App\Services\Billing;

use App\Services\Billing\Exceptions\PaymentGatewayException;

/**
 * انتخاب درگاه پرداخت.
 *
 * درگاه‌ها با `extend()` قابل افزودن یا جایگزینی هستند؛ همین کار در تست‌ها
 * برای جایگزینی درگاه واقعی با یک درگاه ساختگی استفاده می‌شود.
 */
class PaymentGatewayManager
{
    /** @var array<string, callable(PaymentGatewayManager): PaymentGateway> */
    private array $drivers = [];

    public function driver(?string $key = null): PaymentGateway
    {
        $key = $key !== null && $key !== '' ? $key : (string) config('billing.gateway', 'manual');

        if (isset($this->drivers[$key])) {
            return ($this->drivers[$key])($this);
        }

        return match ($key) {
            'manual' => new ManualGateway,
            'zarinpal' => new ZarinpalGateway,
            default => throw new PaymentGatewayException("درگاه پرداخت «{$key}» پشتیبانی نمی‌شود."),
        };
    }

    /** @param  callable(PaymentGatewayManager): PaymentGateway  $factory */
    public function extend(string $key, callable $factory): void
    {
        $this->drivers[$key] = $factory;
    }

    /**
     * فهرست درگاه‌های قابل نمایش به کاربر.
     *
     * @return list<array{key: string, label: string}>
     */
    public function available(): array
    {
        $gateways = [];

        foreach ((array) config('billing.gateways', []) as $key => $config) {
            if (($config['enabled'] ?? false) !== true) {
                continue;
            }

            $gateways[] = [
                'key' => $key,
                'label' => (string) ($config['label'] ?? $key),
            ];
        }

        // درگاه دستی همیشه باید در دسترس باشد؛ بدون آن اگر درگاه آنلاین مشکل
        // داشت، هیچ راهی برای پرداخت نمی‌ماند.
        if ($gateways === []) {
            $gateways[] = ['key' => 'manual', 'label' => 'کارت به کارت'];
        }

        return $gateways;
    }

    public function isAvailable(string $key): bool
    {
        foreach ($this->available() as $gateway) {
            if ($gateway['key'] === $key) {
                return true;
            }
        }

        return false;
    }
}
