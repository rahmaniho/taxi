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
    assert.equal(persisted.sync.dirty, true, 'تغییر آفلاین در صف همگام‌سازی ابری علامت‌گذاری شد');
    assert.equal(offlineCalls.every(u => u.startsWith('/api/')), true, 'تمام درخواست‌های شبکه محدود به /api/* هستند');
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

test('همگام‌سازی ابری چنددستگاهی (/api/sync): انتقال خودکار سفرها، لوگوی اختصاصی و حذف‌ها بین دو دستگاه', async () => {
  const backend = await startTestBackend();
  const deviceA = await bootRawDom({
    url: `${backend.baseUrl}/`,
    beforeParse(window) {
      window.fetch = createStatefulFetch(backend.baseUrl, window);
    },
  });
  const deviceB = await bootRawDom({
    url: `${backend.baseUrl}/`,
    beforeParse(window) {
      window.fetch = createStatefulFetch(backend.baseUrl, window);
    },
  });

  try {
    await deviceA.App.subscription.login('agency@taxi.ir', 'taxi12345', true);
    await wait(40);

    // ثبت سفر و بارگذاری لوگوی اختصاصی روی دستگاه اول
    go(deviceA, 'trips/new');
    const form = deviceA.document.querySelector('form[data-form="trip"]');
    form.querySelector('[name="passengerName"]').value = 'مسافر همگام ابری';
    form.querySelector('[name="origin"]').value = 'میدان آزادی';
    form.querySelector('[name="destination"]').value = 'سعادت‌آباد';
    form.querySelector('[name="fare"]').dataset.manual = 'true';
    form.querySelector('[name="fare"]').value = '220000';
    form.dispatchEvent(new deviceA.window.Event('submit', { bubbles: true, cancelable: true }));

    const svgLogo = new deviceA.window.File(['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="#D4AF37"/></svg>'], 'agency-logo.svg', { type: 'image/svg+xml' });
    const uploaded = await deviceA.App.logo.upload(svgLogo);
    assert.equal(uploaded, true, 'لوگوی آژانس در دستگاه اول ذخیره شد');

    const pushed = await deviceA.App.sync.cloudSync({ manual: true });
    assert.equal(pushed?.ok, true, 'ارسال به سرور موفق بود');
    assert.ok(deviceA.App.sync.info().serverRevision >= 1, 'نسخهٔ سرور ثبت شد');
    assert.equal(deviceA.App.sync.info().dirty, false, 'وضعیت محلی با سرور همگام شد');

    // ورود روی دستگاه دوم (مرورگر خام) و دریافت خودکار از سرور
    await deviceB.App.subscription.login('agency@taxi.ir', 'taxi12345', true);
    await deviceB.App.sync.cloudSync({ manual: false });

    assert.equal(deviceB.App.data.trips.length, 1, 'سفر از سرور به دستگاه دوم منتقل شد');
    assert.equal(deviceB.App.data.trips[0].passengerName, 'مسافر همگام ابری');
    assert.ok(deviceB.App.data.settings.logo?.data?.startsWith('data:image/svg+xml;base64,'), 'لوگوی آژانس به دستگاه دوم منتقل شد');

    // افزودن راننده در دستگاه دوم، سینک، سپس حذف در دستگاه اول و انتشار tombstone
    go(deviceB, 'drivers');
    deviceB.document.querySelector('[data-action="add-driver"]').click();
    const drvForm = deviceB.document.querySelector('form[data-form="driver"]');
    drvForm.querySelector('[name="name"]').value = 'راننده ابری';
    drvForm.dispatchEvent(new deviceB.window.Event('submit', { bubbles: true, cancelable: true }));
    await deviceB.App.sync.cloudSync({ manual: false });

    await deviceA.App.sync.cloudSync({ manual: false });
    assert.equal(deviceA.App.data.drivers.length, 1, 'راننده جدید به دستگاه اول رسید');
    const driverId = deviceA.App.data.drivers[0].id;

    go(deviceA, 'drivers');
    deviceA.document.querySelector(`[data-action="delete-driver"][data-id="${driverId}"]`).click();
    deviceA.document.querySelector('#confirm-action').click();
    await deviceA.App.sync.cloudSync({ manual: false });

    await deviceB.App.sync.cloudSync({ manual: false });
    assert.equal(deviceB.App.data.drivers.length, 0, 'حذف راننده از طریق tombstone در دستگاه دوم نیز اعمال شد');
  } finally {
    deviceA.dom.window.close();
    deviceB.dom.window.close();
    await backend.close();
  }
});

