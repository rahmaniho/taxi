import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { readApp } from './extract.mjs';

const html = readApp();
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function boot(t, { prefersDark = null } = {}) {
  const dom = new JSDOM(html, {
    url: 'https://localhost/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(window) {
      try {
        Object.defineProperty(window, 'crypto', { value: { getRandomValues: a => webcrypto.getRandomValues(a), subtle: webcrypto.subtle }, configurable: true });
      } catch (_) { /* بدون WebCrypto هم برنامه باید کار کند */ }
      if (prefersDark !== null) {
        Object.defineProperty(window, 'matchMedia', {
          configurable: true,
          value: query => ({ matches: /prefers-color-scheme:\s*dark/.test(query) ? prefersDark : false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
        });
      }
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
const press = (window, key, options = {}) => window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options }));

function seedDriver(App, overrides = {}) {
  const driver = { id: 'd1', name: 'راننده یک', phone: '09120000001', license: 'L1', commission: 15, status: 'available', vehicleId: '', ...overrides };
  App.data.drivers.push(driver);
  return driver;
}

test('گردش‌کار کامل سفر: ثبت، تخصیص، شروع، تکمیل و محاسبهٔ کمیسیون و مالیات', async t => {
  const { window, doc, App } = await boot(t);
  seedDriver(App);
  App.data.settings.commissionDefault = 20;
  App.data.settings.taxRate = 9;

  window.location.hash = '#trips/new';
  App.render();

  await wait(20);
  const form = doc.querySelector('form[data-form="trip"]');
  form.querySelector('[name="passengerName"]').value = 'مسافر گردش‌کار';
  form.querySelector('[name="phone"]').value = '09121234567';
  form.querySelector('[name="origin"]').value = 'میدان ونک';
  form.querySelector('[name="destination"]').value = 'فرودگاه مهرآباد';
  form.querySelector('[name="distanceKm"]').value = '0';
  form.querySelector('[name="fare"]').value = '0';
  form.querySelector('[name="fare"]').dataset.manual = 'false';
  form.querySelector('[name="time"]').value = '12:00';
  form.querySelector('#trip-distance').dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(20);
  assert.ok(Number(form.querySelector('[name="fare"]').value) > 0, 'کرایه به‌صورت خودکار برآورد شد');
  submit(window, form);
  await wait(20);
  const trip = App.data.trips.find(item => item.passengerName === 'مسافر گردش‌کار');
  assert.ok(trip, 'سفر ثبت شد');
  assert.equal(trip.status, 'pending');
  assert.ok(Number(trip.fare) > 0, 'کرایه به‌صورت خودکار برآورد شد');
  assert.equal(trip.operatorId, App.data.operators[0].id, 'اپراتور ثبت‌کننده ثبت می‌شود');

  // تخصیص از صف
  window.location.hash = '#trips/queue';
  App.render();
  await wait(30);
  const assignButton = doc.querySelector(`[data-action="assign-next"][data-id="${trip.id}"]`) || doc.querySelector(`[data-action="assign-trip"][data-id="${trip.id}"]`);
  assert.ok(assignButton, 'دکمهٔ تخصیص در صف هست');
  click(window, assignButton);
  await wait(20);
  const assigned = App.data.trips.find(item => item.id === trip.id);
  assert.equal(assigned.status, 'assigned');
  assert.equal(assigned.driverId, 'd1');
  assert.equal(App.data.drivers[0].status, 'busy', 'راننده مشغول شد');

  // شروع و تکمیل
  window.location.hash = '#trips/list';
  App.render();
  await wait(20);
  click(window, doc.querySelector(`[data-action="start-trip"][data-id="${trip.id}"]`));
  await wait(20);
  assert.equal(App.data.trips.find(item => item.id === trip.id).status, 'inProgress');
  click(window, doc.querySelector(`[data-action="complete-trip"][data-id="${trip.id}"]`));
  const confirm = doc.querySelector('#confirm-action');
  if (confirm) click(window, confirm);
  await wait(30);
  const done = App.data.trips.find(item => item.id === trip.id);
  assert.equal(done.status, 'completed');
  assert.equal(done.commissionRate, 15, 'نرخ کمیسیون اختصاصی راننده بر تنظیمات پیشی می‌گیرد');
  assert.equal(done.commission, Math.round(Number(done.fare) * 0.15), 'کمیسیون محاسبه شد');
  assert.equal(done.tax, Math.round(Number(done.fare) * 0.09), 'مالیات محاسبه شد');
  assert.equal(App.data.drivers[0].status, 'available', 'راننده پس از تکمیل آزاد می‌شود');
  // راننده بدون نرخ اختصاصی: نرخ پیش‌فرض تنظیمات
  App.data.drivers[0].commission = null;
  App.data.settings.commissionDefault = 20;
  const secondFare = 200000;
  App.data.trips.push({ ...done, id: 't9', code: 'TRP-0009', status: 'completed', fare: secondFare, commissionRate: null, commission: 0 });
  const statement = App.fares.driverStatement('d1');
  assert.equal(statement.fare, Number(done.fare) + secondFare, 'صورتحساب راننده مجموع کرایه را می‌شمارد');
  assert.ok(statement.commission >= done.commission, 'کمیسیون راننده در صورتحساب هست');
});

test('تاریخ جلالی: تبدیل دوطرفه، طول ماه‌ها، سال کبیسه و اعتبار تاریخ', async t => {
  const { App } = await boot(t);
  const calendar = App.calendar;
  const today = calendar.today();
  assert.match(today, /^\d{4}-\d{2}-\d{2}$/, 'امروز تاریخ شمسی معتبر است');
  assert.equal(calendar.valid(today), true);
  assert.equal(calendar.valid('1404-13-01'), false, 'ماه ۱۳ وجود ندارد');
  assert.equal(calendar.valid('1404-07-32'), false, 'روز ۳۲ وجود ندارد');
  assert.equal(calendar.valid('2026-10-07'), false, 'تاریخ میلادی معتبر شمسی نیست');
  assert.equal(calendar.valid(''), false);

  const gregorian = calendar.toGregorian('1404-07-15');
  assert.equal(gregorian.getFullYear(), 2025, '۱۵ مهر ۱۴۰۴ برابر اکتبر ۲۰۲۵ است');
  const back = calendar.fromGregorian(gregorian.getFullYear(), gregorian.getMonth() + 1, gregorian.getDate());
  assert.equal(back.jy, 1404);
  assert.equal(back.jm, 7);
  assert.equal(back.jd, 15, 'تبدیل رفت‌وبرگشت درست است');

  assert.equal(calendar.monthLength(1404, 1), 31);
  assert.equal(calendar.monthLength(1404, 7), 30);
  assert.equal(calendar.monthLength(1403, 12), 30, 'اسفند سال کبیسه ۱۴۰۳ سی روز است');
  assert.equal(calendar.monthLength(1404, 12), 29, 'اسفند سال عادی ۲۹ روز است');
  const parts = calendar.parts('1404-07-15');
  assert.equal(parts.y, 1404);
  assert.equal(parts.m, 7);
  assert.equal(parts.d, 15);
  assert.equal(calendar.monthBounds(1404, 12).to, '1404-12-29');
  assert.equal(calendar.daysAgo(0), today, 'صفر روز قبل، امروز است');
  assert.notEqual(calendar.daysAgo(7), today);
  assert.ok(calendar.format('1404-07-15').includes('۱۴۰۴'), 'قالب‌بندی فارسی است');
});

test('برآورد کرایه: مسافت، سفر رفت‌وبرگشت، مقصد میانی، تعرفهٔ شب و تعطیلات', async t => {
  const { window, doc, App } = await boot(t);
  const utils = App.utils;
  const calendar = App.calendar;
  App.data.settings.baseFare = 25000;
  App.data.settings.farePerKm = 10000;
  App.data.settings.nightRateMultiplier = 1.5;
  App.data.settings.holidayRateMultiplier = 2;
  App.data.settings.dispatch.roundTripPercent = 80;
  App.data.settings.dispatch.extraStopFee = 20000;
  App.data.addresses.push({ id: 'a1', title: 'میدان ونک', detail: '', surcharge: 5000, lat: 35.7575, lng: 51.4104 });
  App.data.addresses.push({ id: 'a2', title: 'فرودگاه مهرآباد', detail: '', surcharge: 0, lat: 35.6892, lng: 51.3134 });
  App.data.addresses.push({ id: 'a3', title: 'میدان آزادی', detail: '', surcharge: 0, lat: 35.6997, lng: 51.3889 });

  window.location.hash = '#trips/new';
  App.render();

  await wait(20);
  const form = doc.querySelector('form[data-form="trip"]');
  const kind = form.querySelector('#trip-kind');
  const fareInput = form.querySelector('[name="fare"]');
  form.querySelector('[name="origin"]').value = 'میدان ونک';
  form.querySelector('[name="destination"]').value = 'فرودگاه مهرآباد';
  form.querySelector('[name="time"]').value = '12:00';
  form.querySelector('[name="distanceKm"]').value = '10';
  form.querySelector('[name="date"]').value = '1404-07-15';
  kind.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(20);
  assert.equal(Number(fareInput.value), 130000, 'پایه + مسافت + عوارض منطقه');

  kind.value = 'round';
  kind.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(20);
  assert.equal(Number(fareInput.value), 234000, 'سفر رفت‌وبرگشت با ۸۰٪ افزایش');

  kind.value = 'multi';
  form.querySelector('[name="stops"]').value = 'میدان آزادی، چهارراه ولیعصر';
  kind.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(20);
  assert.equal(Number(fareInput.value), 170000, 'پایه + مسافت + دو مقصد میانی (بدون عوارض آزادی)');

  // مسافت خودکار از مختصات آدرس‌ها
  form.querySelector('[name="distanceKm"]').value = '0';
  kind.value = 'oneWay';
  form.querySelector('[name="stops"]').value = '';
  const origin = form.querySelector('[name="origin"]');
  origin.value = 'میدان ونک';
  origin.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(20);
  const auto = Number(form.querySelector('[name="distanceKm"]').value);
  assert.ok(auto > 9 && auto < 14, `مسافت خودکار ونک تا مهرآباد از مختصات محاسبه شد (${auto})`);

  // تعرفهٔ شب
  form.querySelector('[name="distanceKm"]').value = '10';
  form.querySelector('[name="time"]').value = '23:30';
  form.querySelector('[name="time"]').dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(20);
  const night = Number(fareInput.value);
  form.querySelector('[name="time"]').value = '12:00';
  form.querySelector('[name="time"]').dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(20);
  assert.ok(night > Number(fareInput.value), 'کرایهٔ شبانه بیشتر است');

  // تعرفهٔ تعطیلات: جمعه
  const friday = (() => {
    for (let day = 1; day <= 31; day += 1) {
      const value = `1404-07-${String(day).padStart(2, '0')}`;
      const g = calendar.toGregorian(value);
      if (g.getDay() === 5) return value;
    }
    return '';
  })();
  assert.ok(friday, 'یک جمعه در مهر ۱۴۰۴ پیدا شد');
  const weekday = (() => {
    for (let day = 1; day <= 31; day += 1) {
      const value = `1404-07-${String(day).padStart(2, '0')}`;
      const g = calendar.toGregorian(value);
      if (g.getDay() === 3) return value;
    }
    return '';
  })();
  const fareForDate = async value => {
    const input = form.querySelector('[name="date"]');
    input.value = value;
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
    await wait(20);
    return Number(fareInput.value);
  };
  const fridayFare = await fareForDate(friday);
  const weekdayFare = await fareForDate(weekday);
  assert.equal(fridayFare, weekdayFare * 2, 'ضریب تعطیلات اعمال می‌شود');
  assert.match(utils.money(1234567), /۱٬۲۳۴٬۵۶۷/, 'قالب‌بندی مبلغ فارسی است');
  assert.equal(utils.toEnglish('۱۲۳'), '123');
});

test('میان‌بُرهای کیبورد: N، / و Ctrl+K و بی‌اثر بودن در حالت تایپ', async t => {
  const { window, doc, App } = await boot(t);
  press(window, 'n');
  assert.equal(window.location.hash, '#trips/new', 'کلید N سفر جدید را باز می‌کند');
  App.render();

  const input = doc.querySelector('#app-root input');
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'n', bubbles: true, cancelable: true }));
  assert.equal(window.location.hash, '#trips/new', 'تایپ در ورودی میان‌بُر را فعال نمی‌کند');

  press(window, '/');
  await wait(10);
  assert.ok(doc.querySelector('#quick-search-input'), 'کلید / جست‌وجوی سریع را باز می‌کند');
  click(window, doc.querySelector('#modal-root [data-action="close-modal"]'));
  press(window, 'k', { ctrlKey: true });
  await wait(10);
  assert.ok(doc.querySelector('#quick-search-input'), 'Ctrl+K جست‌وجوی سریع را باز می‌کند');
  press(window, 'Escape');
  assert.equal(doc.querySelector('#quick-search-input'), null, 'Esc پنجره را می‌بندد');
  press(window, '?');
  assert.equal(window.location.hash, '#tutorial', 'کلید ? راهنما را باز می‌کند');
});

