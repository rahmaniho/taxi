<?php

namespace App\Http\Controllers\Api\Manager;

use App\Http\Controllers\Controller;
use App\Models\SubscriptionCoupon;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * کدهای تخفیف — درصدی یا مبلغ ثابت، با بازهٔ زمانی، سقف استفاده و محدودیت پلن.
 */
class CouponController extends Controller
{
    public function index(): JsonResponse
    {
        $coupons = SubscriptionCoupon::query()->orderByDesc('id')->limit(100)->get();

        return response()->json([
            'coupons' => $coupons->map(fn (SubscriptionCoupon $coupon) => $this->serialize($coupon))->values()->all(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validatePayload($request);
        $coupon = SubscriptionCoupon::create([
            ...$data,
            'code' => mb_strtoupper($data['code']),
            'used_count' => 0,
        ]);

        AuditLogger::record('coupon_created', [
            'subject_type' => 'coupon',
            'subject_key' => $coupon->code,
            'meta' => ['type' => $coupon->type, 'value' => $coupon->value],
        ]);

        return response()->json(['coupon' => $this->serialize($coupon)], 201);
    }

    public function update(Request $request, SubscriptionCoupon $coupon): JsonResponse
    {
        $data = $this->validatePayload($request, true, $coupon->id);

        if (isset($data['code'])) {
            $data['code'] = mb_strtoupper($data['code']);
        }

        $coupon->fill($data)->save();

        AuditLogger::record('coupon_updated', [
            'subject_type' => 'coupon',
            'subject_key' => $coupon->code,
            'meta' => ['type' => $coupon->type, 'value' => $coupon->value, 'is_active' => $coupon->is_active],
        ]);

        return response()->json(['coupon' => $this->serialize($coupon->refresh())]);
    }

    public function destroy(SubscriptionCoupon $coupon): JsonResponse
    {
        AuditLogger::record('coupon_deleted', [
            'subject_type' => 'coupon',
            'subject_key' => $coupon->code,
        ]);

        $coupon->delete();

        return response()->json(['ok' => true]);
    }

    /**
     * @return array<string, mixed>
     */
    private function validatePayload(Request $request, bool $partial = false, ?int $ignoreId = null): array
    {
        $required = $partial ? 'sometimes' : 'required';

        $data = $request->validate([
            'code' => [
                $required, 'string', 'max:40', 'regex:/^[A-Za-z0-9_-]+$/',
                \Illuminate\Validation\Rule::unique('subscription_coupons', 'code')->ignore($ignoreId),
            ],
            'type' => [$required, 'in:percent,fixed'],
            'value' => [$required, 'integer', 'min:1', 'max:1000000000'],
            'plan_code' => ['sometimes', 'nullable', 'string', 'max:40', 'exists:subscription_plans,code'],
            'starts_at' => ['sometimes', 'nullable', 'date'],
            'ends_at' => ['sometimes', 'nullable', 'date', 'after_or_equal:starts_at'],
            'max_uses' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:100000'],
            'is_active' => ['sometimes', 'boolean'],
            'description' => ['sometimes', 'nullable', 'string', 'max:300'],
        ], [
            'code.regex' => 'کد تخفیف فقط می‌تواند شامل حروف لاتین، عدد، خط تیره و زیرخط باشد.',
            'ends_at.after_or_equal' => 'تاریخ پایان باید بعد از تاریخ شروع باشد.',
        ]);

        if (($data['type'] ?? null) === 'percent' && isset($data['value']) && (int) $data['value'] > 100) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'value' => ['درصد تخفیف نمی‌تواند بیشتر از ۱۰۰ باشد.'],
            ]);
        }

        return $data;
    }

    /**
     * @return array<string, mixed>
     */
    private function serialize(SubscriptionCoupon $coupon): array
    {
        return [
            'id' => $coupon->id,
            'code' => $coupon->code,
            'type' => $coupon->type,
            'value' => (int) $coupon->value,
            'plan_code' => $coupon->plan_code,
            'starts_at' => $coupon->starts_at?->toIso8601String(),
            'ends_at' => $coupon->ends_at?->toIso8601String(),
            'max_uses' => $coupon->max_uses,
            'used_count' => (int) $coupon->used_count,
            'is_active' => (bool) $coupon->is_active,
            'description' => $coupon->description,
            'is_usable' => $coupon->isUsableAt(null),
        ];
    }
}
