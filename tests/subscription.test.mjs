import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { readApp } from './extract.mjs';
import { createDevServer } from '../scripts/serve.mjs';

const rootDir = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function createStatefulFetch(baseUrl, windowRef) {
  const jar = new Map();
  const syncDocCookie = () => {
    const publicCookies = [];
    for (const [k, v] of jar.entries()) {
      if (k !== 'taxi_session') publicCookies.push(`${k}=${encodeURIComponent(v)}`);
    }
    Object.defineProperty(windowRef.document, 'cookie', {
      configurable: true,
      get: () => publicCookies.join('; '),
      set: () => {},
    });
  };
  syncDocCookie();
  return async (input, init = {}) => {
    const rawUrl = typeof input === 'string' ? input : input.url;
    const fullUrl = new URL(rawUrl, baseUrl).href;
    const headers = new Headers(init.headers || {});
    const cookieHeader = [...jar.entries()].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ');
    if (cookieHeader) headers.set('cookie', cookieHeader);
    const res = await globalThis.fetch(fullUrl, { ...init, headers });
    const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const line of setCookies) {
      const [pair, ...attrs] = line.split(';').map(s => s.trim());
      const eq = pair.indexOf('=');
      if (eq <= 0) continue;
      const name = pair.slice(0, eq);
      const val = decodeURIComponent(pair.slice(eq + 1));
      const maxAgeZero = attrs.some(a => /^max-age=0$/i.test(a));
      if (maxAgeZero || val === '') jar.delete(name);
      else jar.set(name, val);
    }
    syncDocCookie();
    return res;
  };
}

async function bootRawDom({ url = 'https://localhost/', beforeParse } = {}) {
  const html = readApp({ authenticated: false });
  const dom = new JSDOM(html, {
    url,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      try {
        Object.defineProperty(window, 'crypto', {
          value: { getRandomValues: a => webcrypto.getRandomValues(a), subtle: webcrypto.subtle },
          configurable: true,
        });
      } catch (_) {}
      window.HTMLCanvasElement.prototype.getContext = () => null;
      window.URL.createObjectURL = () => 'blob:mock';
      window.URL.revokeObjectURL = () => {};
      window.HTMLAnchorElement.prototype.click = () => {};
      window.matchMedia = query => ({
        matches: query.includes('dark'),
        media: query,
        addEventListener() {},
        removeEventListener() {},
      });
      window.fetch = async () => { throw new Error('Network disabled'); };
      if (beforeParse) beforeParse(window);
    },
  });
  const { window } = dom;
  if (window.document.readyState !== 'complete') {
    await Promise.race([new Promise(r => window.addEventListener('load', r, { once: true })), wait(3000)]);
  }
  return { dom, window, document: window.document, App: window.App };
}

function go(session, route) {
  session.window.location.hash = `#${route}`;
  session.App.render();
}

