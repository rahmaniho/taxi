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
        return [
            'id' => $this->id,
            'store_id' => $this->store_id,
            'tier' => $this->tier,
            'plan_code' => $this->plan_code,
            'seats' => $this->seats(),
            'is_lifetime' => (bool) $this->is_lifetime,
            'is_active' => (bool) $this->is_active,
            'is_trial' => (bool) $this->is_trial,
            'status' => $this->effectiveStatus(),
            'starts_at' => $this->starts_at?->toIso8601String(),
            'expires_at' => $this->expires_at?->toIso8601String(),
            'notes' => $this->notes,
            'is_valid' => $this->isCurrentlyValid(),
            'is_expired' => $this->isExpired(),
            'days_remaining' => $this->daysRemaining(),
        ];
    }
}
