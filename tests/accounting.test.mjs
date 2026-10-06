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
const toastText = doc => doc.querySelector('#toast-container')?.textContent || '';
const faDigits = value => String(value).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
const faNumber = value => new RegExp(faDigits(value).split('').join('[٬,،]?'));

function today(App) {
  App.accounting.setReportRange({ preset: 'today' });
  return App.accounting.reportRange().from;
}
function monthRange(App) {
  App.accounting.setReportRange({ preset: 'month' });
  const range = App.accounting.reportRange();
  return { from: range.from, to: range.to, year: Number(range.from.slice(0, 4)) };
}

function seedDrivers(App) {
  App.data.drivers = [
    { id: 'd1', name: 'راننده یک', phone: '09120000001', commission: 15, status: 'available', vehicleId: '' },
    { id: 'd2', name: 'راننده دو', phone: '09120000002', commission: 15, status: 'available', vehicleId: '' },
  ];
}
function addTrip(App, overrides = {}) {
  const trip = {
    id: overrides.id || `t${App.data.trips.length + 1}`,
    code: overrides.code || `TRP-000${App.data.trips.length + 1}`,
    passengerName: 'مسافر تست', phone: '09121112233', origin: 'میدان ونک', destination: 'فرودگاه مهرآباد',
    driverId: 'd1', customerType: 'regular', subscriberId: '', date: today(App), time: '09:00',
    fare: 100000, paymentMethod: 'card', priority: 'normal', status: 'completed', commissionRate: 15, commission: 15000,
    createdAt: new Date().toISOString(), operatorId: 'op-1', manualFare: false, ...overrides,
  };
  App.data.trips.push(trip);
  return trip;
}
function seedLedger(App) {
  seedDrivers(App);
  const date = today(App);
  addTrip(App, { id: 't1', code: 'TRP-0001', fare: 100000, commission: 15000, date });
  addTrip(App, { id: 't2', code: 'TRP-0002', fare: 200000, commission: 30000, date });
  addTrip(App, { id: 't3', code: 'TRP-0003', status: 'pending', fare: 50000, commission: 0, date });
  addTrip(App, { id: 't4', code: 'TRP-0004', status: 'cancelled', fare: 0, commission: 0, cancelFee: 20000, date });
  App.data.expenses = [
    { id: 'x1', title: 'سوخت', category: 'سوخت', amount: 40000, date, paidBy: 'آژانس', operatorId: 'op-1' },
    { id: 'x2', title: 'تعمیرات', category: 'تعمیرات خودرو', amount: 10000, date, paidBy: 'آژانس', operatorId: 'op-1' },
  ];
  return date;
}

test('بازهٔ گزارش: پیش‌فرض ۷ روز، پیش‌تنظیم‌ها و بازهٔ دلخواه', async t => {
  const { App } = await boot(t);
  let range = App.accounting.reportRange();
  assert.equal(range.preset, '7d', 'پیش‌فرض گزارش، هفت روز است');
  assert.equal(range.days, 7);
  assert.ok(range.from < range.to, 'بازه از تاریخ قدیمی‌تر شروع می‌شود');
  assert.match(range.label, /تا/);

  App.accounting.setReportRange({ preset: '30d' });
  assert.equal(App.accounting.reportRange().days, 30);
  App.accounting.setReportRange({ preset: 'today' });
  assert.equal(App.accounting.reportRange().days, 1);
  assert.equal(App.accounting.reportRange().from, App.accounting.reportRange().to);

  const parts = App.accounting.reportRange().from.split('-').map(Number);
  App.accounting.setReportRange({ preset: 'year', from: '', to: '' });
  const year = App.accounting.reportRange();
  assert.equal(year.from, `${parts[0]}-01-01`, 'سال جاری از فروردین شروع می‌شود');
  assert.equal(Number(year.to.slice(0, 4)), parts[0]);
  assert.match(year.to, new RegExp(`^${parts[0]}-12-`), 'پایان سال جاری اسفند است');

  App.accounting.setReportRange({ preset: 'custom', from: '1405-02-10', to: '1405-02-01' });
  const swapped = App.accounting.reportRange();
  assert.equal(swapped.from, '1405-02-01', 'ترتیب تاریخ‌ها در صورت نیاز جابه‌جا می‌شود');
  assert.equal(swapped.to, '1405-02-10');

  App.accounting.setReportRange({ preset: 'custom', from: '', to: '' });
  assert.equal(App.accounting.reportRange().preset, 'custom', 'حالت دلخواه حفظ می‌شود');
  assert.ok(App.accounting.reportRange().from <= App.accounting.reportRange().to, 'بازهٔ نامعتبر به بازهٔ سالم برمی‌گردد');
});