async function startTestBackend() {
  const { server, state } = createDevServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    state,
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

test('دروازهٔ ورود: بدون نشست معتبر، صفحهٔ لاگین نمایش داده می‌شود و دسترسی عملیاتی بسته است', async () => {
  const session = await bootRawDom();
  try {
    const { document, App } = session;
    assert.equal(App.subscription.isAuthenticated(), false, 'کاربر وارد نشده است');
    assert.equal(App.subscription.writable(), false, 'نوشتن بدون ورود بسته است');
    assert.equal(document.body.classList.contains('is-gated'), true, 'پوستهٔ اصلی پنهان است');
    assert.ok(document.querySelector('#auth-login-form'), 'فرم ورود نمایش داده شده است');

    document.querySelector('[data-action="seed-demo"]')?.click();
    assert.equal(App.data.trips.length, 0, 'هیچ سفری بدون ورود ثبت نمی‌شود');
  } finally {
    session.dom.window.close();
  }
});

test('ورود آنلاین، دریافت توکن CSRF و کارکرد کاملاً آفلاین پس از ورود اولیه', async () => {
  const backend = await startTestBackend();
  const networkCalls = [];
  let savedAuthJson = '';
  let savedStoreDbJson = '';

  const session1 = await bootRawDom({
    url: `${backend.baseUrl}/`,
    beforeParse(window) {
      const realFetch = createStatefulFetch(backend.baseUrl, window);
      window.fetch = async (url, opts) => {
        networkCalls.push({ url: String(url), method: opts?.method || 'GET', body: opts?.body || null });
        return realFetch(url, opts);
      };
    },
  });
  try {
    const user = await session1.App.subscription.login('agency@taxi.ir', 'taxi12345', true);
    assert.ok(user && user.id === 2, 'کاربر آژانس با موفقیت وارد شد');
    assert.equal(session1.App.subscription.isStore(), true);
    assert.equal(session1.App.subscription.writable(), true, 'اشتراک فعال اجازهٔ ثبت می‌دهد');
    assert.equal(session1.document.body.classList.contains('is-gated'), false, 'برنامهٔ اصلی باز شد');
    assert.equal(session1.App.data.settings.companyName, 'آژانس تاکسی کارن', 'نام آژانس از پروفایل سرور مقداردهی شد');
    assert.ok(networkCalls.some(c => c.url === '/api/csrf'), 'توکن CSRF دریافت شد');
    assert.ok(networkCalls.some(c => c.url === '/api/login'), 'درخواست ورود ارسال شد');

    savedAuthJson = session1.window.localStorage.getItem('taxi_auth_v1');
    savedStoreDbJson = session1.window.localStorage.getItem('taxi_db_v1_s1');
    assert.ok(savedAuthJson, 'نشست کاربری برای استفادهٔ آفلاین کش شد');
  } finally {
    session1.dom.window.close();
  }

  // راه‌اندازی مجدد در حالت کاملاً آفلاین (قطع اینترنت) و ثبت سفر آفلاین
  const offlineCalls = [];
  const session2 = await bootRawDom({
    url: `${backend.baseUrl}/`,
    beforeParse(window) {
      window.localStorage.setItem('taxi_auth_v1', savedAuthJson);
      if (savedStoreDbJson) window.localStorage.setItem('taxi_db_v1_s1', savedStoreDbJson);
      window.fetch = async url => {
        offlineCalls.push(String(url));
        throw new Error('Offline network error');
      };
    },
  });
  try {
    await wait(30);
    assert.equal(session2.App.subscription.isAuthenticated(), true, 'نشست آفلاین حفظ شده است');
    assert.equal(session2.App.subscription.writable(), true, 'در حالت آفلاین با اشتراک معتبر امکان ثبت فعال است');

    go(session2, 'trips/new');
    const form = session2.document.querySelector('form[data-form="trip"]');
    form.querySelector('[name="passengerName"]').value = 'مسافر آفلاین';
    form.querySelector('[name="origin"]').value = 'ونک';
    form.querySelector('[name="destination"]').value = 'تجریش';
    const fare = form.querySelector('[name="fare"]');
    fare.dataset.manual = 'true';
    fare.value = '160000';
    form.dispatchEvent(new session2.window.Event('submit', { bubbles: true, cancelable: true }));

    assert.equal(session2.App.data.trips.length, 1, 'سفر بدون اینترنت در حافظهٔ محلی ثبت شد');
    assert.equal(session2.App.data.trips[0].passengerName, 'مسافر آفلاین');
    const persisted = JSON.parse(session2.window.localStorage.getItem('taxi_db_v1_s1'));
    assert.equal(persisted.trips.length, 1, 'سفر در کلید اختصاصی آژانس ذخیره شد');
    assert.equal(offlineCalls.every(u => u === '/api/me'), true, 'هیچ دادهٔ عملیاتی به شبکه ارسال نشد');
  } finally {
    session2.dom.window.close();
    await backend.close();
  }
});

test('ایزوله‌سازی داده‌های محلی بین دو آژانس مختلف روی یک مرورگر', async () => {
  const session = await bootRawDom();
  const { window, App } = session;
  try {
    const now = new Date().toISOString();
    const exp = new Date(Date.now() + 30 * 86400000).toISOString();

    App.subscription.setAccountState({
      user: { id: 10, name: 'آژانس اول', email: 'a1@taxi.ir', role: 'store', is_active: true, store_id: 10, store: { id: 10, name: 'آژانس الف', is_active: true, is_archived: false, license: { id: 1, plan_name: 'حرفه‌ای', status: 'active', is_active: true, is_lifetime: false, expires_at: exp } } },
      loggedInAt: now, lastVerifiedAt: now, maxSeenAt: Date.now(),
    }, { seedAgency: true });

    go(session, 'trips/new');
    const f1 = window.document.querySelector('form[data-form="trip"]');
    f1.querySelector('[name="passengerName"]').value = 'مسافر آژانس الف';
    f1.querySelector('[name="origin"]').value = 'مبدأ الف';
    f1.querySelector('[name="destination"]').value = 'مقصد الف';
    f1.querySelector('[name="fare"]').dataset.manual = 'true';
    f1.querySelector('[name="fare"]').value = '110000';
    f1.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    assert.equal(App.data.trips.length, 1);

    App.subscription.setAccountState({
      user: { id: 20, name: 'آژانس دوم', email: 'a2@taxi.ir', role: 'store', is_active: true, store_id: 20, store: { id: 20, name: 'آژانس ب', is_active: true, is_archived: false, license: { id: 2, plan_name: 'پایه', status: 'active', is_active: true, is_lifetime: false, expires_at: exp } } },
      loggedInAt: now, lastVerifiedAt: now, maxSeenAt: Date.now(),
    }, { seedAgency: true });

    assert.equal(App.data.trips.length, 0, 'داده‌های آژانس اول در آژانس دوم دیده نمی‌شود');
    assert.equal(App.data.settings.companyName, 'آژانس ب');

    App.subscription.setAccountState({
      user: { id: 10, name: 'آژانس اول', email: 'a1@taxi.ir', role: 'store', is_active: true, store_id: 10, store: { id: 10, name: 'آژانس الف', is_active: true, is_archived: false, license: { id: 1, plan_name: 'حرفه‌ای', status: 'active', is_active: true, is_lifetime: false, expires_at: exp } } },
      loggedInAt: now, lastVerifiedAt: now, maxSeenAt: Date.now(),
    });
    assert.equal(App.data.trips.length, 1, 'داده‌های آژانس اول دست‌نخورده بازیابی شد');
    assert.equal(App.data.trips[0].passengerName, 'مسافر آژانس الف');
  } finally {
    session.dom.window.close();
  }
});

test('حالت فقط‌خواندنی و پشتیبان‌گیری (readonly_backup) پس از انقضای اشتراک و بازگشایی پس از تمدید', async () => {
  const backend = await startTestBackend();
  const downloads = [];
  const session = await bootRawDom({
    url: `${backend.baseUrl}/`,
    beforeParse(window) {
      window.fetch = createStatefulFetch(backend.baseUrl, window);
      window.URL.createObjectURL = () => {
        downloads.push(1);
        return 'blob:backup';
      };
    },
  });

  try {
    const seededDb = JSON.parse(JSON.stringify(session.App.data));
    seededDb.trips.push({
      id: 'TRP-OLD-1', code: 'TRP-0001', passengerName: 'مسافر قبلی', phone: '09120000000',
      origin: 'آزادی', destination: 'ونک', date: session.App.calendar.today(), time: '09:15',
      fare: 195000, commission: 29250, commissionRate: 15, status: 'completed', paymentMethod: 'cash', customerType: 'regular',
    });
    session.window.localStorage.setItem('taxi_db_v1_s2', JSON.stringify(seededDb));

    await session.App.subscription.login('expired@taxi.ir', 'taxi12345', true);
    assert.equal(session.App.subscription.isStore(), true);
    assert.equal(session.App.subscription.info().status, 'expired');
    assert.equal(session.App.subscription.writable(), false, 'اشتراک منقضی اجازهٔ ویرایش نمی‌دهد');
    assert.ok(session.document.querySelector('#subscription-banner'), 'بنر هشدار انقضای اشتراک نمایش داده شد');

    // ۱) مشاهدهٔ داده‌های موجود برقرار است
    go(session, 'trips/list');
    assert.match(session.document.querySelector('#app-root').textContent, /مسافر قبلی/, 'سفرهای قبلی قابل مشاهده هستند');

    // ۲) ثبت سفر جدید قفل است
    go(session, 'trips/new');
    const tripForm = session.document.querySelector('form[data-form="trip"]');
    tripForm.querySelector('[name="passengerName"]').value = 'سفر غیرمجاز';
    tripForm.querySelector('[name="origin"]').value = 'الف';
    tripForm.querySelector('[name="destination"]').value = 'ب';
    tripForm.querySelector('[name="fare"]').dataset.manual = 'true';
    tripForm.querySelector('[name="fare"]').value = '120000';
    tripForm.dispatchEvent(new session.window.Event('submit', { bubbles: true, cancelable: true }));
    assert.equal(session.App.data.trips.length, 1, 'ثبت سفر جدید در حالت منقضی مسدود شد');

    // ۳) ورود گروهی CSV قفل است
    session.App.durability.importCsvRows('driver', 'نام,شماره همراه,گواهینامه,کمیسیون\nراننده تست,09121112233,123,15');
    assert.equal(session.App.data.drivers.length, 0, 'ورود CSV در حالت منقضی مسدود شد');

    // ۴) پشتیبان‌گیری JSON، خروجی CSV، تغییر بازهٔ گزارش و پیش‌نمایش چاپ همچنان باز هستند
    const beforeDownloads = downloads.length;
    go(session, 'backup');
    session.document.querySelector('[data-action="backup"]').click();
    assert.ok(downloads.length > beforeDownloads, 'دانلود پشتیبان JSON در حالت منقضی انجام شد');

    const beforeCsv = downloads.length;
    session.App.accounting.exportRangeCSV();
    assert.ok(downloads.length > beforeCsv, 'خروجی CSV در حالت منقضی انجام شد');

    session.App.accounting.setReportRange({ preset: '30d' });
    assert.equal(session.App.accounting.reportRange().preset, '30d', 'تغییر فیلتر بازهٔ گزارش در حالت منقضی کار می‌کند');

    go(session, 'trips/list');
    session.document.querySelector('[data-action="print-trip"]').click();
    assert.ok(session.document.querySelector('#print-preview-frame'), 'پیش‌نمایش چاپ رسید سفر در حالت منقضی باز می‌شود');
    session.document.querySelector('[data-action="close-modal"]').click();

    // ۵) تمدید اشتراک در سرور و فراخوانی refresh آنلاین → بازشدن قفل ثبت سفر
    backend.state.licenses.find(l => l.store_id === 2).expires_at = new Date(Date.now() + 180 * 86400000).toISOString();
    backend.state.licenses.find(l => l.store_id === 2).status = 'active';
    await session.App.subscription.refresh({ manual: true });

    assert.equal(session.App.subscription.writable(), true, 'پس از تمدید اشتراک، قفل نوشتن باز شد');
    assert.equal(session.document.querySelector('#subscription-banner'), null, 'بنر انقضا برداشته شد');

    go(session, 'trips/new');
    const unlockedForm = session.document.querySelector('form[data-form="trip"]');
    unlockedForm.querySelector('[name="passengerName"]').value = 'مسافر پس از تمدید';
    unlockedForm.querySelector('[name="origin"]').value = 'میدان ونک';
    unlockedForm.querySelector('[name="destination"]').value = 'فرودگاه';
    unlockedForm.querySelector('[name="fare"]').dataset.manual = 'true';
    unlockedForm.querySelector('[name="fare"]').value = '250000';
    unlockedForm.dispatchEvent(new session.window.Event('submit', { bubbles: true, cancelable: true }));
    assert.equal(session.App.data.trips.length, 2, 'پس از تمدید، سفر جدید با موفقیت ثبت شد');
  } finally {
    session.dom.window.close();
    await backend.close();
  }
});

test('محافظ دست‌کاری ساعت سیستم (maxSeenAt) و هم‌زیستی قفل PIN با احراز هویت سرور', async () => {
  const session = await bootRawDom();
  const { App } = session;
  try {
    const futureNow = Date.now() + 40 * 86400000;
    const expiredBeforeMaxSeen = new Date(Date.now() + 10 * 86400000).toISOString();
    App.subscription.setAccountState({
      user: {
        id: 5, name: 'تست ساعت', email: 'clock@taxi.ir', role: 'store', is_active: true, store_id: 5,
        store: { id: 5, name: 'آژانس ساعت', is_active: true, is_archived: false, license: { id: 5, plan_name: 'حرفه‌ای', status: 'active', is_active: true, is_lifetime: false, expires_at: expiredBeforeMaxSeen } },
      },
      loggedInAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      maxSeenAt: futureNow,
    });
    assert.equal(App.subscription.info().status, 'expired', 'عقب کشیدن ساعت سیستم باعث معتبر شدن اشتراک نمی‌شود');
    assert.equal(App.subscription.writable(), false);

    // هم‌زیستی قفل PIN اپراتور در یک آژانس دارای اشتراک فعال
    App.subscription.setAccountState({
      user: {
        id: 6, name: 'آژانس پین', email: 'pin@taxi.ir', role: 'store', is_active: true, store_id: 6,
        store: { id: 6, name: 'آژانس پین', is_active: true, is_archived: false, license: { id: 6, plan_name: 'حرفه‌ای', status: 'active', is_active: true, is_lifetime: true } },
      },
      loggedInAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      maxSeenAt: Date.now(),
    });
    await App.security.setPin('1357');
    App.data.settings.security.requirePin = true;
    assert.equal(App.security.lock('تست قفل'), true);
    assert.equal(App.security.state().locked, true);
    session.document.querySelector('#lock-pin').value = '1357';
    await App.security.submitPin();
    assert.equal(App.security.state().locked, false, 'قفل PIN اپراتور در کنار نشست سرور به‌درستی باز شد');
  } finally {
    session.dom.window.close();
  }
});

test('پنل مدیریت کل (سوپرادمین): ورود مدیر، ساخت آژانس جدید، تمدید اشتراک و ورود آژانس ساخته‌شده', async () => {
  const backend = await startTestBackend();
  const session = await bootRawDom({
    url: `${backend.baseUrl}/`,
    beforeParse(window) {
      window.fetch = createStatefulFetch(backend.baseUrl, window);
    },
  });

  try {
    const admin = await session.App.subscription.login('admin@karensoft.ir', 'admin12345', true);
    assert.equal(admin.role, 'manager');
    assert.equal(session.App.subscription.isManager(), true);
    await session.App.subscription.loadManagerTab('dashboard');
    assert.match(session.document.querySelector('#manager-body').textContent, /اشتراک‌های فعال/, 'داشبورد مدیریت بارگذاری شد');

    await session.App.subscription.loadManagerTab('stores');
    session.document.querySelector('[data-action="mgr-new-store"]').click();
    const storeForm = session.document.querySelector('form[data-form="mgr-store"]');
    assert.ok(storeForm, 'فرم تعریف آژانس باز شد');
    storeForm.querySelector('[name="name"]').value = 'آژانس تاکسی امید';
    storeForm.querySelector('[name="owner_name"]').value = 'امید کاظمی';
    storeForm.querySelector('[name="phone"]').value = '02177665544';
    storeForm.querySelector('[name="email"]').value = 'omid@taxi.ir';
    storeForm.querySelector('[name="password"]').value = 'omid12345';
    storeForm.querySelector('[name="days"]').value = '180';
    storeForm.dispatchEvent(new session.window.Event('submit', { bubbles: true, cancelable: true }));
    await wait(60);

    assert.ok(session.App.subscription.managerState().stores.some(s => s.name === 'آژانس تاکسی امید'), 'آژانس جدید در سرور ثبت شد');

    await session.App.subscription.logout();
    assert.equal(session.App.subscription.isAuthenticated(), false);

    const omidUser = await session.App.subscription.login('omid@taxi.ir', 'omid12345', true);
    assert.equal(omidUser.store.name, 'آژانس تاکسی امید');
    assert.equal(session.App.subscription.writable(), true);
    assert.equal(session.App.data.settings.companyName, 'آژانس تاکسی امید');
  } finally {
    session.dom.window.close();
    await backend.close();
  }
});

test('انقضای نشست (401) یا غیرفعال شدن کاربر در سرور: خروج امن بدون حذف داده‌های آفلاین آژانس', async () => {
  const backend = await startTestBackend();
  const session = await bootRawDom({
    url: `${backend.baseUrl}/`,
    beforeParse(window) {
      window.fetch = createStatefulFetch(backend.baseUrl, window);
    },
  });

  try {
    await session.App.subscription.login('agency@taxi.ir', 'taxi12345', true);
    go(session, 'trips/new');
    const form = session.document.querySelector('form[data-form="trip"]');
    form.querySelector('[name="passengerName"]').value = 'مسافر محفوظ';
    form.querySelector('[name="origin"]').value = 'تهرانپارس';
    form.querySelector('[name="destination"]').value = 'انقلاب';
    form.querySelector('[name="fare"]').dataset.manual = 'true';
    form.querySelector('[name="fare"]').value = '175000';
    form.dispatchEvent(new session.window.Event('submit', { bubbles: true, cancelable: true }));
    assert.equal(session.App.data.trips.length, 1);

    // غیرفعال کردن کاربر در سرور و فراخوانی refresh → باید نشست پاک شود اما دادهٔ محلی باقی بماند
    backend.state.users.find(u => u.email === 'agency@taxi.ir').is_active = false;
    await session.App.subscription.refresh();

    assert.equal(session.App.subscription.isAuthenticated(), false, 'نشست نامعتبر پاک شد');
    assert.ok(session.document.querySelector('#auth-login-form'), 'صفحهٔ ورود نمایش داده شد');
    const savedLocal = JSON.parse(session.window.localStorage.getItem('taxi_db_v1_s1'));
    assert.equal(savedLocal.trips.length, 1, 'داده‌های آفلاین آژانس پس از خروج اجباری کاملاً محفوظ ماند');
    assert.equal(savedLocal.trips[0].passengerName, 'مسافر محفوظ');
  } finally {
    session.dom.window.close();
    await backend.close();
  }
});

test('ساختار سرور لاراول (laravel-backend): کامل، بدون جداول حسابداری اضافی و با ثبت‌نام عمومی بسته', () => {
  const mustExist = [
    'laravel-backend/composer.json',
    'laravel-backend/routes/web.php',
    'laravel-backend/config/billing.php',
    'laravel-backend/app/Http/Controllers/Api/AuthController.php',
    'laravel-backend/app/Http/Controllers/Api/Manager/StoreController.php',
    'laravel-backend/app/Http/Controllers/Api/Manager/SubscriberController.php',
    'laravel-backend/app/Http/Controllers/Api/Manager/PlanController.php',
    'laravel-backend/app/Http/Controllers/Api/Manager/OrderController.php',
    'laravel-backend/app/Services/Billing/LicenseService.php',
    'laravel-backend/app/Services/Billing/SeatLimitService.php',
    'laravel-backend/public/taxi.html',
    'laravel-backend/public/sw.js',
    'laravel-backend/public/manifest.json',
    'laravel-backend/tests/Feature/PwaServingTest.php',
  ];
  for (const rel of mustExist) {
    assert.equal(fs.existsSync(path.join(rootDir, rel)), true, `فایل ${rel} موجود است`);
  }
  assert.equal(fs.existsSync(path.join(rootDir, 'laravel-backend/app/Http/Controllers/Api/SyncController.php')), false, 'SyncController حذف شده است');
  const webRoutes = fs.readFileSync(path.join(rootDir, 'laravel-backend/routes/web.php'), 'utf8');
  assert.equal(/\/sync\//.test(webRoutes), false, 'مسیرهای همگام‌سازی ابری داده عملیاتی در لاراول وجود ندارد');
  const billingConfig = fs.readFileSync(path.join(rootDir, 'laravel-backend/config/billing.php'), 'utf8');
  assert.match(billingConfig, /'public_registration'\s*=>\s*\(bool\)\s*env\('TAXI_PUBLIC_SIGNUP',\s*env\('KARO_PUBLIC_SIGNUP',\s*false\)\)/, 'ثبت‌نام عمومی به‌طور پیش‌فرض غیرفعال است');
});
