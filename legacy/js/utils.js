/* ==========================================================================
 * js/utils.js — ابزارهای پایه: عدد فارسی، تاریخ شمسی، اعتبارسنجی، کمک‌تابع‌ها
 * این فایل «خالص» است (بدون وابستگی به DB یا DOM) تا در فاز بعد بدون تغییر
 * در سمت API/سرور هم قابل استفاده باشد.
 * ========================================================================== */

import { S } from './strings.js';

/* ============================ ۱) اعداد ============================ */

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

/** تبدیل ارقام لاتین به فارسی */
export function toFa(value) {
    return String(value ?? '').replace(/[0-9]/g, (d) => FA_DIGITS[+d]);
}

/** تبدیل ارقام فارسی/عربی به لاتین (برای محاسبه و ذخیره‌سازی) */
export function toEn(value) {
    return String(value ?? '')
        .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
        .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

/** جداکننده هزارگان فارسی */
export function formatNumber(num) {
    const n = Number(num);
    if (num === '' || num === null || num === undefined || Number.isNaN(n)) return toFa('0');
    const sign = n < 0 ? '-' : '';
    const fixed = Math.abs(Math.round(n * 100) / 100);
    const [intPart, decPart] = String(fixed).split('.');
    const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
    return sign + toFa(decPart ? `${grouped}.${decPart}` : grouped);
}

/** مبلغ با واحد تومان */
export function formatMoney(num, withUnit = true) {
    return formatNumber(num) + (withUnit ? ' تومان' : '');
}

/** درصد */
export function formatPercent(num) {
    return formatNumber(num) + '٪';
}

/** تبدیل رشتهٔ ورودی کاربر (با ارقام فارسی/جداکننده) به عدد */
export function parseNumber(value) {
    if (typeof value === 'number') return value;
    const clean = toEn(value).replace(/[٬,\s٫]/g, '').replace(/[^\d.\-]/g, '');
    const n = parseFloat(clean);
    return Number.isNaN(n) ? 0 : n;
}

/** مبلغ به حروف فارسی (برای فاکتور و رسید چاپی) */
export function numberToPersianWords(num) {
    const n = Math.round(Math.abs(Number(num) || 0));
    if (n === 0) return 'صفر';
    const yekan = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
    const dahgan = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
    const dah = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
    const sadgan = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
    const scales = ['', ' هزار', ' میلیون', ' میلیارد', ' بیلیون'];

    const threeDigits = (x) => {
        const out = [];
        const s = Math.floor(x / 100), rem = x % 100;
        if (s) out.push(sadgan[s]);
        if (rem >= 10 && rem < 20) out.push(dah[rem - 10]);
        else {
            const d = Math.floor(rem / 10), y = rem % 10;
            if (d) out.push(dahgan[d]);
            if (y) out.push(yekan[y]);
        }
        return out.join(' و ');
    };

    const groups = [];
    let rest = n;
    while (rest > 0) {
        groups.push(rest % 1000);
        rest = Math.floor(rest / 1000);
    }
    const parts = [];
    for (let i = groups.length - 1; i >= 0; i--) {
        if (!groups[i]) continue;
        parts.push(threeDigits(groups[i]) + scales[i]);
    }
    return (Number(num) < 0 ? 'منفی ' : '') + parts.join(' و ');
}

/* ===================== ۲) تاریخ شمسی (جلالی) ===================== */
/* پیاده‌سازی الگوریتم استاندارد jalaali (بدون وابستگی خارجی) */

const div = (a, b) => ~~(a / b);
const mod = (a, b) => a - ~~(a / b) * b;

export const JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
    'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
export const WEEKDAYS = ['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];
export const WEEKDAYS_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210,
    1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

function jalCal(jy, withoutLeap = false) {
    const bl = BREAKS.length;
    const gy = jy + 621;
    let leapJ = -14;
    let jp = BREAKS[0];
    let jm, jump = 0, leap, n;

    if (jy < jp || jy >= BREAKS[bl - 1]) throw new Error('Invalid Jalali year ' + jy);

    for (let i = 1; i < bl; i += 1) {
        jm = BREAKS[i];
        jump = jm - jp;
        if (jy < jm) break;
        leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
        jp = jm;
    }
    n = jy - jp;
    leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
    if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;

    const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
    const march = 20 + leapJ - leapG;

    if (!withoutLeap) {
        if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
        leap = mod(mod(n + 1, 33) - 1, 4);
        if (leap === -1) leap = 4;
    }
    return { leap, gy, march };
}

function g2d(gy, gm, gd) {
    let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
        div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
    d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
    return d;
}

function d2g(jdn) {
    let j = 4 * jdn + 139361631;
    j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    const i = div(mod(j, 1461), 4) * 5 + 308;
    const gd = div(mod(i, 153), 5) + 1;
    const gm = mod(div(i, 153), 12) + 1;
    const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
    return { gy, gm, gd };
}

function j2d(jy, jm, jd) {
    const r = jalCal(jy, true);
    return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn) {
    const gy = d2g(jdn).gy;
    let jy = gy - 621;
    const r = jalCal(jy, false);
    const jdn1f = g2d(gy, 3, r.march);
    let k = jdn - jdn1f;
    if (k >= 0) {
        if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
        k -= 186;
    } else {
        jy -= 1;
        k += 179;
        if (r.leap === 1) k += 1;
    }
    return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}

/** میلادی → شمسی؛ ورودی ماه میلادی ۱ تا ۱۲ */
export function toJalali(gy, gm, gd) {
    return d2j(g2d(gy, gm, gd));
}

/** شمسی → میلادی */
export function toGregorian(jy, jm, jd) {
    return d2g(j2d(jy, jm, jd));
}

export function isLeapJalaliYear(jy) {
    return jalCal(jy, false).leap === 0;
}

export function jalaliMonthLength(jy, jm) {
    if (jm <= 6) return 31;
    if (jm <= 11) return 30;
    return isLeapJalaliYear(jy) ? 30 : 29;
}

/** کلید شمسی استاندارد ذخیره‌سازی: '1404-07-15' */
export function jalaliKey(jy, jm, jd) {
    return `${jy}-${String(jm).padStart(2, '0')}-${String(jd).padStart(2, '0')}`;
}

/** امروز به شکل کلید شمسی */
export function todayJalali() {
    const n = new Date();
    const j = toJalali(n.getFullYear(), n.getMonth() + 1, n.getDate());
    return jalaliKey(j.jy, j.jm, j.jd);
}

/** ISO یا Date → کلید شمسی */
export function isoToJalaliKey(iso) {
    if (!iso) return '';
    const d = iso instanceof Date ? iso : new Date(iso);
    if (Number.isNaN(d.getTime())) {
        // شاید ورودی از قبل کلید شمسی باشد
        return isJalaliKey(String(iso).replace(/\//g, '-')) ? String(iso).replace(/\//g, '-') : '';
    }
    const j = toJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
    return jalaliKey(j.jy, j.jm, j.jd);
}

/** ISO/Date → کلید ماه شمسی '1404-07' */
export function isoToJalaliMonthKey(iso) {
    const k = isoToJalaliKey(iso);
    return k ? k.slice(0, 7) : '';
}

export function isValidJalali(jy, jm, jd) {
    if (!Number.isInteger(jy) || !Number.isInteger(jm) || !Number.isInteger(jd)) return false;
    if (jy < 1200 || jy > 1600) return false;
    if (jm < 1 || jm > 12) return false;
    return jd >= 1 && jd <= jalaliMonthLength(jy, jm);
}

export function isJalaliKey(str) {
    if (!str) return false;
    const m = toEn(str).trim().replace(/\//g, '-').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) return false;
    return isValidJalali(+m[1], +m[2], +m[3]);
}

/** کلید شمسی نرمال‌شده از ورودی کاربر: '۱۴۰۴/۷/۵' → '1404-07-05' */
export function normalizeJalaliKey(str) {
    if (!str) return '';
    const m = toEn(str).trim().replace(/\//g, '-').replace(/[.\s]/g, '-').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) return '';
    return jalaliKey(+m[1], +m[2], +m[3]);
}

export function jalaliToDate(key) {
    const k = normalizeJalaliKey(key);
    if (!k) return null;
    const [jy, jm, jd] = k.split('-').map(Number);
    const g = toGregorian(jy, jm, jd);
    return new Date(g.gy, g.gm - 1, g.gd, 0, 0, 0, 0);
}

export function dateToJalaliKey(date) {
    return isoToJalaliKey(date);
}

/** نمایش: ۱۴۰۴/۰۷/۱۵ */
export function formatJalali(key, sep = '/') {
    const k = normalizeJalaliKey(key) || (isJalaliKey(isoToJalaliKey(key)) ? isoToJalaliKey(key) : '');
    if (!k) return '—';
    const [jy, jm, jd] = k.split('-');
    return toFa(`${jy}${sep}${jm}${sep}${jd}`);
}

/** نمایش بلند: پنج‌شنبه ۱۵ مهر ۱۴۰۴ */
export function formatJalaliLong(key) {
    const k = normalizeJalaliKey(key);
    if (!k) return '—';
    const [jy, jm, jd] = k.split('-').map(Number);
    return toFa(`${WEEKDAYS[jalaliDayOfWeek(k)]} ${jd} ${JALALI_MONTHS[jm - 1]} ${jy}`);
}

/** ۰ = شنبه ... ۶ = جمعه */
export function jalaliDayOfWeek(key) {
    const d = jalaliToDate(key);
    if (!d) return 0;
    return (d.getDay() + 1) % 7;
}

export function isThursday(key) {
    return jalaliDayOfWeek(key) === 5;
}

export function isFriday(key) {
    return jalaliDayOfWeek(key) === 6;
}

/** جمع روز روی کلید شمسی */
export function addJalaliDays(key, days) {
    const k = normalizeJalaliKey(key) || todayJalali();
    const [jy, jm, jd] = k.split('-').map(Number);
    const g = toGregorian(jy, jm, jd);
    const d = new Date(g.gy, g.gm - 1, g.gd);
    d.setDate(d.getDate() + Number(days || 0));
    return isoToJalaliKey(d);
}

/** اختلاف روز (b - a) */
export function diffJalaliDays(a, b) {
    const da = jalaliToDate(a), db = jalaliToDate(b);
    if (!da || !db) return 0;
    return Math.round((db - da) / 86400000);
}

export function jalaliMonthStart(key) {
    const k = normalizeJalaliKey(key) || todayJalali();
    return k.slice(0, 8) + '01';
}

export function jalaliMonthEnd(key) {
    const k = normalizeJalaliKey(key) || todayJalali();
    const [jy, jm] = k.split('-').map(Number);
    return jalaliKey(jy, jm, jalaliMonthLength(jy, jm));
}

/** محدوده ماه شمسی جاری */
export function currentJalaliMonthRange() {
    const t = todayJalali();
    return { from: jalaliMonthStart(t), to: jalaliMonthEnd(t) };
}

/** کلید ماه شمسی جاری '1404-07' */
export function currentJalaliMonth() {
    return todayJalali().slice(0, 7);
}

/** «۱۴۰۴/۰۷» از کلید ماه */
export function formatJalaliMonth(monthKey) {
    if (!monthKey) return '—';
    const [jy, jm] = String(monthKey).split('-');
    return toFa(`${jy}/${String(jm).padStart(2, '0')}`);
}

export function jalaliMonthLabel(monthKey) {
    if (!monthKey) return '—';
    const [jy, jm] = String(monthKey).split('-').map(Number);
    return toFa(`${JALALI_MONTHS[jm - 1]} ${String(jy).slice(2)}`);
}

/** لیست N ماه گذشته (کلید ماه) */
export function lastJalaliMonths(n) {
    const out = [];
    let k = currentJalaliMonth();
    for (let i = 0; i < n; i++) {
        out.unshift(k);
        const [jy, jm] = k.split('-').map(Number);
        k = jm === 1 ? jalaliKey(jy - 1, 12, 1) : jalaliKey(jy, jm - 1, 1);
    }
    return out;
}

/* ===================== ۳) زمان و تاریخ-زمان ===================== */

export function nowISO() {
    return new Date().toISOString();
}

/** ترکیب تاریخ شمسی + زمان فعلی → ISO (برای pickupTime) */
export function jalaliDateWithTime(key, time) {
    const d = jalaliToDate(key) || new Date();
    const t = time || new Date().toTimeString().slice(0, 8);
    const [hh, mm, ss] = String(t).split(':').map(Number);
    d.setHours(hh || 0, mm || 0, ss || 0, 0);
    return d.toISOString();
}

/** ISO → ساعت '۱۴:۳۵' */
export function formatTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return toFa(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
}

/** ISO → '۱۴۰۴/۰۷/۱۵ ۱۴:۳۵' */
export function formatDateTime(iso) {
    if (!iso) return '—';
    const k = isoToJalaliKey(iso);
    if (!k) return '—';
    return `${formatJalali(k)} ${formatTime(iso)}`;
}

/** ISO → '1404-07-15T14:35' (برای input) */
export function isoToLocalInput(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function minutesBetween(a, b) {
    const da = new Date(a), db = new Date(b);
    if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return 0;
    return Math.round((db - da) / 60000);
}

/** ۹۵ → '۱ ساعت و ۳۵ دقیقه' */
export function humanizeMinutes(min) {
    const m = Math.max(0, Math.round(Number(min) || 0));
    if (m < 60) return toFa(m) + ' دقیقه';
    const h = Math.floor(m / 60), r = m % 60;
    return toFa(h) + ' ساعت' + (r ? ' و ' + toFa(r) + ' دقیقه' : '');
}

export function humanizeDurationShort(min) {
    const m = Math.max(0, Math.round(Number(min) || 0));
    if (m < 60) return toFa(m) + 'د';
    const h = Math.floor(m / 60), r = m % 60;
    return toFa(h) + ':' + toFa(String(r).padStart(2, '0'));
}

/** شروع و پایان روز (ISO) */
export function startOfDayISO(d = new Date()) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x.toISOString();
}

export function endOfDayISO(d = new Date()) {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x.toISOString();
}

/* ===================== ۴) اعتبارسنجی ===================== */

/** موبایل ایران: ۰۹xxxxxxxxx (۱۱ رقم) */
export function isValidMobile(value) {
    return /^09\d{9}$/.test(toEn(value).replace(/[\s-]/g, ''));
}

/** تلفن ثابت: ۰ + ۱۰ رقم (شامل کد شهر) */
export function isValidLandline(value) {
    return /^0\d{10}$/.test(toEn(value).replace(/[\s-]/g, ''));
}

/** هر شماره تماس معتبر (موبایل یا ثابت) */
export function isValidPhone(value) {
    const v = toEn(value).replace(/[\s-]/g, '');
    if (!v) return false;
    return /^09\d{9}$/.test(v) || /^0\d{10}$/.test(v) || /^0\d{2,3}\d{7,8}$/.test(v);
}

/** کد ملی ایران با الگوریتم رقم کنترل */
export function isValidNationalCode(value) {
    const code = toEn(value).replace(/[\s-]/g, '');
    if (!/^\d{10}$/.test(code)) return false;
    if (/^(\d)\1{9}$/.test(code)) return false; // ۱۱۱۱۱۱۱۱۱۱ نامعتبر
    const check = +code[9];
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += +code[i] * (10 - i);
    const rem = sum % 11;
    return rem < 2 ? check === rem : check === 11 - rem;
}

export const PLATE_LETTERS = ['ا', 'ب', 'پ', 'ت', 'ث', 'ج', 'د', 'ذ', 'ر', 'ز', 'ژ', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ',
    'ع', 'غ', 'ف', 'ق', 'ک', 'گ', 'ل', 'م', 'ن', 'و', 'ه', 'ی'];

/**
 * نرمال‌سازی پلاک خودرو:
 *  - ارقام فارسی/عربی → لاتین در قالب عددی، سپس نمایش فارسی
 *  - حروف عربی: ي→ی، ك→ک، 'ك'/'ی' عربی و 'ة'/'ه' اصلاح می‌شود
 *  - حذف فاصله، خط تیره و نقطه؛ حروف کوچک/بزرگ لاتین → حرف فارسی متناظر بینایی
 *  - خروجی: '۱۲ب۳۴۵' یا '۴۵۶ج۷۸' (+ دو رقم سری استان در انتها در صورت وجود)
 */
export function normalizePlate(value) {
    let v = toEn(value || '').trim().toUpperCase();
    v = v.replace(/[يى]/g, 'ی').replace(/[ك]/g, 'ک').replace(/[ةە]/g, 'ه');
    /* حذف واژهٔ «ایران» که روی پلاک‌های واقعی چاپ می‌شود و کاربران تایپ می‌کنند */
    v = v.replace(/ايران|ایران/g, '');
    v = v.replace(/[\s\-_.,،]/g, '');
    // حروف لاتین معادل در پلاک ایران
    const latinMap = {
        A: 'ا', B: 'ب', C: 'س', D: 'د', E: 'ع', F: 'ف', G: 'گ', H: 'ه', I: 'ی', J: 'ج',
        K: 'ک', L: 'ل', M: 'م', N: 'ن', O: 'و', P: 'پ', Q: 'ق', R: 'ر', S: 'س', T: 'ت',
        U: 'و', V: 'و', W: 'و', X: 'س', Y: 'ی', Z: 'ز'
    };
    v = v.replace(/[A-Z]/g, (ch) => latinMap[ch] || '');
    // ساختارها: [۲رقم][حرف][۳رقم][۲رقم سری]  یا  [۳رقم][حرف][۲رقم][۲رقم سری]
    const m = v.match(/^(\d{2})([^\d])(\d{3})(\d{2})?$/) || v.match(/^(\d{3})([^\d])(\d{2})(\d{2})?$/);
    if (!m) return toFa(v);
    const [, p1, letter, p3, series] = m;
    return toFa(p1 + letter + p3 + (series || ''));
}

/** اعتبار پلاک ایران */
export function isValidPlate(value) {
    const raw = toEn(value || '').replace(/[\s\-_.،]/g, '');
    if (!raw) return false;
    const v = toEn(normalizePlate(value)).replace(/[\s\-_.،]/g, '');
    const m = v.match(/^(\d{2})([^\d])(\d{3})(\d{2})?$/) || v.match(/^(\d{3})([^\d])(\d{2})(\d{2})?$/);
    if (!m) return false;
    return PLATE_LETTERS.includes(m[2]);
}

export function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '').trim());
}

/** اعتبارسنجی رشتهٔ تاریخ شمسی */
export function isValidJalaliDateStr(value) {
    return isJalaliKey(value);
}

/* ===================== ۵) رشته و امنیت ===================== */

export function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export const escapeAttr = escapeHTML;

export function csvEscape(val) {
    const s = String(val ?? '');
    if (/[",\n\r;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
}

export function truncate(str, len = 30) {
    const s = String(str ?? '');
    return s.length > len ? s.slice(0, len - 1) + '…' : s;
}

export function slugify(str) {
    return toEn(String(str || '').trim()).replace(/\s+/g, '-').replace(/[^\w\-]/g, '');
}

/* ===================== ۶) شناسه و مجموعه‌ها ===================== */

/**
 * تولید شناسهٔ یکتا (باگ ۴٫۱).
 * اولویت با `crypto.randomUUID()` و سپس `crypto.getRandomValues` است؛ در
 * مرورگرهای قدیمی به روش قبلی (زمان + Math.random) برمی‌گردد. شناسه‌ها کوتاه
 * و خوانا نگه داشته می‌شوند تا در آدرس‌ها و گزارش‌ها قابل استفاده باشند.
 */
export function uid(prefix = '') {
    const t = Date.now().toString(36);
    let r;
    const c = typeof crypto !== 'undefined' ? crypto : null;
    if (c && typeof c.randomUUID === 'function') {
        r = c.randomUUID().replace(/-/g, '').slice(0, 8);
    } else if (c && typeof c.getRandomValues === 'function') {
        const buf = new Uint8Array(4);
        c.getRandomValues(buf);
        r = Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
    } else {
        r = Math.random().toString(36).slice(2, 7);
    }
    return prefix ? `${prefix}_${t}${r}` : `${t}${r}`;
}

export function clone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (typeof structuredClone === 'function') {
        try { return structuredClone(obj); } catch (_) { /* fallback */ }
    }
    return JSON.parse(JSON.stringify(obj));
}

export function sum(arr, pick = (x) => x) {
    return (arr || []).reduce((s, x) => s + (Number(pick(x)) || 0), 0);
}

export function groupBy(arr, keyFn) {
    const out = {};
    (arr || []).forEach((item) => {
        const k = typeof keyFn === 'function' ? keyFn(item) : item[keyFn];
        const key = k ?? '—';
        if (!out[key]) out[key] = [];
        out[key].push(item);
    });
    return out;
}

export function sortBy(arr, keyFn, dir = 'desc') {
    const s = [...(arr || [])];
    s.sort((a, b) => {
        const va = typeof keyFn === 'function' ? keyFn(a) : a[keyFn];
        const vb = typeof keyFn === 'function' ? keyFn(b) : b[keyFn];
        if (va === vb) return 0;
        if (va === null || va === undefined) return 1;
        if (vb === null || vb === undefined) return -1;
        const res = typeof va === 'string' ? va.localeCompare(vb, 'fa') : (va > vb ? 1 : -1);
        return dir === 'asc' ? res : -res;
    });
    return s;
}

export function uniqBy(arr, keyFn) {
    const seen = new Set();
    return (arr || []).filter((x) => {
        const k = typeof keyFn === 'function' ? keyFn(x) : x[keyFn];
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}

export function clamp(n, min, max) {
    return Math.min(Math.max(n, min), max);
}

export function range(n, start = 0) {
    return Array.from({ length: n }, (_, i) => i + start);
}

export function debounce(fn, wait = 250) {
    let timer = null;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), wait);
    };
}

export function deepMerge(base, patch) {
    const out = { ...(base || {}) };
    Object.keys(patch || {}).forEach((k) => {
        const pv = patch[k], bv = out[k];
        if (pv && typeof pv === 'object' && !Array.isArray(pv) && bv && typeof bv === 'object' && !Array.isArray(bv)) {
            out[k] = deepMerge(bv, pv);
        } else {
            out[k] = pv;
        }
    });
    return out;
}

/* ===================== ۷) فایل ===================== */

export function downloadFile(filename, content, mime = 'text/plain;charset=utf-8') {
    const blob = new Blob(['\uFEFF'.slice(0, mime.includes('csv') ? 1 : 0) + content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadCSV(filename, headers, rows) {
    const lines = [headers, ...rows].map((r) => r.map(csvEscape).join(','));
    downloadFile(filename, lines.join('\n'), 'text/csv;charset=utf-8');
}

export function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error('خواندن فایل ناموفق بود'));
        reader.readAsText(file, 'utf-8');
    });
}

/* ===================== ۸) تعرفه و کرایه ===================== */

/** آیا زمان داده‌شده در بازه شب است؟ (پیش‌فرض ۲۲ تا ۶) */
export function isNightTime(dateLike, settings = {}) {
    const d = dateLike instanceof Date ? dateLike : new Date(dateLike || Date.now());
    if (Number.isNaN(d.getTime())) return false;
    const start = Number(settings.nightStartHour ?? 22);
    const end = Number(settings.nightEndHour ?? 6);
    const h = d.getHours();
    if (start === end) return false;
    return start > end ? (h >= start || h < end) : (h >= start && h < end);
}

/** آیا تاریخ (کلید شمسی) تعطیل رسمی است؟ */
export function isHolidayKey(key, settings = {}) {
    const k = normalizeJalaliKey(key);
    if (!k) return false;
    if ((settings.holidays || []).includes(k)) return true;
    return isFriday(k) && settings.fridayIsHoliday !== false;
}

/**
 * محاسبه کرایه بر اساس تعرفه پلکانی
 * @param {number} distance کیلومتر
 * @param {Date|string} time زمان سفر
 * @param {boolean} isHoliday تعطیل رسمی
 * @param {object} settings تنظیمات تعرفه
 * @returns {{fare:number, base:number, distancePart:number, nightPart:number, holidayPart:number,
 *            isNight:boolean, nightMultiplier:number, holidayMultiplier:number}}
 */
export function calculateFare(distance, time, isHoliday = false, settings = {}) {
    const s = settings || {};
    const base = Number(s.baseFare ?? 15000);
    const perKm = Number(s.farePerKm ?? 5000);
    const dist = Math.max(0, Number(distance) || 0);
    const distancePart = Math.round(dist * perKm);

    let fare = base + distancePart;

    const night = s.nightEnabled === false ? false : isNightTime(time, s);
    const nightMultiplier = night ? Number(s.nightMultiplier ?? 1.3) : 1;
    const nightFixed = night && s.nightMode === 'fixed' ? Number(s.nightFixedSurcharge ?? 0) : 0;

    const holiday = !!isHoliday || isHolidayKey(isoToJalaliKey(time), s);
    const holidayMultiplier = holiday ? Number(s.holidayMultiplier ?? 1.2) : 1;

    const multiplier = nightMultiplier * holidayMultiplier;
    const beforeRound = fare * multiplier + nightFixed;
    const finalFare = Math.max(0, Math.round(beforeRound / 1000) * 1000 || Math.round(beforeRound));

    const nightPart = nightFixed + Math.round(base * (nightMultiplier - 1)) +
        Math.round(distancePart * (nightMultiplier - 1));
    const holidayPart = Math.round((base + distancePart) * (holidayMultiplier - 1));

    return {
        fare: finalFare,
        base,
        distancePart,
        nightPart,
        holidayPart,
        isNight: night,
        isHoliday: holiday,
        nightMultiplier,
        holidayMultiplier,
        perKm,
        distance: dist,
        rule: s.nightMode === 'fixed' && night ? 'fixed' : 'multiplier'
    };
}

/**
 * اعتبارسنجی یک فیلد بر اساس نوع آن
 * @returns {string} پیام خطا یا رشتهٔ خالی
 */
export function validateValue(value, type, opts = {}) {
    const v = typeof value === 'string' ? value.trim() : value;
    const empty = v === '' || v === null || v === undefined;
    if (opts.required && empty) return opts.message || S.errors.required;
    if (empty) return '';
    switch (type) {
        case 'mobile': return isValidMobile(v) ? '' : S.errors.mobile;
        case 'landline': return isValidLandline(v) ? '' : S.errors.landline;
        case 'phone': return isValidPhone(v) ? '' : S.errors.phone;
        case 'nationalCode': return isValidNationalCode(v) ? '' : S.errors.nationalCode;
        case 'plate': return isValidPlate(v) ? '' : S.errors.plate;
        case 'email': return isValidEmail(v) ? '' : S.errors.email;
        case 'jalaliDate': return isValidJalaliDateStr(v) ? '' : S.errors.jalaliDate;
        case 'number': return Number.isNaN(Number(toEn(v))) ? S.errors.number : '';
        case 'positive': return parseNumber(v) > 0 ? '' : S.errors.positive;
        case 'numberOrEmpty': return toEn(v) === '' || !Number.isNaN(Number(toEn(v))) ? '' : S.errors.number;
        default: return '';
    }
}

/* ==========================================================================
 * فایل و تصویر (برای بارگذاری لوگوی آژانس)
 * ========================================================================== */

/** خواندن فایل به‌صورت Data-URL */
export function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        if (typeof FileReader === 'undefined') { reject(new Error('مرورگر از خواندن فایل پشتیبانی نمی‌کند')); return; }
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('خواندن فایل ناموفق بود'));
        reader.readAsDataURL(file);
    });
}

