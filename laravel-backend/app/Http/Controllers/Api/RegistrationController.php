<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\Store;
use App\Models\User;
use App\Services\Billing\LicenseService;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * ثبت‌نام آنلاین فروشگاه (self-service).
 *
 * فروشگاه + کاربر مالک + لایسنس آزمایشی در یک تراکنش ساخته می‌شوند؛ اگر هر
 * بخشی شکست بخورد هیچ دادهٔ نیمه‌کاری باقی نمی‌ماند. بلافاصله پس از ثبت‌نام
 * کاربر وارد سیستم می‌شود تا فاصله تا «اولین فاکتور» کوتاه باشد.
 */
class RegistrationController extends Controller
{
    public function __construct(private readonly LicenseService $licenses) {}

    /**
     * @throws Throwable
     */
    public function store(Request $request): JsonResponse
    {
        if (! config('billing.public_registration', true)) {
            throw ValidationException::withMessages([
                'store_name' => ['ثبت‌نام آنلاین فعلاً غیرفعال است؛ با پشتیبانی تماس بگیرید.'],
            ]);
        }

        $data = $request->validate([
            'store_name' => ['required', 'string', 'max:120'],
            'owner_name' => ['nullable', 'string', 'max:120'],
            'phone' => ['nullable', 'string', 'max:30'],
            'email' => ['required', 'string', 'email', 'max:190', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8', 'max:190', 'confirmed'],
            'terms' => ['accepted'],
        ], [
            'email.unique' => 'این ایمیل قبلاً ثبت شده است. وارد شوید یا ایمیل دیگری بگذارید.',
            'password.min' => 'رمز عبور باید حداقل ۸ نویسه باشد.',
            'password.confirmed' => 'تکرار رمز عبور یکسان نیست.',
            'terms.accepted' => 'برای ادامه باید قوانین استفاده را بپذیرید.',
        ]);

        /** @var array{store: Store, user: User} $result */
        $result = DB::transaction(function () use ($data) {
            $store = Store::create([
                'name' => $data['store_name'],
                'slug' => $this->uniqueSlug($data['store_name']),
                'owner_name' => $data['owner_name'] ?? null,
                'phone' => $data['phone'] ?? null,
                'is_active' => true,
            ]);

            $user = User::create([
                'name' => ($data['owner_name'] ?? null) ?: $data['store_name'],
                'email' => $data['email'],
                'password' => $data['password'],
                'role' => User::ROLE_STORE,
                'store_id' => $store->id,
                'is_active' => true,
                'email_verified_at' => now(),
            ]);

            $this->licenses->startTrial($store, $user->id);

            return ['store' => $store, 'user' => $user];
        });

        Auth::login($result['user']);
        $request->session()->regenerate();
        $result['user']->forceFill(['last_login_at' => now()])->save();

        AuditLogger::record('store_self_registered', [
            'store_id' => $result['store']->id,
            'user_id' => $result['user']->id,
            'subject_type' => 'store',
            'subject_key' => $result['store']->id,
            'meta' => [
                'name' => $result['store']->name,
                'trial_days' => (int) config('billing.trial_days', 14),
            ],
        ]);

        return response()->json([
            'user' => new UserResource($result['user']->load('store.license')),
        ], 201);
    }

    private function uniqueSlug(string $name): string
    {
        $base = Str::slug(Str::ascii($name));
        $base = $base !== '' ? $base : 'store';

        $slug = $base;
        $suffix = 1;

        while (Store::where('slug', $slug)->exists()) {
            $slug = $base.'-'.(++$suffix);
        }

        return $slug;
    }
}
