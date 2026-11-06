<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
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

    public function down(): void
    {
        Schema::dropIfExists('agency_sync_states');
    }
};
