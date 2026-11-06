<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Billing\SeatLimitService;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * کاربران فروشگاه (تیم) و کنترل سقف کاربران اشتراک.
 *
 * قاعده: افزودن کاربر جدید فقط وقتی مجاز است که تعداد کاربران فعال کمتر از
 * سقف اشتراک باشد. حذف کاربر = غیرفعال‌سازی (داده و سابقهٔ او حفظ می‌شود و
 * ظرفیت آزاد می‌شود).
 */
class TeamController extends Controller
{
    public function __construct(private readonly SeatLimitService $seats) {}

    public function index(Request $request): JsonResponse
    {
        $store = $request->user()->store;

        $members = User::query()
            ->where('store_id', $store->id)
            ->orderByDesc('is_active')
            ->orderBy('id')
            ->get()
            ->map(fn (User $user) => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'is_active' => (bool) $user->is_active,
                'last_login_at' => $user->last_login_at?->toIso8601String(),
                'created_at' => $user->created_at?->toIso8601String(),
            ])
            ->values()
            ->all();

        return response()->json([
            'members' => $members,
            'usage' => $this->seats->usage($store),
        ]);
    }

    /**
     * @throws ValidationException
     */
    public function store(Request $request): JsonResponse
    {
        $store = $request->user()->store;

        $this->seats->assertCanAdd($store);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'string', 'email', 'max:190', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8', 'max:190'],
        ], [
            'email.unique' => 'این ایمیل قبلاً ثبت شده است.',
            'password.min' => 'رمز عبور باید حداقل ۸ نویسه باشد.',
        ]);

        $user = User::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => Hash::make($data['password']),
            'role' => User::ROLE_STORE,
            'store_id' => $store->id,
            'is_active' => true,
        ]);

        AuditLogger::record('team_user_created', [
            'store_id' => $store->id,
            'subject_type' => 'user',
            'subject_key' => $user->id,
            'meta' => ['email' => $user->email],
        ]);

        return response()->json([
            'member' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'is_active' => true,
                'last_login_at' => null,
                'created_at' => $user->created_at?->toIso8601String(),
            ],
            'usage' => $this->seats->usage($store->refresh()),
        ], 201);
    }

    /** غیرفعال‌کردن کاربر (آزادسازی ظرفیت). */
    public function destroy(Request $request, User $member): JsonResponse
    {
        $store = $request->user()->store;

        if ((int) $member->store_id !== (int) $store->id) {
            abort(404);
        }

        if ((int) $member->id === (int) $request->user()->id) {
            throw ValidationException::withMessages([
                'member' => ['نمی‌توانید حساب خودتان را غیرفعال کنید.'],
            ]);
        }

        $member->forceFill(['is_active' => false])->save();

        AuditLogger::record('team_user_disabled', [
            'store_id' => $store->id,
            'subject_type' => 'user',
            'subject_key' => $member->id,
            'meta' => ['email' => $member->email],
        ]);

        return response()->json([
            'ok' => true,
            'usage' => $this->seats->usage($store->refresh()),
        ]);
    }

    /** فعال‌سازی دوبارهٔ کاربر غیرفعال — با همان کنترل ظرفیت. */
    public function restore(Request $request, User $member): JsonResponse
    {
        $store = $request->user()->store;

        if ((int) $member->store_id !== (int) $store->id) {
            abort(404);
        }

        // وضعیت را از دیتابیس تازه می‌کنیم تا از دادهٔ کهنه تصمیم گرفته نشود.
        $member->refresh();

        if (! $member->is_active) {
            $this->seats->assertCanAdd($store);
            $member->forceFill(['is_active' => true])->save();

            AuditLogger::record('team_user_enabled', [
                'store_id' => $store->id,
                'subject_type' => 'user',
                'subject_key' => $member->id,
            ]);
        }

        return response()->json([
            'ok' => true,
            'usage' => $this->seats->usage($store->refresh()),
        ]);
    }

    /** تغییر نام/ایمیل کاربر توسط خود فروشگاه. */
    public function update(Request $request, User $member): JsonResponse
    {
        $store = $request->user()->store;

        if ((int) $member->store_id !== (int) $store->id) {
            abort(404);
        }

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:120'],
            'email' => ['sometimes', 'string', 'email', 'max:190', Rule::unique('users', 'email')->ignore($member->id)],
            'password' => ['sometimes', 'nullable', 'string', 'min:8', 'max:190'],
        ]);

        $fields = array_filter([
            'name' => $data['name'] ?? null,
            'email' => $data['email'] ?? null,
        ], fn ($value) => $value !== null);

        if (! empty($data['password'])) {
            $fields['password'] = Hash::make($data['password']);
        }

        $member->forceFill($fields)->save();

        AuditLogger::record('team_user_updated', [
            'store_id' => $store->id,
            'subject_type' => 'user',
            'subject_key' => $member->id,
        ]);

        return response()->json(['ok' => true]);
    }
}