test('صورت سود و زیان: درآمد آژانس، هزینه‌ها و سود خالص بازه', async t => {
  const { window, doc, App } = await boot(t);
  const date = seedLedger(App);
  App.accounting.setReportRange({ preset: 'custom', from: date, to: date });

  const report = App.accounting.plReport(App.accounting.reportRange());
  assert.equal(report.tripCount, 2, 'فقط سفرهای تکمیل‌شده در گزارش می‌آیند');
  assert.equal(report.gross, 300000, 'کرایهٔ ناخالص دو سفر');
  assert.equal(report.commission, 45000);
  assert.equal(report.cancelFees, 20000, 'جریمهٔ لغو در بازه');
  assert.equal(report.revenue, 65000, 'درآمد آژانس = کمیسیون + جریمهٔ لغو');
  assert.equal(report.expenseTotal, 50000);
  assert.equal(report.net, 15000, 'سود خالص = درآمد آژانس − هزینه‌ها');
  assert.equal(report.driverShare, 255000);

  window.location.hash = '#accounting/pl';
  App.render();
  const text = doc.querySelector('#app-root').textContent;
  assert.match(text, /صورت سود و زیان/);
  assert.match(text, /سود خالص دوره/);
  assert.match(text, /جریمهٔ لغو سفر/);
  assert.match(text, /تفکیک هزینه‌ها/);
  assert.ok(doc.querySelector('[data-route="accounting/pl"]'), 'تب سود و زیان در نوار تب‌ها هست');
});

test('تفکیک هزینه‌ها و مقایسه با دورهٔ قبل در سود و زیان', async t => {
  const { window, doc, App } = await boot(t);
  const date = seedLedger(App);
  App.accounting.setReportRange({ preset: 'custom', from: date, to: date });
  window.location.hash = '#accounting/pl';
  App.render();
  let text = doc.querySelector('#app-root').textContent;
  assert.match(text, /سوخت/, 'دستهٔ هزینه در تفکیک دیده می‌شود');
  assert.match(text, /تعمیرات خودرو/);
  assert.match(text, /نسبت به دورهٔ قبل|جدید/, 'مقایسه با دورهٔ قبل نمایش داده می‌شود');

  // بازهٔ دیروز خالی است: سود صفر و اختلاف منفی
  const yesterday = App.accounting.reportRange().from;
  App.accounting.setReportRange({ preset: 'custom', from: '1404-01-01', to: '1404-01-02' });
  assert.equal(App.accounting.plReport(App.accounting.reportRange()).net, 0, 'بازهٔ بدون داده سود صفر دارد');
  assert.ok(yesterday.length === 10);
});