test('جست‌وجوی سریع: یافتن سفر، راننده، مشترک و آدرس و باز کردن پرونده', async t => {
  const { window, doc, App } = await boot(t);
  seedDriver(App, { name: 'حسن رضایی', phone: '09123334444' });
  App.data.subscribers.push({ id: 's1', name: 'شرکت الف', phone: '09125556666', type: 'legal', active: true });
  App.data.addresses.push({ id: 'a1', title: 'ترمینال جنوب', detail: 'تهران', surcharge: 0 });
  App.data.trips.push({ id: 't1', code: 'TRP-0001', passengerName: 'زهرا محمدی', phone: '09121230000', origin: 'ونک', destination: 'تجریش', date: App.calendar.today(), status: 'completed', fare: 100000, driverId: 'd1' });

  const results = App.quality.quickSearchResults('زهرا');
  assert.equal(results.trips.length, 1, 'سفر با نام مسافر پیدا می‌شود');
  assert.equal(App.quality.quickSearchResults('حسن').drivers.length, 1);
  assert.equal(App.quality.quickSearchResults('شرکت').subscribers.length, 1);
  assert.equal(App.quality.quickSearchResults('جنوب').addresses.length, 1);
  assert.deepEqual(Object.values(App.quality.quickSearchResults('ز')).map(list => list.length), [0, 0, 0, 0], 'کمتر از دو حرف نتیجه‌ای ندارد');

  window.location.hash = '#trips/list';
  App.render();

  await wait(20);
  click(window, doc.querySelector('[data-action="quick-search"]') || doc.querySelector('[data-action="new-trip"]'));
  press(window, '/');
  await wait(10);
  const searchInput = doc.querySelector('#quick-search-input');
  searchInput.value = 'زهرا';
  searchInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  await wait(10);
  const box = doc.querySelector('#quick-search-results');
  assert.match(box.textContent, /زهرا محمدی/);
  assert.match(box.textContent, /سفرها/);
  click(window, box.querySelector('[data-action="quick-open"][data-kind="trip"]'));
  await wait(10);
  assert.ok(doc.querySelector('#modal-root form[data-form="trip"]'), 'پروندهٔ سفر برای ویرایش باز شد');
  assert.ok(doc.querySelector('#quick-search-input') === null, 'پنجرهٔ جست‌وجو بسته شد');
});

