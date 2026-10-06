/* ==========================================================================
 * tests/smoke.mjs — آزمون دود (Smoke Test) بدون مرورگر
 * --------------------------------------------------------------------------
 * اجرا:  node tests/smoke.mjs
 * این آزمون، ماژول‌های بدون‌DOM (utils, db, auth, domain) را در Node بارگذاری
 * می‌کند و درستی قواعد کاری را می‌سنجد: چرخهٔ سفر، کرایه، بدهی مشترک،
 * تسویهٔ راننده، گزارش‌ها، حسابرسی و ورود کاربران.
 * ========================================================================== */

/* ------------------------- شبیه‌سازی محیط مرورگر ------------------------- */
class MemoryStorage {
    constructor() { this.map = new Map(); }
    get length() { return this.map.size; }
    key(i) { return [...this.map.keys()][i] ?? null; }
    getItem(k) { return this.map.has(String(k)) ? this.map.get(String(k)) : null; }
    setItem(k, v) { this.map.set(String(k), String(v)); }
    removeItem(k) { this.map.delete(String(k)); }
    clear() { this.map.clear(); }
}
globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();
try {
    Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'node-smoke-test', onLine: true },
        configurable: true, writable: true
    });
} catch (e) {
    /* در نسخه‌های قدیمی Node، navigator وجود ندارد و تعریف ساده کافی است */
    globalThis.navigator = { userAgent: 'node-smoke-test', onLine: true };
}

const { DB, SCHEMA_VERSION } = await import('../js/db.js');
const Prints = await import('../js/prints.js');
const { Auth } = await import('../js/auth.js');
const { Drivers, Trips, Subscribers, Payments, Reports, Alerts, fareFor } = await import('../js/domain.js');
const U = await import('../js/utils.js');

/* ------------------------------ چارچوب آزمون ------------------------------ */
let passed = 0;
const failures = [];
function ok(cond, label, extra = '') {
    if (cond) { passed++; console.log(`  ✅ ${label}`); }
    else { failures.push(label + (extra ? ` — ${extra}` : '')); console.log(`  ❌ ${label}${extra ? ' — ' + extra : ''}`); }
}
function eq(actual, expected, label) {
    ok(actual === expected, label, `دریافتی: ${JSON.stringify(actual)} — انتظار: ${JSON.stringify(expected)}`);
}
function near(actual, expected, label, tol = 1) {
    ok(Math.abs(Number(actual) - Number(expected)) <= tol, label, `دریافتی ${actual} — انتظار ${expected}`);
}
function group(title) { console.log(`\n— ${title}`); }

/* --------------------------------- آغاز --------------------------------- */
await DB.init();
const settings = DB.settings();
const today = U.todayJalali();

/* ------------------------------- ۱) ابزارها ------------------------------- */
group('ابزارها و تقویم شمسی');
eq(today, U.dateToJalaliKey(new Date()), 'امروز با تقویم شمسی مطابق است');
eq(U.toFa('1404'), '۱۴۰۴', 'تبدیل ارقام لاتین به فارسی');
eq(U.toEn('۱۴۰۴'), '1404', 'تبدیل ارقام فارسی به لاتین');
eq(U.formatJalali('1404-07-15'), '۱۴۰۴/۰۷/۱۵', 'قالب‌بندی تاریخ شمسی');
eq(U.addJalaliDays('1404-12-29', 1), '1405-01-01', 'عبور از پایان سال شمسی');
eq(U.addJalaliDays('1403-12-30', 1), '1404-01-01', 'سال کبیسه (۱۴۰۳) درست محاسبه می‌شود');
eq(U.diffJalaliDays('1404-07-15', '1404-07-20'), 5, 'اختلاف روز بین دو تاریخ شمسی (b − a)');
ok(U.isValidMobile('09123456789'), 'شماره همراه معتبر پذیرفته می‌شود');
ok(!U.isValidMobile('0812345678'), 'شماره همراه نامعتبر رد می‌شود');
ok(U.isValidLandline('02123456789'), 'تلفن ثابت معتبر پذیرفته می‌شود');
ok(U.isValidNationalCode('0012345679'), 'کد ملی با رقم کنترل درست پذیرفته می‌شود');
ok(!U.isValidNationalCode('0012345678'), 'کد ملی با رقم کنترل غلط رد می‌شود');
eq(U.normalizePlate('12ب345 ایران 67'), '۱۲ب۳۴۵۶۷', 'نرمال‌سازی پلاک ایران (حذف واژهٔ «ایران» و تبدیل ارقام)');
eq(U.normalizePlate('123 ج 45 - 78'), '۱۲۳ج۴۵۷۸', 'نرمال‌سازی پلاک با قالب سه‌رقمی');
ok(U.isValidPlate('12 ب 345 - 67'), 'پلاک نرمال‌شده معتبر است');
ok(!U.isValidPlate('12345'), 'پلاک بدون حرف رد می‌شود');
ok(!U.isValidPlate('12 1 345 67'), 'پلاک با رقم به‌جای حرف رد می‌شود');
eq(U.parseNumber('۱٬۲۵۰٬۰۰۰'), 1250000, 'تبدیل عدد فارسی با جداکننده به عدد');
ok(U.formatNumber(1250000).includes('۱'), 'عدد با ارقام فارسی قالب‌بندی می‌شود');
ok(U.numberToPersianWords(1250000).includes('میلیون'), 'تبدیل عدد به حروف فارسی');

/* -------------------------------- ۲) کرایه -------------------------------- */
group('کرایهٔ پلکانی (شب و تعطیلات)');
const s = { ...settings, baseFare: 20000, farePerKm: 10000, holidayMultiplier: 1.5, nightMultiplier: 1.3, nightEnabled: true, nightMode: 'multiplier', holidays: [] };
const dayFare = U.calculateFare(10, new Date('2026-05-10T12:00:00'), false, s);
eq(dayFare.base, 20000, 'کرایه پایه در محاسبه لحاظ می‌شود');
eq(dayFare.distancePart, 100000, 'هزینهٔ مسافت = کیلومتر × نرخ');
ok(dayFare.fare % 1000 === 0, 'کرایه نهایی به هزار تومان گِرد می‌شود');
const nightFare = U.calculateFare(10, new Date('2026-05-10T23:30:00'), false, s);
ok(nightFare.isNight && nightFare.fare > dayFare.fare, 'تعرفهٔ شب گران‌تر از روز است');
const holidayFare = U.calculateFare(10, new Date('2026-05-10T12:00:00'), true, s);
ok(holidayFare.isHoliday && holidayFare.fare > dayFare.fare, 'تعرفهٔ تعطیلات گران‌تر از روز عادی است');
const f2 = fareFor(10, new Date('2026-05-10T23:30:00').toISOString(), {});
eq(f2.isNight, true, 'fareFor دامنه هم شبانه را تشخیص می‌دهد');

