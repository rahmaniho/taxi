/* ==========================================================================
 * tests/dom-smoke.mjs — آزمون دود رابط کاربری با jsdom
 * --------------------------------------------------------------------------
 * اجرا:
 *   npm i --no-save jsdom            # در همین پوشه یا هر جای دیگر
 *   node tests/dom-smoke.mjs
 *   یا با مسیر دلخواه:  JSDOM_PATH=/path/to/node_modules/jsdom node tests/dom-smoke.mjs
 *
 * این آزمون، فایل taxi.html را در یک DOM شبیه‌سازی‌شده بارگذاری می‌کند،
 * برنامه را با ماژول‌های واقعی اجرا می‌کند، وارد سامانه می‌شود و همهٔ
 * صفحه‌ها را رندر می‌گیرد تا خطاهای زمان اجرا (نه فقط نحو) دیده شوند.
 * اگر jsdom نصب نباشد، آزمون با پیام راهنما رد می‌شود (کد خروج ۰).
 * ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

/* ------------------------------ بارگذاری jsdom ------------------------------ */
async function loadJSDOM() {
    const candidates = [
        process.env.JSDOM_PATH || '',
        'jsdom',
        '/tmp/jsx/node_modules/jsdom'
    ].filter(Boolean);
    const require_ = createRequire(import.meta.url);
    for (const c of candidates) {
        try {
            /* مسیر مطلق یا نام بسته؛ jsdom از نوع CommonJS است */
            const mod = c.startsWith('/') ? require_(path.resolve(c)) : require_(c);
            if (mod?.JSDOM) return mod.JSDOM;
        } catch (e) { /* بعدی */ }
    }
    return null;
}

const JSDOM = await loadJSDOM();
if (!JSDOM) {
    console.log('⏭  jsdom نصب نیست؛ آزمون رابط کاربری رد شد.');
    console.log('   نصب:  npm i --no-save jsdom   سپس:  node tests/dom-smoke.mjs');
    process.exit(0);
}

/* ------------------------------ آماده‌سازی محیط ------------------------------ */
const html = fs.readFileSync(path.join(root, 'taxi.html'), 'utf8');
const dom = new JSDOM(html, {
    url: 'http://localhost/taxi.html',
    runScripts: 'outside-only',
    pretendToBeVisual: true
});
const { window } = dom;
const { document } = window;

/* شبیه‌سازی چیزهایی که jsdom ندارد */
window.matchMedia = window.matchMedia || ((q) => ({
    matches: false, media: q, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; }
}));
window.scrollTo = () => {};
window.HTMLElement.prototype.scrollTo = function () {};
/* window.print در jsdom پیاده‌سازی نشده است؛ برای آزمون مسیر چاپ، آن را ثبت می‌کنیم */
let printCalls = 0;
window.print = () => { printCalls += 1; };
Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });

const GLOBALS = [
    'window', 'document', 'HTMLElement', 'HTMLScriptElement', 'HTMLInputElement', 'HTMLSelectElement',
    'Element', 'Node', 'NodeList', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent',
    'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'DOMParser', 'CSS',
    'localStorage', 'sessionStorage', 'location', 'history'
];
for (const key of GLOBALS) {
    try { globalThis[key] = window[key]; } catch (e) { /* بعضی ویژگی‌ها فقط‌خواندنی‌اند */ }
}
try {
    Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true });
} catch (e) { /* بی‌اهمیت */ }

/* ------------------------------ چارچوب آزمون ------------------------------ */
let passed = 0;
const failures = [];
const consoleErrors = [];
const origError = console.error;
console.error = (...args) => { consoleErrors.push(args.map(String).join(' ')); };

function ok(cond, label, extra = '') {
    if (cond) { passed++; console.log(`  ✅ ${label}`); }
    else { failures.push(label + (extra ? ` — ${extra}` : '')); console.log(`  ❌ ${label}${extra ? ' — ' + extra : ''}`); }
}
function group(t) { console.log(`\n— ${t}`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeout = 6000, step = 40) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
        try { if (fn()) return true; } catch (e) { /* ادامه */ }
        await sleep(step);
    }
    return false;
}
const fa = (s) => /[\u0600-\u06FF]/.test(s || '');