test('بستن حساب ماه: قفل ثبت سفر و هزینه و بازکردن دوباره', async t => {
  const { window, doc, App } = await boot(t);
  const month = monthRange(App);
  seedDrivers(App);
  App.accounting.closeMonth(`${month.from}|${month.to}`);
  assert.equal(App.data.closes.length, 1, 'دورهٔ ماه بسته شد');
  assert.equal(App.accounting.isDateClosed(month.from), true);
  assert.equal(App.accounting.isDateClosed(month.to), true);
  assert.equal(App.accounting.isDateClosed('1401-01-01'), false, 'بازه‌های دیگر آزادند');

  // ثبت سفر در بازهٔ بسته‌شده مسدود است
  window.location.hash = '#trips/new';
  App.render();
  const form = doc.querySelector('form[data-form="trip"]');
  form.querySelector('[name="origin"]').value = 'میدان ونک';
  form.querySelector('[name="destination"]').value = 'فرودگاه مهرآباد';
  form.querySelector('[name="fare"]').value = '150000';
  form.querySelector('[name="date"]').value = month.from;
  const before = App.data.trips.length;
  submit(window, form);
  await wait(20);
  assert.equal(App.data.trips.length, before, 'سفر در ماه بسته‌شده ثبت نمی‌شود');
  assert.match(toastText(doc), /بسته‌شده/, 'پیام خطای دورهٔ بسته‌شده نمایش داده می‌شود');

  // ثبت هزینه در بازهٔ بسته‌شده هم مسدود است
  window.location.hash = '#accounting/expenses';
  App.render();
  click(window, doc.querySelector('[data-action="add-expense"]'));
  const expenseForm = doc.querySelector('form[data-form="expense"]');
  expenseForm.querySelector('[name="title"]').value = 'اجاره';
  expenseForm.querySelector('[name="amount"]').value = '500000';
  expenseForm.querySelector('[name="date"]').value = month.from;
  const expenseBefore = App.data.expenses.length;
  submit(window, expenseForm);
  await wait(20);
  assert.equal(App.data.expenses.length, expenseBefore, 'هزینه در ماه بسته‌شده ثبت نمی‌شود');

  // بازکردن دوره از تب سود و زیان
  window.location.hash = '#accounting/pl';
  App.render();
  assert.match(doc.querySelector('#app-root').textContent, /بستن حساب ماه/);
  click(window, doc.querySelector('[data-action="reopen-month"]'));
  click(window, doc.querySelector('#confirm-action'));
  await wait(20);
  assert.equal(App.data.closes.length, 0, 'دوره باز شد');
  assert.equal(App.accounting.isDateClosed(month.from), false);

  window.location.hash = '#trips/new';
  App.render();
  const form2 = doc.querySelector('form[data-form="trip"]');
  form2.querySelector('[name="origin"]').value = 'میدان ونک';
  form2.querySelector('[name="destination"]').value = 'فرودگاه مهرآباد';
  form2.querySelector('[name="fare"]').value = '150000';
  form2.querySelector('[name="date"]').value = month.from;
  submit(window, form2);
  await wait(20);
  assert.equal(App.data.trips.length, before + 1, 'پس از بازکردن دوره ثبت سفر آزاد است');
});

test('شمارهٔ سند: شماره‌گذاری پیوسته، سالانه و ثبت در دفتر اسناد', async t => {
  const { window, doc, App } = await boot(t);
  const year = monthRange(App).year;
  const first = App.accounting.issueInvoice('subscriber', { person: 'مشترک الف', amount: 100000, refId: 's1' });
  const second = App.accounting.issueInvoice('driver', { person: 'راننده یک', amount: 50000, refId: 'd1' });
  assert.equal(first, `SUB-${year}-0001`);
  assert.equal(second, `DRV-${year}-0002`, 'شمارنده میان انواع اسناد پیوسته است');
  assert.equal(App.data.invoices.length, 2);
  assert.equal(App.data.meta.invoiceCounters[String(year)], 2, 'شمارندهٔ سال ثبت می‌شود');

  App.accounting.setReportRange({ preset: 'today' });
  window.location.hash = '#accounting/invoices';
  App.render();
  const text = doc.querySelector('#app-root').textContent;
  assert.match(text, /دفتر اسناد|اسناد این بازه|شمارهٔ سند/);
  assert.match(text, new RegExp(`SUB-${year}-0001`), 'شمارهٔ سند در دفتر دیده می‌شود');
  assert.match(text, new RegExp(`DRV-${year}-0002`));
});

