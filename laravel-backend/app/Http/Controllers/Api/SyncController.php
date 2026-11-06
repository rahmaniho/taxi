<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AgencySyncState;
use App\Services\Sync\AgencySyncMergeService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class SyncController extends Controller
{
    public function __construct(private readonly AgencySyncMergeService $merger) {}

    /**
     * ایجاد خودکار جدول همگام‌سازی در هاست‌های اشتراکی فاقد SSH/Terminal در صورت اجرا نشدن مایگریشن جدید.
     */
    private function ensureSyncTableExists(): void
    {
        if (app()->runningUnitTests() || cache()->get('agency_sync_states_ready_v1') === true) {
            return;
        }

        if (! Schema::hasTable('agency_sync_states')) {
            Schema::create('agency_sync_states', function (Blueprint $table) {
                $table->id();
                $table->foreignId('store_id')->unique()->constrained('stores')->cascadeOnDelete();
                $table->unsignedBigInteger('revision')->default(1);
                $table->longText('payload');
                $table->string('payload_hash', 64);
                $table->unsignedInteger('payload_bytes')->default(0);
                $table->unsignedInteger('records_count')->default(0);
                $table->foreignId('last_synced_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('client_updated_at')->nullable();
                $table->timestamps();
            });
        }

        cache()->put('agency_sync_states_ready_v1', true, now()->addDays(30));
    }

    /**
     * دریافت آخرین تصویر داده‌های آژانس از سرور (حتی در زمان انقضای اشتراک برای حفظ دسترسی خواندن/پشتیبان‌گیری).
     */
    public function pull(Request $request): JsonResponse
    {
        $user = $request->user();
        $storeId = (int) ($user?->store_id ?? 0);
        abort_if($storeId <= 0, 403, 'این مسیر ویژهٔ حساب آژانس است.');

        $this->ensureSyncTableExists();

        $state = AgencySyncState::where('store_id', $storeId)->first();
        if (! $state) {
            return response()->json([
                'ok' => true,
                'empty' => true,
                'unchanged' => false,
                'revision' => 0,
                'synced_at' => null,
                'records_count' => 0,
                'data' => null,
            ])->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        }

        $sinceRevision = $request->query('since_revision');
        if ($sinceRevision !== null && (int) $sinceRevision === (int) $state->revision) {
            return response()->json([
                'ok' => true,
                'empty' => false,
                'unchanged' => true,
                'revision' => $state->revision,
                'synced_at' => $state->updated_at?->toIso8601String(),
                'records_count' => $state->records_count,
            ])->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        }

        return response()->json([
            'ok' => true,
            'empty' => false,
            'unchanged' => false,
            'revision' => $state->revision,
            'synced_at' => $state->updated_at?->toIso8601String(),
            'records_count' => $state->records_count,
            'data' => json_decode($state->payload, true),
        ])->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    }

    /**
     * دریافت تغییرات آفلاین/آنلاین دستگاه، ادغام اتمی با دادهٔ سرور و بازگرداندن تصویر یکپارچه.
     */
    public function push(Request $request): JsonResponse
    {
        $user = $request->user()->loadMissing('store.license');
        $store = $user?->store;
        abort_if(! $store || ! $store->is_active || $store->isArchived(), 403, 'حساب آژانس غیرفعال است.');

        $license = $store->license;
        if (! $license || ! $license->isCurrentlyValid()) {
            return response()->json([
                'message' => 'اعتبار اشتراک به پایان رسیده است؛ ذخیرهٔ تغییرات جدید روی سرور تا زمان تمدید متوقف است.',
                'code' => 'subscription_expired',
            ], 403);
        }

        $this->ensureSyncTableExists();

        $validated = $request->validate([
            'base_revision' => ['nullable', 'integer', 'min:0'],
            'data' => ['required', 'array'],
        ]);

        $rawIncoming = json_encode($validated['data'], JSON_UNESCAPED_UNICODE);
        if ($rawIncoming === false || strlen($rawIncoming) > 10 * 1024 * 1024) {
            return response()->json([
                'message' => 'حجم بستهٔ همگام‌سازی بیش از حد مجاز (۱۰ مگابایت) است.',
            ], 422);
        }

        /** @var AgencySyncState $saved */
        [$saved, $mergedData] = DB::transaction(function () use ($store, $user, $validated) {
            $existing = AgencySyncState::where('store_id', $store->id)->lockForUpdate()->first();
            $serverPayload = $existing ? json_decode($existing->payload, true) : null;

            $result = $this->merger->merge(
                is_array($serverPayload) ? $serverPayload : null,
                $validated['data'],
            );

            $encoded = json_encode($result['merged'], JSON_UNESCAPED_UNICODE);
            $hash = hash('sha256', (string) $encoded);

            if ($existing && $existing->payload_hash === $hash) {
                $existing->touch();

                return [$existing->fresh(), $result['merged']];
            }

            $nextRevision = $existing ? ((int) $existing->revision + 1) : 1;
            $record = AgencySyncState::updateOrCreate(
                ['store_id' => $store->id],
                [
                    'revision' => $nextRevision,
                    'payload' => (string) $encoded,
                    'payload_hash' => $hash,
                    'payload_bytes' => strlen((string) $encoded),
                    'records_count' => $result['records_count'],
                    'last_synced_by' => $user->id,
                    'client_updated_at' => now(),
                ],
            );

            return [$record, $result['merged']];
        });

        return response()->json([
            'ok' => true,
            'revision' => $saved->revision,
            'synced_at' => $saved->updated_at?->toIso8601String(),
            'records_count' => $saved->records_count,
            'data' => $mergedData,
        ]);
    }
}