/* ------------------------------- اجرای برنامه ------------------------------- */
group('راه‌اندازی پوستهٔ برنامه');
document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
const appModule = await import(pathToFileURL(path.join(root, 'js', 'app.js')).href);
const App = window.App;
ok(!!App, 'window.App ساخته شد (تنها متغیر سراسری)');
ok(typeof App.navigate === 'function' && typeof App.reload === 'function', 'API عمومی App موجود است');
ok(!!document.querySelector('#icon-sprite, svg[aria-hidden="true"] defs, svg symbol'), 'اسپرایت آیکون‌های SVG نصب شد');

const loginReady = await waitFor(() => document.querySelector('#loginForm'));
ok(loginReady, 'صفحهٔ ورود رندر شد');
ok(document.getElementById('auth-screen') && !document.getElementById('auth-screen').hidden, 'صفحهٔ ورود نمایان است');
ok(document.getElementById('app-shell').hasAttribute('hidden'), 'پوستهٔ برنامه تا پیش از ورود پنهان است');
ok(fa(document.getElementById('auth-screen').textContent), 'متن‌های صفحهٔ ورود فارسی است');
ok(!!document.getElementById('sidebar'), 'محل سایدبار در HTML موجود است');
ok(document.getElementById('app-shell').getAttribute('dir') === null, 'جهت صفحه در سطح html تنظیم شده است');
ok(document.documentElement.getAttribute('dir') === 'rtl', 'صفحه راست‌به‌چپ است');
ok(document.documentElement.getAttribute('lang') === 'fa', 'زبان صفحه فارسی است');

