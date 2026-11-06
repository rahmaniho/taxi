import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = name => readFileSync(join(root, name), 'utf8');
const pkg = JSON.parse(read('package.json'));

test('نسخهٔ برنامه در taxi.html، sw.js و package.json هم‌خوان است', () => {
  const html = read('taxi.html');
  const sw = read('sw.js');
  assert.match(html, new RegExp(`APP_VERSION='${pkg.version.replace(/\./g, '\\.')}'`), 'نسخهٔ نمایشی با package.json یکی است');
  assert.match(sw, new RegExp(`CACHE_VERSION = 'taxi-v${pkg.version.replace(/\./g, '\\.')}'`), 'نسخهٔ کش سرویس‌ورکر هم‌خوان است');
  assert.match(html, /نسخه \$\{APP_VERSION\}/, 'نسخه در صفحهٔ درباره نمایش داده می‌شود');
});

test('معماری حریم داده محلی حفظ شده است: شبکه فقط برای احراز هویت و اشتراک /api/* است و داده عملیاتی آپلود نمی‌شود', () => {
  const html = read('taxi.html');
  const script = html.match(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/)[1];
  assert.equal(/navigator\.sendBeacon/.test(script), false, 'sendBeacon استفاده نشده');
  assert.equal(/\/api\/sync/.test(script), false, 'مسیر همگام‌سازی ابری داده عملیاتی وجود ندارد');
  const fetchMatches = [...script.matchAll(/\bfetch\s*\(/g)];
  assert.equal(fetchMatches.length, 2, 'fetch فقط در ماژول CSRF و کلاینت /api/* فراخوانی می‌شود');
  assert.match(script, /cleanPath\.startsWith\('\/api\/'\)/, 'کلاینت شبکه محدود به مسیرهای /api/* است');
  assert.match(script, /localStorage/, 'ذخیره‌سازی محلی برقرار است');
  assert.match(script, /indexedDB/, 'آینهٔ پنهان روی IndexedDB کار می‌کند');
});

test('سرویس‌ورکر: پیش‌کش فایل‌های پایه، استثنای /api/* برای اشتراک و پاک‌سازی کش‌های قدیمی', () => {
  const sw = read('sw.js');
  assert.match(sw, /'taxi\.html'/, 'صفحهٔ اصلی پیش‌کش می‌شود');
  assert.match(sw, /CDN_FILES\s*=/, 'فهرست CDN تعریف شده است');
  assert.match(sw, /chart\.js/, 'Chart.js پیش‌کش می‌شود');
  assert.match(sw, /font-awesome/, 'FontAwesome پیش‌کش می‌شود');
  assert.match(sw, /vazirmatn/, 'فونت وزیرمتن پیش‌کش می‌شود');
  assert.match(sw, /\/api\(/, 'درخواست‌های /api/* از کش سرویس‌ورکر عبور داده می‌شوند');
  assert.match(sw, /caches\.delete\(key\)/, 'کش‌های نسخهٔ قبل پاک می‌شوند');
  assert.match(sw, /skipWaiting/, 'نسخهٔ تازه بی‌درنگ فعال می‌شود');
});

test('مانیفست PWA: آیکون‌ها، میان‌بُرها و مسیر شروع معتبر است', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.dir, 'rtl');
  assert.equal(manifest.lang, 'fa-IR');
  assert.ok(manifest.icons.length >= 6, 'آیکون‌های کافی برای نصب وجود دارد');
  assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable'), 'آیکون maskable هست');
  assert.ok(Array.isArray(manifest.shortcuts) && manifest.shortcuts.length >= 2, 'میان‌بُرهای نصب تعریف شده‌اند');
  for (const shortcut of manifest.shortcuts) {
    assert.match(shortcut.url, /^\.\/taxi\.html#/, 'میان‌بُر به مسیر معتبر اشاره می‌کند');
  }
});

test('اسکریپت‌های هم‌گام‌سازی نسخه و فایل‌های PWA سرور لاراول بدون خطا اجرا می‌شوند', async () => {
  const { execFileSync } = await import('node:child_process');
  const verOutput = execFileSync('node', ['scripts/bump-version.mjs', '--check'], { cwd: root, encoding: 'utf8' });
  assert.match(verOutput, /هم‌خوان/, 'بررسی نسخه بدون خطا اجرا می‌شود');
  const pwaOutput = execFileSync('node', ['scripts/sync-laravel-pwa.mjs', '--check'], { cwd: root, encoding: 'utf8' });
  assert.match(pwaOutput, /هم‌گام/, 'فایل‌های PWA سرور لاراول هم‌گام‌اند');
});

test('کیفیت فایل تک‌صفحه‌ای: بدون اسکریپت درون‌خطی دوم و با ساختار کامل HTML', () => {
  const html = read('taxi.html');
  const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>/g)];
  assert.equal(scripts.length, 1, 'فقط یک اسکریپت درون‌خطی وجود دارد');
  const external = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(match => match[1]);
  assert.ok(external.length <= 2, 'کتابخانه‌های بیرونی محدود به CDN ضروری‌اند');
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<html lang="fa" dir="rtl"/);
  assert.match(html, /<\/html>\s*$/);
  assert.match(html, /id="app-root"/);
  assert.match(html, /id="account-root"/, 'ریشهٔ صفحهٔ ورود و پنل مدیریت هست');
  assert.match(html, /class="skip-link"/, 'پیوند پرش به محتوا هست');
  assert.equal(/console\.log\(/.test(html.match(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/)[1]), false, 'در کد برنامه console.log نمانده است');
});
