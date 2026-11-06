<?php

namespace App\Http\Controllers\Api\Manager;

use App\Http\Controllers\Controller;
use App\Http\Resources\StoreResource;
use App\Models\Store;
use App\Models\User;
use App\Services\Billing\LicenseService;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * مدیریت فروشگاه‌ها و لایسنس آن‌ها — فقط برای مدیر کل.
 *
 * سیاست داده: حذف پیش‌فرض «آرشیو» است و هیچ دادهٔ مالی/حسابداری را پاک نمی‌کند.
 * حذف دائمی فقط برای فروشگاه آرشیوشده و با تایپ نام فروشگاه انجام می‌شود.
 */
class StoreController extends Controller
{
    public function __construct(private readonly LicenseService $licenses) {}

    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:120'],
            'status' => ['nullable', 'in:active,archived,all'],
            'plan_code' => ['nullable', 'string', 'max:40'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1', 'max:100000'],
            'sort' => ['nullable', 'in:created_at,-created_at,name,-name'],
        ]);

        $status = $filters['status'] ?? 'active';
        $sort = $filters['sort'] ?? '-created_at';
        $column = ltrim($sort, '-');
        $direction = str_starts_with($sort, '-') ? 'desc' : 'asc';

        $query = Store::query()
            ->with('license')
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
                        ->orWhereHas('users', fn ($user) => $user->where('email', 'like', $like));
                });
            })
            ->when($filters['plan_code'] ?? null, fn ($q, $plan) => $q->whereHas('license', fn ($l) => $l->where('plan_code', $plan)))
            ->orderBy($column, $direction);

        $page = $query->paginate((int) ($filters['limit'] ?? 12), ['*'], 'page', (int) ($filters['page'] ?? 1));

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
                'active_licenses' => Store::query()->whereNull('archived_at')
                    ->whereHas('license', fn ($q) => $q->where('is_active', true)
                        ->where(fn ($inner) => $inner->where('is_lifetime', true)->orWhere('expires_at', '>', now())))
                    ->count(),
            ],
        ]);
    }

    public function show(Store $store): JsonResponse
    {
        $store->load('license')->loadCount(['users', 'users as active_users_count' => fn ($q) => $q->where('is_active', true)]);

        return response()->json(['store' => new StoreResource($store)]);
    }

    /**
     * @throws Throwable
     */
    public function store(Request $request): JsonResponse
    {
        $data = $this->validatePayload($request);

        $store = DB::transaction(function () use ($data, $request) {
            $store = Store::create([
                'name' => $data['name'],
                'slug' => $this->uniqueSlug($data['name']),
                'owner_name' => $data['owner_name'] ?? null,
                'phone' => $data['phone'] ?? null,
                'address' => $data['address'] ?? null,
                'is_active' => $data['is_active'] ?? true,
            ]);

            User::create([
                'name' => ($data['owner_name'] ?? null) ?: $data['name'],
                'email' => $data['email'],
                'password' => $data['password'],
                'role' => User::ROLE_STORE,
                'store_id' => $store->id,
                'is_active' => true,
            ]);

            if (! empty($data['license'])) {
                $this->licenses->adminOverride(
                    $store->refresh(),
                    $data['license'],
                    $request->user(),
                    (string) ($data['license']['reason'] ?? 'ایجاد اشتراک توسط مدیر'),
                    'license.',
                );
            }

            return $store;
        });

        $store->load('license')->loadCount(['users', 'users as active_users_count' => fn ($q) => $q->where('is_active', true)]);

        AuditLogger::record('store_created', [
            'store_id' => $store->id,
            'subject_type' => 'store',
            'subject_key' => $store->id,
            'meta' => ['name' => $store->name, 'email' => $data['email']],
        ]);

        return response()->json(['store' => new StoreResource($store)], 201);
    }

    /**
     * @throws Throwable
     */
    public function update(Request $request, Store $store): JsonResponse
    {
        $data = $this->validatePayload($request, $store);

        DB::transaction(function () use ($data, $store, $request) {
            $store->update(array_filter([
                'name' => $data['name'],
                'owner_name' => $data['owner_name'] ?? null,
                'phone' => $data['phone'] ?? null,
                'address' => $data['address'] ?? null,
                'is_active' => $data['is_active'] ?? $store->is_active,
            ], fn ($value) => $value !== null));

            $user = $store->users()->orderBy('id')->first();

            if ($user) {
                $fields = [];

                if (! empty($data['email'])) {
                    $fields['email'] = $data['email'];
                }

                if (! empty($data['password'])) {
                    $fields['password'] = $data['password'];
                }

                if (array_key_exists('owner_name', $data) && $data['owner_name']) {
                    $fields['name'] = $data['owner_name'];
                }

                $user->update($fields);
            }

            if (isset($data['license']) && is_array($data['license'])) {
                $this->licenses->adminOverride(
                    $store,
                    $data['license'],
                    $request->user(),
                    (string) ($data['license']['reason'] ?? 'ویرایش لایسنس توسط مدیر'),
                    'license.',
                );
            }
        });

        $store->refresh()->load('license')->loadCount(['users', 'users as active_users_count' => fn ($q) => $q->where('is_active', true)]);

        AuditLogger::record('store_updated', [
            'store_id' => $store->id,
            'subject_type' => 'store',
            'subject_key' => $store->id,
            'meta' => ['name' => $store->name, 'is_active' => $store->is_active],
        ]);

        return response()->json(['store' => new StoreResource($store)]);
    }

    /**
     * آرشیو پیش‌فرض (حفظ داده) و حذف دائمی فقط با تأیید نام فروشگاه.
     *
     * @throws Throwable
     */
    public function destroy(Request $request, Store $store): JsonResponse
    {
        $data = $request->validate([
            'mode' => ['nullable', 'in:archive,purge'],
            'confirm_name' => ['nullable', 'string', 'max:120'],
            'reason' => ['nullable', 'string', 'max:300'],
        ]);

        $mode = $data['mode'] ?? 'archive';

        if ($mode === 'purge') {
            if ($store->archived_at === null) {
                throw ValidationException::withMessages([
                    'mode' => ['حذف دائمی فقط برای فروشگاه آرشیوشده ممکن است؛ ابتدا آرشیو کنید.'],
                ]);
            }

            if (($data['confirm_name'] ?? null) !== $store->name) {
                throw ValidationException::withMessages([
                    'confirm_name' => ['برای حذف دائمی، نام فروشگاه را دقیقاً تایپ کنید.'],
                ]);
            }

            $snapshot = ['store_id' => $store->id, 'name' => $store->name];

            DB::transaction(function () use ($store) {
                User::where('store_id', $store->id)->update(['is_active' => false]);
                $store->delete();
            });

            AuditLogger::record('store_purged', [
                'store_id' => null,
                'subject_type' => 'store',
                'subject_key' => $snapshot['store_id'],
                'meta' => [...$snapshot, 'reason' => $data['reason'] ?? null],
            ]);

            return response()->json(['purged' => true]);
        }

        $store->forceFill(['archived_at' => now(), 'is_active' => false])->save();

        AuditLogger::record('store_archived', [
            'store_id' => $store->id,
            'subject_type' => 'store',
            'subject_key' => $store->id,
            'meta' => ['name' => $store->name, 'reason' => $data['reason'] ?? null],
        ]);

        return response()->json(['archived' => true, 'store' => new StoreResource($store->load('license'))]);
    }

    /** بازگرداندن فروشگاه آرشیوشده به حالت فعال. */
    public function restore(Store $store): JsonResponse
    {
        if ($store->archived_at !== null) {
            $store->forceFill(['archived_at' => null, 'is_active' => true])->save();

            AuditLogger::record('store_restored', [
                'store_id' => $store->id,
                'subject_type' => 'store',
                'subject_key' => $store->id,
                'meta' => ['name' => $store->name],
            ]);
        }

        return response()->json([
            'store' => new StoreResource(
                $store->refresh()->load('license')->loadCount(['users', 'users as active_users_count' => fn ($q) => $q->where('is_active', true)]),
            ),
        ]);
    }

    /**
     * تغییر مستقل لایسنس (بدون ویرایش اطلاعات فروشگاه).
     *
     * @throws Throwable
     */
    public function updateLicense(Request $request, Store $store): JsonResponse
    {
        $data = $request->validate([...$this->licenseRules(), 'reason' => ['required', 'string', 'min:3', 'max:300']]);

        $reason = (string) $data['reason'];
        unset($data['reason']);

        $this->licenses->adminOverride($store, $data, $request->user(), $reason);

        return response()->json([
            'store' => new StoreResource(
                $store->refresh()->load('license')->loadCount(['users', 'users as active_users_count' => fn ($q) => $q->where('is_active', true)]),
            ),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function validatePayload(Request $request, ?Store $store = null): array
    {
        $existingUser = $store?->users()->orderBy('id')->first();

        $rules = [
            'name' => ['required', 'string', 'max:120'],
            'owner_name' => ['nullable', 'string', 'max:120'],
            'phone' => ['nullable', 'string', 'max:30'],
            'address' => ['nullable', 'string', 'max:1000'],
            'is_active' => ['sometimes', 'boolean'],
            'email' => [
                $store ? 'sometimes' : 'required', 'string', 'email', 'max:190',
                Rule::unique('users', 'email')->ignore($existingUser?->id),
            ],
            'password' => [$store ? 'nullable' : 'required', 'string', 'min:8', 'max:190'],
            'license' => ['sometimes', 'nullable', 'array'],
            'license.tier' => ['nullable', 'in:pro,proplus'],
            'license.plan_code' => ['nullable', 'string', 'max:40', 'exists:subscription_plans,code'],
            'license.seats' => ['nullable', 'integer', 'min:1', 'max:200'],
            'license.is_lifetime' => ['sometimes', 'boolean'],
            'license.is_active' => ['sometimes', 'boolean'],
            'license.starts_at' => ['nullable', 'date'],
            'license.expires_at' => ['nullable', 'date'],
            'license.notes' => ['nullable', 'string', 'max:1000'],
            'license.reason' => ['nullable', 'string', 'max:300'],
        ];

        return $request->validate($rules);
    }

    /**
     * @return array<string, list<string>>
     */
    private function licenseRules(): array
    {
        return [
            'tier' => ['nullable', 'in:pro,proplus'],
            'plan_code' => ['nullable', 'string', 'max:40', 'exists:subscription_plans,code'],
            'seats' => ['nullable', 'integer', 'min:1', 'max:200'],
            'is_lifetime' => ['sometimes', 'boolean'],
            'is_active' => ['sometimes', 'boolean'],
            'starts_at' => ['nullable', 'date'],
            'expires_at' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ];
    }

    private function uniqueSlug(string $name): string
    {
        $base = Str::slug(Str::ascii($name));

        if ($base === '') {
            $base = 'store';
        }

        $slug = $base;
        $suffix = 1;

        while (Store::where('slug', $slug)->exists()) {
            $slug = $base.'-'.(++$suffix);
        }

        return $slug;
    }
}
