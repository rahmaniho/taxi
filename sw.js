/* Service Worker کارن‌سافت · کش آفلاین برنامه و فایل‌های استاتیک */
'use strict';
const CACHE_VERSION = 'taxi-v1.1.0';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const LOGO_CACHE = 'taxi-logo-v1';
const ROOT = new URL('./', self.registration.scope);
const STATIC_FILES = [
  'taxi.html', 'manifest.json',
  'icons/icon-72.png', 'icons/icon-96.png', 'icons/icon-128.png',
  'icons/icon-144.png', 'icons/icon-152.png', 'icons/icon-192.png',
  'icons/icon-384.png', 'icons/icon-512.png', 'icons/maskable-512.png'
].map(path => new URL(path, ROOT).href);
const LOGO_URL = new URL('__taxi_agency_logo__', ROOT).href;
const OFFLINE_HTML = `<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#D4AF37"><title>کارن‌سافت · آفلاین</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#080A19;color:#f6f5f1;font:16px Tahoma,Arial,sans-serif}.box{max-width:440px;margin:20px;padding:32px;border:1px solid #343954;border-radius:22px;background:#11162b;text-align:center;line-height:2}.mark{width:62px;height:62px;margin:0 auto 16px;border-radius:18px;display:grid;place-items:center;background:#D4AF37;color:#111;font-size:28px;font-weight:bold}.muted{color:#a5acc0;font-size:13px}</style><main class="box"><div class="mark">ت</div><h1>کارن‌سافت آفلاین است</h1><p class="muted">برای بازشدن برنامه، یک بار به اینترنت وصل شوید. پس از بارگذاری اولیه، می‌توانید سفرها را بدون اینترنت مدیریت کنید.</p><p class="muted">اطلاعات ثبت‌شده روی همین دستگاه باقی می‌مانند.</p></main></html>`;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await Promise.all(STATIC_FILES.map(async url => {
      try {
        const response = await fetch(url, { cache: 'reload' });
        if (response && response.ok) await cache.put(url, response);
      } catch (_) { /* نصب آفلاین نباید با یک فایل فرعی ناموجود متوقف شود */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('taxi-') &&
      ![STATIC_CACHE, RUNTIME_CACHE, LOGO_CACHE].includes(key)).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && (response.ok || response.type === 'opaque')) {
    const cache = await caches.open(RUNTIME_CACHE);
    try { await cache.put(request, response.clone()); } catch (_) { /* بعضی پاسخ‌های CDN قابل ذخیره نیستند */ }
  }
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    return (await caches.match(request)) || (await caches.match(new URL('taxi.html', ROOT).href)) ||
      new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 200 });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request).then(response => {
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  return cached || network;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === ROOT.origin && url.href.split('?')[0] === LOGO_URL) {
    event.respondWith(caches.open(LOGO_CACHE).then(cache => cache.match(LOGO_URL)).then(response =>
      response || new Response('', { status: 404, statusText: 'لوگوی آژانس بارگذاری نشده است' })));
    return;
  }
  if (url.origin !== ROOT.origin) {
    const cdn = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
    if (cdn.includes(url.hostname)) event.respondWith(cacheFirst(request));
    return;
  }
  if (url.pathname.endsWith('/manifest.json')) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  if (request.mode === 'navigate' || url.pathname.endsWith('/taxi.html') || url.pathname === ROOT.pathname) {
    event.respondWith(networkFirst(request));
    return;
  }
  if (/\/icons\//.test(url.pathname) || url.pathname.endsWith('/sw.js')) {
    event.respondWith(cacheFirst(request));
  }
});

self.addEventListener('message', event => {
  if (!event.data || event.data.type !== 'CACHE_LOGO' || typeof event.data.data !== 'string') return;
  event.waitUntil((async () => {
    try {
      const response = await fetch(event.data.data);
      if (!response.ok) return;
      const cache = await caches.open(LOGO_CACHE);
      await cache.put(LOGO_URL, response);
    } catch (_) { /* لوگو همچنان در localStorage موجود است */ }
  })());
});