test('بررسی واقعی تمدید اشتراک، روزشمار زندهٔ اعتبار و دکمه‌های برجستهٔ خروج از حساب', async () => {
  const backend = await startTestBackend();
  const meUrls = [];
  const session = await bootRawDom({
    url: `${backend.baseUrl}/`,
    beforeParse(window) {
      const realFetch = createStatefulFetch(backend.baseUrl, window);
      window.fetch = async (url, opts) => {
        if (String(url).startsWith('/api/me')) meUrls.push({ url: String(url), cache: opts?.cache || '' });
        return realFetch(url, opts);
      };
    },
  });

  try {
    await session.App.subscription.login('expired@taxi.ir', 'taxi12345', true);
    go(session, 'settings');

    // ۱) بررسی تمدید وقتی هنوز در سرور تمدیدی ثبت نشده است
    await session.App.subscription.refresh({ manual: true });
    assert.ok(meUrls.some(u => u.url.includes('/api/me?_t=') && u.cache === 'no-store'), 'درخواست بررسی تمدید بدون کش به سرور ارسال شد');
    assert.equal(session.App.subscription.renewalResult()?.type, 'expired', 'نتیجهٔ عدم ثبت تمدید ثبت شد');
    assert.match(session.document.querySelector('#renewal-check-result').textContent, /هنوز تمدیدی/, 'بنر نتیجهٔ استعلام نمایش داده شد');

    // ۲) ثبت تمدید در سرور و زدن دوبارهٔ بررسی تمدید
    backend.state.licenses.find(l => l.store_id === 2).expires_at = new Date(Date.now() + 90 * 86400000 + 7200000).toISOString();
    backend.state.licenses.find(l => l.store_id === 2).status = 'active';
    await session.App.subscription.refresh({ manual: true });

    assert.equal(session.App.subscription.writable(), true, 'قفل نوشتن بلافاصله باز شد');
    assert.equal(session.App.subscription.renewalResult()?.type, 'renewed', 'وضعیت تأیید تمدید تشخیص داده شد');
    assert.match(session.document.querySelector('#renewal-check-result').textContent, /تأیید و فعال شد/, 'پیام موفقیت تمدید نمایش داده شد');

    // ۳) بررسی روزشمار زنده در صفحهٔ تنظیمات
    const cd = session.App.subscription.countdown();
    assert.equal(cd.mode, 'active');
    assert.ok(cd.days >= 89 && cd.days <= 90, 'تعداد روزهای مانده در روزشمار دقیق است');
    assert.ok(session.document.querySelector('#sub-countdown-box #cd-days'), 'کارت روزشمار در تنظیمات نمایش داده شد');

    // ۴) دکمهٔ خروج برجسته در نوار بالا و نوار کناری
    assert.ok(session.document.querySelector('#top-logout-btn'), 'دکمهٔ خروج نوار بالا حاضر است');
    assert.ok(session.document.querySelector('#sidebar-logout-btn'), 'دکمهٔ خروج نوار کناری حاضر است');
    session.document.querySelector('#top-logout-btn').click();
    assert.match(session.document.querySelector('#modal-root').textContent, /خروج از حساب کاربری/, 'دیالوگ تأیید خروج باز شد');
    session.document.querySelector('#confirm-action').click();
    await wait(40);
    assert.equal(session.App.subscription.isAuthenticated(), false, 'خروج از حساب انجام شد');
  } finally {
    session.dom.window.close();
    await backend.close();
  }
});

