<?php

/*
|--------------------------------------------------------------------------
| تنظیمات فروش، پرداخت و تمدید اشتراک تاکسی کارن
|--------------------------------------------------------------------------
|
| قیمت‌ها به تومان ذخیره می‌شوند؛ درگاه زرین‌پال مبلغ را در واحد ریال
| می‌خواهد، پس هنگام ارسال ×۱۰ می‌شود (`toman_to_rials`).
|
*/

return [

    'currency' => 'toman',
    'currency_label' => 'تومان',
    'toman_to_rials' => 10,

    // دورهٔ آزمایشی پیش‌فرض (روز)
    'trial_days' => (int) env('TAXI_TRIAL_DAYS', env('KARO_TRIAL_DAYS', 14)),

    // ثبت‌نام عمومی به‌صورت پیش‌فرض غیرفعال است؛ ساخت آژانس توسط مدیر کل انجام می‌شود.
    'public_registration' => (bool) env('TAXI_PUBLIC_SIGNUP', env('KARO_PUBLIC_SIGNUP', false)),

    // درگاه پیش‌فرض: manual (کارت به کارت) یا zarinpal
    'gateway' => env('TAXI_PAYMENT_GATEWAY', env('KARO_PAYMENT_GATEWAY', 'manual')),

    // روزهای یادآوری تمدید (از بزرگ به کوچک)
    'reminder_days' => [7, 3, 1, 0],

    'callback_path' => env('TAXI_PAYMENT_CALLBACK', env('KARO_PAYMENT_CALLBACK', '/billing/callback')),

    'bank' => [
        'holder' => env('TAXI_BANK_HOLDER', env('KARO_BANK_HOLDER', '')),
        'account' => env('TAXI_BANK_ACCOUNT', env('KARO_BANK_ACCOUNT', '')),
        'sheba' => env('TAXI_BANK_SHEBA', env('KARO_BANK_SHEBA', '')),
        'card' => env('TAXI_BANK_CARD', env('KARO_BANK_CARD', '')),
    ],

    'gateways' => [
        'manual' => [
            'label' => 'کارت به کارت / واریز بانکی',
            'enabled' => true,
        ],
        'zarinpal' => [
            'label' => 'درگاه زرین‌پال',
            'enabled' => env('ZARINPAL_MERCHANT_ID') !== null && env('ZARINPAL_MERCHANT_ID') !== '',
            'merchant_id' => env('ZARINPAL_MERCHANT_ID', ''),
            'sandbox' => (bool) env('ZARINPAL_SANDBOX', false),
            'base_url' => env('ZARINPAL_SANDBOX', false)
                ? 'https://sandbox.zarinpal.com'
                : 'https://payment.zarinpal.com',
        ],
    ],

];
