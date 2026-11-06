<?php

namespace App\Http\Resources;

use App\Models\Store;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Store
 */
class StoreResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'owner_name' => $this->owner_name,
            'phone' => $this->phone,
            'address' => $this->address,
            'is_active' => (bool) $this->is_active,
            'archived_at' => $this->archived_at?->toIso8601String(),
            'is_archived' => $this->archived_at !== null,
            'users_count' => $this->whenCounted('users'),
            'active_users_count' => $this->whenCounted('active_users_count'),
            'license' => $this->whenLoaded('license', fn () => $this->license
                ? new LicenseResource($this->license)
                : null),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