test('لوگوی اختصاصی آژانس تا ۱۰ مگابایت و درج نام و لوگوی آژانس در سربرگ فاکتورها', async () => {
  const session = await bootRawDom();
  const { window, document, App } = session;
  try {
    const now = new Date().toISOString();
    const exp = new Date(Date.now() + 120 * 86400000).toISOString();
    App.subscription.setAccountState({
      user: {
        id: 30, name: 'مدیریت آژانس نگین', email: 'negin@taxi.ir', role: 'store', is_active: true, store_id: 30,
        store: { id: 30, name: 'آژانس تاکسی نگین', is_active: true, is_archived: false, license: { id: 30, plan_name: 'حرفه‌ای', status: 'active', is_active: true, is_lifetime: false, expires_at: exp } },
      },
      loggedInAt: now, lastVerifiedAt: now, maxSeenAt: Date.now(),
    }, { seedAgency: true });

    // ۱) فایل PNG بزرگ‌تر از ۵۰۰ کیلوبایت (مثلاً ۷۰۰ کیلوبایت) دیگر رد نمی‌شود
    const bigPngBytes = new Uint8Array(700 * 1024);
    bigPngBytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    const bigPng = new window.File([bigPngBytes], 'negin-logo.png', { type: 'image/png' });
    const okBig = await App.logo.upload(bigPng);
    assert.equal(okBig, true, 'لوگوی ۷۰۰ کیلوبایتی پذیرفته و ذخیره شد');
    assert.ok(App.data.settings.logo?.data?.startsWith('data:image/png;base64,'), 'دادهٔ PNG ذخیره شد');

    // ۲) فایل بزرگ‌تر از ۱۰ مگابایت رد می‌شود
    const hugeFile = new window.File([new Uint8Array(10 * 1024 * 1024 + 1024)], 'huge.png', { type: 'image/png' });
    const okHuge = await App.logo.upload(hugeFile);
    assert.equal(okHuge, false, 'فایل بیش از ۱۰ مگابایت رد شد');

    // ۳) پیش‌نمایش فاکتور در تنظیمات با لوگو و نام آژانس
    go(session, 'settings');
    document.querySelector('[data-action="preview-logo-invoice"]').click();
    const frame = document.querySelector('#print-preview-frame');
    assert.ok(frame, 'پیش‌نمایش فاکتور رسمی باز شد');
    const htmlDoc = frame.getAttribute('srcdoc') || '';
    assert.match(htmlDoc, /آژانس تاکسی نگین/, 'نام اختصاصی آژانس در سربرگ فاکتور درج شده است');
    assert.match(htmlDoc, /<img class="logo" src="data:image\/png;base64,/, 'لوگوی اختصاصی آژانس در سربرگ فاکتور چاپ شده است');
  } finally {
    session.dom.window.close();
  }
});

test('ساختار سرور لاراول (laravel-backend): کامل، دارای همگام‌سازی ابری آژانس و با ثبت‌نام عمومی بسته', () => {
  const mustExist = [
    'laravel-backend/composer.json',
    'laravel-backend/routes/web.php',
    'laravel-backend/config/billing.php',
    'laravel-backend/app/Http/Controllers/Api/AuthController.php',
    'laravel-backend/app/Http/Controllers/Api/SyncController.php',
    'laravel-backend/app/Services/Sync/AgencySyncMergeService.php',
    'laravel-backend/app/Models/AgencySyncState.php',
    'laravel-backend/database/migrations/2026_11_07_020000_create_agency_sync_states_table.php',
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
    'laravel-backend/tests/Feature/CloudSyncTest.php',
  ];
  for (const rel of mustExist) {
    assert.equal(fs.existsSync(path.join(rootDir, rel)), true, `فایل ${rel} موجود است`);
  }
  const webRoutes = fs.readFileSync(path.join(rootDir, 'laravel-backend/routes/web.php'), 'utf8');
  assert.match(webRoutes, /SyncController::class/, 'مسیرهای /api/sync در لاراول ثبت شده‌اند');
  const billingConfig = fs.readFileSync(path.join(rootDir, 'laravel-backend/config/billing.php'), 'utf8');
  assert.match(billingConfig, /'public_registration'\s*=>\s*\(bool\)\s*env\('TAXI_PUBLIC_SIGNUP',\s*env\('KARO_PUBLIC_SIGNUP',\s*false\)\)/, 'ثبت‌نام عمومی به‌طور پیش‌فرض غیرفعال است');
});

test('هویت بصری تاکسینو | Taxino: نام رسمی، لوگوی افقی (logo.png) و آیکون برنامه در تمام لایه‌های PWA و لاراول', async () => {
  const brandFiles = [
    'icons/logo.png',
    'icons/apple-touch-icon.png',
    'icons/icon-72.png',
    'icons/icon-96.png',
    'icons/icon-128.png',
    'icons/icon-144.png',
    'icons/icon-152.png',
    'icons/icon-192.png',
    'icons/icon-384.png',
    'icons/icon-512.png',
    'icons/maskable-512.png',
    'laravel-backend/public/icons/logo.png',
    'laravel-backend/public/icons/apple-touch-icon.png',
    'laravel-backend/public/icons/icon-192.png',
    'laravel-backend/public/icons/icon-512.png',
    'laravel-backend/public/icons/maskable-512.png',
  ];
  for (const rel of brandFiles) {
    const abs = path.join(rootDir, rel);
    assert.equal(fs.existsSync(abs), true, `دارایی برند ${rel} موجود است`);
    assert.ok(fs.statSync(abs).size > 2000, `دارایی برند ${rel} معتبر و غیرخالی است`);
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
  assert.match(manifest.name, /تاکسینو.*Taxino/);
  assert.equal(manifest.short_name, 'تاکسینو | Taxino');

  const swText = fs.readFileSync(path.join(rootDir, 'sw.js'), 'utf8');
  assert.match(swText, /icons\/logo\.png/, 'لوگوی رسمی تاکسینو در Service Worker پیش‌کش شده است');
  assert.match(swText, /icons\/apple-touch-icon\.png/, 'آیکون iOS تاکسینو در Service Worker پیش‌کش شده است');

  const backend = await startTestBackend();
  const session = await bootRawDom({
    url: `${backend.baseUrl}/`,
    beforeParse(window) {
      window.fetch = createStatefulFetch(backend.baseUrl, window);
    },
  });
  try {
    assert.match(session.document.title, /تاکسینو \| Taxino/);
    assert.equal(session.document.querySelector('meta[name="application-name"]')?.content, 'تاکسینو | Taxino');
    const loginBannerImg = session.document.querySelector('.auth-logo-banner img');
    assert.ok(loginBannerImg, 'بنر لوگوی رسمی تاکسینو در صفحهٔ ورود نمایش داده شده است');
    assert.match(loginBannerImg.getAttribute('src'), /icons\/logo\.png/);
    assert.match(session.document.querySelector('#auth-login-title')?.textContent || '', /تاکسینو \| Taxino/);

    await session.App.subscription.login('agency@taxi.ir', 'taxi12345', true);
    assert.match(session.document.querySelector('#sidebar .brand-name')?.textContent || '', /تاکسینو/);
    assert.match(session.document.querySelector('#sidebar-brand-icon img')?.getAttribute('src') || '', /icons\/icon-192\.png/);

    go(session, 'about');
    assert.ok(session.document.querySelector('.about-logo-showcase img[src*="icons/logo.png"]'), 'لوگوی کامل تاکسینو در صفحهٔ درباره نمایش داده می‌شود');
  } finally {
    session.dom.window.close();
    await backend.close();
  }
});
