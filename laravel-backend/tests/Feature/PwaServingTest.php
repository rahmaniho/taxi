<?php

use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('serves the offline-first Taxi PWA HTML at root', function () {
    $this->get('/')
        ->assertOk()
        ->assertHeader('Content-Type', 'text/html; charset=utf-8')
        ->assertSee('id="app-root"', false);
});

it('exposes a CSRF endpoint for cached PWA clients', function () {
    $response = $this->getJson('/api/csrf')->assertOk();

    expect($response->json('ok'))->toBeTrue()
        ->and($response->json('csrf_token'))->toBeString()->not->toBeEmpty();
});

it('does not expose operational data sync endpoints on the server', function () {
    $this->getJson('/api/sync/pull')->assertNotFound();
    $this->postJson('/api/sync/push', [])->assertNotFound();
});
