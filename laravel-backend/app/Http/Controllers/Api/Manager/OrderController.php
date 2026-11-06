<?php

namespace App\Http\Controllers\Api\Manager;

use App\Http\Controllers\Controller;
use App\Http\Resources\OrderResource;
use App\Models\Order;
use App\Services\Billing\CheckoutService;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * مرور سفارش‌ها، تأیید پرداخت دستی و ابطال پرداخت — فقط مدیر کل.
 *
 * قاعدهٔ پول: تأیید دستی بدون «شمارهٔ پیگیری بانکی» انجام نمی‌شود و تأیید/ابطال
 * هر دو در دفتر رویدادها با دلیل ثبت می‌شوند. ابطال، رکورد را حذف نمی‌کند.
 */
class OrderController extends Controller
{
    public function __construct(private readonly CheckoutService $checkout) {}

    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'status' => ['nullable', 'in:pending,paid,failed,canceled,voided'],
            'store_id' => ['nullable', 'integer'],
            'q' => ['nullable', 'string', 'max:120'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:200'],
            'page' => ['nullable', 'integer', 'min:1', 'max:100000'],
            'sort' => ['nullable', 'in:created_at,-created_at,amount,-amount,paid_at,-paid_at'],
        ]);

        $perPage = (int) ($filters['limit'] ?? 20);
        $sort = $filters['sort'] ?? '-created_at';
        $column = ltrim($sort, '-');
        $direction = str_starts_with($sort, '-') ? 'desc' : 'asc';

        $query = Order::query()
            ->with(['store:id,name', 'invoice:id,order_id,number'])
            ->when($filters['status'] ?? null, fn ($q, $status) => $q->where('status', $status))
            ->when($filters['store_id'] ?? null, fn ($q, $storeId) => $q->where('store_id', (int) $storeId))
            ->when($filters['q'] ?? null, function ($q, $term) {
                $like = '%'.$term.'%';
                $q->where(function ($inner) use ($like) {
                    $inner->where('reference_id', 'like', $like)
                        ->orWhere('coupon_code', 'like', $like)
                        ->orWhereHas('store', fn ($store) => $store->where('name', 'like', $like));
                });
            })
            ->orderBy($column, $direction);

        $page = $query->paginate($perPage, ['*'], 'page', (int) ($filters['page'] ?? 1));

        return response()->json([
            'orders' => OrderResource::collection($page->items()),
            'meta' => [
                'page' => $page->currentPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
                'last_page' => $page->lastPage(),
            ],
            'totals' => [
                'pending' => Order::query()->where('status', Order::STATUS_PENDING)->count(),
                'pending_amount' => (int) Order::query()->where('status', Order::STATUS_PENDING)->sum('amount'),
                'paid_this_month' => Order::query()
                    ->where('status', Order::STATUS_PAID)
                    ->where('paid_at', '>=', now()->startOfMonth())
                    ->count(),
                'revenue_this_month' => (int) Order::query()
                    ->where('status', Order::STATUS_PAID)
                    ->where('paid_at', '>=', now()->startOfMonth())
                    ->sum('amount'),
            ],
        ]);
    }

    /**
     * تأیید پرداخت دستی (کارت‌به‌کارت) — شمارهٔ پیگیری اجباری است.
     *
     * @throws ValidationException
     */
    public function approve(Request $request, Order $order): JsonResponse
    {
        if (! $order->isPending()) {
            throw ValidationException::withMessages([
                'order' => ['این سفارش در وضعیت انتظار نیست.'],
            ]);
        }

        $data = $request->validate([
            'reference' => ['required', 'string', 'min:3', 'max:120'],
            'note' => ['nullable', 'string', 'max:300'],
        ], [
            'reference.required' => 'شمارهٔ پیگیری بانکی برای تأیید پرداخت الزامی است.',
        ]);

        $paid = $this->checkout->complete($order, $data['reference']);

        AuditLogger::record('order_manually_approved', [
            'store_id' => $paid->store_id,
            'subject_type' => 'order',
            'subject_key' => $paid->id,
            'meta' => [
                'reference' => $data['reference'],
                'note' => $data['note'] ?? null,
                'amount' => (int) $paid->amount,
                'actor_id' => $request->user()?->id,
            ],
        ]);

        return response()->json([
            'order' => new OrderResource($paid->load('store:id,name', 'invoice')),
        ]);
    }

    /**
     * ابطال پرداخت تأییدشده با دلیل (بدون حذف رکورد و بدون قطع خودکار اشتراک).
     *
     * @throws ValidationException|\Throwable
     */
    public function void(Request $request, Order $order): JsonResponse
    {
        $data = $request->validate([
            'reason' => ['required', 'string', 'min:3', 'max:300'],
        ], [
            'reason.required' => 'دلیل ابطال پرداخت الزامی است.',
        ]);

        $voided = $this->checkout->voidOrder($order, (string) $data['reason'], $request->user());

        return response()->json([
            'order' => new OrderResource($voided->load('store:id,name', 'invoice')),
        ]);
    }

    public function reject(Request $request, Order $order): JsonResponse
    {
        $data = $request->validate([
            'reason' => ['required', 'string', 'min:3', 'max:300'],
        ], [
            'reason.required' => 'دلیل رد سفارش الزامی است.',
        ]);

        $canceled = $this->checkout->cancel($order, (string) $data['reason']);

        return response()->json(['order' => new OrderResource($canceled->load('store:id,name', 'invoice'))]);
    }
}
