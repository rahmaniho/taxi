<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureManager
{
    /**
     * تنها حساب مدیر کل اجازه‌ی دسترسی به مسیرهای مدیریتی را دارد.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user || ! $user->isManager()) {
            abort(403, 'دسترسی به این بخش فقط برای مدیر مجاز است.');
        }

        return $next($request);
    }
}
