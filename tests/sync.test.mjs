import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { readApp } from './extract.mjs';

const html = readApp();
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function boot(t) {
  const dom = new JSDOM(html, {
    url: 'https://localhost/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(window) {
      try {
        Object.defineProperty(window, 'crypto', { value: { getRandomValues: a => webcrypto.getRandomValues(a), subtle: webcrypto.subtle }, configurable: true });
      } catch (_) { /* بدون WebCrypto هم برنامه باید کار کند */ }
    },
  });
  const { window } = dom;
  t.after(() => window.close());
  if (window.document.readyState !== 'complete') {
    await Promise.race([new Promise(r => window.addEventListener('load', r, { once: true })), wait(4000)]);
  }
  return { window, doc: window.document, App: window.App };
}

const click = (window, el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
const submit = (window, form) => form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

function today(App) {
  App.accounting.setReportRange({ preset: 'today' });
  return App.accounting.reportRange().from;
}
function seedTrip(App, overrides = {}) {
  const trip = {
    id: overrides.id || `t${App.data.trips.length + 1}`, code: 'TRP-0001', passengerName: 'مسافر', phone: '0912',
    origin: 'میدان ونک', destination: 'فرودگاه', driverId: 'd1', customerType: 'regular', subscriberId: '',
    date: today(App), time: '09:00', fare: 100000, paymentMethod: 'cash', priority: 'normal', status: 'completed',
    commissionRate: 15, commission: 15000, createdAt: new Date().toISOString(), operatorId: 'op-1', manualFare: false, ...overrides,
  };
  App.data.trips.push(trip);
  return trip;
}
function externalDatabase(App, mutate) {
  const copy = JSON.parse(JSON.stringify(App.data));
  mutate(copy);
  return JSON.parse(JSON.stringify(copy));
}

test('مهر نسخه: هر تغییر، rev و اپراتور و زمان را روی رکورد ثبت می‌کند', async t => {
  const { App } = await boot(t);
  seedTrip(App, { id: 't1' });
  App.data.trips.push({ ...App.data.trips[0], id: 't2', code: 'TRP-0002' });
  App.navigate('trips/queue');
  const before = App.sync.recordStamp(App.data.trips[0]);
  const untouched = JSON.parse(JSON.stringify(App.data));
  const summary = App.sync.stampChanges(untouched, App.data, App.data.operators[0]);
  assert.equal(summary.changed, 0, 'رکورد بدون تغییر، مهر تازه نمی‌گیرد');

  const stale = JSON.parse(JSON.stringify(App.data));
  App.data.trips[0].fare = 250000;
  const fresh = App.sync.stampChanges(stale, App.data, App.data.operators[0]);
  assert.equal(fresh.changed, 1);
  assert.equal(App.data.trips[0].rev, 1, 'اولین تغییر، نسخهٔ ۱ می‌سازد');
  assert.equal(App.data.trips[0].updatedBy, App.data.operators[0].name);
  assert.ok(App.sync.recordStamp(App.data.trips[0]) > before, 'زمان تغییر ثبت می‌شود');
  const second = JSON.parse(JSON.stringify(App.data));
  App.data.trips[0].fare = 300000;
  App.sync.stampChanges(second, App.data, App.data.operators[0]);
  assert.equal(App.data.trips[0].rev, 2, 'نسخه در تغییر دوم افزایش می‌یابد');
});

test('گزارش تغییرات محلی: هر ذخیره‌سازی با نام اپراتور و تعداد رکورد ثبت می‌شود', async t => {
  const { App, doc } = await boot(t);
  App.navigate('settings');
  App.render();
  const form = doc.querySelector('form[data-form="settings-company"]');
  form.querySelector('[name="companyName"]').value = 'آژانس تست';
  submit(doc.defaultView, form);
  await wait(20);
  const log = App.sync.log();
  assert.ok(log.length >= 1, 'گزارش تغییر ثبت شد');
  assert.equal(log[0].action, 'ذخیره اطلاعات شرکت');
  assert.equal(log[0].operator, App.data.operators[0].name);
  assert.ok(App.data.settingsUpdatedAt, 'زمان تغییر تنظیمات ثبت می‌شود');

  App.navigate('sync');
  App.render();
  const text = doc.querySelector('#app-root').textContent;
  assert.match(text, /گزارش تغییرات محلی/);
  assert.match(text, /ذخیره اطلاعات شرکت/);
});

test('ادغام دو پایگاه‌داده: افزودن رکورد تازه، به‌روزرسانی و تضاد', async t => {
  const { App } = await boot(t);
  seedTrip(App, { id: 't1' });
  const incoming = externalDatabase(App, copy => {
    copy.trips[0].rev = 3;
    copy.trips[0].updatedAt = new Date(Date.now() + 60000).toISOString();
    copy.trips[0].fare = 500000;
    copy.trips.push({ ...copy.trips[0], id: 't9', code: 'TRP-0009', fare: 700000, updatedAt: new Date(Date.now() + 90000).toISOString() });
  });

  const preview = App.sync.mergeDatabases({ data: incoming, device: 'دستگاه دفتر' }, { strategy: 'newer', dryRun: true });
  assert.equal(preview.added, 1, 'پیش‌نمایش رکورد تازه را می‌شمارد');
  assert.equal(preview.updated, 1, 'پیش‌نمایش به‌روزرسانی را می‌شمارد');
  assert.equal(App.data.trips.length, 1, 'پیش‌نمایش داده را تغییر نمی‌دهد');

  const summary = App.sync.mergeDatabases({ data: incoming, device: 'دستگاه دفتر' }, { strategy: 'newer' });
  assert.equal(summary.added, 1);
  assert.equal(summary.updated, 1);
  assert.equal(App.data.trips.length, 2, 'رکورد تازه افزوده شد');
  assert.equal(App.data.trips.find(x => x.id === 't1').fare, 500000, 'نسخهٔ جدیدتر برنده شد');
  assert.equal(App.data.trips.find(x => x.id === 't1').mergedFrom, 'دستگاه دفتر');
  assert.ok(summary.byCollection.trips.updated >= 1);

  // رکورد محلی جدیدتر: تضاد و بی‌تغییر ماندن
  const stale = externalDatabase(App, copy => {
    const trip = copy.trips.find(x => x.id === 't9');
    trip.updatedAt = '2020-01-01T00:00:00.000Z';
    trip.fare = 1;
  });
  const localFare = App.data.trips.find(x => x.id === 't9').fare;
  const report = App.sync.mergeDatabases({ data: stale, device: 'دستگاه قدیمی' }, { strategy: 'newer' });
  assert.equal(report.conflicts, 2, 'نسخه‌های قدیمی‌تر/هم‌زمان ورودی، تضاد شمرده می‌شوند');
  assert.equal(report.updated, 0, 'در تضاد، نسخهٔ محلی برنده است');
  assert.equal(App.data.trips.find(x => x.id === 't9').fare, localFare, 'نسخهٔ محلی حفظ شد');

  // سیاست «فقط افزودن»: رکوردهای موجود دست‌نخورده می‌مانند
  const forced = externalDatabase(App, copy => { copy.trips.find(x => x.id === 't1').fare = 999; });
  const addOnly = App.sync.mergeDatabases({ data: forced, device: 'دستگاه سوم' }, { strategy: 'addOnly' });
  assert.equal(addOnly.updated, 0, 'در حالت فقط‌افزودن چیزی به‌روز نمی‌شود');
  assert.notEqual(App.data.trips.find(x => x.id === 't1').fare, 999);
});

test('ادغام: تنظیمات جدیدتر منتقل می‌شود اما امنیت و بازهٔ گزارش محلی می‌ماند', async t => {
  const { App } = await boot(t);
  App.data.settings.companyName = 'آژانس محلی';
  App.data.settingsUpdatedAt = '2026-01-01T00:00:00.000Z';
  App.data.settings.reportRange = { preset: 'custom', from: '1405-01-01', to: '1405-01-05' };
  const incoming = externalDatabase(App, copy => {
    copy.settings.companyName = 'آژانس شعبه';
    copy.settings.farePerKm = 20000;
    copy.settings.reportRange = { preset: 'today', from: '', to: '' };
    copy.settings.security = { requirePin: true, autoLockMinutes: 1, lockOnHide: true };
    copy.settingsUpdatedAt = new Date(Date.now() + 120000).toISOString();
  });
  const summary = App.sync.mergeDatabases({ data: incoming, device: 'دستگاه شعبه' }, { strategy: 'newer' });
  assert.equal(summary.settingsMerged, true);
  assert.equal(App.data.settings.companyName, 'آژانس شعبه', 'تنظیمات جدیدتر منتقل شد');
  assert.equal(App.data.settings.farePerKm, 20000);
  assert.equal(App.data.settings.reportRange.from, '1405-01-01', 'بازهٔ گزارش محلی حفظ می‌شود');
  assert.equal(App.data.settings.security.requirePin, false, 'تنظیمات امنیتی این دستگاه دست‌نخورده می‌ماند');

  const blocked = externalDatabase(App, copy => { copy.settings.companyName = 'شعبه دوم'; });
  const report = App.sync.mergeDatabases({ data: blocked, device: 'دستگاه سوم' }, { strategy: 'addOnly' });
  assert.equal(report.settingsMerged, false, 'در حالت فقط‌افزودن تنظیمات ادغام نمی‌شود');
  assert.equal(App.data.settings.companyName, 'آژانس شعبه');
});

test('همگام‌سازی زنده: پیام پنجرهٔ دیگر داده‌ها را به‌روزرسانی می‌کند و قابل خاموش‌کردن است', async t => {
  const { window, App, doc } = await boot(t);
  seedTrip(App, { id: 't1' });
  const other = JSON.parse(window.localStorage.getItem('taxi_db_v1'));
  other.trips.push({ ...other.trips[0], id: 'peer-trip', code: 'TRP-0200', fare: 333000 });
  window.localStorage.setItem('taxi_db_v1', JSON.stringify(other));

  App.sync.handlePeer({ type: 'hello', device: 'DEV-PEER' });
  assert.ok(App.sync.peers().includes('DEV-PEER'), 'پنجرهٔ دیگر در فهرست همتا ثبت می‌شود');

  App.sync.handlePeer({ type: 'db-updated', device: 'DEV-PEER', at: Date.now() });
  await wait(30);
  assert.ok(App.data.trips.some(x => x.id === 'peer-trip'), 'دادهٔ تازه از پنجرهٔ دیگر خوانده شد');
  assert.match(doc.querySelector('#toast-container').textContent, /به‌روزرسانی شد/);

  // خاموش‌کردن همگام‌سازی زنده
  App.sync.info().live = false;
  const blocked = JSON.parse(window.localStorage.getItem('taxi_db_v1'));
  blocked.trips.push({ ...blocked.trips[0], id: 'blocked-trip', code: 'TRP-0300' });
  window.localStorage.setItem('taxi_db_v1', JSON.stringify(blocked));
  App.sync.handlePeer({ type: 'db-updated', device: 'DEV-PEER', at: Date.now() });
  await wait(20);
  assert.equal(App.data.trips.some(x => x.id === 'blocked-trip'), false, 'با همگام‌سازی خاموش، تغییر اعمال نمی‌شود');

  // رویداد storage مرورگر هم پذیرفته می‌شود
  App.sync.info().live = true;
  App.sync.adoptExternalChange('پنجرهٔ دیگر');
  await wait(20);
  assert.ok(App.data.trips.some(x => x.id === 'blocked-trip'), 'به‌روزرسانی دستی کار می‌کند');
});

test('بستهٔ همگام‌سازی: دانلود، بارگذاری فایل و ادغام از مسیر رابط', async t => {
  const { window, doc, App } = await boot(t);
  seedTrip(App, { id: 't1' });
  click(window, doc.querySelector('[data-route="sync"]') || doc.querySelector('#app-root [data-route="sync"]'));
  window.location.hash = '#sync';
  App.render();
  const link = [...doc.querySelectorAll('.nav-item')].find(el => el.dataset.route === 'sync') || doc.querySelector('[data-route="sync"]');
  assert.ok(link, 'مسیر همگام‌سازی در ناوبری هست');
  click(window, link);
  await wait(20);
  assert.equal(window.location.hash, '#sync');
  assert.match(doc.querySelector('#app-root').textContent, /همگام‌سازی/);
  assert.ok(doc.querySelector('#sync-status'), 'کارت وضعیت همگام‌سازی نمایش داده می‌شود');

  click(window, doc.querySelector('[data-action="sync-export"]'));
  await wait(20);
  assert.ok(App.sync.info().lastExportAt, 'زمان ساخت بسته ثبت می‌شود');

  // فایل بستهٔ همگام‌سازی از «دستگاه دیگر»
  const foreign = JSON.parse(JSON.stringify(App.data));
  foreign.trips.push({ ...foreign.trips[0], id: 'foreign-trip', code: 'TRP-0500', fare: 480000, updatedAt: new Date(Date.now() + 60000).toISOString(), rev: 4 });
  const bundle = new window.File([JSON.stringify({ kind: 'karnsoft-taxi-sync', device: 'دفتر مرکزی', operator: 'مدیر', at: new Date().toISOString(), counts: { trips: foreign.trips.length }, data: foreign })], 'sync.json', { type: 'application/json' });
  App.sync.importFile(bundle);
  await wait(60);
  assert.ok(doc.querySelector('#modal-root').textContent.includes('ادغام بستهٔ همگام‌سازی'), 'مودال پیش‌نمایش ادغام باز شد');
  const form = doc.querySelector('form[data-form="sync-merge"]');
  form.querySelector('[name="strategy"]').value = 'newer';
  submit(window, form);
  await wait(40);
  assert.ok(App.data.trips.some(x => x.id === 'foreign-trip'), 'رکورد بستهٔ ورودی ادغام شد');
  assert.equal(App.data.trips.length, 2, 'رکورد تکراری اضافه نشد');
  assert.ok(App.sync.info().lastMergeAt, 'زمان ادغام ثبت شد');
  const report = App.sync.lastReport();
  assert.equal(report.added, 1);
  assert.match(doc.querySelector('#app-root').textContent, /آخرین گزارش ادغام|ادغام انجام شد/);
});

test('صندوق شیفت: محاسبهٔ مبلغ موردانتظار، ثبت اختلاف و بستن شیفت', async t => {
  const { window, doc, App } = await boot(t);
  const date = today(App);
  App.data.drivers = [{ id: 'd1', name: 'راننده یک', phone: '0912', commission: 15, status: 'available', vehicleId: '' }];
  App.data.trips = [];
  App.sync.startShift();
  await wait(20);
  const shift = App.sync.currentShift();
  assert.ok(shift, 'شیفت آغاز شد');
  seedTrip(App, { id: 'c1', paymentMethod: 'cash', fare: 100000, commission: 15000, status: 'completed' });
  seedTrip(App, { id: 'k1', paymentMethod: 'card', fare: 200000, commission: 30000, status: 'completed' });
  App.data.subscriberPayments.push({ id: 'sp1', subscriberId: 's1', amount: 50000, date, method: 'نقدی', operatorId: 'op-1', createdAt: new Date().toISOString() });
  App.data.expenses.push({ id: 'x1', title: 'سوخت', category: 'سوخت', amount: 20000, date, operatorId: 'op-1', createdAt: new Date().toISOString() });
  const cash = App.sync.shiftCash(shift);
  assert.equal(cash.commissionCash, 15000, 'کمیسیون سفر نقدی در صندوق');
  assert.equal(cash.cardFare, 200000, 'کرایهٔ کارتی در صندوق');
  assert.equal(cash.received, 50000);
  assert.equal(cash.expenses, 20000);
  assert.equal(cash.total, 245000, 'جمع صندوق = کمیسیون نقدی + کرایهٔ کارتی + دریافتی − هزینه');

  window.location.hash = '#sync';
  App.render();
  assert.match(doc.querySelector('#app-root').textContent, /صندوق شیفت جاری/);
  click(window, doc.querySelector('[data-action="shift-close"]'));
  const form = doc.querySelector('form[data-form="shift-close"]');
  assert.ok(form, 'مودال بستن شیفت باز شد');
  assert.equal(Number(form.querySelector('[name="counted"]').value), 245000, 'مبلغ شمارش‌شده پیشنهادی');
  form.querySelector('[name="counted"]').value = '240000';
  form.querySelector('[name="note"]').value = 'کسری نقدی';
  submit(window, form);
  await wait(30);
  const closed = App.data.shifts[0];
  assert.ok(closed.endedAt, 'شیفت بسته شد');
  assert.equal(closed.expectedCash, 245000);
  assert.equal(closed.countedCash, 240000);
  assert.equal(closed.variance, -5000, 'اختلاف صندوق ثبت می‌شود');
  assert.equal(closed.note, 'کسری نقدی');
  assert.equal(App.sync.currentShift(), null, 'پس از بستن، شیفتی باز نیست');
  assert.match(doc.querySelector('#app-root').textContent, /شیفت‌ها و تحویل صندوق/);
  assert.match(doc.querySelector('#app-root').textContent, /کسری|۲۴۵|۲۴۰/, 'جدول شیفت‌ها مبالغ را نشان می‌دهد');
});

test('عملکرد اپراتورها: شمارش سفر، پرداخت و صندوق تخمینی هر اپراتور', async t => {
  const { window, doc, App } = await boot(t);
  const date = today(App);
  App.data.operators = [
    { id: 'op-1', name: 'مدیر', role: 'مدیر', active: true },
    { id: 'op-2', name: 'اپراتور دوم', role: 'اپراتور', active: true },
  ];
  App.data.meta.currentOperatorId = 'op-1';
  seedTrip(App, { id: 'o1', operatorId: 'op-1', paymentMethod: 'cash', fare: 100000, commission: 15000 });
  seedTrip(App, { id: 'o2', operatorId: 'op-2', paymentMethod: 'card', fare: 300000, commission: 45000 });
  App.data.subscriberPayments.push({ id: 'sp1', subscriberId: 's1', amount: 70000, date, operatorId: 'op-2', createdAt: new Date().toISOString() });

  const activity = App.sync.operatorActivity();
  const first = activity.find(row => row.operator.id === 'op-1');
  const second = activity.find(row => row.operator.id === 'op-2');
  assert.equal(first.trips, 1);
  assert.equal(first.cash, 15000, 'صندوق اپراتور اول = کمیسیون سفر نقدی');
  assert.equal(second.trips, 1);
  assert.equal(second.collected, 70000);
  assert.equal(second.cash, 370000, 'کرایهٔ کارتی + دریافتی مشترک');

  window.location.hash = '#sync';
  App.render();
  const text = doc.querySelector('#app-root').textContent;
  assert.match(text, /عملکرد اپراتورها/);
  assert.match(text, /اپراتور دوم/);
});

test('دسترسی: اپراتور عادی کارت‌های مدیریتی همگام‌سازی را نمی‌بیند', async t => {
  const { window, doc, App } = await boot(t);
  App.data.operators = [
    { id: 'op-1', name: 'مدیر', role: 'مدیر', active: true },
    { id: 'op-2', name: 'اپراتور دوم', role: 'اپراتور', active: true },
  ];
  App.data.meta.currentOperatorId = 'op-2';
  window.location.hash = '#sync';
  App.render();
  const text = doc.querySelector('#app-root').textContent;
  assert.match(text, /همگام‌سازی و اپراتورها/, 'اپراتور عادی به صفحهٔ همگام‌سازی دسترسی دارد');
  assert.match(text, /صندوق شیفت جاری/);
  assert.doesNotMatch(text, /ادغام با دستگاه دیگر/, 'کارت ادغام برای اپراتور عادی پنهان است');
  assert.equal(doc.querySelector('[data-action="sync-export"]'), null, 'دکمهٔ ساخت بستهٔ همگام‌سازی پنهان است');
  assert.equal(doc.querySelector('[data-action="shift-close"]') === null, true, 'بدون شیفت باز، دکمهٔ بستن شیفت نیست');
});
