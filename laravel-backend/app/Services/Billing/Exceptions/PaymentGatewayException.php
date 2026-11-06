<?php

namespace App\Services\Billing\Exceptions;

use RuntimeException;

/**
 * خطای درگاه پرداخت با پیام قابل نمایش به کاربر.
 */
class PaymentGatewayException extends RuntimeException
{
}