/* ------------------------------- ۳) داده‌ها ------------------------------- */
group('لایهٔ داده و حسابرسی');
ok(DB.isReady(), 'پایگاه داده راه‌اندازی شد');
eq(DB.raw().meta.version, SCHEMA_VERSION, 'نسخهٔ ساختار داده درست ثبت شده است');
ok(DB.list('drivers').length > 0, 'داده نمونه شامل راننده است');
ok(DB.list('subscribers').length > 0, 'داده نمونه شامل مشترک است');
const auditBefore = DB.listAll('auditLog').length;
const drv = DB.insert('drivers', { fullName: 'راننده آزمون', phone: '09120000000', commissionRate: 15, availability: 'available', status: 'active' }, 'راننده آزمون افزوده شد');
ok(DB.get('drivers', drv.id), 'رکورد جدید قابل خواندن است');
const auditAfterCreate = DB.listAll('auditLog').length;
ok(auditAfterCreate > auditBefore, 'افزودن رکورد در گزارش تغییرات ثبت شد');
DB.update('drivers', drv.id, { phone: '09121111111' }, 'ویرایش آزمون');
eq(DB.get('drivers', drv.id).phone, '09121111111', 'ویرایش رکورد اعمال شد');
DB.remove('drivers', drv.id, 'حذف آزمون');
ok(!DB.get('drivers', drv.id), 'حذف نرم، رکورد را از فهرست اصلی پنهان می‌کند');
ok(DB.listDeleted('drivers').some((d) => d.id === drv.id), 'رکورد حذف‌شده در فهرست حذف‌شده‌ها هست');
DB.restore('drivers', drv.id);
ok(!!DB.get('drivers', drv.id), 'بازیابی رکورد حذف‌شده کار می‌کند');
DB.remove('drivers', drv.id, 'حذف نهایی آزمون');

const seq1 = DB.nextSequence('smoke');
eq(DB.nextSequence('smoke'), seq1 + 1, 'شمارنده یکتا درست افزایش می‌یابد');

/* ------------------------------ ۴) چرخهٔ سفر ------------------------------ */
group('چرخهٔ سفر: ثبت ← تخصیص ← پایان');
const driver = Drivers.free()[0] || Drivers.active()[0];
const subscriber = DB.list('subscribers').find((x) => x.type === 'corporate') || DB.list('subscribers')[0];
const code = Trips.nextCode();
ok(/^T\d{5}$/.test(code), 'شمارهٔ سفر با الگوی T + ۵ رقم ساخته می‌شود', code);

const trip = Trips.create({
    subscriberId: subscriber.id,
    subscriberName: subscriber.fullName,
    phone: subscriber.phone,
    passengerName: subscriber.fullName,
    pickupAddress: 'میدان امام',
    dropoffAddress: 'فرودگاه',
    distance: 12,
    tripDate: today,
    pickupTime: U.jalaliDateWithTime(today, '09:30'),
    priority: 'urgent',
    paymentMethod: 'subscription',
    billedTo: 'company',
    notes: 'آزمون'
});
ok(trip.id, 'سفر ایجاد شد');
eq(trip.status, 'pending', 'سفر جدید در وضعیت «در انتظار» است');
const queue = Trips.pendingQueue();
ok(queue.length > 0, 'سفر در صف انتظار دیده می‌شود');
eq(queue[0].id, trip.id, 'سفر فوری بالای صف قرار می‌گیرد');
ok(typeof queue[0].waitMinutes === 'number', 'زمان انتظار صف محاسبه می‌شود');

Trips.assign(trip.id, driver.id);
const assigned = DB.get('trips', trip.id);
eq(assigned.driverId, driver.id, 'راننده به سفر تخصیص یافت');
eq(assigned.status, 'inProgress', 'وضعیت سفر پس از تخصیص «در حال انجام» شد');
eq(DB.get('drivers', driver.id).availability, 'busy', 'وضعیت راننده خودکار «در سفر» شد');

const before = DB.get('drivers', driver.id);
Trips.complete(trip.id);
const done = DB.get('trips', trip.id);
eq(done.status, 'completed', 'سفر با موفقیت پایان یافت');
ok(!!done.dropoffTime, 'زمان پایان سفر خودکار ثبت شد');
ok(done.fare > 0, 'کرایه سفر محاسبه شد');
eq(done.commission, Math.round(done.fare * (driver.commissionRate ?? settings.commissionDefault) / 100), 'کمیسیون بر اساس درصد راننده محاسبه شد');
eq(done.driverShare, done.fare - done.commission, 'سهم راننده = کرایه − کمیسیون');

const cancelledTrip = Trips.create({
    subscriberName: 'مسافر لغوی', phone: '09120000001',
    pickupAddress: 'الف', dropoffAddress: 'ب', distance: 5,
    tripDate: today, pickupTime: U.jalaliDateWithTime(today, '10:00'), paymentMethod: 'cash'
});
Trips.cancel(cancelledTrip.id, 'مشتری لغو کرد', 'تماس مجدد');
const cancelled = DB.get('trips', cancelledTrip.id);
eq(cancelled.status, 'cancelled', 'وضعیت سفر لغوشده ثبت شد');
eq(cancelled.cancelReason, 'مشتری لغو کرد', 'دلیل لغو ذخیره شد');

/* ---------------------------- ۵) بدهی مشترک ---------------------------- */
group('بدهی مشترک و ثبت پرداخت');
/* مشترک تازه می‌سازیم تا بدهی فقط از سفرهای همین آزمون محاسبه شود */
const testSub = DB.insert('subscribers', {
    fullName: 'شرکت آزمون', type: 'corporate', phone: '02123456789',
    subscriptionNumber: 'S-SMOKE', debt: 0, status: 'active'
});
const debt0 = Subscribers.computeDebt(testSub.id);
eq(DB.get('subscribers', testSub.id).debt, 0, 'مشترک جدید بدهی ندارد');
eq(debt0, 0, 'بدهی محاسبه‌شدهٔ مشترک جدید صفر است');

