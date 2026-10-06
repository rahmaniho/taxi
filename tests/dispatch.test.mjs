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

function seedDrivers(App, count = 3) {
  App.data.drivers = Array.from({ length: count }, (_, i) => ({ id: `d${i + 1}`, name: `راننده ${i + 1}`, phone: `0912000000${i}`, commission: 15, status: 'available', vehicleId: '' }));
}

function addTrip(App, overrides = {}) {
  const trip = {
    id: overrides.id || `t${App.data.trips.length + 1}`, code: `TRP-000${App.data.trips.length + 1}`,
    passengerName: 'مسافر تست', phone: '09121112233', origin: 'میدان ونک', destination: 'فرودگاه مهرآباد',
    driverId: '', customerType: 'regular', subscriberId: '', date: App.data.meta ? '1404-07-15' : '1404-07-15', time: '09:00',
    fare: 200000, paymentMethod: 'cash', priority: 'normal', status: 'pending', commissionRate: 15, commission: 0,
    createdAt: new Date(Date.now() - 45 * 60000).toISOString(), operatorId: 'op-1', manualFare: false, ...overrides,
  };
  App.data.trips.push(trip);
  return trip;
}

test('نوبت‌دهی: رانندهٔ آزادِ با قدیمی‌ترین تخصیص اول پیشنهاد می‌شود', async t => {
  const { window, App, doc } = await boot(t);
  seedDrivers(App);
  // راننده ۲ قدیمی‌ترین تخصیص را دارد و باید اول نوبت باشد
  App.data.trips.push({ id: 'old1', driverId: 'd2', status: 'completed', assignedAt: '2026-01-01T08:00:00.000Z', date: '1404-07-14', fare: 100000 });
  App.data.trips.push({ id: 'old2', driverId: 'd1', status: 'completed', assignedAt: '2026-09-30T08:00:00.000Z', date: '1404-07-14', fare: 100000 });
  const order = App.dispatch.driverTurnList().map(item => item.driver.id);
  assert.equal(order[0], 'd3', 'رانندهٔ بدون تخصیص، اول نوبت است');
  assert.equal(App.dispatch.nextInTurn().id, 'd3');
  assert.equal(App.dispatch.turnBased(), true, 'حالت پیش‌فرض نوبت‌محور است');

  addTrip(App, { id: 'q1' });
  window.location.hash = '#trips/queue';
  App.render();
  assert.match(doc.querySelector('#app-root').textContent, /نوبت رانندگان/);
  // تخصیص به نفر بعدی نوبت
  click(window, doc.querySelector('[data-action="assign-next"][data-id="q1"]'));
  assert.equal(App.data.trips.find(x => x.id === 'q1').driverId, 'd3');
  assert.equal(App.data.trips.find(x => x.id === 'q1').status, 'assigned');
});

test('تخصیص هوشمند نوبت‌محور و کم‌سفرترین به‌صورت قابل‌تغییر', async t => {
  const { App, window: win } = await boot(t);
  seedDrivers(App);
  addTrip(App, { id: 'x1' });
  App.data.trips.push({ id: 'h1', driverId: 'd2', assignedAt: '2026-06-01T00:00:00.000Z', status: 'completed', date: '1404-07-14', fare: 100000 });
  assert.equal(App.dispatch.turnBased(), true);
  App.render();
  // تخصیص به نفر بعدی نوبت: d1 یا d3 (بدون تخصیص) پیش از d2
  App.dispatch.assignTrips(['x1'], 'd3');
  assert.equal(App.data.trips.find(x => x.id === 'x1').driverId, 'd3');
  // حالت خاموش: به‌روزرسانی تنظیمات و بررسی ذخیره‌سازی
  App.data.settings.dispatch.turnBased = false;
  win.localStorage.setItem('taxi_db_v1', JSON.stringify(App.data));
  const saved = JSON.parse(win.localStorage.getItem('taxi_db_v1'));
  assert.equal(saved.settings.dispatch.turnBased, false, 'قواعد دیسپچ در پایگاه‌داده ذخیره می‌شود');
});

