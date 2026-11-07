<?php

namespace App\Http\Resources;

use App\Models\License;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin License
 */
class LicenseResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $isLifetime = (bool) $this->is_lifetime;

        return [
            'id' => $this->id,
            'store_id' => $this->store_id,
            'tier' => $this->tier,
            'plan_code' => $this->plan_code,
            'plan_name' => $this->planLabel(),
            'seats' => $this->seats(),
            'max_users' => $this->seats(),
            'is_lifetime' => $isLifetime,
            'is_active' => (bool) $this->is_active,
            'is_trial' => (bool) $this->is_trial,
            'status' => $this->effectiveStatus(),
            'starts_at' => $this->starts_at?->toIso8601String(),
            'expires_at' => $isLifetime ? null : $this->expires_at?->toIso8601String(),
            'notes' => $this->notes,
            'is_valid' => $this->isCurrentlyValid(),
            'is_expired' => $this->isExpired(),
            'days_remaining' => $this->daysRemaining(),
        ];
    }
}