test('رسید سفر شمارهٔ یکتا و پایدار می‌گیرد و فاکتور مشترک در دفتر ثبت می‌شود', async t => {
  const { window, doc, App } = await boot(t);
  seedDrivers(App);
  App.data.subscribers = [{ id: 's1', name: 'مشترک الف', phone: '09121110000', type: 'individual', active: true }];
  addTrip(App, { id: 't1', code: 'TRP-0001', customerType: 'subscriber', subscriberId: 's1', fare: 120000, commission: 18000 });

  window.location.hash = '#trips/list';
  App.render();
  click(window, doc.querySelector('[data-action="print-trip"]'));
  const trip = App.data.trips.find(x => x.id === 't1');
  assert.match(String(trip.receiptNumber), /^RCP-\d{4}-0001$/, 'شمارهٔ رسید سفر صادر شد');
  assert.equal(App.data.invoices.filter(i => i.kind === 'trip').length, 1);
  assert.match(doc.querySelector('#modal-root').textContent, /پیش‌نمایش چاپ/);
  assert.match(doc.querySelector('#print-preview-frame').getAttribute('srcdoc'), new RegExp(trip.receiptNumber), 'شمارهٔ رسید در سند چاپی دیده می‌شود');

  // چاپ دوبارهٔ همان سفر شمارهٔ تازه نمی‌سازد
  click(window, doc.querySelector('#modal-root [data-action="close-modal"]'));
  window.location.hash = '#trips/list';
  App.render();
  click(window, doc.querySelector('[data-action="print-trip"]'));
  assert.equal(App.data.invoices.filter(i => i.kind === 'trip').length, 1, 'رسید سفر تکرار نمی‌شود');
  assert.equal(App.data.trips.find(x => x.id === 't1').receiptNumber, trip.receiptNumber);

  // فاکتور مشترک
  window.location.hash = '#accounting/subscribers';
  App.render();
  click(window, doc.querySelector('[data-action="subscriber-invoice"]'));
  const subscriberInvoice = App.data.invoices.find(i => i.kind === 'subscriber');
  assert.ok(subscriberInvoice, 'فاکتور مشترک در دفتر اسناد ثبت شد');
  assert.match(subscriberInvoice.number, /^SUB-\d{4}-\d{4}$/);
  assert.match(doc.querySelector('#print-preview-frame').getAttribute('srcdoc'), new RegExp(subscriberInvoice.number), 'شمارهٔ سند روی صورتحساب چاپ می‌شود');
});

test('آرشیو سالانه: حذف سفرهای سال گذشته و ثبت تاریخچه', async t => {
  const { window, doc, App } = await boot(t);
  const year = monthRange(App).year;
  const oldYear = year - 1;
  seedDrivers(App);
  addTrip(App, { id: 'old1', code: 'TRP-0001', date: `${oldYear}-03-05` });
  addTrip(App, { id: 'old2', code: 'TRP-0002', date: `${oldYear}-04-11`, status: 'cancelled', cancelFee: 0 });
  addTrip(App, { id: 'new1', code: 'TRP-0003', date: `${year}-02-01` });

  window.location.hash = '#accounting/archive';
  App.render();
  const archiveText = doc.querySelector('#app-root').textContent;
  assert.match(archiveText, /آرشیو و خروجی سالانه/);
  assert.match(archiveText, faNumber(year), 'سال‌های دارای سفر فهرست می‌شوند');
  assert.match(archiveText, faNumber(oldYear), 'سال گذشته در فهرست آرشیو دیده می‌شود');

  const stats = App.accounting.archiveStats();
  const entry = stats.find(([y]) => Number(y) === oldYear) || [];
  assert.equal(entry[0], String(oldYear), 'سال گذشته در آمار آرشیو هست');
  assert.equal(entry[1], 2, 'دو سفر در سال گذشته شمرده می‌شود');

  click(window, doc.querySelector('[data-action="archive-old"]'));
  const form = doc.querySelector('form[data-form="archive-trips"]');
  form.querySelector('[name="year"]').value = String(oldYear);
  submit(window, form);
  await wait(30);
  assert.equal(App.data.trips.filter(t => String(t.date).startsWith(String(oldYear))).length, 0, 'سفرهای سال آرشیوشده حذف شدند');
  assert.equal(App.data.trips.length, 1, 'سفرهای سال جاری دست‌نخورده ماندند');
  assert.equal(App.data.archives.length, 1);
  assert.equal(App.data.archives[0].count, 2);
  assert.equal(App.data.archives[0].year, oldYear);
});

