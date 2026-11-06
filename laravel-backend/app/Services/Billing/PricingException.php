<?php

namespace App\Services\Billing;

use RuntimeException;

/**
 * خطای قیمت‌گذاری با پیام قابل نمایش به کاربر (تمام اعتبارسنجی‌ها سمت سرور).
 */
class PricingException extends RuntimeException
{
}
