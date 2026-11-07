<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /** ورود مدیر یا کاربر فروشگاه با ایمیل یا شماره موبایل ثبت‌شدهٔ آژانس. */
    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'string', 'max:190'],
            'password' => ['required', 'string'],
            'remember' => ['sometimes', 'boolean'],
        ]);

        $rawIdentifier = trim(self::normalizeDigits($credentials['email']));
        $user = $this->resolveUserForLogin($rawIdentifier, $credentials['password']);

        if (! $user || ! Hash::check($credentials['password'], $user->password)) {
            AuditLogger::record('login_failed', [
                'user_id' => null,
                'store_id' => null,
                'meta' => ['email' => $rawIdentifier],
            ]);

            throw ValidationException::withMessages([
                'email' => ['شماره موبایل/ایمیل یا رمز عبور نادرست است.'],
            ]);
        }

        if (! $user->is_active) {
            AuditLogger::record('login_blocked', [
                'user_id' => $user->getKey(),
                'store_id' => $user->store_id,
                'meta' => ['email' => $user->email, 'reason' => 'inactive_user'],
            ]);

            throw ValidationException::withMessages([
                'email' => ['این حساب غیرفعال شده است. با پشتیبانی تماس بگیرید.'],
            ]);
        }

        // فروشگاه آرشیو/غیرفعال: ورود کاربران آن مسدود است، اما داده‌ها دست‌نخورده می‌مانند.
        if ($user->isStore()) {
            $store = $user->store;

            if ($store === null || ! $store->is_active || $store->archived_at !== null) {
                AuditLogger::record('login_blocked', [
                    'user_id' => $user->getKey(),
                    'store_id' => $user->store_id,
                    'meta' => ['email' => $user->email, 'reason' => 'store_archived_or_inactive'],
                ]);

                throw ValidationException::withMessages([
                    'email' => ['دسترسی این فروشگاه غیرفعال یا آرشیو شده است. با پشتیبانی تماس بگیرید.'],
                ]);
            }
        }

        Auth::login($user, $request->boolean('remember'));
        $request->session()->regenerate();

        $user->forceFill(['last_login_at' => now()])->save();
        $user->load('store.license');

        AuditLogger::record('login', [
            'meta' => ['role' => $user->role],
        ]);

        return response()->json([
            'user' => new UserResource($user),
            'server_time' => now()->toIso8601String(),
        ])->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    }

    /** بازگرداندن کاربر واردشده برای راه‌اندازی مجدد رابط و استعلام آنی تمدید اشتراک. */
    public function me(Request $request): JsonResponse
    {
        $user = ($request->user()?->fresh() ?? $request->user())->load('store.license');

        return response()->json([
            'user' => new UserResource($user),
            'server_time' => now()->toIso8601String(),
        ])->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    }

    public function logout(Request $request): JsonResponse
    {
        AuditLogger::record('logout');

        Auth::guard('web')->logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['ok' => true]);
    }

    /** تبدیل ارقام فارسی و عربی به انگلیسی. */
    private static function normalizeDigits(string $value): string
    {
        return strtr($value, [
            '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4',
            '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
            '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4',
            '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
        ]);
    }

    /** نرمال‌سازی شماره تلفن (حذف فاصله/خط تیره و یکسان‌سازی پیش‌شماره +98 با 0). */
    private static function normalizePhone(string $value): string
    {
        $digits = preg_replace('/\D+/', '', self::normalizeDigits($value)) ?? '';
        if (str_starts_with($digits, '0098') && strlen($digits) > 4) {
            $digits = '0'.substr($digits, 4);
        } elseif (str_starts_with($digits, '98') && strlen($digits) === 12) {
            $digits = '0'.substr($digits, 2);
        } elseif (strlen($digits) === 10 && str_starts_with($digits, '9')) {
            $digits = '0'.$digits;
        }

        return $digits;
    }

    /** یافتن کاربر بر اساس ایمیل یا شماره تلفن ثبت‌شده برای آژانس. */
    private function resolveUserForLogin(string $identifier, string $password): ?User
    {
        $lower = mb_strtolower($identifier);
        $byEmail = User::whereRaw('LOWER(email) = ?', [$lower])->first();
        if ($byEmail !== null) {
            return $byEmail;
        }

        if (str_contains($identifier, '@')) {
            return null;
        }

        $targetPhone = self::normalizePhone($identifier);
        if (strlen($targetPhone) < 7) {
            return null;
        }

        $candidates = User::with('store')
            ->whereNotNull('store_id')
            ->whereHas('store', fn ($q) => $q->whereNotNull('phone')->where('phone', '!=', ''))
            ->get()
            ->filter(fn (User $u) => $u->store && self::normalizePhone((string) $u->store->phone) === $targetPhone)
            ->values();

        foreach ($candidates as $candidate) {
            if (Hash::check($password, $candidate->password)) {
                return $candidate;
            }
        }

        return $candidates->first();
    }
}