test('یادداشت داخلی سفر: ثبت از فهرست، نمایش و ویرایش', async t => {
  const { window, doc, App } = await boot(t);
  seedDriver(App);
  App.data.trips.push({ id: 't1', code: 'TRP-0001', passengerName: 'مسافر یادداشت', phone: '0912', origin: 'ونک', destination: 'تجریش', date: App.calendar.today(), status: 'completed', fare: 100000, driverId: 'd1' });
  window.location.hash = '#trips/list';
  App.render();
  await wait(20);
  click(window, doc.querySelector('[data-action="trip-note"][data-id="t1"]'));
  const form = doc.querySelector('form[data-form="trip-note"]');
  assert.ok(form, 'پنجرهٔ یادداشت باز شد');
  form.querySelector('[name="note"]').value = 'کرایه نقدی، مسافر سالمند';
  submit(window, form);
  await wait(20);
  assert.equal(App.data.trips[0].note, 'کرایه نقدی، مسافر سالمند');
  assert.match(doc.querySelector('#app-root').textContent, /مسافر سالمند/, 'یادداشت در فهرست دیده می‌شود');
  assert.equal(App.quality.tripNote(App.data.trips[0]), 'کرایه نقدی، مسافر سالمند');

  // پاک کردن یادداشت
  click(window, doc.querySelector('[data-action="trip-note"][data-id="t1"]'));
  const form2 = doc.querySelector('form[data-form="trip-note"]');
  form2.querySelector('[name="note"]').value = '';
  submit(window, form2);
  await wait(20);
  assert.equal(App.data.trips[0].note, '');
});

