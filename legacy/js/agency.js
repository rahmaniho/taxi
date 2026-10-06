/* ==========================================================================
 * js/agency.js — مدیریت آژانس‌ها (چند‌مستأجری / Multi-Tenant)
 * --------------------------------------------------------------------------
 * چرا این ماژول؟
 *   کاربر خواست «نرم‌افزار اشتراکی شود تا هر اشتراکی با نام کاربری و رمز خودش
 *   وارد شود» و «هر آژانس لوگوی خودش را داشته باشد». پس:
 *     • هر آژانس یک رکورد در مجموعهٔ agencies است (نام، تلفن، نشانی، لوگو،
 *       اشتراک نرم‌افزار، وضعیت فعال/غیرفعال).
 *     • همهٔ رکوردهای عملیاتی (راننده، سفر، مشترک، سند حسابداری، کاربر …)
 *       شناسهٔ آژانس دارند و لایهٔ داده فهرست‌ها را بر اساس آژانس فعال فیلتر
 *       می‌کند (DB.setScope).
 *     • کاربرِ هر آژانس فقط دادهٔ آژانس خودش را می‌بیند؛ مدیر سامانه می‌تواند
 *       بین آژانس‌ها جابه‌جا شود.
 * ========================================================================== */

import { DB, DEFAULT_AGENCY_ID, defaultAgency } from './db.js';
import { addJalaliDays, diffJalaliDays, todayJalali, toFa, nowISO, uid, slugify } from './utils.js';

export { DEFAULT_AGENCY_ID };

const ACTIVE_AGENCY_KEY = 'taxi_active_agency';

export const AGENCY_STATUS_LABELS = { active: 'فعال', suspended: 'غیرفعال' };
export const AGENCY_PLAN_LABELS = { trial: 'آزمایشی', basic: 'پایه', pro: 'حرفه‌ای', unlimited: 'نامحدود' };

/** محدودیت‌های لوگو (لوگو به‌صورت Data-URL در سند ذخیره می‌شود) */
export const LOGO_MAX_BYTES = 400 * 1024;
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml', 'image/gif'];

