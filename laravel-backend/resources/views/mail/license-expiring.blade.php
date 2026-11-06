<!DOCTYPE html>
<html lang="fa" dir="rtl">
    <body style="margin:0;padding:24px;background:#080A19;font-family:Tahoma,'Segoe UI',sans-serif;color:#f6f5f1;">
        <div style="max-width:560px;margin:0 auto;background:#121831;border:1px solid rgba(212,175,55,.25);border-radius:18px;padding:28px;">
            <h1 style="margin:0 0 12px;font-size:20px;color:#D4AF37;">تاکسی کارن · کارن‌سافت</h1>

            <p style="margin:0 0 12px;line-height:2;font-size:14px;">
                سلام {{ $store->owner_name ?: $store->name }} عزیز،
            </p>

            @if ($daysLeft > 0)
                <p style="margin:0 0 12px;line-height:2;font-size:14px;">
                    اعتبار اشتراک آژانس «{{ $store->name }}» تا
                    <b>{{ \App\Support\Jalali::long($license->expires_at) }}</b>
                    یعنی <b>{{ \App\Support\Jalali::digits($daysLeft) }} روز دیگر</b> ادامه دارد.
                    با تمدید به‌موقع، ثبت سفر و عملیات آژانس بدون وقفه ادامه پیدا می‌کند.
                </p>
            @elseif ($daysLeft === 0)
                <p style="margin:0 0 12px;line-height:2;font-size:14px;">
                    امروز آخرین روز اعتبار اشتراک آژانس «{{ $store->name }}» است.
                    با تمدید امروز، فردا هم بدون وقفه سفرها را مدیریت می‌کنید.
                </p>
            @else
                <p style="margin:0 0 12px;line-height:2;font-size:14px;">
                    اعتبار اشتراک آژانس «{{ $store->name }}» در تاریخ
                    <b>{{ \App\Support\Jalali::long($license->expires_at) }}</b>
                    به پایان رسید. تمام داده‌های آفلاین شما روی دستگاهتان کاملاً محفوظ و قابل پشتیبان‌گیری است و با تمدید، ثبت سفر دوباره فعال می‌شود.
                </p>
            @endif

            <p style="margin:20px 0;">
                <a href="{{ $renewUrl }}"
                   style="display:inline-block;background:#D4AF37;color:#111;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:12px;">
                    ورود به سامانه و بررسی اشتراک
                </a>
            </p>

            <p style="margin:16px 0 0;line-height:2;font-size:12px;color:#9ca4bb;">
                بستهٔ فعلی: {{ $license->tier === 'proplus' ? 'حرفه‌ای پلاس (Pro+)' : 'حرفه‌ای' }} —
                تاریخ انقضا: {{ \App\Support\Jalali::numeric($license->expires_at) }}
            </p>
        </div>
    </body>
</html>