export function formatFileSize(bytes) {
    const b = Number(bytes) || 0;
    if (b < 1024) return `${toFa(b)} بایت`;
    if (b < 1024 * 1024) return `${toFa(Math.round(b / 1024))} کیلوبایت`;
    return `${toFa((b / (1024 * 1024)).toFixed(1))} مگابایت`;
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        if (typeof Image === 'undefined') { reject(new Error('تصویر پشتیبانی نمی‌شود')); return; }
        const img = new Image();
        const timer = setTimeout(() => reject(new Error('بارگذاری تصویر زمان‌بر شد')), 2500);
        img.onload = () => { clearTimeout(timer); resolve(img); };
        img.onerror = () => { clearTimeout(timer); reject(new Error('فایل تصویر معتبر نیست')); };
        img.src = src;
    });
}

/**
 * تبدیل فایل لوگو به Data-URL. فایل‌های بزرگ با Canvas کوچک می‌شوند تا در
 * حافظهٔ مرورگر جا شوند (لوگو در سند دادهٔ سامانه ذخیره می‌شود).
 */
export async function imageFileToDataURL(file, {
    maxBytes = 400 * 1024, maxWidth = 640, maxHeight = 320,
    allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/svg+xml']
} = {}) {
    if (!file) throw new Error('فایلی انتخاب نشده است');
    const type = String(file.type || '').toLowerCase();
    if (allowedTypes.length && !allowedTypes.includes(type)) {
        throw new Error('فقط تصویر PNG، JPG، WEBP، GIF یا SVG مجاز است');
    }
    if (Number(file.size) > maxBytes * 4) {
        throw new Error(`حجم فایل بیش از حد مجاز است (حداکثر ${formatFileSize(maxBytes * 4)})`);
    }
    const raw = await readFileAsDataURL(file);
    if (type === 'image/svg+xml' || Number(file.size) <= maxBytes) return raw;
    try {
        const img = await loadImage(raw);
        const ratio = Math.min(1, maxWidth / (img.width || maxWidth), maxHeight / (img.height || maxHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round((img.width || maxWidth) * ratio));
        canvas.height = Math.max(1, Math.round((img.height || maxHeight) * ratio));
        const ctx = canvas.getContext && canvas.getContext('2d');
        if (!ctx) return raw;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const out = canvas.toDataURL('image/png');
        return out && out.length < raw.length ? out : raw;
    } catch (_) {
        return raw;
    }
}