export const Agency = {
    /** همهٔ آژانس‌ها (این مجموعه از فیلتر آژانس مستثنی است) */
    all() {
        return DB.list('agencies').sort((a, b) => String(a.name).localeCompare(String(b.name), 'fa'));
    },

    get(id) {
        return DB.get('agencies', id) || null;
    },

    byCode(code) {
        return DB.findGlobal('agencies', 'code', String(code || '').trim().toLowerCase());
    },

    /* ---------------------------- آژانس فعال ---------------------------- */

    currentId() {
        const scoped = DB.scope();
        if (scoped && Agency.get(scoped)) return scoped;
        const saved = localStorage.getItem(ACTIVE_AGENCY_KEY);
        if (saved && Agency.get(saved)) return saved;
        return Agency.all()[0]?.id || DEFAULT_AGENCY_ID;
    },

    current() {
        return Agency.get(Agency.currentId()) || Agency.all()[0] || null;
    },

    /** تعیین آژانس فعال (هم دامنهٔ داده و هم حافظهٔ مرورگر) */
    setCurrent(id) {
        if (id && !Agency.get(id)) throw new Error('آژانس مورد نظر یافت نشد');
        localStorage.setItem(ACTIVE_AGENCY_KEY, id || '');
        DB.setScope(id || null);
        return Agency.current();
    },

    /* ------------------------------ هویت ------------------------------ */

    /** هویت آژانس برای سربرگ اسناد چاپی (با بازگشت به تنظیمات عمومی) */
    identity(agencyId = null) {
        const s = DB.settings();
        const a = agencyId ? Agency.get(agencyId) : Agency.current();
        return {
            id: a?.id || '',
            name: a?.name || s.companyName || 'آژانس تاکسی تلفنی',
            phone: a?.phone || s.companyPhone || '',
            address: a?.address || s.companyAddress || '',
            logo: a?.logo || '',
            footerNote: a?.footerNote || '',
            economicCode: a?.economicCode || '',
            nationalId: a?.nationalId || s.nationalId || '',
            hasLogo: !!a?.logo
        };
    },

    /* ------------------------------ اشتراک ------------------------------ */

    /** وضعیت اشتراک نرم‌افزار آژانس (تاریخ‌ها شمسی‌اند) */
    subscription(agency) {
        const a = typeof agency === 'object' ? agency : Agency.get(agency);
        const end = a?.softwareEnd || '';
        if (!end) return { known: false, expired: false, daysLeft: null, label: 'نامحدود', tone: 'ok' };
        const daysLeft = diffJalaliDays(todayJalali(), end);
        const expired = daysLeft < 0;
        const soon = !expired && daysLeft <= 14;
        return {
            known: true,
            expired,
            daysLeft,
            label: expired ? `منقضی شده (${toFa(Math.abs(daysLeft))} روز پیش)` : `${toFa(daysLeft)} روز باقی‌مانده`,
            tone: expired ? 'danger' : soon ? 'warn' : 'ok'
        };
    },

    /** آیا کاربر این آژانس اجازهٔ ورود دارد؟ */
    canLogin(agency) {
        const a = typeof agency === 'object' ? agency : Agency.get(agency);
        if (!a) return { ok: false, message: 'آژانس این کاربر یافت نشد؛ با پشتیبانی تماس بگیرید' };
        if (a.status !== 'active') return { ok: false, message: 'اشتراک این آژانس غیرفعال است؛ با پشتیبانی تماس بگیرید' };
        const sub = Agency.subscription(a);
        if (sub.expired) return { ok: false, message: 'اشتراک نرم‌افزار این آژانس به پایان رسیده است؛ برای تمدید با پشتیبانی تماس بگیرید' };
        return { ok: true, message: '' };
    },

    /* ------------------------------ نوشتن ------------------------------ */

    create({ name, phone = '', address = '', ownerName = '', plan = 'basic', months = 12, maxUsers = 5, economicCode = '', nationalId = '', footerNote = '', code = '' }) {
        const cleanName = String(name || '').trim();
        if (cleanName.length < 3) throw new Error('نام آژانس باید حداقل ۳ کاراکتر باشد');
        const finalCode = slugify(code || cleanName) || ('agency-' + Date.now());
        if (Agency.byCode(finalCode)) throw new Error('این شناسهٔ آژانس قبلاً استفاده شده است');
        const start = todayJalali();
        return DB.insert('agencies', {
            code: finalCode,
            name: cleanName,
            ownerName: String(ownerName || '').trim(),
            phone: String(phone || '').trim(),
            address: String(address || '').trim(),
            economicCode: String(economicCode || '').trim(),
            nationalId: String(nationalId || '').trim(),
            footerNote: String(footerNote || '').trim(),
            logo: '',
            plan,
            status: 'active',
            softwareStart: start,
            softwareEnd: addJalaliDays(start, Math.max(1, Number(months) || 12) * 30),
            maxUsers: Number(maxUsers) || 5,
            notes: ''
        }, `ایجاد آژانس «${cleanName}»`);
    },

    update(id, patch, note = '') {
        const a = Agency.get(id);
        if (!a) throw new Error('آژانس یافت نشد');
        if (patch.code && patch.code !== a.code && Agency.byCode(patch.code)) {
            throw new Error('این شناسهٔ آژانس قبلاً استفاده شده است');
        }
        const clean = { ...patch };
        if (clean.name !== undefined && String(clean.name).trim().length < 3) throw new Error('نام آژانس نامعتبر است');
        return DB.update('agencies', id, clean, note || `ویرایش آژانس «${a.name}»`);
    },

    /** ثبت/حذف لوگوی آژانس (ورودی: Data-URL) */
    setLogo(id, dataUrl, note = '') {
        const a = Agency.get(id);
        if (!a) throw new Error('آژانس یافت نشد');
        if (dataUrl && !String(dataUrl).startsWith('data:image/')) throw new Error('فایل انتخاب‌شده تصویر معتبر نیست');
        if (dataUrl && String(dataUrl).length > LOGO_MAX_BYTES * 1.4) throw new Error('حجم لوگو پس از پردازش بیش از حد مجاز است');
        return DB.update('agencies', id, { logo: dataUrl || '' }, note || (dataUrl ? `بارگذاری لوگوی آژانس «${a.name}»` : `حذف لوگوی آژانس «${a.name}»`));
    },

    /** تمدید اشتراک نرم‌افزار (ماه) */
    extend(id, months = 12) {
        const a = Agency.get(id);
        if (!a) throw new Error('آژانس یافت نشد');
        const base = a.softwareEnd && diffJalaliDays(todayJalali(), a.softwareEnd) >= 0 ? a.softwareEnd : todayJalali();
        const end = addJalaliDays(base, Math.max(1, Number(months) || 12) * 30);
        Agency.update(id, { softwareEnd: end, status: 'active' }, `تمدید ${toFa(months)} ماههٔ اشتراک آژانس «${a.name}»`);
        return end;
    },

    setStatus(id, status) {
        if (!AGENCY_STATUS_LABELS[status]) throw new Error('وضعیت آژانس نامعتبر است');
        return Agency.update(id, { status }, `تغییر وضعیت آژانس به «${AGENCY_STATUS_LABELS[status]}»`);
    },

    /** حذف نرم آژانس (اگر دادهٔ عملیاتی داشته باشد اجازه نمی‌دهد) */
    remove(id) {
        const a = Agency.get(id);
        if (!a) throw new Error('آژانس یافت نشد');
        if (Agency.all().length <= 1) throw new Error('تنها آژانس سامانه را نمی‌توان حذف کرد');
        const busy = ['drivers', 'trips', 'subscribers', 'journals'].some((c) =>
            DB.listGlobal(c).some((r) => !r.deletedAt && (r.agencyId || DEFAULT_AGENCY_ID) === id));
        if (busy) throw new Error('این آژانس دادهٔ عملیاتی دارد؛ ابتدا داده‌ها را منتقل یا پاک کنید');
        return DB.remove('agencies', id, `حذف آژانس «${a.name}»`);
    },

    /* ------------------------------ آمار ------------------------------ */

    /** آمار یک آژانس (برای صفحهٔ مدیریت آژانس‌ها) */
    stats(id) {
        const pick = (c) => DB.listGlobal(c).filter((r) => !r.deletedAt && (r.agencyId || DEFAULT_AGENCY_ID) === id);
        const trips = pick('trips');
        const completed = trips.filter((t) => t.status === 'completed');
        return {
            users: pick('operators').length,
            drivers: pick('drivers').length,
            vehicles: pick('vehicles').length,
            subscribers: pick('subscribers').length,
            trips: trips.length,
            completed: completed.length,
            revenue: completed.reduce((s, t) => s + (t.commission || 0), 0),
            turnover: completed.reduce((s, t) => s + (t.fare || 0), 0),
            journals: pick('journals').length,
            lastActivity: trips.map((t) => t.createdAt || t.pickupTime || '').sort().pop() || ''
        };
    },

    userCount(id) {
        return DB.listGlobal('operators').filter((u) => !u.deletedAt && (u.agencyId || DEFAULT_AGENCY_ID) === id).length;
    },

    /** بررسی سقف کاربران آژانس پیش از ساخت کاربر جدید */
    assertUserQuota(agencyId) {
        const a = Agency.get(agencyId);
        if (!a) throw new Error('آژانس یافت نشد');
        const max = Number(a.maxUsers) || 0;
        if (max > 0 && Agency.userCount(a.id) >= max) {
            throw new Error(`سقف کاربران این آژانس (${toFa(max)} کاربر) پر شده است`);
        }
        return true;
    },

    /** ساخت آژانس نمونه برای آزمون/راه‌اندازی سریع */
    buildDemoAgency(name) {
        return defaultAgency({ id: uid('ag'), code: slugify(name || 'agency'), name: name || 'آژانس جدید', softwareStart: todayJalali(), softwareEnd: addJalaliDays(todayJalali(), 365), createdAt: nowISO() });
    }
};

export default Agency;
