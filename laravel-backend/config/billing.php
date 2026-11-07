<?php

/*
|--------------------------------------------------------------------------
| تنظیمات فروش، پرداخت، پشتیبانی و تمدید اشتراک تاکسینو (کارن سافت)
|--------------------------------------------------------------------------
|
| تمام قیمت‌ها به تومان ذخیره می‌شوند؛ درگاه زرین‌پال مبلغ را در واحد ریال
| می‌خواهد، پس هنگام ارسال ×۱۰ می‌شود (`toman_to_rials`).
|
*/

return [

    'product_name' => 'تاکسینو',
    'product_name_en' => 'TAXINO',
    'brand_name' => 'کارن سافت',
    'brand_name_en' => 'KarenSoft',
    'slogan' => 'همه‌چیز تحت کنترل شما',

    'currency' => 'toman',
    'currency_label' => 'تومان',
    'toman_to_rials' => 10,

    // مالیات بر ارزش افزوده (درصد) — فقط اگر واقعاً بزرگ‌تر از صفر تعریف شود اعمال و نمایش داده می‌شود.
    'tax_percent' => (int) env('TAXI_TAX_PERCENT', 0),

    // دورهٔ آزمایشی پیش‌فرض (روز)
    'trial_days' => (int) env('TAXI_TRIAL_DAYS', env('KARO_TRIAL_DAYS', 14)),

    // ثبت‌نام عمومی به‌صورت پیش‌فرض غیرفعال است؛ ساخت آژانس توسط مدیر کل انجام می‌شود.
    'public_registration' => (bool) env('TAXI_PUBLIC_SIGNUP', env('KARO_PUBLIC_SIGNUP', false)),

    // درگاه پیش‌فرض: manual (ثبت سفارش و تأیید پشتیبانی/کارت‌به‌کارت) یا zarinpal
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

    // کانال‌های رسمی پشتیبانی کارن سافت (karen-soft.ir)
    'support' => [
        'company' => 'کارن سافت | Karen Soft',
        'website' => env('TAXI_SUPPORT_WEBSITE', 'https://karen-soft.ir'),
        'contact_url' => env('TAXI_SUPPORT_CONTACT_URL', 'https://karen-soft.ir/contact'),
        'phone' => env('TAXI_SUPPORT_PHONE', '+989152521166'),
        'phone_display' => env('TAXI_SUPPORT_PHONE_DISPLAY', '۰۹۱۵۲۵۲۱۱۶۶'),
        'email' => env('TAXI_SUPPORT_EMAIL', 'info@karen-soft.ir'),
        'telegram' => env('TAXI_SUPPORT_TELEGRAM', 'https://t.me/KarenSoftOfficial'),
        'telegram_handle' => env('TAXI_SUPPORT_TELEGRAM_HANDLE', '@KarenSoftOfficial'),
        'instagram' => env('TAXI_SUPPORT_INSTAGRAM', 'https://instagram.com/karen_soft.ir'),
        'address' => env('TAXI_SUPPORT_ADDRESS', 'قزوین، زیباشهر، کارن سافت'),
        'hours' => env('TAXI_SUPPORT_HOURS', 'شنبه تا چهارشنبه ۹:۰۰ تا ۱۸:۰۰ · پنج‌شنبه ۹:۰۰ تا ۱۳:۰۰'),
        'crisp_website_id' => env('TAXI_CRISP_WEBSITE_ID', 'ffafdfcf-e510-45d0-a026-4e964ad420ee'),
    ],

    'manager' => [
        'name' => env('TAXI_MANAGER_NAME', env('TAXI_ADMIN_NAME', env('KARO_MANAGER_NAME', 'مدیر کل'))),
        'email' => env('TAXI_MANAGER_EMAIL', env('TAXI_ADMIN_EMAIL', env('KARO_MANAGER_EMAIL', ''))),
        'password' => env('TAXI_MANAGER_PASSWORD', env('TAXI_ADMIN_PASSWORD', env('KARO_MANAGER_PASSWORD', ''))),
    ],

    'gateways' => [
        'manual' => [
            'label' => 'کارت به کارت / هماهنگی با پشتیبانی کارن‌سافت',
            'enabled' => true,
        ],
        'zarinpal' => [
            'label' => 'درگاه پرداخت آنلاین زرین‌پال',
            'enabled' => env('ZARINPAL_MERCHANT_ID') !== null && env('ZARINPAL_MERCHANT_ID') !== '',
            'merchant_id' => env('ZARINPAL_MERCHANT_ID', ''),
            'sandbox' => (bool) env('ZARINPAL_SANDBOX', false),
            'base_url' => env('ZARINPAL_SANDBOX', false)
                ? 'https://sandbox.zarinpal.com'
                : 'https://payment.zarinpal.com',
        ],
    ],

];
