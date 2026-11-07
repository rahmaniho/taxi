<?php

namespace App\Http\Controllers\Api\Manager;

use App\Http\Controllers\Controller;
use App\Http\Resources\StoreResource;
use App\Models\License;
use App\Models\Store;
use App\Models\SubscriptionHistory;
use App\Models\SubscriptionPlan;
use App\Models\User;
use App\Services\Billing\LicenseService;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * مدیریت آژانس‌ها/فروشگاه‌ها و لایسنس‌هایشان توسط مدیر کل.
 *
 * اصل ایمنی داده: هیچ آژانسی با یک کلیک حذف دائمی نمی‌شود؛ پیش‌فرض
 * «آرشیو» است (مسدودکردن ورود با حفظ کامل داده‌ها و امکان بازیابی). حذف دائمی
 * فقط برای آژانسِ از قبل آرشیوشده و با تکرار دقیق نام آژانس انجام می‌شود.
 */
class StoreController extends Controller
{
    public function __construct(private readonly LicenseService $licenses) {}

    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'status' => ['nullable', 'in:active,archived,all'],
            'q' => ['nullable', 'string', 'max:120'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:200'],
            'page' => ['nullable', 'integer', 'min:1', 'max:100000'],
        ]);

        $status = $filters['status'] ?? 'active';
        $perPage = (int) ($filters['limit'] ?? 25);

        $query = Store::query()
            ->with([
                'license',
                'users:id,store_id,name,email,phone,is_active,last_login_at',
            ])
            ->withCount([
                'users',
                'users as active_users_count' => fn ($q) => $q->where('is_active', true),
            ])
            ->when($status === 'active', fn ($q) => $q->whereNull('archived_at'))
            ->when($status === 'archived', fn ($q) => $q->whereNotNull('archived_at'))
            ->when($filters['q'] ?? null, function ($q, $term) {
                $like = '%'.$term.'%';
                $q->where(function ($inner) use ($like) {
                    $inner->where('name', 'like', $like)
                        ->orWhere('owner_name', 'like', $like)
                        ->orWhere('phone', 'like', $like)
                        ->orWhere('slug', 'like', $like)
                        ->orWhereHas('users', fn ($user) => $user
                            ->where('email', 'like', $like)
                            ->orWhere('phone', 'like', $like));
                });
            })
            ->orderByDesc('id');

        $page = $query->paginate($perPage, ['*'], 'page', (int) ($filters['page'] ?? 1));

        return response()->json([
            'stores' => StoreResource::collection($page->items()),
            'meta' => [
                'page' => $page->currentPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
                'last_page' => $page->lastPage(),
            ],
            'totals' => [
                'active' => Store::query()->whereNull('archived_at')->count(),
                'archived' => Store::query()->whereNotNull('archived_at')->count(),
            ],
        ]);
    }

    public function show(Store $store): JsonResponse
    {
        $store->load([
            'license',
            'users:id,store_id,name,email,phone,is_active,last_login_at',
        ])->loadCount([
            'users',
            'users as active_users_count' => fn ($q) => $q->where('is_active', true),
        ]);

        return response()->json(['store' => new StoreResource($store)]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'owner_name' => ['nullable', 'string', 'max:120'],
            'user_name' => ['nullable', 'string', 'max:120'],
            'phone' => ['nullable', 'string', 'max:40'],
            'address' => ['nullable', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:190', Rule::unique('users', 'email')],
            'password' => ['required', 'string', 'min:6', 'max:190'],
            'admin_note' => ['nullable', 'string', 'max:500'],

            // فیلدهای تخت (پشتیبانی کامل از فرم مستقیم مدیریت)
            'plan_code' => ['nullable', 'string', 'max:40'],
            'plan_name' => ['nullable', 'string', 'max:120'],
            'days' => ['nullable', 'integer', 'min:1', 'max:3650'],
            'seats' => ['nullable', 'integer', 'min:1', 'max:200'],
            'max_users' => ['nullable', 'integer', 'min:1', 'max:200'],
            'is_lifetime' => ['nullable', 'boolean'],

            // ساختار تودرتوی استاندارد
            'license' => ['nullable', 'array'],
            'license.tier' => ['nullable', 'in:pro,proplus'],
            'license.plan_code' => ['nullable', 'string', 'max:40', 'exists:subscription_plans,code'],
            'license.seats' => ['nullable', 'integer', 'min:1', 'max:200'],
            'license.is_lifetime' => ['nullable', 'boolean'],
            'license.is_active' => ['nullable', 'boolean'],
            'license.is_trial' => ['nullable', 'boolean'],
            'license.starts_at' => ['nullable', 'date'],
            'license.expires_at' => ['nullable', 'date'],
            'license.days' => ['nullable', 'integer', 'min:1', 'max:3650'],
            'license.notes' => ['nullable', 'string', 'max:500'],
        ]);

        // اگر شیء license صریحاً فرستاده شده و غیرمادام‌العمر است، باید تاریخ انقضا یا تعداد روز داشته باشد.
        if (array_key_exists('license', $data) && is_array($data['license'])) {
            $explicitLifetime = (bool) ($data['license']['is_lifetime'] ?? false);
            $hasExplicitExpiry = ! empty($data['license']['expires_at']) || ! empty($data['license']['days']);

            if (! $explicitLifetime && ! $hasExplicitExpiry) {
                throw ValidationException::withMessages([
                    'license.expires_at' => ['برای لایسنس غیر مادام‌العمر، تاریخ انقضا الزامی است.'],
                ]);
            }
        }

        $licenseSpec = $this->resolveInitialLicenseSpec($data);

        $store = DB::transaction(function () use ($data, $licenseSpec, $request) {
            $store = Store::create([
                'name' => $data['name'],
                'slug' => $this->uniqueSlug($data['name']),
                'owner_name' => $data['owner_name'] ?? null,
                'phone' => $data['phone'] ?? null,
                'address' => $data['address'] ?? null,
                'is_active' => true,
            ]);

            $normalizedPhone = $this->normalizeIranPhone($data['phone'] ?? null);
            $phoneForUser = $normalizedPhone !== null && ! User::where('phone', $normalizedPhone)->exists()
                ? $normalizedPhone
                : null;

            User::create([
                'name' => $data['user_name'] ?? $data['owner_name'] ?? $data['name'],
                'email' => strtolower(trim((string) $data['email'])),
                'phone' => $phoneForUser,
                'password' => $data['password'],
                'role' => User::ROLE_STORE,
                'store_id' => $store->id,
                'is_active' => true,
            ]);

            $license = $store->license()->create([
                'tier' => $licenseSpec['tier'],
                'plan_code' => $licenseSpec['plan_code'],
                'seats' => $licenseSpec['seats'],
                'status' => $licenseSpec['is_active'] ? License::STATUS_ACTIVE : License::STATUS_SUSPENDED,
                'is_lifetime' => $licenseSpec['is_lifetime'],
                'is_active' => $licenseSpec['is_active'],
                'is_trial' => $licenseSpec['is_trial'],
                'starts_at' => $licenseSpec['starts_at'],
                'expires_at' => $licenseSpec['is_lifetime'] ? null : $licenseSpec['expires_at'],
                'notes' => $licenseSpec['notes'],
                'created_by' => $request->user()?->id,
            ]);

            SubscriptionHistory::create([
                'store_id' => $store->id,
                'license_id' => $license->id,
                'action' => 'admin_license_issued',
                'reason' => 'صدور اولیه هنگام ثبت آژانس توسط مدیر کل',
                'payload' => [
                    'plan_code' => $license->plan_code,
                    'is_lifetime' => (bool) $license->is_lifetime,
                    'expires_at' => $license->expires_at?->toIso8601String(),
                    'seats' => $license->seats(),
                ],
                'actor_id' => $request->user()?->id,
                'created_at' => now(),
            ]);

            return $store->load([
                'license',
                'users:id,store_id,name,email,phone,is_active,last_login_at',
            ])->loadCount([
                'users',
                'users as active_users_count' => fn ($q) => $q->where('is_active', true),
            ]);
        });

        AuditLogger::record('store_created', [
            'store_id' => $store->id,
            'subject_type' => 'store',
            'subject_key' => $store->id,
            'meta' => [
                'name' => $store->name,
                'email' => $data['email'],
                'plan_code' => $store->license?->plan_code,
                'is_lifetime' => (bool) $store->license?->is_lifetime,
                'expires_at' => $store->license?->expires_at?->toIso8601String(),
            ],
        ]);

        return response()->json(['store' => new StoreResource($store)], 201);
    }

    public function update(Request $request, Store $store): JsonResponse
    {
        $primaryUser = $store->users()->orderBy('id')->first();

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:150'],
            'owner_name' => ['nullable', 'string', 'max:120'],
            'user_name' => ['nullable', 'string', 'max:120'],
            'phone' => ['nullable', 'string', 'max:40'],
            'address' => ['nullable', 'string', 'max:255'],
            'is_active' => ['sometimes', 'boolean'],
            'email' => [
                'sometimes',
                'nullable',
                'string',
                'email',
                'max:190',
                Rule::unique('users', 'email')->ignore($primaryUser?->id),
            ],
            'password' => ['sometimes', 'nullable', 'string', 'min:6', 'max:190'],
        ]);

        DB::transaction(function () use ($store, $primaryUser, $data) {
            $storeFields = array_intersect_key($data, array_flip(['name', 'owner_name', 'phone', 'address', 'is_active']));
            $store->update($storeFields);

            if ($primaryUser !== null) {
                $userUpdates = [];
                if (! empty($data['email'])) {
                    $userUpdates['email'] = strtolower(trim((string) $data['email']));
                }
                if (! empty($data['user_name'])) {
                    $userUpdates['name'] = $data['user_name'];
                }
                if (! empty($data['password'])) {
                    $userUpdates['password'] = $data['password'];
                }
                if (array_key_exists('phone', $data)) {
                    $normalizedPhone = $this->normalizeIranPhone($data['phone']);
                    if ($normalizedPhone !== null && ! User::where('phone', $normalizedPhone)->where('id', '!=', $primaryUser->id)->exists()) {
                        $userUpdates['phone'] = $normalizedPhone;
                    }
                }
                if ($userUpdates !== []) {
                    $primaryUser->update($userUpdates);
                }
            }
        });

        AuditLogger::record('store_updated', [
            'store_id' => $store->id,
            'subject_type' => 'store',
            'subject_key' => $store->id,
            'meta' => [
                'fields' => array_keys(array_diff_key($data, ['password' => true])),
                'password_changed' => ! empty($data['password']),
            ],
        ]);

        return response()->json([
            'store' => new StoreResource(
                $store->refresh()->load([
                    'license',
                    'users:id,store_id,name,email,phone,is_active,last_login_at',
                ])->loadCount([
                    'users',
                    'users as active_users_count' => fn ($q) => $q->where('is_active', true),
                ])
            ),
        ]);
    }

    /**
     * آرشیو پیش‌فرض؛ حذف دائمی فقط با `mode=purge` و نام دقیق آژانسِ از قبل آرشیوشده.
     */
    public function destroy(Request $request, Store $store): JsonResponse
    {
        if ($request->input('mode') === 'purge') {
            return $this->purge($request, $store);
        }

        return $this->archiveStore($store);
    }

    public function archive(Store $store): JsonResponse
    {
        return $this->archiveStore($store);
    }

    public function restore(Store $store): JsonResponse
    {
        if ($store->archived_at === null) {
            return response()->json([
                'store' => new StoreResource($store->load([
                    'license',
                    'users:id,store_id,name,email,phone,is_active,last_login_at',
                ])),
            ]);
        }

        DB::transaction(function () use ($store) {
            $store->forceFill([
                'archived_at' => null,
                'is_active' => true,
            ])->save();

            $store->users()->update(['is_active' => true]);
        });

        AuditLogger::record('store_restored', [
            'store_id' => $store->id,
            'subject_type' => 'store',
            'subject_key' => $store->id,
            'meta' => ['name' => $store->name],
        ]);

        return response()->json([
            'store' => new StoreResource(
                $store->refresh()->load([
                    'license',
                    'users:id,store_id,name,email,phone,is_active,last_login_at',
                ])->loadCount([
                    'users',
                    'users as active_users_count' => fn ($q) => $q->where('is_active', true),
                ])
            ),
        ]);
    }

    public function grantTrial(Request $request, Store $store): JsonResponse
    {
        $data = $request->validate([
            'days' => ['nullable', 'integer', 'min:1', 'max:365'],
            'seats' => ['nullable', 'integer', 'min:1', 'max:200'],
        ]);

        $days = (int) ($data['days'] ?? config('billing.trial_days', 14));
        $seats = (int) ($data['seats'] ?? ($store->license?->seats() ?? 3));

        $this->licenses->startTrial($store, $request->user()?->id, $days, $seats);

        AuditLogger::record('trial_granted', [
            'store_id' => $store->id,
            'subject_type' => 'license',
            'subject_key' => $store->id,
            'meta' => ['days' => $days, 'seats' => $seats],
        ]);

        return response()->json([
            'store' => new StoreResource(
                $store->refresh()->load([
                    'license',
                    'users:id,store_id,name,email,phone,is_active,last_login_at',
                ])->loadCount([
                    'users',
                    'users as active_users_count' => fn ($q) => $q->where('is_active', true),
                ])
            ),
        ]);
    }

    public function updateLicense(Request $request, Store $store): JsonResponse
    {
        $data = $request->validate([
            'tier' => ['sometimes', 'in:pro,proplus'],
            'plan_code' => ['sometimes', 'nullable', 'string', 'max:40', 'exists:subscription_plans,code'],
            'plan_name' => ['sometimes', 'nullable', 'string', 'max:120'],
            'seats' => ['sometimes', 'integer', 'min:1', 'max:200'],
            'max_users' => ['sometimes', 'integer', 'min:1', 'max:200'],
            'is_lifetime' => ['sometimes', 'boolean'],
            'is_active' => ['sometimes', 'boolean'],
            'is_trial' => ['sometimes', 'boolean'],
            'starts_at' => ['nullable', 'date'],
            'expires_at' => ['nullable', 'date'],
            'days' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:3650'],
            'notes' => ['nullable', 'string', 'max:500'],
            'reason' => ['nullable', 'string', 'min:3', 'max:300'],
        ]);

        $existing = $store->license;
        $isLifetime = (bool) ($data['is_lifetime'] ?? $existing?->is_lifetime ?? false);

        $expiresAt = $data['expires_at'] ?? null;
        if ($expiresAt === null && array_key_exists('days', $data) && $data['days'] !== null && ! $isLifetime) {
            $days = (int) $data['days'];
            $expiresAt = $days > 0
                ? now()->addDays($days)->toIso8601String()
                : now()->subMinute()->toIso8601String();
        }
        if ($expiresAt === null && ! $isLifetime) {
            $expiresAt = $existing?->expires_at;
        }

        if (! $isLifetime && empty($expiresAt)) {
            throw ValidationException::withMessages([
                'expires_at' => ['برای لایسنس غیر مادام‌العمر، تاریخ انقضا الزامی است.'],
            ]);
        }

        $planCode = $data['plan_code'] ?? null;
        if ($planCode === null && ! empty($data['plan_name'])) {
            $matched = SubscriptionPlan::where('name', trim((string) $data['plan_name']))->first();
            $planCode = $matched?->code;
        }
        $planCode = $planCode ?? ($isLifetime ? 'lifetime' : $existing?->plan_code);

        $plan = $planCode !== null
            ? SubscriptionPlan::where('code', $planCode)->first()
            : null;

        $tier = $data['tier'] ?? $plan?->tier ?? $existing?->tier ?? 'proplus';
        $requestedSeats = $data['seats'] ?? $data['max_users'] ?? null;
        $seats = isset($requestedSeats) ? max(1, (int) $requestedSeats) : ($existing?->seats() ?? 1);

        $activeUsers = $store->users()->where('is_active', true)->count();
        if ($seats < $activeUsers) {
            throw ValidationException::withMessages([
                'seats' => ["تعداد کاربران فعال فعلی {$activeUsers} نفر است؛ سقف نمی‌تواند کمتر از آن باشد."],
            ]);
        }

        $isActive = (bool) ($data['is_active'] ?? $existing?->is_active ?? true);
        $isTrial = (bool) ($data['is_trial'] ?? $existing?->is_trial ?? false);
        $reason = trim((string) ($data['reason'] ?? $data['notes'] ?? 'ویرایش اشتراک توسط مدیر کل'));
        if (mb_strlen($reason) < 3) {
            $reason = 'ویرایش اشتراک توسط مدیر کل';
        }

        $license = $store->license()->updateOrCreate(
            [],
            [
                'tier' => $tier,
                'plan_code' => $planCode,
                'seats' => $seats,
                'status' => $isActive ? License::STATUS_ACTIVE : License::STATUS_SUSPENDED,
                'is_lifetime' => $isLifetime,
                'is_active' => $isActive,
                'is_trial' => $isTrial,
                'starts_at' => $data['starts_at'] ?? $existing?->starts_at ?? now(),
                'expires_at' => $isLifetime ? null : $expiresAt,
                'notes' => $data['notes'] ?? $existing?->notes,
                'created_by' => $request->user()?->id,
            ]
        );

        SubscriptionHistory::create([
            'store_id' => $store->id,
            'license_id' => $license->id,
            'action' => 'admin_license_updated',
            'reason' => $reason,
            'payload' => [
                'tier' => $license->tier,
                'plan_code' => $license->plan_code,
                'seats' => $license->seats,
                'is_lifetime' => (bool) $license->is_lifetime,
                'is_active' => (bool) $license->is_active,
                'expires_at' => $license->expires_at?->toIso8601String(),
            ],
            'actor_id' => $request->user()?->id,
            'created_at' => now(),
        ]);

        AuditLogger::record('admin_license_updated', [
            'store_id' => $store->id,
            'subject_type' => 'license',
            'subject_key' => $license->id,
            'meta' => [
                'reason' => $reason,
                'tier' => $license->tier,
                'plan_code' => $license->plan_code,
                'seats' => $license->seats,
                'is_lifetime' => $license->is_lifetime,
                'is_active' => $license->is_active,
                'expires_at' => $license->expires_at?->toIso8601String(),
            ],
        ]);

        return response()->json([
            'store' => new StoreResource(
                $store->load([
                    'license',
                    'users:id,store_id,name,email,phone,is_active,last_login_at',
                ])->loadCount([
                    'users',
                    'users as active_users_count' => fn ($q) => $q->where('is_active', true),
                ])
            ),
        ]);
    }

    /**
     * استخراج مشخصات لایسنس اولیه آژانس (پشتیبانی هم‌زمان از ساختار تودرتو و فیلدهای تخت
     * + فعال‌سازی خودکار اشتراک تا آژانس تازه‌ثبت‌شده بلافاصله اشتراک معتبر داشته باشد).
     *
     * @param  array<string, mixed>  $data
     * @return array{
     *   tier: string, plan_code: string, seats: int, is_lifetime: bool,
     *   is_active: bool, is_trial: bool, starts_at: mixed, expires_at: mixed, notes: string|null
     * }
     */
    private function resolveInitialLicenseSpec(array $data): array
    {
        $nested = is_array($data['license'] ?? null) ? $data['license'] : [];

        $requestedPlanCode = $nested['plan_code'] ?? $data['plan_code'] ?? null;
        if ($requestedPlanCode === null && ! empty($data['plan_name'])) {
            $byName = SubscriptionPlan::where('name', trim((string) $data['plan_name']))->first();
            $requestedPlanCode = $byName?->code;
        }

        $plan = $requestedPlanCode !== null
            ? SubscriptionPlan::where('code', strtolower(trim((string) $requestedPlanCode)))->first()
            : null;

        $isLifetime = (bool) ($nested['is_lifetime'] ?? $data['is_lifetime'] ?? $plan?->is_lifetime ?? false);

        if ($plan === null) {
            $defaultCode = $isLifetime ? 'lifetime' : 'yearly';
            $plan = SubscriptionPlan::where('code', $defaultCode)->first();
        }

        $planCode = $plan?->code ?? ($isLifetime ? 'lifetime' : 'yearly');
        $tier = (string) ($nested['tier'] ?? $plan?->tier ?? 'proplus');
        $seats = max(1, (int) ($nested['seats'] ?? $data['seats'] ?? $data['max_users'] ?? 3));
        $isActive = (bool) ($nested['is_active'] ?? true);
        $isTrial = (bool) ($nested['is_trial'] ?? false);
        $startsAt = $nested['starts_at'] ?? now();

        $days = (int) ($nested['days'] ?? $data['days'] ?? $plan?->duration_days ?? 365);
        $expiresAt = $isLifetime
            ? null
            : ($nested['expires_at'] ?? now()->addDays(max(1, $days)));

        $notes = $nested['notes'] ?? $data['admin_note'] ?? ($isLifetime ? 'اشتراک مادام‌العمر' : 'اشتراک فعال');

        return [
            'tier' => $tier,
            'plan_code' => $planCode,
            'seats' => $seats,
            'is_lifetime' => $isLifetime,
            'is_active' => $isActive,
            'is_trial' => $isTrial,
            'starts_at' => $startsAt,
            'expires_at' => $expiresAt,
            'notes' => $notes,
        ];
    }

    private function archiveStore(Store $store): JsonResponse
    {
        if ($store->archived_at === null) {
            DB::transaction(function () use ($store) {
                $store->forceFill([
                    'archived_at' => now(),
                    'is_active' => false,
                ])->save();

                $store->users()->update(['is_active' => false]);
            });

            AuditLogger::record('store_archived', [
                'store_id' => $store->id,
                'subject_type' => 'store',
                'subject_key' => $store->id,
                'meta' => ['name' => $store->name],
            ]);
        }

        return response()->json([
            'archived' => true,
            'store' => new StoreResource(
                $store->refresh()->load([
                    'license',
                    'users:id,store_id,name,email,phone,is_active,last_login_at',
                ])->loadCount([
                    'users',
                    'users as active_users_count' => fn ($q) => $q->where('is_active', true),
                ])
            ),
        ]);
    }

    private function purge(Request $request, Store $store): JsonResponse
    {
        if ($store->archived_at === null) {
            throw ValidationException::withMessages([
                'store' => ['ابتدا آژانس را آرشیو کنید؛ حذف دائمی مستقیم مجاز نیست.'],
            ]);
        }

        $data = $request->validate([
            'confirm_name' => ['required', 'string'],
        ]);

        if (trim($data['confirm_name']) !== $store->name) {
            throw ValidationException::withMessages([
                'confirm_name' => ['نام واردشده با نام آژانس مطابقت ندارد.'],
            ]);
        }

        $meta = ['name' => $store->name, 'slug' => $store->slug];
        $id = $store->id;

        DB::transaction(function () use ($store) {
            $store->users()->delete();
            $store->delete();
        });

        AuditLogger::record('store_purged', [
            'subject_type' => 'store',
            'subject_key' => $id,
            'meta' => $meta,
        ]);

        return response()->json(['purged' => true]);
    }

    private function normalizeIranPhone(?string $raw): ?string
    {
        if ($raw === null || trim($raw) === '') {
            return null;
        }

        $digits = strtr($raw, [
            '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4',
            '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
            '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4',
            '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
        ]);
        $digits = preg_replace('/\D+/', '', $digits) ?? '';

        if (str_starts_with($digits, '0098') && strlen($digits) === 14) {
            $digits = '0'.substr($digits, 4);
        } elseif (str_starts_with($digits, '98') && strlen($digits) === 12) {
            $digits = '0'.substr($digits, 2);
        } elseif (str_starts_with($digits, '9') && strlen($digits) === 10) {
            $digits = '0'.$digits;
        }

        return preg_match('/^09\d{9}$/', $digits) === 1 ? $digits : null;
    }

    private function uniqueSlug(string $name): string
    {
        $base = Str::slug($name) ?: 'store';
        $slug = $base;
        $i = 2;

        while (Store::where('slug', $slug)->exists()) {
            $slug = "{$base}-{$i}";
            $i++;
        }

        return $slug;
    }
}