test('تکرار سفر: سفر تکمیل‌شده به صف انتظار برمی‌گردد', async t => {
  const { window, doc, App } = await boot(t);
  seedDriver(App);
  const source = { id: 't1', code: 'TRP-0001', passengerName: 'مسافر همیشگی', phone: '09121112222', origin: 'ونک', destination: 'مهرآباد', date: '1404-07-15', time: '08:30', status: 'completed', fare: 150000, commission: 22500, driverId: 'd1', paymentMethod: 'cash', note: 'همیشه نقدی', receiptNumber: 'RCP-1404-0001' };
  App.data.trips.push(source);
  window.location.hash = '#trips/list';
  App.render();
  await wait(20);
  click(window, doc.querySelector('[data-action="repeat-trip"][data-id="t1"]'));
  await wait(30);
  assert.equal(App.data.trips.length, 2, 'سفر تازه ساخته شد');
  const copy = App.data.trips[1];
  assert.notEqual(copy.id, source.id);
  assert.equal(copy.status, 'pending', 'سفر تکراری در صف انتظار است');
  assert.equal(copy.driverId, '', 'راننده پاک می‌شود');
  assert.equal(copy.fare, 150000, 'کرایه حفظ می‌شود');
  assert.equal(copy.note, 'همیشه نقدی');
  assert.equal(copy.receiptNumber, '', 'شمارهٔ رسید قبلی منتقل نمی‌شود');
  assert.equal(copy.date, App.calendar.today(), 'تاریخ امروز می‌شود');
  assert.equal(window.location.hash, '#trips/queue', 'به صف انتظار می‌رود');
  assert.equal(App.data.trips.filter(item => item.id === 't1').length, 1, 'سفر اصلی دست‌نخورده است');
});