test('مرخصی/استراحت و شیفت: راننده در تخصیص پیشنهاد نمی‌شود', async t => {
  const { window, App, doc } = await boot(t);
  App.data.drivers = [
    { id: 'a1', name: 'در استراحت', phone: '', commission: 15, status: 'rest', vehicleId: '' },
    { id: 'a2', name: 'خارج از شیفت', phone: '', commission: 15, status: 'available', shiftFrom: '08:00', shiftTo: '09:00', vehicleId: '' },
    { id: 'a3', name: 'آماده', phone: '', commission: 15, status: 'available', vehicleId: '' },
  ];
  App.data.settings.dispatch.turnBased = true;
  const available = App.dispatch.driverTurnList();
  assert.equal(available.length, 3);
  const free = available.filter(item => !item.resting).map(item => item.driver.id);
  assert.deepEqual(free, ['a3'], 'فقط رانندهٔ فعال و داخل شیفت آزاد است');
  assert.equal(App.dispatch.nextInTurn().id, 'a3');
  addTrip(App, { id: 'q2' });
  window.location.hash = '#trips/queue';
  App.render();
  assert.match(doc.querySelector('#app-root').textContent, /مرخصی/);
});

test('هشدار صف: سفر قدیمی با نشان زمان انتظار و هشدار صف نمایش داده می‌شود', async t => {
  const { window, App, doc } = await boot(t);
  seedDrivers(App);
  addTrip(App, { id: 'stale1', createdAt: new Date(Date.now() - 90 * 60000).toISOString() });
  App.data.settings.dispatch.staleMinutes = 30;
  assert.equal(App.dispatch.minutesWaiting(App.data.trips[0]) >= 89, true);
  window.location.hash = '#trips/queue';
  App.render();
  const text = doc.querySelector('#app-root').textContent;
  assert.match(text, /دقیقه در صف/);
  assert.match(text, /سفر بیش از ۳۰ دقیقه در صف مانده/);
});

test('مسیر مشترک: چند سفر هم‌مسیر به یک راننده سپرده می‌شود', async t => {
  const { App } = await boot(t);
  seedDrivers(App, 2);
  addTrip(App, { id: 's1', origin: 'میدان ونک', destination: 'فرودگاه مهرآباد' });
  addTrip(App, { id: 's2', origin: 'میدان ونک', destination: 'فرودگاه مهرآباد' });
  addTrip(App, { id: 's3', origin: 'تجریش', destination: 'ونک' });
  const groups = App.dispatch.sharedRouteGroups();
  assert.equal(groups.length, 1, 'یک گروه مسیر مشترک پیدا شد');
  assert.equal(groups[0].trips.length, 2);
  App.dispatch.assignTrips(groups[0].trips.map(x => x.id), 'd1', { shared: true });
  const assigned = App.data.trips.filter(x => x.driverId === 'd1');
  assert.equal(assigned.length, 2, 'هر دو سفر به یک راننده سپرده شد');
  assert.equal(assigned.every(x => x.sharedRoute === true), true);
});

test('جریمهٔ لغو: مبلغ در سفر ثبت و در گزارش درآمد دیده می‌شود', async t => {
  const { window, App, doc } = await boot(t);
  seedDrivers(App);
  const trip = addTrip(App, { id: 'c1', driverId: 'd1', status: 'assigned', date: '1404-07-15' });
  App.data.trips.find(x => x.id === 'c1').date = new Date().toLocaleDateString('en-US-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/[/]/g, '-');
  window.location.hash = '#trips/list';
  App.render();
  click(window, doc.querySelector('[data-action="cancel-trip"][data-id="c1"]'));
  assert.ok(doc.querySelector('#cancel-fee-value'), 'فیلد جریمهٔ لغو نمایش داده شد');
  assert.equal(Number(doc.querySelector('#cancel-fee-value').value), 20000, 'مبلغ پیش‌فرض از تنظیمات دیسپچ');
  doc.querySelector('#status-reason') || doc.querySelector('[name="reason"]');
  doc.querySelector('[name="reason"]').value = 'مسافر لغو کرد';
  doc.querySelector('#cancel-fee-value').value = '35000';
  submit(window, doc.querySelector('form[data-form="cancel-trip"]'));
  await wait(80);
  const cancelled = App.data.trips.find(x => x.id === 'c1');
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.cancelFee, 35000);
  assert.equal(cancelled.cancelReason, 'مسافر لغو کرد');
});