const subTrip = Trips.create({
    subscriberId: testSub.id, subscriberName: testSub.fullName, subscriberPhone: testSub.phone,
    pickupAddress: 'دفتر', dropoffAddress: 'کارخانه', distance: 8, fare: 200000,
    tripDate: today, pickupTime: U.jalaliDateWithTime(today, '08:00'),
    paymentMethod: 'subscription', billedTo: 'company'
});
eq(subTrip.isPaid, false, 'سفر حقوقی به‌صورت پیش‌فرض تسویه‌نشده است');
eq(Subscribers.computeDebt(testSub.id), 200000, 'بدهی مشترک از سفر حقوقی محاسبه می‌شود');
eq(Subscribers.recalcDebt(testSub.id), 200000, 'مقدار ذخیره‌شدهٔ بدهی با محاسبهٔ زنده همگام است');

Subscribers.addPayment({ subscriberId: testSub.id, amount: 50000, date: today, method: 'cash', receiptNo: 'SMOKE-1', notes: 'آزمون' });
eq(Subscribers.computeDebt(testSub.id), 150000, 'ثبت پرداخت، بدهی مشترک را کاهش می‌دهد');
let rejected = false;
try {
    Subscribers.addPayment({ subscriberId: testSub.id, amount: 999000, date: today, method: 'cash' });
} catch (e) { rejected = true; }
ok(rejected, 'پرداخت بیش از بدهی رد می‌شود');
const overPay = DB.list('subscriberPayments').filter((p) => p.subscriberId === testSub.id);
eq(overPay.length, 1, 'پرداخت نامعتبر در پایگاه داده ثبت نشده است');

const pStmt = Subscribers.statement(testSub.id);
eq(pStmt.totalPaid, 50000, 'صورت‌حساب مشترک مجموع پرداخت‌ها را نشان می‌دهد');
eq(pStmt.debt, 150000, 'صورت‌حساب مشترک بدهی باقی‌مانده را نشان می‌دهد');
ok(Array.isArray(pStmt.payments) && pStmt.payments.length === 1, 'تاریخچهٔ پرداخت در صورت‌حساب هست');
ok(typeof pStmt.debtAge === 'number', 'سنّ بدهی مشترک محاسبه می‌شود');
eq(pStmt.companyGroups.length, 1, 'تفکیک شرکت در صورت‌حساب حقوقی کار می‌کند');

/* حذف پرداخت، بدهی را برمی‌گرداند */
Payments.deleteSubscriberPayment(overPay[0].id);
eq(Subscribers.computeDebt(testSub.id), 200000, 'حذف پرداخت مشترک، بدهی را بازمی‌گرداند');

/* --------------------------- ۶) تسویهٔ راننده --------------------------- */
group('صورت‌حساب و تسویهٔ راننده');
const statement = Drivers.statement(driver.id);
ok(statement.trips.length > 0, 'سفرهای راننده در صورت‌حساب می‌آید');
ok(statement.totalShare > 0, 'سهم راننده محاسبه شده است');
ok(statement.payable >= 0, 'مبلغ قابل پرداخت منفی نمی‌شود');
eq(statement.payable, statement.net > 0 ? statement.net : 0, 'مانده قابل پرداخت = خالص حساب راننده (در صورت مثبت بودن)');
eq(statement.receivableFromDriver, statement.net < 0 ? -statement.net : 0, 'طلب از راننده وقتی خالص منفی است محاسبه می‌شود');
ok(statement.agencyClaim >= 0 && statement.driverClaim >= 0, 'طلب آژانس و طلب راننده جدا محاسبه می‌شوند');

const payout = Math.min(500000, Math.max(0, statement.driverClaim));
if (payout > 0) {
    Payments.driver({ driverId: driver.id, kind: 'payout', amount: payout, date: today, method: 'cash', notes: 'آزمون تسویه' });
    const st2 = Drivers.statement(driver.id);
    eq(st2.payouts, statement.payouts + payout, 'پرداخت به راننده در صورت‌حساب ثبت شد');
    const last = DB.list('driverPayments').find((p) => p.driverId === driver.id && p.amount === payout);
    Payments.deleteDriverPayment(last.id);
    eq(Drivers.statement(driver.id).payouts, statement.payouts, 'حذف پرداخت راننده بازگردانی می‌شود');
}

/* ------------------------------- ۷) گزارش‌ها ------------------------------- */
group('گزارش‌ها');
const fin = Reports.financial('', '');
ok(fin.tripCount > 0, 'گزارش مالی تعداد سفر دارد');
ok(fin.fareSum > 0, 'گزارش مالی مجموع کرایه دارد');
eq(fin.profit, fin.netIncome - fin.expenseSum, 'سود خالص = درآمد خالص − هزینه‌ها');
ok(fin.subscriptionIncome >= 0 && fin.commission >= 0, 'اجزای گزارش مالی عددی هستند');
const daily = Reports.dailySeries(7);
eq(daily.labels.length, 7, 'سری روزانه ۷ برچسب می‌سازد');
eq(daily.revenue.length, 7, 'سری روزانه ۷ مقدار درآمد دارد');
eq(daily.trips.length, 7, 'سری روزانه ۷ مقدار تعداد سفر دارد');
ok(daily.revenue.every((v) => typeof v === 'number'), 'مقادیر درآمد عددی هستند');
const methods = Reports.paymentMethods(30);
ok(Array.isArray(methods.labels) && Array.isArray(methods.data), 'گزارش روش‌های پرداخت با برچسب و داده برمی‌گردد');
eq(methods.labels.length, methods.data.length, 'تعداد برچسب‌ها و داده‌های روش پرداخت برابر است');
const cancelReport = Reports.cancellations('', '');
ok(cancelReport.total >= 1, 'گزارش لغو، سفر لغوشده را می‌شمارد');
ok(cancelReport.byReason.some((r) => r.reason === 'مشتری لغو کرد'), 'دلیل لغو در گزارش گروه‌بندی می‌شود');
ok(cancelReport.byHour.length === 24, 'گزارش لغو، ۲۴ ساعت شبانه‌روز را پوشش می‌دهد');
const opReport = Reports.operators('', '');
ok(Array.isArray(opReport.byOperator), 'گزارش اپراتور ساخته می‌شود');
const debtors = Reports.debtors();
ok(debtors.buckets && 'b0_30' in debtors.buckets && 'b60' in debtors.buckets, 'رده‌بندی سنّ بدهی (۰-۳۰/۳۱-۶۰/۶۰+) وجود دارد');
const activity = Drivers.activity(30);
ok(activity.every((a) => typeof a.tripCount === 'number' && typeof a.share === 'number'), 'گزارش عملکرد رانندگان خروجی عددی دارد');

