<?php

namespace App\Support;

use Carbon\CarbonInterface;

/**
 * تبدیل تاریخ میلادی به شمسی برای متن‌های سمت سرور (ایمیل، فاکتور، لاگ).
 *
 * رابط کاربری React خودش تاریخ جلالی را می‌سازد؛ این کلاس فقط جایی لازم است
 * که متن در PHP تولید می‌شود.
 */
class Jalali
{
    /** @var list<string> */
    private const MONTHS = [
        'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
        'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
    ];

    /**
     * تاریخ شمسی به شکل «۱۵ آبان ۱۴۰۵».
     */
    public static function long(CarbonInterface $date): string
    {
        [$year, $month, $day] = self::toJalali(
            (int) $date->format('Y'),
            (int) $date->format('n'),
            (int) $date->format('j'),
        );

        return self::digits($day).' '.self::MONTHS[$month - 1].' '.self::digits($year);
    }

    /**
     * نام ماه شمسی با سال، مثل «آبان ۱۴۰۵» — برای برچسب نمودارهای مدیریتی.
     */
    public static function monthLabel(CarbonInterface $date): string
    {
        [$year, $month] = self::toJalali(
            (int) $date->format('Y'),
            (int) $date->format('n'),
            (int) $date->format('j'),
        );

        return self::MONTHS[$month - 1].' '.self::digits($year);
    }

    /**
     * تاریخ شمسی عددی به شکل «۱۴۰۵/۰۸/۱۵».
     */
    public static function numeric(CarbonInterface $date, string $separator = '/'): string
    {
        [$year, $month, $day] = self::toJalali(
            (int) $date->format('Y'),
            (int) $date->format('n'),
            (int) $date->format('j'),
        );

        return implode($separator, [
            self::digits($year),
            self::digits(str_pad((string) $month, 2, '0', STR_PAD_LEFT)),
            self::digits(str_pad((string) $day, 2, '0', STR_PAD_LEFT)),
        ]);
    }

    /**
     * @return array{0: int, 1: int, 2: int}
     */
    public static function toJalali(int $gy, int $gm, int $gd): array
    {
        $daysInMonth = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
        $gy2 = $gm > 2 ? $gy + 1 : $gy;

        $days = 355666 + (365 * $gy) + intdiv($gy2 + 3, 4) - intdiv($gy2 + 99, 100)
            + intdiv($gy2 + 399, 400) + $gd + $daysInMonth[$gm - 1];

        $jy = -1595 + (33 * intdiv($days, 12053));
        $days %= 12053;
        $jy += 4 * intdiv($days, 1461);
        $days %= 1461;

        if ($days > 365) {
            $jy += intdiv($days - 1, 365);
            $days = ($days - 1) % 365;
        }

        if ($days < 186) {
            $jm = 1 + intdiv($days, 31);
            $jd = 1 + ($days % 31);
        } else {
            $jm = 7 + intdiv($days - 186, 30);
            $jd = 1 + (($days - 186) % 30);
        }

        return [$jy, $jm, $jd];
    }

    /** ارقام لاتین را به ارقام فارسی تبدیل می‌کند. */
    public static function digits(int|string $value): string
    {
        return strtr((string) $value, [
            '0' => '۰', '1' => '۱', '2' => '۲', '3' => '۳', '4' => '۴',
            '5' => '۵', '6' => '۶', '7' => '۷', '8' => '۸', '9' => '۹',
        ]);
    }
}