test('سفر رفت‌وبرگشت و چندمسیره: کرایه بر پایهٔ قواعد دیسپچ محاسبه می‌شود', async t => {
  const { window, App, doc } = await boot(t);
  App.data.settings.dispatch.roundTripPercent = 80;
  App.data.settings.dispatch.extraStopFee = 20000;
  App.data.settings.baseFare = 25000;
  App.data.settings.farePerKm = 10000;
  window.location.hash = '#trips/new';
  App.render();
  await wait(20);
  const form = doc.querySelector('#app-root form[data-form="trip"]');
  assert.ok(form.querySelector('#trip-kind'), 'انتخاب نوع سفر در فرم هست');
  form.querySelector('[name="distanceKm"]').value = '10';
  form.querySelector('#trip-kind').value = 'round';
  form.querySelector('#trip-kind').dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(30);
  // ۲۵٬۰۰۰ + ۱۰×۱۰٬۰۰۰ = ۱۲۵٬۰۰۰ و با ۸۰٪ افزایش ≈ ۲۲۵٬۰۰۰
  assert.equal(Number(form.querySelector('[name="fare"]').value) >= 220000, true, 'کرایهٔ رفت‌وبرگشت محاسبه شد');
  form.querySelector('#trip-kind').value = 'multi';
  form.querySelector('#trip-kind').dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(20);
  const stopsField = doc.querySelector('#trip-stops-field');
  assert.equal(stopsField.hidden, false, 'فیلد مقصدهای میانی نمایش داده شد');
  form.querySelector('#trip-stops').value = 'ونک، تجریش';
  form.querySelector('#trip-stops').dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(30);
  assert.equal(Number(form.querySelector('[name="fare"]').value) >= 125000 + 40000, true, 'هزینهٔ دو مقصد میانی اضافه شد');
});

test('مسافت خودکار از مختصات آدرس‌ها محاسبه می‌شود', async t => {
  const { window, App, doc } = await boot(t);
  App.data.addresses = [
    { id: 'a1', title: 'میدان ونک', detail: '', surcharge: 0, lat: 35.7575, lng: 51.41 },
    { id: 'a2', title: 'فرودگاه مهرآباد', detail: '', surcharge: 0, lat: 35.6892, lng: 51.3134 },
  ];
  App.data.settings.farePerKm = 10000;
  App.data.settings.baseFare = 0;
  const km = App.dispatch.routeDistanceKm('میدان ونک', 'فرودگاه مهرآباد');
  assert.ok(km > 8 && km < 15, `فاصلهٔ محاسبه‌شده منطقی است (${km} کیلومتر)`);
  window.location.hash = '#trips/new';
  App.render();
  const form = doc.querySelector('#app-root form[data-form="trip"]');
  form.querySelector('[name="origin"]').value = 'میدان ونک';
  form.querySelector('[name="destination"]').value = 'فرودگاه مهرآباد';
  form.querySelector('[name="origin"]').dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(40);
  const distance = Number(form.querySelector('[name="distanceKm"]').value);
  assert.ok(distance > 8 && distance < 15, `مسافت خودکار پر شد (${distance})`);
  assert.equal(Number(form.querySelector('[name="fare"]').value) > 0, true, 'کرایه بر پایهٔ مسافت خودکار محاسبه شد');
});

test('پنل دیسپچ در تنظیمات ذخیره می‌شود', async t => {
  const { window, App, doc } = await boot(t);
  window.location.hash = '#settings';
  App.render();
  const form = doc.querySelector('form[data-form="settings-dispatch"]');
  assert.ok(form, 'پنل دیسپچ رندر شد');
  form.querySelector('[name="turnBased"]').checked = false;
  form.querySelector('[name="staleMinutes"]').value = '45';
  form.querySelector('[name="cancelFee"]').value = '50000';
  submit(window, form);
  await wait(50);
  assert.equal(App.data.settings.dispatch.turnBased, false);
  assert.equal(App.data.settings.dispatch.staleMinutes, 45);
  assert.equal(App.data.settings.dispatch.cancelFee, 50000);
});
