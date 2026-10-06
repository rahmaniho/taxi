/* ==========================================================================
 * sw.js — سرویس‌ورکر واقعی سامانهٔ تاکسی تلفنی (PWA)
 * --------------------------------------------------------------------------
 * دلایل تصمیم‌های این فایل (شرح کامل در CHANGELOG):
 *   • نسخهٔ نمایشی یک Service Worker جعلی با Blob می‌ساخت که در iOS/اندروید
 *     کار نمی‌کرد و برنامه نصب نمی‌شد. اینجا فایل واقعی و کش‌پذیر است.
 *   • راهبرد‌ها:
 *       - HTML (ناوبری): Network-First با Fallback به کش → همیشه آخرین نسخه،
 *         ولی آفلاین‌پذیر.
 *       - فونت/آیکون/تصویر: Cache-First (تغییرناپذیرند).
 *       - CSS/JS ماژول‌ها: Stale-While-Revalidate (سرعت بالا + به‌روزرسانی آرام).
 *   • همهٔ مسیرها نسبی‌اند تا برنامه هم در ریشه و هم در زیرپوشه (legacy/) کار کند.
 * ========================================================================== */

const CACHE_VERSION = 'taxi-v5.0.1';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const FONT_CACHE = `${CACHE_VERSION}-fonts`;

/** پیش‌بارگذاری پوستهٔ برنامه */
const PRECACHE = [
    './taxi.html',
    './manifest.json',
    './css/main.css',
    './css/print.css',
    './js/app.js',
    './js/db.js',
    './js/auth.js',
    './js/utils.js',
    './js/strings.js',
    './js/jalali.js',
    './js/domain.js',
    './js/prints.js',
    './js/components/icons.js',
    './js/components/toast.js',
    './js/components/modal.js',
    './js/components/table.js',
    './js/components/form.js',
    './js/components/chart.js',
    './js/components/ui.js',
    './js/pages/dashboard.js',
    './js/pages/queue.js',
    './js/pages/trips.js',
    './js/pages/drivers.js',
    './js/pages/addresses.js',
    './js/pages/subscribers.js',
    './js/pages/accounting.js',
    './js/pages/reports.js',
    './js/pages/audit.js',
    './js/pages/settings.js',
    './js/pages/operators.js',
    './js/pages/backup.js',
    './js/pages/training.js',
    './js/pages/about.js',
    './icons/favicon.svg',
    './icons/favicon-32.png',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/apple-touch-icon.png',
    './fonts/BNazanin.woff2',
    './fonts/BTitrBold.woff2',
    './fonts/BLotus.woff2',
    './fonts/BCompset.woff2'
];

/* ------------------------------ نصب: پیش‌کش ------------------------------ */
self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(SHELL_CACHE);
        /* هر فایل جداگانه اضافه می‌شود تا نبودِ یک فایل، نصب را خراب نکند */
        await Promise.all(PRECACHE.map(async (url) => {
            try {
                await cache.add(new Request(url, { cache: 'reload' }));
            } catch (e) {
                console.warn('[SW] precache skip:', url);
            }
        }));
        await self.skipWaiting();
    })());
});

/* ------------------------------ فعال‌سازی: پاک‌سازی کش قدیمی ------------------------------ */
self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys
            .filter((k) => !k.startsWith(CACHE_VERSION))
            .map((k) => caches.delete(k)));
        if (self.registration.navigationPreload) {
            try { await self.registration.navigationPreload.disable(); } catch (e) { /* اختیاری */ }
        }
        await self.clients.claim();
    })());
});

/* ------------------------------ ابزارها ------------------------------ */
function isNavigation(request) {
    return request.mode === 'navigate' ||
        (request.method === 'GET' && (request.headers.get('accept') || '').includes('text/html'));
}

function isFontOrImage(url) {
    return /\.(?:woff2?|ttf|otf|eot|png|jpe?g|gif|svg|webp|ico)$/i.test(url.pathname);
}

function isStyleOrScript(url) {
    return /\.(?:css|js|mjs)$/i.test(url.pathname);
}

/** Cache-First: برای منابع تغییرناپذیر */
async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request, { ignoreSearch: false });
    if (cached) return cached;
    try {
        const res = await fetch(request);
        if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
        return res;
    } catch (e) {
        if (cached) return cached;
        return new Response('', { status: 504, statusText: 'Offline' });
    }
}

/** Stale-While-Revalidate: سرعت بالا و به‌روزرسانی پس‌زمینه */
async function staleWhileRevalidate(request) {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(request);
    const network = fetch(request).then((res) => {
        if (res && res.ok) cache.put(request, res.clone());
        return res;
    }).catch(() => null);
    return cached || (await network) || new Response('', { status: 504, statusText: 'Offline' });
}

/** Network-First: برای HTML؛ در قطعی شبکه از کش استفاده می‌کند */
async function networkFirst(request) {
    const cache = await caches.open(SHELL_CACHE);
    try {
        const res = await fetch(request);
        if (res && res.ok) cache.put(request, res.clone());
        return res;
    } catch (e) {
        const cached = await cache.match(request) ||
            await cache.match('./taxi.html') ||
            await cache.match('taxi.html');
        if (cached) return cached;
        return new Response(
            `<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>آفلاین</title></head>
             <body style="font-family:Tahoma,sans-serif;background:#0a0e27;color:#f1f5f9;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center">
             <div><h2 style="color:#D4AF37">برنامه در حالت آفلاین در دسترس نیست</h2>
             <p>یک‌بار با اتصال اینترنت برنامه را باز کنید تا نسخهٔ آفلاین ساخته شود.</p></div></body></html>`,
            { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
    }
}

/* ------------------------------ رهگیری درخواست‌ها ------------------------------ */
self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;

    let url;
    try { url = new URL(request.url); } catch (e) { return; }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

    if (isNavigation(request)) {
        event.respondWith(networkFirst(request));
        return;
    }
    if (isFontOrImage(url)) {
        event.respondWith(cacheFirst(request, FONT_CACHE));
        return;
    }
    if (isStyleOrScript(url) || url.pathname.endsWith('/manifest.json')) {
        event.respondWith(staleWhileRevalidate(request));
        return;
    }
    /* سایر درخواست‌های هم‌دامنه */
    if (url.origin === self.location.origin) {
        event.respondWith(cacheFirst(request, RUNTIME_CACHE));
    }
});

/* ------------------------------ پیام‌ها ------------------------------ */
self.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.type === 'SKIP_WAITING') self.skipWaiting();
    if (data.type === 'CLEAR_CACHES') {
        event.waitUntil((async () => {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
            event.source?.postMessage({ type: 'CACHES_CLEARED' });
        })());
    }
});

/* ------------------------------ همگام‌سازی پس‌زمینه (آماده برای فاز بعد) ------------------------------ */
self.addEventListener('sync', (event) => {
    if (event.tag === 'taxi-sync-queue') {
        event.waitUntil(Promise.resolve());
    }
});
