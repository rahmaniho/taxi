<?php

namespace App\Support;

use App\Models\AuditLog;
use Illuminate\Support\Facades\Auth;
use Throwable;

/**
 * ثبت رویدادهای مهم برنامه در `audit_logs`.
 *
 * قاعده: ثبت رویداد هرگز نباید عملیات اصلی کاربر را بشکند؛ پس همهٔ خطاها
 * بی‌صدا نادیده گرفته می‌شوند (اگر دیتابیس رویداد مشکل داشت، فروش نباید بخوابد).
 */
class AuditLogger
{
    /**
     * @param  array{store_id?: int|null, user_id?: int|null, subject_type?: string|null, subject_key?: string|int|null, meta?: array<string, mixed>|null}  $context
     */
    public static function record(string $action, array $context = []): void
    {
        try {
            $user = Auth::user();
            $request = request();

            AuditLog::create([
                'store_id' => $context['store_id'] ?? $user?->store_id,
                'user_id' => $context['user_id'] ?? $user?->getKey(),
                'action' => mb_substr($action, 0, 60),
                'subject_type' => $context['subject_type'] ?? null,
                'subject_key' => isset($context['subject_key'])
                    ? mb_substr((string) $context['subject_key'], 0, 60)
                    : null,
                'meta' => $context['meta'] ?? null,
                'ip' => $request?->ip(),
                'user_agent' => mb_substr((string) $request?->userAgent(), 0, 255),
                'created_at' => now(),
            ]);
        } catch (Throwable) {
            // حسابرسی اختیاری است؛ شکستش نباید کاری را خراب کند.
        }
    }
}
