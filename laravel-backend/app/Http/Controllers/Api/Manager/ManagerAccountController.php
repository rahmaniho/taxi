<?php

namespace App\Http\Controllers\Api\Manager;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * حساب‌های مدیر کل — ساخت، ویرایش، غیرفعال‌سازی.
 *
 * قاعده‌ها: هیچ مدیری نمی‌تواند حساب خودش را غیرفعال کند؛ حذف فیزیکی وجود ندارد
 * (غیرفعال‌سازی، تا تاریخچه و رویدادها قابل ردیابی بمانند) و هر تغییر ثبت می‌شود.
 */
class ManagerAccountController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $me = $request->user();

        $managers = User::query()
            ->where('role', User::ROLE_MANAGER)
            ->orderBy('id')
            ->get()
            ->map(fn (User $user) => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'is_active' => (bool) $user->is_active,
                'last_login_at' => $user->last_login_at?->toIso8601String(),
                'created_at' => $user->created_at?->toIso8601String(),
                'is_self' => (int) $user->id === (int) $me->id,
            ])
            ->values()
            ->all();

        return response()->json(['managers' => $managers]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'string', 'email', 'max:190', Rule::unique('users', 'email')],
            'password' => ['required', 'string', 'min:8', 'max:190'],
            'is_active' => ['sometimes', 'boolean'],
        ], [
            'email.unique' => 'این ایمیل قبلاً ثبت شده است.',
            'password.min' => 'رمز عبور مدیر باید حداقل ۸ نویسه باشد.',
        ]);

        $manager = User::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => $data['password'],
            'role' => User::ROLE_MANAGER,
            'store_id' => null,
            'is_active' => $data['is_active'] ?? true,
        ]);

        AuditLogger::record('manager_created', [
            'subject_type' => 'user',
            'subject_key' => $manager->id,
            'meta' => ['email' => $manager->email],
        ]);

        return response()->json(['manager' => $this->serialize($manager, $request)], 201);
    }

    public function update(Request $request, User $manager): JsonResponse
    {
        $this->ensureManager($manager);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:120'],
            'email' => ['sometimes', 'string', 'email', 'max:190', Rule::unique('users', 'email')->ignore($manager->id)],
            'password' => ['sometimes', 'nullable', 'string', 'min:8', 'max:190'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        if (array_key_exists('is_active', $data) && (int) $manager->id === (int) $request->user()->id && ! $data['is_active']) {
            throw ValidationException::withMessages([
                'is_active' => ['نمی‌توانید حساب خودتان را غیرفعال کنید.'],
            ]);
        }

        $fields = array_filter([
            'name' => $data['name'] ?? null,
            'email' => $data['email'] ?? null,
        ], fn ($value) => $value !== null);

        if (array_key_exists('is_active', $data)) {
            $fields['is_active'] = (bool) $data['is_active'];
        }

        if (! empty($data['password'])) {
            $fields['password'] = $data['password'];
        }

        $manager->update($fields);

        AuditLogger::record('manager_updated', [
            'subject_type' => 'user',
            'subject_key' => $manager->id,
            'meta' => [
                'email' => $manager->email,
                'is_active' => (bool) $manager->is_active,
                'password_changed' => ! empty($data['password']),
            ],
        ]);

        return response()->json(['manager' => $this->serialize($manager->refresh(), $request)]);
    }

    public function destroy(Request $request, User $manager): JsonResponse
    {
        $this->ensureManager($manager);

        if ((int) $manager->id === (int) $request->user()->id) {
            throw ValidationException::withMessages([
                'manager' => ['نمی‌توانید حساب خودتان را غیرفعال کنید.'],
            ]);
        }

        $manager->forceFill(['is_active' => false])->save();

        AuditLogger::record('manager_deactivated', [
            'subject_type' => 'user',
            'subject_key' => $manager->id,
            'meta' => ['email' => $manager->email],
        ]);

        return response()->json(['manager' => $this->serialize($manager->refresh(), $request)]);
    }

    private function ensureManager(User $user): void
    {
        if (! $user->isManager()) {
            abort(404);
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function serialize(User $manager, Request $request): array
    {
        return [
            'id' => $manager->id,
            'name' => $manager->name,
            'email' => $manager->email,
            'is_active' => (bool) $manager->is_active,
            'last_login_at' => $manager->last_login_at?->toIso8601String(),
            'created_at' => $manager->created_at?->toIso8601String(),
            'is_self' => (int) $manager->id === (int) $request->user()->id,
        ];
    }
}