test('کارت سفرهای امروز رانندگان و کارت کیفیت داده', async t => {
  const { window, doc, App } = await boot(t);
  seedDriver(App, { name: 'راننده امروز' });
  const today = App.calendar.today();
  App.data.trips.push({ id: 't1', code: 'TRP-0001', passengerName: 'الف', origin: 'ونک', destination: 'تجریش', date: today, status: 'completed', fare: 200000, commission: 30000, driverId: 'd1' });
  App.data.trips.push({ id: 't2', code: 'TRP-0002', passengerName: 'ب', origin: 'ونک', destination: 'تجریش', date: today, status: 'inProgress', fare: 100000, commission: 0, driverId: 'd1' });
  App.data.trips.push({ id: 't3', code: 'TRP-0003', passengerName: 'ج', origin: 'ونک', destination: 'تجریش', date: '1400-01-01', status: 'completed', fare: 900000, commission: 0, driverId: 'd1' });

  const rows = App.quality.driverTodayRows();
  assert.equal(rows[0].total, 2, 'فقط سفرهای امروز شمرده می‌شوند');
  assert.equal(rows[0].done, 1);
  assert.equal(rows[0].active, 1);
  assert.equal(rows[0].fare, 200000);
  assert.equal(rows[0].commission, 30000);
  assert.equal(App.quality.totalFareForDate(today), 200000);

  window.location.hash = '#dashboard';
  App.render();

  await wait(20);
  const text = doc.querySelector('#app-root').textContent;
  assert.match(text, /سفرهای امروز رانندگان/);
  assert.match(text, /راننده امروز/);

  window.location.hash = '#settings';
  App.render();

  await wait(20);
  const settingsText = doc.querySelector('#app-root').textContent;
  assert.match(settingsText, /کیفیت داده و دسترس‌پذیری/);
  assert.match(settingsText, /میان‌بُرها/, 'راهنمای میان‌بُرها نمایش داده می‌شود');
});

test('پوستهٔ پیش‌فرض بر پایهٔ تنظیم سیستم انتخاب می‌شود', async t => {
  const light = await boot(t, { prefersDark: false });
  assert.equal(light.App.quality.defaultTheme(), 'light');
  assert.equal(light.window.document.documentElement.dataset.theme, 'light', 'در سیستم روشن، پوستهٔ روشن');
  assert.equal(light.App.data.settings.theme, '', 'پوستهٔ کاربر خالی می‌ماند تا از سیستم پیروی کند');
  const toggle = light.doc.querySelector('[data-action="theme"]');
  click(light.window, toggle);
  await wait(10);
  assert.equal(light.App.data.settings.theme, 'light');
  assert.equal(light.window.document.documentElement.dataset.theme, 'light');

  const dark = await boot(t, { prefersDark: true });
  assert.equal(dark.App.quality.defaultTheme(), 'dark');
  assert.equal(dark.window.document.documentElement.dataset.theme, 'dark', 'در سیستم تیره، پوستهٔ تیره');
});

test('پرش به محتوا و پیمایش با کیبورد برای کاربران صفحه‌خوان', async t => {
  const { window, doc } = await boot(t);
  const skip = doc.querySelector('.skip-link');
  assert.ok(skip, 'پیوند پرش به محتوا در صفحه هست');
  assert.equal(skip.getAttribute('data-action'), 'skip-to-content');
  const main = doc.querySelector('#app-root');
  assert.equal(main.getAttribute('tabindex'), '-1', 'ناحیهٔ محتوا قابل فوکوس است');
  click(window, skip);
  assert.equal(doc.activeElement, main, 'پس از کلیک، فوکوس روی محتوای اصلی می‌رود');
  const toasts = doc.querySelector('#toast-container');
  assert.equal(toasts.getAttribute('aria-live'), 'polite', 'اعلان‌ها برای صفحه‌خوان خوانده می‌شوند');
});