test('تسویهٔ گروهی رانندگان: یک شمارهٔ سند برای همهٔ پرداخت‌ها', async t => {
  const { window, doc, App } = await boot(t);
  seedDrivers(App);
  const date = today(App);
  addTrip(App, { id: 't1', code: 'TRP-0001', driverId: 'd1', date, fare: 200000, commission: 30000, paymentMethod: 'card' });
  addTrip(App, { id: 't2', code: 'TRP-0002', driverId: 'd2', date, fare: 100000, commission: 15000, paymentMethod: 'card' });

  window.location.hash = '#accounting/drivers';
  App.render();
  click(window, doc.querySelector('[data-action="settle-drivers"]'));
  const form = doc.querySelector('form[data-form="settle-drivers"]');
  assert.ok(form, 'فرم تسویهٔ گروهی باز شد');
  assert.equal(form.querySelectorAll('input[name="driver"]').length, 2, 'همهٔ رانندگان بدهکار پیشنهاد می‌شوند');
  submit(window, form);
  await wait(30);

  assert.equal(App.data.driverPayments.length, 2, 'برای هر راننده یک پرداخت ثبت شد');
  const numbers = new Set(App.data.driverPayments.map(p => p.settlementNumber));
  assert.equal(numbers.size, 1, 'همهٔ پرداخت‌ها یک شمارهٔ تسویه دارند');
  const settlement = App.data.invoices.find(i => i.kind === 'settlement');
  assert.ok(settlement, 'سند تسویه صادر شد');
  assert.equal(settlement.amount, 255000, 'مبلغ سند برابر جمع مانده‌هاست');
  assert.match(doc.querySelector('#modal-root').textContent, /رسید تسویهٔ گروهی/);
  assert.match(doc.querySelector('#modal-root').textContent, new RegExp(settlement.number));
});

test('یادآوری گروهی مشترکین و خروجی CSV بازه', async t => {
  const { window, doc, App } = await boot(t);
  seedLedger(App);
  App.data.subscribers = [
    { id: 's1', name: 'مشترک بدهکار', phone: '09121110000', type: 'individual', active: true },
    { id: 's2', name: 'مشترک بی‌حساب', phone: '09121110001', type: 'individual', active: true },
  ];
  addTrip(App, { id: 'sub1', code: 'TRP-0009', customerType: 'subscriber', subscriberId: 's1', fare: 120000, commission: 18000, paymentMethod: 'subscriber' });

  window.location.hash = '#accounting/revenue';
  App.render();
  click(window, doc.querySelector('[data-action="batch-reminders"]'));
  const modal = doc.querySelector('#modal-root').textContent;
  assert.match(modal, /یادآوری پیامکی مشترکین/);
  assert.match(modal, /مشترک بدهکار/);
  assert.doesNotMatch(modal, /مشترک بی‌حساب/, 'فقط مشترکین بدهکار فهرست می‌شوند');
});

test('نوار بازه در همهٔ تب‌های حسابداری و ذخیرهٔ بازه', async t => {
  const { window, doc, App } = await boot(t);
  seedLedger(App);
  for (const tab of ['revenue', 'pl', 'expenses', 'invoices', 'drivers', 'commission', 'subscribers']) {
    window.location.hash = `#accounting/${tab}`;
    App.render();
    const text = doc.querySelector('#app-root').textContent;
    assert.match(text, /بازهٔ گزارش/, `نوار بازه در تب ${tab} هست`);
  }
  // اعمال بازهٔ دلخواه از فرم
  window.location.hash = '#accounting/revenue';
  App.render();
  const form = doc.querySelector('form[data-form="report-range"]');
  form.querySelector('[name="from"]').value = '1405-01-01';
  form.querySelector('[name="to"]').value = '1405-01-05';
  submit(window, form);
  await wait(20);
  const range = App.accounting.reportRange();
  assert.equal(range.preset, 'custom');
  assert.equal(range.from, '1405-01-01');
  assert.equal(range.to, '1405-01-05');
  assert.equal(JSON.parse(window.localStorage.getItem('taxi_db_v1')).settings.reportRange.from, '1405-01-01', 'بازه ذخیره می‌شود');
  // پیش‌تنظیم‌ها
  click(window, doc.querySelector('[data-action="range-preset"][data-preset="30d"]'));
  await wait(20);
  assert.equal(App.accounting.reportRange().days, 30);
});
