<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AgencySyncState extends Model
{
    protected $fillable = [
        'store_id',
        'revision',
        'payload',
        'payload_hash',
        'payload_bytes',
        'records_count',
        'last_synced_by',
        'client_updated_at',
    ];

    protected function casts(): array
    {
        return [
            'revision' => 'integer',
            'payload_bytes' => 'integer',
            'records_count' => 'integer',
            'client_updated_at' => 'datetime',
        ];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function syncedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'last_synced_by');
    }
}
