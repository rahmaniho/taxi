<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * خواندن دفتر رویدادها.
 *
 * - مدیر کل: همهٔ فروشگاه‌ها با فیلتر فروشگاه/نوع رویداد.
 * - کاربر فروشگاه: فقط رویدادهای فروشگاه خودش.
 */
class AuditController extends Controller
{
    /** رویدادهای همهٔ فروشگاه‌ها (فقط مدیر) — با فیلتر و صفحه‌بندی. */
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'limit' => ['nullable', 'integer', 'min:1', 'max:200'],
            'page' => ['nullable', 'integer', 'min:1', 'max:100000'],
            'store_id' => ['nullable', 'integer'],
            'action' => ['nullable', 'string', 'max:60'],
            'q' => ['nullable', 'string', 'max:120'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
        ]);

        $query = AuditLog::query()
            ->with(['user:id,name,email', 'store:id,name'])
            ->when($filters['store_id'] ?? null, fn ($q, $storeId) => $q->where('store_id', (int) $storeId))
            ->when($filters['action'] ?? null, fn ($q, $action) => $q->where('action', $action))
            ->when($filters['from'] ?? null, fn ($q, $from) => $q->where('created_at', '>=', $from))
            ->when($filters['to'] ?? null, fn ($q, $to) => $q->where('created_at', '<=', $to.' 23:59:59'))
            ->when($filters['q'] ?? null, function ($q, $term) {
                $like = '%'.$term.'%';
                $q->where(fn ($inner) => $inner
                    ->whereHas('user', fn ($user) => $user->where('name', 'like', $like)->orWhere('email', 'like', $like))
                    ->orWhereHas('store', fn ($store) => $store->where('name', 'like', $like))
                    ->orWhere('subject_key', 'like', $like));
            })
            ->orderByDesc('id');

        $page = $query->paginate((int) ($filters['limit'] ?? 25), ['*'], 'page', (int) ($filters['page'] ?? 1));

        return response()->json([
            'events' => $this->serialize(collect($page->items())),
            'meta' => [
                'page' => $page->currentPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
                'last_page' => $page->lastPage(),
            ],
        ]);
    }

    /** فهرست نوع رویدادها با تعداد — برای فیلتر پنل مدیریت. */
    public function actions(): JsonResponse
    {
        $actions = AuditLog::query()
            ->select('action', DB::raw('count(*) as total'))
            ->groupBy('action')
            ->orderByDesc('total')
            ->limit(80)
            ->get()
            ->map(fn ($row) => ['action' => (string) $row->action, 'total' => (int) $row->total])
            ->values()
            ->all();

        return response()->json(['actions' => $actions]);
    }

    /** رویدادهای فروشگاه خود کاربر. */
    public function mine(Request $request): JsonResponse
    {
        $limit = (int) $request->query('limit', 40);
        $limit = max(1, min(200, $limit));

        $events = AuditLog::query()
            ->with(['user:id,name,email', 'store:id,name'])
            ->where('store_id', (int) $request->user()->store_id)
            ->orderByDesc('id')
            ->limit($limit)
            ->get();

        return response()->json(['events' => $this->serialize($events)]);
    }

    /**
     * @param  \Illuminate\Support\Collection<int, AuditLog>  $events
     * @return list<array<string, mixed>>
     */
    private function serialize($events): array
    {
        return $events->map(fn (AuditLog $log) => [
            'id' => $log->id,
            'action' => $log->action,
            'storeId' => $log->store_id,
            'storeName' => $log->store?->name,
            'userName' => $log->user?->name,
            'userEmail' => $log->user?->email,
            'subjectType' => $log->subject_type,
            'subjectKey' => $log->subject_key,
            'meta' => $log->meta,
            'ip' => $log->ip,
            'createdAt' => $log->created_at?->toIso8601String(),
        ])->all();
    }
}
