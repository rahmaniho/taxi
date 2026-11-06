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
    /** ورود مدیر یا کاربر فروشگاه با نشست لاراول. */
    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'string', 'email'],
            'password' => ['required', 'string'],
            'remember' => ['sometimes', 'boolean'],
        ]);

        $user = User::where('email', $credentials['email'])->first();

        if (! $user || ! Hash::check($credentials['password'], $user->password)) {
            AuditLogger::record('login_failed', [
                'user_id' => null,
                'store_id' => null,
                'meta' => ['email' => $credentials['email']],
            ]);

            throw ValidationException::withMessages([
                'email' => ['ایمیل یا رمز عبور نادرست است.'],
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

        return response()->json(['user' => new UserResource($user)]);
    }

    /** بازگرداندن کاربر واردشده برای راه‌اندازی مجدد رابط. */
    public function me(Request $request): JsonResponse
    {
        $user = $request->user()->load('store.license');

        return response()->json(['user' => new UserResource($user)]);
    }

    public function logout(Request $request): JsonResponse
    {
        AuditLogger::record('logout');

        Auth::guard('web')->logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['ok' => true]);
    }
}