/* ------------------------- ۷٫۵) یکپارچگی تاریخ‌ها ------------------------- */
group('یکپارچگی تاریخ و ساعت در پایگاه داده (رگرسیون)');
const allTrips = Trips.all();
const badTime = allTrips.filter((t) => {
    const d = new Date(t.pickupTime);
    return Number.isNaN(d.getTime()) || d.getFullYear() < 2000 || d.getFullYear() > 2100;
});
eq(badTime.length, 0, 'همهٔ زمان‌های سفر ISO میلادی معتبر هستند',
    badTime.slice(0, 2).map((t) => t.pickupTime).join(' , '));
const badKey = allTrips.filter((t) => {
    const k = U.isoToJalaliKey(t.pickupTime);
    return !/^1[34]\d{2}-\d{2}-\d{2}$/.test(k);
});
eq(badKey.length, 0, 'کلید شمسی حاصل از هر زمان سفر معتبر است',
    badKey.slice(0, 2).map((t) => `${t.pickupTime} → ${U.isoToJalaliKey(t.pickupTime)}`).join(' , '));
const wrongDay = allTrips.filter((t) => U.diffJalaliDays(U.isoToJalaliKey(t.pickupTime), today) > 60);
eq(wrongDay.length, 0, 'هیچ سفر نمونه‌ای با تاریخ دور از امروز ثبت نشده است');
const todayKey = U.todayJalali();
const created = Trips.create({
    subscriberName: 'آزمون تاریخ', subscriberPhone: '09120000009',
    pickupAddress: 'الف', dropoffAddress: 'ب', distance: 3, fare: 50000,
    tripDate: todayKey, pickupTime: U.jalaliDateWithTime(todayKey, '13:45'),
    paymentMethod: 'cash'
});
eq(U.isoToJalaliKey(created.pickupTime), todayKey, 'قاعدهٔ کلیدی: تاریخ شمسی ذخیره‌شده با کلید ISO هم‌خوان است');
eq(U.formatTime(created.pickupTime), U.toFa('13:45'), 'ساعت انتخابی کاربر در زمان ISO حفظ می‌شود');
const series = Reports.dailySeries(7);
ok(series.trips.reduce((a, b) => a + b, 0) > 0, 'سری روزانه سفرهای امروز را می‌شمارد', JSON.stringify(series.trips));
ok(series.revenue.reduce((a, b) => a + b, 0) > 0, 'درآمد امروز در سری روزانه دیده می‌شود');
const monthTrips = allTrips.filter((t) => U.isoToJalaliKey(t.pickupTime) >= todayKey.slice(0, 8) + '01');
ok(monthTrips.length > 0, 'فیلتر «ماه جاری» لیست سفرها رکورد دارد', `${monthTrips.length} سفر`);