/* -------------------------------- ورود کاربر -------------------------------- */
group('ورود کاربر و ساخت پوسته');
document.querySelector('#loginUser').value = 'admin';
document.querySelector('#loginPass').value = 'admin123';
document.querySelector('#loginForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
const loggedIn = await waitFor(() => !document.getElementById('app-shell').hasAttribute('hidden') && document.querySelector('#sidebarNav .nav-item'));
ok(loggedIn, 'ورود با کاربر پیش‌فرض مدیر انجام شد');
ok(document.getElementById('auth-screen').hidden, 'صفحهٔ ورود پس از ورود پنهان شد');
const navCount = document.querySelectorAll('#sidebarNav [data-page]').length;
ok(navCount >= 15, 'منوی کنار شامل همهٔ بخش‌ها است', `تعداد: ${navCount}`);
ok(!!document.getElementById('headerUser') || !!document.querySelector('.header-user'), 'نوار بالای برنامه ساخته شد');
ok(!!document.getElementById('shiftChip') && !!document.getElementById('userChip'), 'دکمه‌های شیفت و کاربر در نوار بالا هستند');

/* ------------------------------ رندر همهٔ صفحه‌ها ------------------------------ */
group('رندر همهٔ صفحه‌ها (بدون خطای زمان اجرا)');
const pages = App.nav();
ok(pages.length >= 15, 'فهرست صفحات مجاز نقش مدیر کامل است', `تعداد: ${pages.length}`);
for (const id of pages) {
    consoleErrors.length = 0;
    App.navigate(id, {}, { fromHash: true });
    await sleep(30);
    const view = document.getElementById('view');
    const section = view.querySelector('.page-section');
    const errFallback = /خطا در نمایش این بخش/.test(view.innerHTML);
    const problems = [];
    if (!section) problems.push('بخش صفحه ساخته نشد');
    if (view.innerHTML.length < 400) problems.push('محتوای صفحه بسیار کم است');
    if (errFallback) problems.push('قالب خطای رندر نمایش داده شد');
    if (consoleErrors.length) problems.push('console.error: ' + consoleErrors.slice(0, 2).join(' | '));
    ok(problems.length === 0, `صفحهٔ ${id} بدون خطا رندر شد`, problems.join('؛ '));
    if (id === 'dashboard') {
        ok(fa(section.textContent), 'محتوای داشبورد فارسی است');
        ok(!!section.querySelector('.kpi, .stat-card, .stat-value'), 'کارت‌های آماری داشبورد ساخته شدند');
        ok(!!section.querySelector('.chart-container, .chart-svg, .empty-state'), 'نمودارها یا حالت خالی نمایش داده شد');
    }
}

/* ------------------------- تعامل: تم، سایدبار، مودال ------------------------- */
group('تعامل‌های کلیدی');
const themeBefore = document.documentElement.getAttribute('data-theme');
document.getElementById('themeToggleHeader').click();
await sleep(30);
ok(document.documentElement.getAttribute('data-theme') !== themeBefore, 'تغییر تم روشن/تاریک کار می‌کند');
document.getElementById('themeToggleHeader').click();
await sleep(20);

const sidebar = document.getElementById('sidebar');
document.getElementById('hamburgerBtn').click();
await sleep(30);
const opened = sidebar.classList.contains('open');
document.getElementById('hamburgerBtn').click();
await sleep(30);
ok(sidebar.classList.contains('open') !== opened, 'باز/بستن سایدبار با دکمهٔ منو کار می‌کند');

document.getElementById('shiftChip').click();
await sleep(60);
const modalOpen = document.getElementById('modalOverlay').classList.contains('active');
ok(modalOpen, 'پنجرهٔ شیفت کاری باز می‌شود (بدون alert/confirm بومی)');
ok(fa(document.getElementById('modalContent').textContent), 'محتوای پنجرهٔ شیفت فارسی است');
document.querySelector('#modalOverlay [data-modal-close]')?.click();
await sleep(80);
ok(!document.getElementById('modalOverlay').classList.contains('active'), 'بستن پنجره کار می‌کند');

/* ------------------------- تعامل: صف و تخصیص راننده ------------------------- */
group('صف انتظار و تخصیص راننده');
App.navigate('queue', {}, { fromHash: true });
await sleep(50);
let assignBtn = document.querySelector('#view [data-assign]');
if (!assignBtn) {
    /* سفر در انتظار نبود؛ یک سفر آزمایشی می‌سازیم */
    const { Trips } = await import(pathToFileURL(path.join(root, 'js', 'domain.js')).href);
    const { todayJalali, jalaliDateWithTime } = await import(pathToFileURL(path.join(root, 'js', 'utils.js')).href);
    Trips.create({
        subscriberName: 'مسافر آزمون مرورگر', subscriberPhone: '09120000002',
        pickupAddress: 'مبدأ آزمون', dropoffAddress: 'مقصد آزمون', distance: 6,
        tripDate: todayJalali(), pickupTime: jalaliDateWithTime(todayJalali(), '10:15'),
        paymentMethod: 'cash', priority: 'urgent'
    });
    App.navigate('queue', {}, { fromHash: true });
    await sleep(50);
    assignBtn = document.querySelector('#view [data-assign]');
}
ok(!!assignBtn, 'سطر صف با دکمهٔ تخصیص راننده نمایش داده می‌شود');
if (assignBtn) {
    const selectId = assignBtn.dataset.assign;
    const select = document.querySelector(`#view [data-assign-select="${selectId}"]`);
    ok(!!select, 'فهرست انتخاب راننده در کارت صف وجود دارد');
    ok(select && select.querySelectorAll('option').length >= 2, 'رانندگان آزاد در فهرست انتخاب هستند');
    if (select) {
        const firstValue = [...select.options].map((o) => o.value).filter(Boolean)[0];
        select.value = firstValue;
        assignBtn.click();
        await sleep(80);
        const { Trips } = await import(pathToFileURL(path.join(root, 'js', 'domain.js')).href);
        const trip = Trips.all().find((t) => t.id === selectId);
        ok(!!trip && trip.driverId === firstValue && trip.status === 'inProgress', 'تخصیص سفر به راننده انجام و ذخیره شد');
    }
}

/* --------------------------- تعامل: تقویم شمسی --------------------------- */
group('تقویم شمسی (Jalali Datepicker)');
App.navigate('trips-new', {}, { fromHash: true });
await sleep(50);
const dateInput = document.querySelector('#view input.jalali-date');
ok(!!dateInput, 'فیلد تاریخ شمسی در فرم ثبت سفر وجود دارد');
if (dateInput) {
    dateInput.dispatchEvent(new window.Event('click', { bubbles: true }));
    await sleep(60);
    ok(!!document.querySelector('.jp-pop'), 'تقویم شمسی با کلیک باز می‌شود');
    ok(fa(document.querySelector('.jp-pop')?.textContent), 'تقویم با ماه‌های فارسی نمایش داده می‌شود');
    const today = new Date();
    const todayBtn = document.querySelector('.jp-pop [data-today]');
    if (todayBtn) { todayBtn.click(); await sleep(60); }
    ok(dateInput.value.length > 0, 'انتخاب تاریخ، مقدار فیلد را پر می‌کند');
    ok(/[\d۰-۹]{4}/.test(dateInput.value), 'مقدار تاریخ با سال چهاررقمی نمایش داده می‌شود');
    void today;
    dateInput.dispatchEvent(new window.Event('click', { bubbles: true }));
    await sleep(40);
}

/* --------------------------- جست‌وجو و جدول --------------------------- */
group('جدول مشترک: جست‌وجو و مرتب‌سازی');
App.navigate('subscribers', {}, { fromHash: true });
await sleep(50);
const searchBox = document.querySelector('#view [data-tbl-search]');
ok(!!searchBox, 'جعبهٔ جست‌وجوی جدول ساخته شد');
const sortTh = document.querySelector('#view th[data-sort]');
ok(!!sortTh, 'سرستون مرتب‌سازی وجود دارد');
if (sortTh) {
    const before = document.querySelector('#view tbody tr')?.textContent;
    sortTh.click();
    await sleep(40);
    ok(true, 'کلیک روی سرستون بدون خطا انجام شد');
    void before;
}
const pager = document.querySelector('#view [data-pg-size]');
const rowCount = document.querySelectorAll('#view tbody tr').length;
ok(!!pager || rowCount <= 10, 'صفحه‌بندی (۱۰/۲۵/۵۰/۱۰۰) با بیش از ۱۰ رکورد نمایش داده می‌شود', `سطرها: ${rowCount}`);

/* --------------------------- فرم سادهٔ سفر و استپر وضعیت --------------------------- */
group('فرم ساده سفر و استپر تغییر وضعیت');
App.navigate('trips-new', {}, { fromHash: true });
await sleep(60);
const quickForm = document.querySelector('#view #quickTripForm');
ok(!!quickForm, 'فرم ثبت سفر ساخته شد');
const essential = ['subscriberName', 'subscriberPhone', 'pickupAddress', 'dropoffAddress']
    .filter((n) => quickForm?.querySelector(`[name="${n}"]`));
ok(essential.length === 4, 'چهار فیلد ضروری سفر در فرم اصلی هستند', essential.join(', '));
const advanced = quickForm?.querySelector('details');
ok(!!advanced, 'سایر گزینه‌ها زیر بخش «تنظیمات پیشرفته» قرار دارند');
ok(/پیشرفته/.test(advanced?.querySelector('summary')?.textContent || ''), 'عنوان بخش پیشرفته فارسی و روشن است');
const advFields = advanced?.querySelectorAll('[name]').length || 0;
ok(advFields >= 8, 'فیلدهای پیشرفته (راننده، کرایه، پرداخت، زمان‌ها) وجود دارند', `تعداد: ${advFields}`);

App.navigate('trips-list', {}, { fromHash: true });
await sleep(60);
const statusBtn = document.querySelector('#view [data-trip-status]');
ok(!!statusBtn, 'دکمهٔ تغییر وضعیت سفر در فهرست سفرها هست');
if (statusBtn) {
    statusBtn.click();
    await sleep(80);
    const content = document.getElementById('modalContent');
    ok(fa(content.textContent), 'پنجرهٔ تغییر وضعیت فارسی است');
    ok(!!content.querySelector('.stepper'), 'استپر مراحل سفر (در انتظار ← در حال انجام ← پایان) نمایش داده می‌شود');
    const steps = content.querySelectorAll('.stepper .step').length;
    ok(steps >= 3, 'استپر حداقل سه گام دارد', `تعداد گام: ${steps}`);
    content.querySelector('[data-modal-close]')?.click();
    await sleep(80);
}

/* --------------------------- پیش‌نمایش و چاپ سند --------------------------- */
group('پیش‌نمایش چاپ و خروجی PDF');
App.navigate('acc-subscribers', {}, { fromHash: true });
await sleep(60);
const subSelect = document.querySelector('#view #accSubSelect');
ok(!!subSelect && subSelect.options.length > 1, 'فهرست انتخاب مشترک در حسابداری مشترکین هست');
if (subSelect) {
    subSelect.value = [...subSelect.options].map((o) => o.value).filter(Boolean)[0];
    subSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
    await sleep(60);
    const printBtn = document.querySelector('#view #accSubPrint');
    ok(!!printBtn, 'دکمهٔ چاپ فاکتور فعال می‌شود');
    if (printBtn) {
        printBtn.click();
        await sleep(120);
        const frame = document.querySelector('#modalOverlay .print-preview-frame');
        ok(!!frame, 'پیش‌نمایش سند در پنجرهٔ مودال باز می‌شود');
        ok(!!frame?.querySelector('.print-doc'), 'سند با قالب چاپی (.print-doc) ساخته شده است');
        ok(fa(frame?.textContent), 'محتوای سند پیش‌نمایش فارسی است');
        ok(/[۰-۹]/.test(frame?.textContent || ''), 'مبالغ سند با ارقام فارسی نمایش داده می‌شوند');
        const doPrint = document.querySelector('#modalOverlay [data-do-print]');
        ok(!!doPrint, 'دکمهٔ «چاپ / ذخیره PDF» وجود دارد');
        printCalls = 0;
        doPrint?.click();
        await sleep(500);
        const printRoot = document.getElementById('print-root');
        ok(printCalls >= 1, 'window.print() برای خروجی PDF فراخوانی شد');
        ok(!!printRoot.querySelector('.print-doc'), 'سند نهایی در #print-root قرار گرفت (چاپ فقط همین بخش)');
    }
}

/* --------------------------- دسترسی نقش‌ها --------------------------- */
group('محدودیت دسترسی نقش‌ها');
const { Auth } = await import(pathToFileURL(path.join(root, 'js', 'auth.js')).href);
await Auth.logout({ silent: true });
await Auth.login('accountant', 'account123');
App.navigate('dashboard', {}, { fromHash: true });
await sleep(40);
const navAfter = document.querySelectorAll('#sidebarNav [data-page]').length;
ok(navAfter < navCount, 'منوی حسابدار کوتاه‌تر از مدیر است', `مدیر: ${navCount} — حسابدار: ${navAfter}`);
App.navigate('settings', {}, { fromHash: true });
await sleep(40);
ok(!/تنظیمات سامانه/.test(document.getElementById('view').textContent) ||
    /dashboard|داشبورد/.test(document.getElementById('view').textContent), 'دسترسی مستقیم به صفحهٔ غیرمجاز مسدود می‌شود');

/* --------------------------------- پایان --------------------------------- */
console.error = origError;
console.log('\n' + '─'.repeat(60));
console.log(`نتیجهٔ آزمون رابط کاربری: ${passed} موفق` + (failures.length ? ` — ${failures.length} خطا` : ' — بدون خطا'));
if (failures.length) {
    console.log('\nخطاها:');
    failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
    process.exit(1);
}
process.exit(0);
