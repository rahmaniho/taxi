<?php

namespace Database\Factories;

use App\Models\License;
use App\Models\Store;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<License>
 */
class LicenseFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'store_id' => Store::factory(),
            'tier' => 'pro',
            'is_lifetime' => true,
            'is_active' => true,
            'starts_at' => now(),
            'expires_at' => null,
            'notes' => null,
        ];
    }

    public function expiringSoon(): static
    {
        return $this->state(fn (array $attributes) => [
            'is_lifetime' => false,
            'expires_at' => now()->addDays(10),
        ]);
    }

    public function expired(): static
    {
        return $this->state(fn (array $attributes) => [
            'is_lifetime' => false,
            'expires_at' => now()->subDay(),
        ]);
    }

    public function inactive(): static
    {
        return $this->state(fn (array $attributes) => [
            'is_active' => false,
        ]);
    }
}
