<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureStoreUser
{
    /**
     * مسیرهای داده فقط برای کاربر متصل به یک فروشگاه فعال در دسترس است.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user || ! $user->isStore() || $user->store_id === null) {
            abort(403, 'این حساب به هیچ فروشگاهی وصل نیست.');
        }

        if (! $user->store || ! $user->store->is_active) {
            abort(403, 'فروشگاه این حساب غیرفعال است.');
        }

        return $next($request);
    }
}