/* ------------------- ۷٫۶) قالب فیلدهای تاریخ در همهٔ موجودیت‌ها ------------------- */
group('قالب تاریخ در همهٔ موجودیت‌ها (کلید شمسی یا ISO)');
const KEY_FIELDS = {
    drivers: ['joinDate'],
    vehicles: ['insuranceExpiry', 'technicalExpiry'],
    subscribers: ['subscriptionStart', 'subscriptionEnd'],
    expenses: ['date'],
    subscriberPayments: ['date'],
    driverPayments: ['date'],
    transactions: ['date'],
    shifts: ['date']
};
const ISO_FIELDS = {
    auditLog: ['timestamp'],
    trips: ['pickupTime', 'dropoffTime', 'createdAt'],
    subscriberPayments: ['createdAt'],
    shifts: ['startTime', 'endTime']
};
Object.entries(KEY_FIELDS).forEach(([coll, fields]) => {
    const rows = DB.list(coll);
    const bad = rows.filter((r) => fields.some((f) => r[f] && !isJalaliKey(r[f])));
    ok(bad.length === 0, `فیلدهای تاریخ «${coll}» قالب کلید شمسی دارند`, bad.length ? JSON.stringify(bad[0]) : '');
});
Object.entries(ISO_FIELDS).forEach(([coll, fields]) => {
    const rows = DB.listAll(coll);
    const bad = rows.filter((r) => fields.some((f) => {
        if (!r[f]) return false;
        const d = new Date(r[f]);
        return Number.isNaN(d.getTime()) || d.getFullYear() < 2000;
    }));
    ok(bad.length === 0, `فیلدهای زمان «${coll}» قالب ISO معتبر دارند`, bad.length ? JSON.stringify(bad[0]) : '');
});
function isJalaliKey(v) { return /^1[34]\d{2}-\d{2}-\d{2}$/.test(String(v).replace(/\//g, '-')); }

/* ---------------------------- ۸) اسناد چاپی ---------------------------- */
function escapeForTest(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
group('اسناد چاپی (فاکتور، رسید، گزارش‌ها)');
function docChecks(html, label) {
    ok(typeof html === 'string' && html.length > 400, `${label}: سند تولید شد`);
    ok(/class="print-doc"/.test(html), `${label}: قالب استاندارد چاپ دارد`);
    ok(/doc-head/.test(html) && /doc-foot|doc-watermark/.test(html), `${label}: سربرگ و پاصفحه دارد`);
    ok(/[\u0600-\u06FF]/.test(html), `${label}: متن فارسی دارد`);
    ok(!/undefined|NaN|\[object Object\]/.test(html), `${label}: مقدار نامعتبر (undefined/NaN) ندارد`);
    ok(/[۰-۹]/.test(html), `${label}: اعداد با ارقام فارسی نمایش داده می‌شوند`);
}
const subStatement = Subscribers.statement(testSub.id);
docChecks(Prints.invoiceHTML(subStatement), 'فاکتور مشترک');
const drvStatement = Drivers.statement(driver.id);
docChecks(Prints.driverReceiptHTML(drvStatement), 'رسید راننده');
docChecks(Prints.financialReportHTML(Reports.financial('', ''), { from: '', to: '', chartData: Reports.dailySeries(7) }), 'گزارش مالی');
const shiftFixture = {
    id: 'shift-smoke', code: 'SH-9999', operatorId: 'op-smoke', operatorName: 'مدیر آزمون',
    date: today, startTime: new Date(Date.now() - 3 * 3600000).toISOString(), endTime: new Date().toISOString(),
    openingCash: 500000, closingCash: 700000, status: 'closed', notes: 'آزمون'
};
docChecks(Prints.shiftReportHTML(shiftFixture, Auth.shiftStats(shiftFixture), { operator: 'مدیر آزمون', trips: Trips.all().slice(0, 3) }), 'گزارش شیفت');
docChecks(Prints.analysisReportHTML({
    title: 'گزارش آزمون',
    subtitle: 'بازهٔ آزمون',
    kpis: [{ label: 'تعداد', value: U.toFa(3) }],
    tables: [{ title: 'جدول آزمون', headers: ['الف', 'ب'], rows: [['یک', 'دو']] }]
}), 'گزارش تحلیلی');
ok(/شرکت آزمون/.test(Prints.invoiceHTML(subStatement)), 'فاکتور مشترک شامل نام مشترک است');
const receiptDriver = DB.list('drivers')[0];
const receiptDriverStmt = Drivers.statement(receiptDriver.id);
const receiptHTML = Prints.driverReceiptHTML(receiptDriverStmt);
ok(receiptHTML.includes(escapeForTest(receiptDriver.fullName)), 'رسید راننده شامل نام همان راننده است');
ok(/شرکت آزمون/.test(Prints.invoiceHTML(Subscribers.statement(testSub.id))), 'فاکتور مشترک شامل نام همان مشترک است');
ok((Prints.invoiceHTML(subStatement).match(/\u062a\u0648\u0645\u0627\u0646/g) || []).length > 0, 'مبالغ با واحد تومان در سند درج می‌شوند');

/* ---------------------- ۸٫۵) آژانس‌ها و چند‌مستأجری ---------------------- */
group('آژانس‌ها، اشتراک نرم‌افزار و جداسازی دادهٔ آژانس‌ها');
/* رمزهای پیش‌فرض کاربران نمونه در Auth.init ساخته می‌شوند */
await Auth.init();
const { Agency, DEFAULT_AGENCY_ID } = await import('../js/agency.js');
ok(Agency.all().length >= 1, 'آژانس پیش‌فرض سامانه وجود دارد');
const defaultAgencyRow = Agency.get(DEFAULT_AGENCY_ID);
ok(!!defaultAgencyRow, 'آژانس پیش‌فرض با شناسهٔ ag1 ساخته شده است');
ok(DB.list('drivers').every((d) => (d.agencyId || DEFAULT_AGENCY_ID) === DEFAULT_AGENCY_ID),
    'همهٔ رکوردها مهر آژانس دارند (دادهٔ قدیمی به آژانس پیش‌فرض منتسب است)');

const agencyCountBefore = Agency.all().length;
const eastAgency = Agency.create({ name: 'آژانس آزمون شرق', code: 'test-east', phone: '02133445566', plan: 'basic', months: 6, maxUsers: 3 });
eq(Agency.all().length, agencyCountBefore + 1, 'آژانس (اشتراک) جدید ساخته شد');
ok(Agency.subscription(eastAgency).daysLeft > 150, 'اعتبار اشتراک آژانس جدید محاسبه می‌شود');
let dupCodeBlocked = false;
try { Agency.create({ name: 'آژانس تکراری', code: 'test-east' }); } catch (e) { dupCodeBlocked = true; }
ok(dupCodeBlocked, 'شناسهٔ تکراری آژانس پذیرفته نمی‌شود');

await Auth.createUser({ fullName: 'مدیر آژانس شرق', username: 'east-admin', password: 'east12345', role: 'admin', agencyId: eastAgency.id });
await Auth.login('east-admin', 'east12345');
eq(DB.scope(), eastAgency.id, 'دامنهٔ داده به آژانس کاربر محدود شد');
eq(DB.list('drivers').length, 0, 'کاربر آژانس جدید هیچ راننده‌ای از آژانس دیگر نمی‌بیند');
eq(DB.list('trips').length, 0, 'سفرهای آژانس دیگر برای این کاربر دیده نمی‌شود');
const eastDriver = DB.insert('drivers', { fullName: 'رانندهٔ شرق', phone: '09121110000', commissionRate: 15, status: 'active', availability: 'available' });
eq(DB.get('drivers', eastDriver.id).agencyId, eastAgency.id, 'رکورد جدید به آژانس فعال مهر می‌شود');
let switchDenied = false;
try { Auth.switchAgency(DEFAULT_AGENCY_ID); } catch (e) { switchDenied = true; }
ok(switchDenied, 'کاربر غیرمدیر سامانه نمی‌تواند آژانس فعال را عوض کند');

Auth.logout({ silent: true });
await Auth.login('admin', 'admin');
ok(Auth.isSuperAdmin(), 'کاربر admin مدیر سامانه است');
Auth.switchAgency(eastAgency.id);
eq(DB.list('drivers').length, 1, 'مدیر سامانه پس از جابه‌جایی، دادهٔ همان آژانس را می‌بیند');
Auth.switchAgency(DEFAULT_AGENCY_ID);
eq(DB.list('drivers').length > 1, true, 'با بازگشت به آژانس پیش‌فرض، دادهٔ آن دیده می‌شود');

/* سقف کاربران آژانس */
let quotaBlocked = false;
try {
    await Auth.createUser({ fullName: 'کاربر ۲', username: 'east-user2', password: 'east12345', role: 'operator', agencyId: eastAgency.id });
    await Auth.createUser({ fullName: 'کاربر ۳', username: 'east-user3', password: 'east12345', role: 'operator', agencyId: eastAgency.id });
    await Auth.createUser({ fullName: 'کاربر ۴', username: 'east-user4', password: 'east12345', role: 'operator', agencyId: eastAgency.id });
} catch (e) { quotaBlocked = /سقف/.test(e.message); }
ok(quotaBlocked, 'سقف کاربران آژانس رعایت می‌شود');

/* انقضا و تمدید اشتراک نرم‌افزار */
Agency.update(eastAgency.id, { softwareEnd: U.addJalaliDays(today, -1) }, 'آزمون انقضای اشتراک');
ok(Agency.subscription(Agency.get(eastAgency.id)).expired, 'اشتراک منقضی‌شده تشخیص داده می‌شود');
let expiredBlocked = false;
try { await Auth.login('east-admin', 'east12345'); } catch (e) { expiredBlocked = /اشتراک/.test(e.message); }
ok(expiredBlocked, 'ورود کاربر آژانس با اشتراک منقضی مسدود می‌شود');
Agency.extend(eastAgency.id, 12);
ok(!Agency.subscription(Agency.get(eastAgency.id)).expired, 'تمدید اشتراک کار می‌کند');
Agency.setStatus(eastAgency.id, 'suspended');
ok(!Agency.canLogin(Agency.get(eastAgency.id)).ok, 'آژانس غیرفعال اجازهٔ ورود نمی‌دهد');
Agency.setStatus(eastAgency.id, 'active');

/* پاک‌سازی داده‌های آزمون آژانس (بدون اثر روی داده اصلی) */
let deleteBlocked = false;
try { Agency.remove(eastAgency.id); } catch (e) { deleteBlocked = true; }
ok(deleteBlocked, 'آژانس دارای دادهٔ عملیاتی حذف نمی‌شود');
DB.listGlobal('operators').filter((u) => ['east-user2', 'east-user3'].includes(u.username)).forEach((u) => DB.remove('operators', u.id, 'پاک‌سازی آزمون'));
DB.remove('drivers', eastDriver.id, 'پاک‌سازی آزمون');

/* ------------------- ۸٫۶) لوگوی آژانس روی اسناد چاپی ------------------- */
group('لوگوی آژانس روی صورت‌حساب‌های چاپی');
const LOGO_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
Auth.switchAgency(DEFAULT_AGENCY_ID);
Agency.setLogo(DEFAULT_AGENCY_ID, LOGO_DATA_URL);
ok(Agency.identity().hasLogo, 'لوگو در هویت آژانس ثبت شد');
const invoiceWithLogo = Prints.invoiceHTML(subStatement);
ok(invoiceWithLogo.includes('data:image/png;base64'), 'لوگو در سربرگ صورت‌حساب مشترک درج می‌شود');
ok(/class="doc-logo"/.test(invoiceWithLogo), 'تصویر لوگو با کلاس چاپی .doc-logo ساخته می‌شود');
let badLogoBlocked = false;
try { Agency.setLogo(DEFAULT_AGENCY_ID, 'https://example.com/logo.png'); } catch (e) { badLogoBlocked = true; }
ok(badLogoBlocked, 'لوگوی غیرتصویری (آدرس بیرونی) رد می‌شود');
Agency.setLogo(DEFAULT_AGENCY_ID, '');
ok(!Prints.invoiceHTML(subStatement).includes('class="doc-logo"'), 'در نبود لوگو، نشان پیش‌فرض چاپ می‌شود');
ok(Prints.invoiceHTML(subStatement).includes('doc-brand'), 'سربرگ سند در هر حالت ساخته می‌شود');
Agency.update(DEFAULT_AGENCY_ID, { name: 'آژانس آزمون سند', phone: '02112345678', address: 'تهران، خیابان آزمون' });
const invoiceNamed = Prints.invoiceHTML(subStatement);
ok(invoiceNamed.includes('آژانس آزمون سند'), 'نام آژانس روی اسناد چاپی درج می‌شود');
ok(invoiceNamed.includes('تهران، خیابان آزمون'), 'نشانی آژانس روی اسناد چاپی درج می‌شود');
const receiptWithAgency = Prints.driverReceiptHTML(Drivers.statement(DB.list('drivers')[0].id));
ok(receiptWithAgency.includes('آژانس آزمون سند'), 'رسید راننده هم سربرگ آژانس را دارد');
Agency.update(DEFAULT_AGENCY_ID, { name: defaultAgencyRow.name, phone: defaultAgencyRow.phone, address: defaultAgencyRow.address });
let invalidLogoFile = false;
try { await U.imageFileToDataURL({ type: 'text/plain', size: 10, name: 'a.txt' }); } catch (e) { invalidLogoFile = /تصویر/.test(e.message); }
ok(invalidLogoFile, 'فایل غیرتصویری برای لوگو رد می‌شود');

/* ----------------------- ۸٫۷) حسابداری دوطرفه ----------------------- */
group('حسابداری دوطرفه: کدینگ، سند، تراز، سود و زیان، دفتر معین');
const { Accounts, Journals, ACCOUNT_MAP, expenseAccountCode, registerLedgerAutoPosting } = await import('../js/ledger.js');
ok(Accounts.all().length >= 20, 'کدینگ پیش‌فرض حساب‌ها ساخته شده است', `تعداد: ${Accounts.all().length}`);
eq(expenseAccountCode('قبض اینترنت دفتر'), '5020', 'دستهٔ هزینه به کد حساب درست نگاشت می‌شود');
eq(expenseAccountCode('دستهٔ ناشناخته'), ACCOUNT_MAP.defaultExpense, 'هزینهٔ ناشناخته به حساب پیش‌فرض می‌رود');
let dupAccBlocked = false;
try { Accounts.create({ code: ACCOUNT_MAP.cash, name: 'حساب تکراری', type: 'asset' }); } catch (e) { dupAccBlocked = true; }
ok(dupAccBlocked, 'کد حساب تکراری رد می‌شود');
let badTypeBlocked = false;
try { Accounts.create({ code: '9911', name: 'نوع نامعتبر', type: 'whatever' }); } catch (e) { badTypeBlocked = true; }
ok(badTypeBlocked, 'نوع حساب نامعتبر رد می‌شود');
let unbalancedBlocked = false;
try {
    Journals.create({ description: 'سند نامتوازن', lines: [{ accountCode: ACCOUNT_MAP.cash, debit: 1000 }, { accountCode: ACCOUNT_MAP.commissionIncome, credit: 900 }] });
} catch (e) { unbalancedBlocked = /متوازن/.test(e.message); }
ok(unbalancedBlocked, 'سند نامتوازن ثبت نمی‌شود');
let singleLineBlocked = false;
try { Journals.create({ description: 'یک سطر', lines: [{ accountCode: ACCOUNT_MAP.cash, debit: 100 }] }); } catch (e) { singleLineBlocked = true; }
ok(singleLineBlocked, 'سند تک‌سطری رد می‌شود');
let bothSidesBlocked = false;
try { Journals.create({ description: 'دو طرفه', lines: [{ accountCode: ACCOUNT_MAP.cash, debit: 100, credit: 100 }, { accountCode: ACCOUNT_MAP.capital, debit: 100, credit: 100 }] }); } catch (e) { bothSidesBlocked = true; }
ok(bothSidesBlocked, 'سطر هم‌زمان بدهکار و بستانکار رد می‌شود');

const openingJournal = Journals.create({
    date: today, description: 'سند سرمایهٔ اولیه (آزمون)',
    lines: [
        { accountCode: ACCOUNT_MAP.cash, debit: 50000000, description: 'موجودی صندوق' },
        { accountCode: ACCOUNT_MAP.capital, credit: 50000000, description: 'سرمایهٔ مالک' }
    ]
});
ok(/^JV-\d{4}$/.test(openingJournal.number), 'شمارهٔ سند به‌صورت JV-xxxx ساخته می‌شود');
const opTotals = Journals.totals(Journals.get(openingJournal.id).lines);
eq(opTotals.debit, opTotals.credit, 'سند ثبت‌شده متوازن است');

const wide = { from: U.addJalaliDays(today, -400), to: today };
const tb = Journals.trialBalance(wide);
ok(tb.rows.length > 0, 'تراز آزمایشی سطر دارد');
eq(tb.totalDebit, tb.totalCredit, 'جمع بدهکار و بستانکار تراز آزمایشی برابر است');
ok(tb.balanced, 'وضعیت تراز «متوازن» است');
const pl = Journals.incomeStatement(wide);
eq(pl.profit, pl.totalIncome - pl.totalExpense, 'سود صورت مالی = درآمد − هزینه');
const bs = Journals.balanceSheet({ to: today });
ok(bs.balanced, 'ترازنامه متوازن است (دارایی = بدهی + سرمایه)', JSON.stringify({ a: bs.totalAssets, l: bs.totalLiabilities, e: bs.totalEquity }));
const capLedger = Journals.accountLedger(ACCOUNT_MAP.capital, wide);
eq(capLedger.closing, capLedger.opening + capLedger.totalDebit - capLedger.totalCredit, 'ماندهٔ دفتر معین درست بسته می‌شود');
ok(capLedger.rows.length >= 1, 'دفتر معین گردش حساب را نشان می‌دهد');

group('ثبت خودکار اسناد حسابداری از دادهٔ عملیاتی');
registerLedgerAutoPosting();
const autoTrip = Trips.create({
    subscriberName: 'مسافر آزمون حسابداری', subscriberPhone: '09120000011',
    pickupAddress: 'میدان ونک', dropoffAddress: 'فرودگاه امام', distance: 30,
    fare: 1000000, tripDate: today, pickupTime: U.jalaliDateWithTime(today, '10:30'),
    paymentMethod: 'cash', driverId: DB.list('drivers')[0]?.id || ''
});
Trips.setStatus(autoTrip.id, 'completed');
const tripJournal = Journals.findRef('trip', autoTrip.id);
ok(!!tripJournal, 'برای سفر تکمیل‌شده سند خودکار ساخته می‌شود');
if (tripJournal) {
    const tl = tripJournal.lines;
    ok(tl.some((l) => l.accountCode === ACCOUNT_MAP.cash && l.debit === Number(tripJournal.lines.find((x) => x.accountCode === ACCOUNT_MAP.cash).debit)),
        'کرایهٔ نقدی به حساب صندوق بدهکار می‌شود');
    ok(tl.some((l) => l.accountCode === ACCOUNT_MAP.commissionIncome && l.credit > 0), 'درآمد کمیسیون بستانکار می‌شود');
    ok(tl.some((l) => l.accountCode === ACCOUNT_MAP.driverPayable && l.credit > 0), 'سهم راننده به بدهی رانندگان بستانکار می‌شود');
    eq(Journals.totals(tl).debit, Journals.totals(tl).credit, 'سند خودکار سفر متوازن است');
}

const corpSub = DB.insert('subscribers', {
    subscriptionNumber: 'SUB-TEST-9', type: 'corporate', fullName: 'شرکت آزمون حسابداری',
    companyName: 'شرکت آزمون حسابداری', phone: '02177778888', debt: 0, subscriptionStart: today, subscriptionEnd: U.addJalaliDays(today, 30)
});
const corpTrip = Trips.create({
    subscriberId: corpSub.id, subscriberName: corpSub.fullName, subscriberPhone: corpSub.phone,
    pickupAddress: 'دفتر مرکزی', dropoffAddress: 'پایانه غرب', distance: 12,
    fare: 500000, tripDate: today, pickupTime: U.jalaliDateWithTime(today, '12:00'),
    paymentMethod: 'credit', billedTo: 'company'
});
Trips.setStatus(corpTrip.id, 'completed');
const corpJournal = Journals.findRef('trip', corpTrip.id);
ok(!!corpJournal, 'سفر حقوقی هم سند خودکار دارد');
ok(!!corpJournal && corpJournal.lines.some((l) => l.accountCode === ACCOUNT_MAP.subscriberReceivable && l.debit > 0),
    'کرایهٔ سفر حقوقی به حساب‌های دریافتنی مشترکین بدهکار می‌شود');

Subscribers.addPayment({ subscriberId: corpSub.id, amount: 200000, date: today, method: 'cash', notes: 'آزمون' });
const subPay = DB.list('subscriberPayments').find((p) => p.subscriberId === corpSub.id);
const subPayJournal = Journals.findRef('subscriberPayment', subPay.id);
ok(!!subPayJournal, 'برای دریافت از مشترک سند خودکار ساخته می‌شود');
ok(!!subPayJournal && subPayJournal.lines.some((l) => l.accountCode === ACCOUNT_MAP.subscriberReceivable && l.credit === 200000),
    'دریافت مشترک، حساب دریافتنی را بستانکار می‌کند');

const expRow = DB.insert('expenses', { date: today, category: 'اینترنت', description: 'آزمون سند هزینه', amount: 300000 });
const expJournal = Journals.findRef('expense', expRow.id);
ok(!!expJournal, 'برای هزینهٔ جانبی سند خودکار ساخته می‌شود');
ok(!!expJournal && expJournal.lines.some((l) => l.accountCode === '5020' && l.debit === 300000), 'هزینه به حساب درست بدهکار می‌شود');

const backfillFirst = Journals.backfill();
ok(U.sum(Object.values(backfillFirst), (v) => v) > 0, 'تولید اسناد از دادهٔ موجود، اسناد سفرهای قبلی را می‌سازد',
    JSON.stringify(backfillFirst));
const cov = Journals.coverage();
ok(cov.trips.posted === cov.trips.total && cov.expenses.posted === cov.expenses.total
    && cov.subscriberPayments.posted === cov.subscriberPayments.total && cov.driverPayments.posted === cov.driverPayments.total,
    'پس از تولید، همهٔ رکوردهای عملیاتی سند حسابداری دارند', JSON.stringify(cov));
const backfillAgain = Journals.backfill();
eq(U.sum(Object.values(backfillAgain), (v) => v), 0, 'تولید دوبارهٔ اسناد، سند تکراری نمی‌سازد (idempotent)');
const tbAfter = Journals.trialBalance(wide);
ok(tbAfter.balanced, 'تراز پس از ثبت اسناد خودکار همچنان متوازن است');
Journals.remove(openingJournal.id);
ok(!DB.get('journals', openingJournal.id), 'حذف نرم سند حسابداری کار می‌کند');
ok(Journals.trialBalance(wide).balanced, 'تراز پس از حذف سند متوازن می‌ماند');

/* ------------------- ۸٫۸) مهاجرت داده‌های نسخهٔ ۵ به ۶ ------------------- */
group('مهاجرت داده از نسخهٔ ۵ (نصب‌های قبلی)');
const { migrateFromV5, DEFAULT_AGENCY_ID: DEF_AG } = await import('../js/db.js');
const legacyDoc = {
    meta: { version: 5, sampleData: false },
    settings: { ...DB.settings(), companyName: 'آژانس قدیمی من' },
    sequences: { trip: 12, subscriber: 4 },
    drivers: [{ id: 'old-d1', fullName: 'رانندهٔ قدیمی', phone: '09120000000', commissionRate: 15, status: 'active' }],
    trips: [{ id: 'old-t1', driverId: 'old-d1', fare: 100000, commission: 15000, status: 'completed', billedTo: 'driver', pickupTime: new Date().toISOString(), createdAt: new Date().toISOString() }],
    subscribers: [{ id: 'old-s1', fullName: 'مشترک قدیمی', debt: 0, type: 'individual' }],
    operators: [{ id: 'old-op1', fullName: 'کاربر قدیمی', username: 'olduser', role: 'operator', status: 'active', passwordHash: 'x', salt: 'y' }],
    expenses: [{ id: 'old-e1', date: U.todayJalali(), category: 'برق', amount: 1000 }],
    auditLog: []
};
const migrated = migrateFromV5(legacyDoc);
eq(migrated.meta.version, 6, 'نسخهٔ سند پس از مهاجرت به ۶ ارتقا می‌یابد');
eq(migrated.meta.migratedFrom, 'v5', 'منبع مهاجرت ثبت می‌شود');
eq(migrated.agencies.length, 1, 'آژانس پیش‌فرض برای دادهٔ قدیمی ساخته می‌شود');
eq(migrated.agencies[0].name, 'آژانس قدیمی من', 'نام آژانس از تنظیمات قبلی برداشته می‌شود');
ok(migrated.accounts.length >= 20, 'کدینگ حساب‌ها برای دادهٔ قدیمی ساخته می‌شود');
ok(migrated.drivers.every((d) => d.agencyId === DEF_AG), 'رانندگان قدیمی به آژانس پیش‌فرض مهر می‌شوند');
ok(migrated.trips.every((t) => t.agencyId === DEF_AG) && migrated.operators.every((o) => o.agencyId === DEF_AG),
    'سفرها و کاربران قدیمی هم مهر آژانس می‌گیرند');
eq(migrated.trips.length, 1, 'داده‌های قدیمی حفظ می‌شوند (هیچ رکوردی گم نمی‌شود)');

/* ------------------------------- ۹) هشدارها ------------------------------- */
group('هشدارهای داشبورد');
const alerts = Alerts.all ? Alerts.all() : [];
ok(Array.isArray(alerts), 'فهرست هشدارها آرایه است');
ok(Array.isArray(Alerts.expiringDocs(30)), 'هشدار مدارک منقضی‌شدنی کار می‌کند');
ok(Array.isArray(Alerts.overdueQueue(30)), 'هشدار صف معوق کار می‌کند');
ok(Array.isArray(Alerts.heavyDebts(1000000)), 'هشدار بدهی سنگین کار می‌کند');

/* ----------------------------- ۱۰) ورود کاربران ----------------------------- */
group('احراز هویت و نقش‌ها');
await Auth.init();
let loginFailed = false;
try { await Auth.login('admin', 'wrong-password'); } catch (e) { loginFailed = true; }
ok(loginFailed, 'رمز نادرست رد می‌شود');
const session = await Auth.login('admin', 'admin');
ok(!!session, 'ورود مدیر با رمز پیش‌فرض انجام شد');
eq(Auth.role(), 'admin', 'نقش کاربر شناسایی شد');
ok(Auth.canAccess('dashboard') && Auth.canAccess('settings'), 'مدیر به همهٔ صفحه‌ها دسترسی دارد');
Auth.logout({ silent: true });
await Auth.login('operator', 'operator123');
eq(Auth.role(), 'operator', 'ورود اپراتور انجام شد');
ok(Auth.canAccess('queue') && !Auth.canAccess('settings'), 'دسترسی اپراتور محدود است');
ok(Auth.can('trip.assign'), 'توانایی تخصیص سفر برای اپراتور فعال است');

/* -------------------------------- ۱۱) شیفت -------------------------------- */
group('شیفت‌ها');
const shift = Auth.openShift({ openingCash: 500000, notes: 'آزمون' });
ok(shift.id && shift.code.startsWith('SH-'), 'شیفت با کد یکتا باز شد');
eq(Auth.currentShift().id, shift.id, 'شیفت جاری شناسایی می‌شود');
let secondShiftBlocked = false;
try { Auth.openShift({}); } catch (e) { secondShiftBlocked = true; }
ok(secondShiftBlocked, 'باز کردن دو شیفت هم‌زمان جلوگیری می‌شود');
const stats = Auth.shiftStats(shift);
ok(typeof stats.tripsCount === 'number', 'آمار شیفت محاسبه می‌شود');
const closed = Auth.closeShift({ closingCash: 600000, notes: 'تحویل' });
eq(closed.status, 'closed', 'بستن شیفت انجام شد');
ok(!Auth.currentShift(), 'پس از بستن، شیفت جاری وجود ندارد');

/* --------------------------- ۱۲) پشتیبان‌گیری --------------------------- */
group('پشتیبان‌گیری و بازیابی');
const dump = DB.exportObject();
ok(dump && dump.drivers && dump.trips, 'خروجی پشتیبان شامل موجودیت‌هاست');
const clone1 = JSON.parse(JSON.stringify(dump));
await DB.importObject(clone1, { merge: false });
eq(DB.list('trips').length, clone1.trips.filter((t) => !t.deletedAt).length, 'بازیابی کامل داده‌ها انجام شد');
const stats2 = DB.stats();
ok(Object.keys(stats2).length >= 10, 'آمار موجودیت‌ها گزارش می‌شود');

/* --------------------------------- پایان --------------------------------- */
console.log('\n' + '─'.repeat(60));
console.log(`نتیجه: ${passed} آزمون موفق` + (failures.length ? ` — ${failures.length} خطا` : ' — بدون خطا'));
if (failures.length) {
    console.log('\nخطاها:');
    failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
    process.exit(1);
}
process.exit(0);
