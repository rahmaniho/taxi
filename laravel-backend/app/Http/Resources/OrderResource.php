<?php

namespace App\Http\Resources;

use App\Models\Order;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Order
 */
class OrderResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $meta = is_array($this->meta) ? $this->meta : [];

        return [
            'id' => $this->id,
            'store_id' => $this->store_id,
            'store_name' => $this->whenLoaded('store', fn () => $this->store?->name),
            'user_email' => $this->whenLoaded('user', fn () => $this->user?->email),
            'plan' => $this->plan,
            'plan_label' => (string) ($meta['plan_label'] ?? $this->plan),
            'tier' => $this->tier,
            'type' => $this->type,
            'months' => $this->months,
            'seats' => (int) $this->seats,
            'extra_users' => (int) $this->extra_users,
            'base_monthly' => (int) $this->base_monthly,
            'extra_user_monthly' => (int) $this->extra_user_monthly,
            'subtotal' => (int) $this->subtotal,
            'discount' => (int) $this->discount,
            'coupon_code' => $this->coupon_code,
            'is_lifetime' => (bool) $this->is_lifetime,
            'amount' => $this->amount,
            'status' => $this->status,
            'gateway' => $this->gateway,
            'reference_id' => $this->reference_id,
            'paid_at' => $this->paid_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'instructions' => $meta['instructions'] ?? null,
            'invoice_number' => $this->whenLoaded('invoice', fn () => $this->invoice?->number),
            'invoice_voided' => $this->whenLoaded('invoice', fn () => (bool) $this->invoice?->voided_at),
            'voided_at' => $this->voided_at?->toIso8601String(),
            'void_reason' => $this->void_reason,
            'is_voided' => $this->isVoided(),
        ];
    }
}
