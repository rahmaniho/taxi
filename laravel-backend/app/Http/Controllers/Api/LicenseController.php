<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\LicenseResource;
use App\Models\License;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LicenseController extends Controller
{
    /** لایسنس فروشگاه کاربر جاری. */
    public function show(Request $request): JsonResponse
    {
        $user = $request->user();

        $license = $user->store_id
            ? License::where('store_id', $user->store_id)->first()
            : null;

        return response()->json([
            'license' => $license ? new LicenseResource($license) : null,
        ]);
    }
}
