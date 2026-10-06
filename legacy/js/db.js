/* ==========================================================================
 * js/db.js — لایه دسترسی داده (Data Layer)
 * --------------------------------------------------------------------------
 * اهداف طراحی:
 *   ۱) UI هرگز با localStorage حرف نمی‌زند؛ فقط با DB صحبت می‌کند.
 *   ۲) تمام تغییرات از mutateDB() عبور می‌کنند → Audit Log خودکار + ذخیره‌سازی
 *      + اعلان به شنوندگان (re-render خودکار صفحه جاری).
 *   ۳) Adapter Pattern: امروز LocalStorageAdapter، فردا RestAdapter
 *      (PocketBase / Supabase) بدون تغییر یک خط در UI.
 *   ۴) Soft Delete: هیچ رکوردی واقعاً پاک نمی‌شود (deletedAt).
 * ========================================================================== */

import {
    uid, clone, todayJalali, nowISO, isoToJalaliKey, toFa, addJalaliDays,
    currentJalaliMonth, jalaliKey, sortBy, jalaliDateWithTime
} from './utils.js';

export const SCHEMA_VERSION = 6;
export const DB_KEY = 'taxi_dispatch_db_v6';
export const LEGACY_KEYS = ['taxi_dispatch_db_v5', 'taxi_dispatch_db_v4'];

/** شناسهٔ آژانس پیش‌فرض (همهٔ داده‌های قدیمی بدون شناسه، متعلق به این آژانس‌اند) */
export const DEFAULT_AGENCY_ID = 'ag1';

/** مجموعه‌هایی که فیلتر آژانس (tenant) روی آن‌ها اعمال نمی‌شود */
export const SCOPE_EXEMPT = ['agencies'];
export const API_CONFIG_KEY = 'taxi_api_config';

/** کلید نگهداری نسخهٔ خراب‌شدهٔ داده (باگ ۲٫۲) — هرگز بازنویسی نمی‌شود مگر با خرابی تازه */
export const CORRUPT_KEY = DB_KEY + '_corrupted';
/** کلید نگهداری عکس فوری پیش از بازیابی فایل پشتیبان (باگ ۲٫۵ — امکان بازگشت) */
export const PRE_IMPORT_KEY = DB_KEY + '_preimport';

/* ترتیب مجموعه‌ها (برای خروجی/ورودی و پیمایش) */
export const COLLECTIONS = [
    'agencies',
    'drivers', 'vehicles', 'addresses', 'subscribers', 'trips',
    'subscriberPayments', 'driverPayments', 'transactions', 'expenses',
    'operators', 'shifts', 'auditLog',
    'accounts', 'journals'
];

export const COLLECTION_LABELS = {
    agencies: 'آژانس',
    drivers: 'راننده', vehicles: 'خودرو', addresses: 'آدرس', subscribers: 'مشترک',
    trips: 'سفر', subscriberPayments: 'پرداخت مشترک', driverPayments: 'پرداخت راننده',
    transactions: 'تراکنش', expenses: 'هزینه', operators: 'کاربر', shifts: 'شیفت',
    auditLog: 'گزارش تغییرات',
    accounts: 'حساب', journals: 'سند حسابداری'
};

/* ------------------------- کدینگ پیش‌فرض حساب‌ها ------------------------- */
/**
 * ساختار استاندارد حساب‌ها برای آژانس تاکسی تلفنی.
 * قاعدهٔ حسابداری دوطرفه: دارایی/هزینه ماهیت بدهکار، بدهی/سرمایه/درآمد ماهیت بستانکار.
 */
export const DEFAULT_CHART_OF_ACCOUNTS = [
    { code: '1000', name: 'صندوق', type: 'asset', group: 'نقد و بانک' },
    { code: '1010', name: 'بانک', type: 'asset', group: 'نقد و بانک' },
    { code: '1020', name: 'حساب‌های دریافتنی — مشترکین', type: 'asset', group: 'دریافتنی‌ها' },
    { code: '1030', name: 'حساب‌های دریافتنی — رانندگان', type: 'asset', group: 'دریافتنی‌ها' },
    { code: '1040', name: 'موجودی ملزومات', type: 'asset', group: 'موجودی‌ها' },
    { code: '2000', name: 'حساب‌های پرداختنی — رانندگان', type: 'liability', group: 'پرداختنی‌ها' },
    { code: '2010', name: 'مالیات بر ارزش افزوده', type: 'liability', group: 'پرداختنی‌ها' },
    { code: '2020', name: 'حقوق پرداختنی', type: 'liability', group: 'پرداختنی‌ها' },
    { code: '3000', name: 'سرمایه', type: 'equity', group: 'سرمایه' },
    { code: '3010', name: 'برداشت مالک', type: 'equity', group: 'سرمایه' },
    { code: '4000', name: 'درآمد کمیسیون سفرها', type: 'income', group: 'درآمد عملیاتی' },
    { code: '4010', name: 'درآمد اشتراک مشترکین', type: 'income', group: 'درآمد عملیاتی' },
    { code: '4020', name: 'درآمد متفرقه', type: 'income', group: 'درآمد غیرعملیاتی' },
    { code: '5000', name: 'هزینهٔ حقوق و دستمزد', type: 'expense', group: 'هزینه‌های پرسنلی' },
    { code: '5010', name: 'هزینهٔ اجاره دفتر', type: 'expense', group: 'هزینه‌های سربار' },
    { code: '5020', name: 'آب، برق، گاز و اینترنت', type: 'expense', group: 'هزینه‌های سربار' },
    { code: '5030', name: 'تعمیر و نگهداری خودرو', type: 'expense', group: 'هزینه‌های عملیاتی' },
    { code: '5040', name: 'سوخت', type: 'expense', group: 'هزینه‌های عملیاتی' },
    { code: '5050', name: 'هزینه‌های اداری و متفرقه', type: 'expense', group: 'هزینه‌های سربار' },
    { code: '5060', name: 'تبلیغات و بازاریابی', type: 'expense', group: 'هزینه‌های سربار' }
];

/** آژانس پیش‌فرض (اولین اجرا) */
export function defaultAgency(overrides = {}) {
    return {
        id: DEFAULT_AGENCY_ID,
        code: 'default',
        name: 'آژانس کارن‌سافت',
        ownerName: '',
        phone: '',
        address: '',
        logo: '',
        economicCode: '',
        nationalId: '',
        footerNote: '',
        plan: 'pro',
        status: 'active',
        softwareStart: todayJalali(),
        softwareEnd: addJalaliDays(todayJalali(), 365),
        maxUsers: 20,
        notes: 'آژانس پیش‌فرض سامانه',
        createdAt: nowISO(),
        ...overrides
    };
}

/* ---------------------------------- پایه ---------------------------------- */

export function defaultSettings() {
    return {
        companyName: 'کارن‌سافت',
        companyPhone: '',
        companyAddress: '',
        taxRate: 0,
        commissionDefault: 15,
        /* تعرفه */
        baseFare: 15000,
        farePerKm: 5000,
        distanceEnabled: true,
        nightEnabled: true,
        nightMode: 'multiplier',        // multiplier | fixed
        nightMultiplier: 1.3,
        nightFixedSurcharge: 10000,
        nightStartHour: 22,
        nightEndHour: 6,
        holidayMultiplier: 1.2,
        fridayIsHoliday: true,
        holidays: [],
        /* عملیات */
        queueAlertMinutes: 10,
        urgentAlertMinutes: 5,
        autoBusyOnAssign: true,
        dropoffAutoFill: true,
        debtOnCompanyTrip: true,
        /* ظاهر */
        theme: 'dark'
    };
}

export function emptyDB() {
    const db = {
        meta: {
            version: SCHEMA_VERSION,
            app: 'taxi-karensoft',
            createdAt: nowISO(),
            updatedAt: nowISO(),
            sampleData: false
        },
        settings: defaultSettings(),
        sequences: {
            trip: 1, subscriber: 1, payment: 1, driverPayment: 1, operator: 1, shift: 1,
            journal: 1, agency: 1, account: 1
        },
        auditLog: []
    };
    COLLECTIONS.forEach((c) => {
        if (c === 'auditLog') return;
        db[c] = [];
    });
    db.agencies = [defaultAgency()];
    db.accounts = DEFAULT_CHART_OF_ACCOUNTS.map((a, i) => ({
        id: 'acc-' + a.code, ...a, isActive: true, notes: '', order: i
    }));
    return db;
}

/** افزودن شناسهٔ آژانس به همهٔ رکوردهای یک سند (برای داده نمونه/مهاجرت) */
export function ensureAgencyTags(db, agencyId = DEFAULT_AGENCY_ID) {
    COLLECTIONS.forEach((c) => {
        if (SCOPE_EXEMPT.includes(c)) return;
        (db[c] || []).forEach((r) => { if (!r.agencyId) r.agencyId = agencyId; });
    });
    return db;
}

/**
 * اطمینان از وجود آژانس پیش‌فرض و کدینگ حساب‌ها در سند بارگذاری‌شده.
 * اگر سند قدیمی هیچ آژانسی نداشته باشد، آژانس پیش‌فرض هم‌نام تنظیمات ساخته می‌شود
 * تا نام آژانس کاربر (تغییر‌یافته در تنظیمات نسخهٔ ۵) از دست نرود.
 */
function ensureFoundation(db, { hadAgencies = true } = {}) {
    const settingsName = db.settings?.companyName || '';
    if (!hadAgencies) {
        db.agencies = [defaultAgency({ name: settingsName || 'آژانس کارن‌سافت' })];
    }
    if (!Array.isArray(db.agencies) || !db.agencies.length) {
        db.agencies = [defaultAgency({ name: settingsName || 'آژانس کارن‌سافت' })];
    }
    const existing = new Set((db.agencies || []).map((a) => a.id));
    if (!existing.has(DEFAULT_AGENCY_ID)) {
        db.agencies.unshift(defaultAgency({ name: db.agencies[0]?.name || 'آژانس کارن‌سافت' }));
    }
    if (!Array.isArray(db.accounts) || !db.accounts.length) {
        db.accounts = DEFAULT_CHART_OF_ACCOUNTS.map((a, i) => ({
            id: 'acc-' + a.code, ...a, isActive: true, notes: '', order: i, agencyId: DEFAULT_AGENCY_ID
        }));
    }
    if (!Array.isArray(db.journals)) db.journals = [];
    return db;
}

/* ------------------------------- Adapter ها ------------------------------- */

/** ذخیره‌سازی محلی (فاز جاری) */
export const LocalStorageAdapter = {
    name: 'local',
    available: () => {
        try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true; } catch (_) { return false; }
    },
    /**
     * خواندن سند از حافظهٔ محلی.
     * اگر JSON خراب باشد، نسخهٔ خام در کلید جداگانه نگه داشته می‌شود و خطای
     * نشان‌دار (code = CORRUPT_DB) پرتاب می‌شود تا هرگز دادهٔ نمونه جای دادهٔ
     * واقعی کاربر را نگیرد (باگ ۲٫۲).
     */
    async load() {
        const raw = localStorage.getItem(DB_KEY);
        if (!raw) return null;
        try {
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') throw new Error('ساختار سند نامعتبر است');
            return parsed;
        } catch (e) {
            try { localStorage.setItem(CORRUPT_KEY, raw); } catch (_) { /* فضای ذخیره‌سازی پر است */ }
            const err = new Error('داده‌های ذخیره‌شده خراب شده‌اند');
            err.code = 'CORRUPT_DB';
            err.cause = e;
            throw err;
        }
    },
    async save(db) {
        localStorage.setItem(DB_KEY, JSON.stringify(db));
    },
    async clear() {
        localStorage.removeItem(DB_KEY);
    }
};

/**
 * آداپتر REST برای اتصال آینده به PocketBase / Supabase.
 * قرارداد ساده و مستند:  GET {baseUrl}/db  → کل سند  |  PUT {baseUrl}/db → ذخیره
 * (برای PocketBase: یک collection به نام taxidb با یک رکورد «singleton»)
 * فعال‌سازی: window.App.config.adapter = 'rest' و تنظیم apiConfig.baseUrl
 */
export const RestAdapter = {
    name: 'rest',
    available: () => !!getApiConfig().baseUrl,
    async load() {
        const { baseUrl, token } = getApiConfig();
        const res = await fetch(`${baseUrl}/db`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (!res.ok) throw new Error('خطا در دریافت داده از سرور');
        return await res.json();
    },
    async save(db) {
        const { baseUrl, token } = getApiConfig();
        const res = await fetch(`${baseUrl}/db`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: JSON.stringify(db)
        });
        if (!res.ok) throw new Error('خطا در ذخیره‌سازی روی سرور');
    },
    async clear() { /* در فاز API، پاک‌سازی از سمت سرور انجام می‌شود */ }
};

export function getApiConfig() {
    try {
        return JSON.parse(localStorage.getItem(API_CONFIG_KEY) || '{}') || {};
    } catch (_) {
        return {};
    }
}

export function setApiConfig(cfg) {
    localStorage.setItem(API_CONFIG_KEY, JSON.stringify(cfg || {}));
}

/* ------------------------------ هستهٔ DB ------------------------------ */

let _db = null;
let _adapter = LocalStorageAdapter;
let _listeners = [];
let _hooks = [];
let _actor = { id: '', name: 'سیستم' };
let _scope = null;              // شناسهٔ آژانس فعال (null = بدون فیلتر؛ قبل از ورود)
let _saveTimer = null;
let _ready = false;
let _corrupted = false;          // دادهٔ محلی خراب است و منتظر تصمیم کاربر است (باگ ۲٫۲)

/** شناسهٔ آژانس مؤثر یک رکورد (رکوردهای قدیمی بدون شناسه متعلق به آژانس پیش‌فرض‌اند) */
export function agencyOf(rec) {
    return rec?.agencyId || DEFAULT_AGENCY_ID;
}

function notify(meta = {}) {
    _listeners.forEach((fn) => {
        try { fn(meta); } catch (e) { console.error('DB listener error', e); }
    });
}

function schedulePersist() {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => { DB.persist(); }, 200);
}

export const DB = {
    /* ---------- init ---------- */
    async init({ adapter } = {}) {
        const chosen = adapter || (RestAdapter.available() ? 'rest' : 'local');
        _adapter = chosen === 'rest' ? RestAdapter : LocalStorageAdapter;

        _corrupted = false;
        try {
            let data = await _adapter.load();
            if (!data) data = await migrateOrSeed();
            _db = normalizeDB(data);
        } catch (e) {
            if (e?.code === 'CORRUPT_DB') {
                /* باگ ۲٫۲: دادهٔ خراب را با دادهٔ نمونه جایگزین نمی‌کنیم.
                   سند موقتِ خالی در حافظه ساخته می‌شود اما تا تصمیم کاربر
                   (بازیابی پشتیبان یا شروع از صفر) چیزی روی دیسک نوشته نمی‌شود. */
                console.error('DB corrupted', e);
                _corrupted = true;
                _db = emptyDB();
                _ready = true;
                notify({ action: 'corrupted', entity: 'db' });
                return _db;
            }
            console.error('DB init failed', e);
            _db = migrateSeedSync();
        }
        _ready = true;
        DB.persist(true);
        return _db;
    },

    /* ---------- محافظت از دادهٔ خراب (باگ ۲٫۲) ---------- */

    /** آیا آخرین راه‌اندازی با دادهٔ خراب مواجه شد؟ (حالت «فقط خواندنی تا تصمیم کاربر») */
    isCorrupted: () => _corrupted,

    /** نسخهٔ خام دادهٔ خراب‌شده (برای دانلود و تلاش دستی بازیابی) */
    corruptedRaw() {
        try { return localStorage.getItem(CORRUPT_KEY) || ''; } catch (_) { return ''; }
    },

    /**
     * شروع از صفر پس از خرابی: سند خالی (بدون دادهٔ نمونه) ساخته و ذخیره می‌شود.
     * نسخهٔ خراب برای بررسی بعدی در `CORRUPT_KEY` باقی می‌ماند.
     */
    async startFresh() {
        _db = emptyDB();
        _corrupted = false;
        await DB.persist(true);
        notify({ action: 'reset', entity: 'db' });
        return _db;
    },

    /** حذف نسخهٔ خام خراب‌شده پس از اطمینان کاربر */
    discardCorruptedCopy() {
        try { localStorage.removeItem(CORRUPT_KEY); } catch (_) { /* ignore */ }
    },

    isReady: () => _ready,
    adapterName: () => _adapter.name,

    setActor(actor) {
        _actor = { id: actor?.id || '', name: actor?.fullName || actor?.username || 'سیستم' };
    },

    /* ---------- خواندن ---------- */
    /** سند کامل (فقط برای پشتیبان‌گیری/دیباگ) */
    raw() { return _db; },

    /* ---------- دامنهٔ آژانس (multi-tenant) ---------- */
    /** تعیین آژانس فعال؛ همهٔ فهرست‌ها از این پس فیلتر می‌شوند (null = بدون فیلتر) */
    setScope(agencyId) {
        _scope = agencyId || null;
        return _scope;
    },

    scope: () => _scope,

    /** بررسی تعلق یک رکورد به آژانس فعال */
    inScope(rec) {
        if (SCOPE_EXEMPT.includes(rec?.__collection)) return true;
        if (!_scope) return true;
        return agencyOf(rec) === _scope;
    },

    /** همهٔ رکوردهای یک مجموعه، بدون حذف‌شده‌ها */
    list(name) {
        const arr = _db?.[name] || [];
        return arr.filter((r) => !r.deletedAt && DB._visible(name, r));
    },

    /** همهٔ رکوردهای یک مجموعه، شامل حذف‌شده‌ها */
    listAll(name) {
        return clone((_db?.[name] || []).filter((r) => DB._visible(name, r)));
    },

    listDeleted(name) {
        return (_db?.[name] || []).filter((r) => !!r.deletedAt && DB._visible(name, r));
    },

    /** فهرست بدون فیلتر آژانس (برای ورود/مدیریت سامانه) */
    listGlobal(name) {
        return clone(_db?.[name] || []);
    },

    /** آیا رکورد در آژانس فعال دیده می‌شود؟ */
    _visible(name, rec) {
        if (SCOPE_EXEMPT.includes(name)) return true;
        if (!_scope) return true;
        return agencyOf(rec) === _scope;
    },

    get(name, id) {
        if (!id) return null;
        const found = (_db?.[name] || []).find((r) => r.id === id && !r.deletedAt);
        return found ? clone(found) : null;
    },

    /** جست‌وجوی یکتایی بر اساس فیلد (مثلاً username یا plateNumber) */
    findBy(name, field, value) {
        return (_db?.[name] || []).find((r) => !r.deletedAt && r[field] === value) || null;
    },

    /** جست‌وجوی یکتا در همهٔ آژانس‌ها (برای نام کاربری و شناسهٔ آژانس) */
    findGlobal(name, field, value) {
        return (_db?.[name] || []).find((r) => !r.deletedAt && r[field] === value) || null;
    },

    /** جست‌وجوی یکتا در آژانس فعال */
    findByScoped(name, field, value) {
        return (_db?.[name] || []).find((r) => !r.deletedAt && DB._visible(name, r) && r[field] === value) || null;
    },

    query(name, predicate) {
        return DB.list(name).filter(predicate);
    },

    settings() {
        return { ...defaultSettings(), ...(_db?.settings || {}) };
    },

    count(name) {
        return DB.list(name).length;
    },

    /* ---------- نوشتن ---------- */
    /**
     * نرمال‌سازی گزینه‌ها: رشتهٔ ساده به‌عنوان توضیح فارسی (برای گزارش تغییرات) پذیرفته می‌شود.
     * @returns {{silent:boolean,noPersist:boolean,desc:string}}
     */
    _opts(opts) {
        if (typeof opts === 'string') return { silent: false, noPersist: false, desc: opts };
        return { silent: false, noPersist: false, desc: '', ...(opts || {}) };
    },

    /**
     * تابع مرکزی تغییر داده. هر mutation باید از اینجا بگذرد.
     * @param {Function} mutationFn (db, api) => void | descriptor | descriptor[]
     *        descriptor: { action, entity, entityId, oldValue, newValue, silent, noPersist }
     */
    mutate(mutationFn, opts = {}) {
        const { silent, noPersist, desc } = DB._opts(opts);
        if (!_db) throw new Error('DB initialized نشده است');
        const before = clone(_db);
        const result = mutationFn(_db, {
            id: uid,
            actor: _actor,
            now: nowISO(),
            today: todayJalali(),
            nextSeq: (key) => {
                _db.sequences = _db.sequences || {};
                const v = Number(_db.sequences[key] || 1);
                _db.sequences[key] = v + 1;
                return v;
            }
        });

        const descriptors = []
            .concat(result || [])
            .filter((d) => d && typeof d === 'object');
        if (desc) descriptors.forEach((d) => { if (!d.note) d.note = desc; });

        /* مهر آژانس فعال روی رکوردهای تازه‌ساخته‌شده (نوشتن‌های مستقیم در mutate) */
        descriptors.forEach((d) => {
            if (!d.entity || SCOPE_EXEMPT.includes(d.entity)) return;
            const arr = _db[d.entity] || [];
            const row = d.entityId ? arr.find((r) => r.id === d.entityId) : null;
            if (row && !row.agencyId) row.agencyId = _scope || DEFAULT_AGENCY_ID;
        });

        _db.meta = { ...(_db.meta || {}), version: SCHEMA_VERSION, updatedAt: nowISO() };

        if (!silent) {
            descriptors.forEach((d) => DB.writeAudit(d, before));
        }
        if (!noPersist) schedulePersist();

        const summary = descriptors.length
            ? { action: descriptors[0].action, entity: descriptors[0].entity, count: descriptors.length }
            : { action: 'update', entity: 'db', count: 0 };

        /* قلاب‌های پس از نوشتن (ثبت خودکار اسناد حسابداری و ...) */
        _hooks.forEach((h) => {
            try { h(descriptors, _db, summary); } catch (e) { console.error('DB hook error', e); }
        });

        notify(summary);
        return result;
    },

    insert(name, obj, opts = {}) {
        opts = DB._opts(opts);
        const rec = { id: obj.id || uid(name.slice(0, 3)), createdAt: nowISO(), ...obj };
        if (!SCOPE_EXEMPT.includes(name) && !rec.agencyId) rec.agencyId = _scope || DEFAULT_AGENCY_ID;
        DB.mutate((db) => {
            db[name] = db[name] || [];
            db[name].push(rec);
            return { action: 'create', entity: name, entityId: rec.id, newValue: rec };
        }, opts);
        return clone(rec);
    },

    update(name, id, patch, opts = {}) {
        opts = DB._opts(opts);
        let updated = null;
        let oldValue = null;
        DB.mutate((db) => {
            const arr = db[name] || [];
            const idx = arr.findIndex((r) => r.id === id);
            if (idx < 0) throw new Error('رکورد مورد نظر یافت نشد');
            oldValue = clone(arr[idx]);
            arr[idx] = { ...arr[idx], ...patch, updatedAt: nowISO() };
            updated = clone(arr[idx]);
            return { action: 'update', entity: name, entityId: id, oldValue, newValue: updated };
        }, opts);
        return updated;
    },

    /** حذف نرم */
    remove(name, id, opts = {}) {
        opts = DB._opts(opts);
        let oldValue = null;
        const stamp = nowISO();
        DB.mutate((db) => {
            const arr = db[name] || [];
            const idx = arr.findIndex((r) => r.id === id);
            if (idx < 0) throw new Error('رکورد مورد نظر یافت نشد');
            oldValue = clone(arr[idx]);
            arr[idx] = { ...arr[idx], deletedAt: stamp, deletedBy: _actor.name };
            return { action: 'delete', entity: name, entityId: id, oldValue, newValue: { deletedAt: stamp } };
        }, opts);
        return true;
    },

    /** حذف نرم گروهی */
    removeMany(name, ids, opts = {}) {
        opts = DB._opts(opts);
        const stamp = nowISO();
        DB.mutate((db) => {
            const out = [];
            (db[name] || []).forEach((r, i) => {
                if (!ids.includes(r.id)) return;
                out.push({
                    action: 'delete', entity: name, entityId: r.id,
                    oldValue: clone(r), newValue: { deletedAt: stamp }
                });
                db[name][i] = { ...r, deletedAt: stamp, deletedBy: _actor.name };
            });
            return out;
        }, opts);
        return ids.length;
    },

    restore(name, id, opts = {}) {
        opts = DB._opts(opts);
        DB.mutate((db) => {
            const arr = db[name] || [];
            const idx = arr.findIndex((r) => r.id === id);
            if (idx < 0) throw new Error('رکورد مورد نظر یافت نشد');
            const oldValue = clone(arr[idx]);
            const rec = { ...arr[idx] };
            delete rec.deletedAt;
            delete rec.deletedBy;
            arr[idx] = { ...rec, restoredAt: nowISO() };
            return { action: 'restore', entity: name, entityId: id, oldValue, newValue: clone(arr[idx]) };
        }, opts);
        return true;
    },

    /* ---------- ثبت لاگ ---------- */
    writeAudit(descriptor, beforeSnapshot) {
        if (descriptor.silent) return;
        if (descriptor.entity === 'auditLog') return;
        _db.auditLog = _db.auditLog || [];
        _db.auditLog.push({
            id: uid('log'),
            timestamp: nowISO(),
            userId: _actor.id || '',
            userName: _actor.name || 'سیستم',
            action: descriptor.action,
            entity: descriptor.entity,
            entityLabel: COLLECTION_LABELS[descriptor.entity] || descriptor.entity,
            entityId: descriptor.entityId || '',
            note: descriptor.note || '',
            oldValue: descriptor.oldValue ? trimForLog(descriptor.oldValue) : null,
            newValue: descriptor.newValue ? trimForLog(descriptor.newValue) : null,
            device: navigator.userAgent.slice(0, 60)
        });
        /* سقف نگهداری لاگ برای جلوگیری از حجیم شدن: ۳۰۰۰ رکورد آخر */
        if (_db.auditLog.length > 3000) _db.auditLog = _db.auditLog.slice(-3000);
    },

    /* ---------- کدهای یکتا ---------- */
    nextSequence(key) {
        _db.sequences = _db.sequences || {};
        const v = Number(_db.sequences[key] || 1);
        _db.sequences[key] = v + 1;
        return v;
    },

    /* ---------- ذخیره‌سازی ---------- */
    async persist(immediate = false) {
        clearTimeout(_saveTimer);
        if (!_db) return false;
        try {
            await _adapter.save(_db);
            return true;
        } catch (e) {
            console.error('DB persist error', e);
            notify({ action: 'error', entity: 'db', message: 'ذخیره‌سازی ناموفق بود' });
            return false;
        }
    },

    subscribe(fn) {
        _listeners.push(fn);
        return () => { _listeners = _listeners.filter((x) => x !== fn); };
    },

    /** ثبت قلاب پس از هر نوشتن موفق (خروجی: تابع لغو) */
    onWrite(fn) {
        _hooks.push(fn);
        return () => { _hooks = _hooks.filter((x) => x !== fn); };
    },

    /* ---------- پشتیبان‌گیری ---------- */
    exportObject() {
        return clone(_db);
    },

    /**
     * بازیابی سند پشتیبان.
     * پیش از هر کاری ساختار اعتبارسنجی می‌شود (باگ ۲٫۵) و یک عکس فوری از دادهٔ
     * فعلی در `PRE_IMPORT_KEY` ذخیره می‌شود تا کاربر بتواند بازیابی را لغو کند.
     */
    async importObject(obj, { merge = false } = {}) {
        const check = validateDBStructure(obj);
        if (!check.ok) {
            const err = new Error('فایل پشتیبان معتبر نیست:\n• ' + check.errors.join('\n• '));
            err.code = 'INVALID_BACKUP';
            err.errors = check.errors;
            throw err;
        }
        /* عکس فوری برای بازگشت (Undo) */
        try {
            localStorage.setItem(PRE_IMPORT_KEY, JSON.stringify({
                savedAt: nowISO(), db: _db
            }));
        } catch (_) { /* اگر فضای ذخیره‌سازی پر بود، بازیابی متوقف نمی‌شود */ }
        if (!merge) {
            _db = normalizeDB(obj);
        } else {
            const incoming = normalizeDB(obj);
            COLLECTIONS.forEach((c) => {
                const existing = new Set((_db[c] || []).map((r) => r.id));
                (incoming[c] || []).forEach((r) => {
                    if (!existing.has(r.id)) _db[c].push(r);
                });
            });
            _db.settings = { ..._db.settings, ...incoming.settings };
        }
        _db.meta = { ...(_db.meta || {}), updatedAt: nowISO(), version: SCHEMA_VERSION };
        await DB.persist(true);
        notify({ action: 'import', entity: 'db' });
        return true;
    },

    /** آیا نسخهٔ پیش از آخرین بازیابی موجود است؟ */
    hasPreImportSnapshot() {
        try { return !!localStorage.getItem(PRE_IMPORT_KEY); } catch (_) { return false; }
    },

    /** اطلاعات عکس فوری پیش از بازیابی (زمان ثبت) */
    preImportInfo() {
        try {
            const snap = JSON.parse(localStorage.getItem(PRE_IMPORT_KEY) || 'null');
            return snap?.db ? { savedAt: snap.savedAt || '' } : null;
        } catch (_) { return null; }
    },

    /** بازگرداندن داده به وضعیت پیش از آخرین بازیابی (Undo) */
    async undoImport() {
        const raw = localStorage.getItem(PRE_IMPORT_KEY);
        if (!raw) throw new Error('نسخهٔ پیش از بازیابی موجود نیست');
        const snap = JSON.parse(raw);
        if (!snap?.db) throw new Error('نسخهٔ پیش از بازیابی خوانا نیست');
        _db = normalizeDB(snap.db);
        await DB.persist(true);
        localStorage.removeItem(PRE_IMPORT_KEY);
        notify({ action: 'undo-import', entity: 'db' });
        return true;
    },

    /** بارگذاری دادهٔ نمونه به‌درخواست کاربر (دمو/آموزش) — باگ ۲٫۶ */
    async loadSampleData() {
        _db = normalizeDB(seedSampleDB());
        _corrupted = false;
        await DB.persist(true);
        notify({ action: 'seed-sample', entity: 'db' });
        return _db;
    },

    async factoryReset() {
        await _adapter.clear();
        _db = emptyDB();
        await DB.persist(true);
        notify({ action: 'reset', entity: 'db' });
    },

    /** حذف فقط داده‌های نمونه (رکوردهای علامت‌خورده) */
    purgeSampleData() {
        const counts = {};
        DB.mutate((db) => {
            const out = [];
            COLLECTIONS.forEach((c) => {
                const before = (db[c] || []).length;
                db[c] = (db[c] || []).filter((r) => !r._sample);
                const removed = before - db[c].length;
                if (removed) counts[c] = removed;
            });
            db.meta = { ...(db.meta || {}), sampleData: false };
            out.push({ action: 'purge-sample', entity: 'db', newValue: counts });
            return out;
        });
        return counts;
    },

    stats() {
        const out = {};
        COLLECTIONS.forEach((c) => {
            out[c] = { active: DB.list(c).length, deleted: DB.listDeleted(c).length };
        });
        return out;
    }
};

/* --------------------------- نرمال‌سازی و مهاجرت --------------------------- */

function trimForLog(obj) {
    const o = clone(obj);
    ['notes', 'description'].forEach((k) => {
        if (typeof o[k] === 'string' && o[k].length > 200) o[k] = o[k].slice(0, 200) + '…';
    });
    return o;
}

function normalizeDB(data) {
    const base = emptyDB();
    const db = { ...base, ...(data || {}) };
    db.meta = { ...base.meta, ...(data?.meta || {}) };
    db.settings = { ...defaultSettings(), ...(data?.settings || {}) };
    db.sequences = { ...base.sequences, ...(data?.sequences || {}) };
    COLLECTIONS.forEach((c) => {
        if (!Array.isArray(db[c])) db[c] = [];
    });
    db.auditLog = Array.isArray(db.auditLog) ? db.auditLog.slice(-3000) : [];
    /* نسخهٔ ۶: آژانس پیش‌فرض + کدینگ حساب‌ها + مهر آژانس روی دادهٔ قدیمی */
    const hadAgencies = Array.isArray(data?.agencies) && data.agencies.length > 0;
    ensureFoundation(db, { hadAgencies });
    ensureAgencyTags(db, DEFAULT_AGENCY_ID);
    db.meta.version = SCHEMA_VERSION;
    return db;
}

/* ===================== اعتبارسنجی سند پشتیبان (باگ ۲٫۵) ===================== */

/** مجموعه‌های اجباری یک سند پشتیبان معتبر */
export const REQUIRED_COLLECTIONS = ['drivers', 'vehicles', 'trips'];

/**
 * بررسی ساختار یک سند پیش از جایگزینی داده‌ها.
 * خروجی: { ok, errors[], warnings[] } با پیام‌های دقیق فارسی دربارهٔ فیلد ناقص.
 * @param {any} data سند خوانده‌شده از فایل JSON
 */
export function validateDBStructure(data) {
    const errors = [];
    const warnings = [];

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return { ok: false, errors: ['فایل یک سند JSON معتبر نیست (شیء انتظار می‌رفت).'], warnings };
    }

    REQUIRED_COLLECTIONS.forEach((c) => {
        if (!(c in data)) errors.push(`فیلد اجباری «${COLLECTION_LABELS[c] || c}» (${c}) در فایل وجود ندارد.`);
        else if (!Array.isArray(data[c])) errors.push(`فیلد «${COLLECTION_LABELS[c] || c}» (${c}) باید آرایه باشد.`);
    });

    if (!('settings' in data)) errors.push('فیلد اجباری «تنظیمات» (settings) در فایل وجود ندارد.');
    else if (typeof data.settings !== 'object' || data.settings === null || Array.isArray(data.settings)) {
        errors.push('فیلد «تنظیمات» (settings) باید یک شیء باشد.');
    }

    /* مجموعه‌های اختیاری: اگر باشند باید آرایه باشند */
    COLLECTIONS.forEach((c) => {
        if (REQUIRED_COLLECTIONS.includes(c)) return;
        if (c in data && !Array.isArray(data[c])) {
            errors.push(`فیلد «${COLLECTION_LABELS[c] || c}» (${c}) باید آرایه باشد.`);
        }
        if (!(c in data)) warnings.push(`مجموعهٔ «${COLLECTION_LABELS[c] || c}» در فایل نیست و خالی ساخته می‌شود.`);
    });

    /* یکتایی شناسه‌ها و وجود id در رکوردها */
    COLLECTIONS.forEach((c) => {
        if (!Array.isArray(data[c])) return;
        const seen = new Set();
        let noId = 0;
        let dup = 0;
        data[c].forEach((r) => {
            if (!r || typeof r !== 'object') { noId++; return; }
            if (!r.id) { noId++; return; }
            if (seen.has(r.id)) dup++;
            seen.add(r.id);
        });
        if (noId) warnings.push(`${toFa(noId)} رکورد بدون شناسه در «${COLLECTION_LABELS[c] || c}» یافت شد.`);
        if (dup) errors.push(`${toFa(dup)} شناسهٔ تکراری در «${COLLECTION_LABELS[c] || c}» (${c}) وجود دارد.`);
    });

    /* ارجاع‌های شکسته فقط هشدارند (Soft Delete ممکن است رکورد را پنهان کرده باشد) */
    if (Array.isArray(data.trips) && Array.isArray(data.drivers)) {
        const ids = new Set(data.drivers.map((d) => d?.id));
        const orphan = data.trips.filter((t) => t?.driverId && !ids.has(t.driverId)).length;
        if (orphan) warnings.push(`${toFa(orphan)} سفر به رانندهٔ ناموجود ارجاع می‌دهد.`);
    }

    return { ok: errors.length === 0, errors, warnings };
}

/** تلاش برای مهاجرت از نسخه‌های قبلی و در غیر این صورت داده نمونه */
async function migrateOrSeed() {
    for (const key of LEGACY_KEYS) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        try {
            const old = JSON.parse(raw);
            if (!old) continue;
            if (key === 'taxi_dispatch_db_v5' || old.meta?.version === 5) {
                console.info('مهاجرت داده‌ها از نسخهٔ ۵ به ۶ (چند آژانسی + حسابداری دوطرفه)');
                return migrateFromV5(old);
            }
            if (old.drivers || old.trips) {
                console.info('مهاجرت داده‌ها از نسخه دموی قبلی انجام شد');
                return migrateFromV4(old);
            }
        } catch (e) {
            console.error('legacy migrate failed', e);
        }
    }
    return seedSampleDB();
}

/** نگاشت نسخهٔ ۵ به ۶: افزودن آژانس پیش‌فرض، کدینگ حساب‌ها و مهر آژانس */
export function migrateFromV5(old) {
    const db = normalizeDB(old);
    db.meta.migratedFrom = 'v5';
    db.meta.version = SCHEMA_VERSION;
    return db;
}

function migrateSeedSync() {
    try {
        return migrateOrSeedSync();
    } catch (_) {
        return seedSync();
    }
}

function migrateOrSeedSync() {
    for (const key of LEGACY_KEYS) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        try {
            const old = JSON.parse(raw);
            if (old && (old.drivers || old.trips)) return migrateFromV4(old);
        } catch (_) { /* ignore */ }
    }
    return seedSync();
}

/** نگاشت داده‌های نسخه ۴ به ساختار نسخه ۵ (تاریخ‌های میلادی → کلید شمسی) */
export function migrateFromV4(old) {
    const db = emptyDB();
    db.settings = { ...defaultSettings(), ...(old.settings || {}) };
    db.meta.sampleData = false;
    db.meta.migratedFrom = 'v4';

    db.drivers = (old.drivers || []).map((d) => ({
        id: d.id || uid('drv'),
        fullName: d.fullName || '',
        phone: d.phone || '',
        nationalCode: d.nationalCode || '',
        licenseNumber: d.licenseNumber || '',
        joinDate: isoToJalaliKey(d.joinDate) || d.joinDate || '',
        commissionRate: Number(d.commissionRate) || 15,
        status: d.status || 'active',
        availability: d.availability || 'available',
        rating: 4.5,
        notes: d.notes || '',
        _migrated: true
    }));

    db.vehicles = (old.vehicles || []).map((v) => ({
        id: v.id || uid('veh'),
        plateNumber: v.plateNumber || '',
        brand: v.brand || '',
        model: v.model || '',
        color: v.color || '',
        year: v.year || '',
        driverId: v.driverId || '',
        insuranceExpiry: v.insuranceExpiry || '',
        technicalExpiry: v.technicalExpiry || '',
        status: v.status || 'active',
        notes: v.notes || '',
        _migrated: true
    }));

    db.addresses = (old.addresses || []).map((a) => ({ ...a, id: a.id || uid('adr') }));
    db.subscribers = (old.subscribers || []).map((s) => ({
        ...s,
        id: s.id || uid('sub'),
        subscriptionStart: s.subscriptionStart || '',
        subscriptionEnd: s.subscriptionEnd || '',
        debt: Number(s.debt) || 0
    }));
    db.trips = (old.trips || []).map((t) => ({ ...t, id: t.id || uid('trp') }));
    db.expenses = (old.expenses || []).map((e) => ({
        ...e, id: e.id || uid('exp'),
        date: isoToJalaliKey(e.date) || e.date || todayJalali()
    }));
    db.transactions = old.transactions || [];
    if (old.tripCounter) db.sequences.trip = old.tripCounter;
    return db;
}

/* ------------------------------ داده نمونه ------------------------------ */

const SAMPLE = (o) => ({ ...o, _sample: true });

function seedSync() {
    return seedSampleDB();
}

/**
 * داده نمونهٔ واقع‌گرا برای تست کامل سیستم (۲۴ سفر، پرداخت‌ها، هزینه‌ها).
 * تمام رکوردها با _sample علامت خورده‌اند تا با یک کلیک در تنظیمات پاک شوند.
 */
export function seedSampleDB() {
    const db = emptyDB();
    db.meta.sampleData = true;
    db.meta.agencyScoped = true;

    /* تعطیلات ثابت سال جاری */
    const jy = Number(currentJalaliMonth().slice(0, 4));
    db.settings.holidays = [
        jalaliKey(jy, 1, 1), jalaliKey(jy, 1, 2), jalaliKey(jy, 1, 3), jalaliKey(jy, 1, 4),
        jalaliKey(jy, 1, 12), jalaliKey(jy, 1, 13), jalaliKey(jy, 11, 22), jalaliKey(jy, 12, 29)
    ];

    /* کاربران پیش‌فرض (رمزها در auth.js ساخته می‌شوند: admin123 / operator123 / account123) */
    db.operators = [
        SAMPLE({ id: 'op-admin', fullName: 'مدیر سامانه', username: 'admin', role: 'admin', status: 'active', phone: '', passwordHash: '', superAdmin: true, agencyId: DEFAULT_AGENCY_ID, notes: 'حساب پیش‌فرض مدیر سامانه (admin / admin)' }),
        SAMPLE({ id: 'op-oper', fullName: 'زهرا رضایی', username: 'operator', role: 'operator', status: 'active', phone: '09121112233', passwordHash: '', notes: 'اپراتور شیفت صبح' }),
        SAMPLE({ id: 'op-acc', fullName: 'محسن افشار', username: 'accountant', role: 'accountant', status: 'active', phone: '09124445566', passwordHash: '', notes: 'حسابدار' })
    ];

    db.drivers = [
        SAMPLE({ id: 'd1', fullName: 'علی محمدی', phone: '09123456789', nationalCode: '0012345679', licenseNumber: 'L12345', joinDate: addJalaliDays(todayJalali(), -400), status: 'active', availability: 'available', commissionRate: 15, rating: 4.8, notes: 'راننده نمونه' }),
        SAMPLE({ id: 'd2', fullName: 'رضا کریمی', phone: '09359876543', nationalCode: '0012345687', licenseNumber: 'L67890', joinDate: addJalaliDays(todayJalali(), -260), status: 'active', availability: 'busy', commissionRate: 12, rating: 4.4, notes: '' }),
        SAMPLE({ id: 'd3', fullName: 'سعید نجفی', phone: '09122223344', nationalCode: '0012345695', licenseNumber: 'L24680', joinDate: addJalaliDays(todayJalali(), -150), status: 'active', availability: 'rest', commissionRate: 15, rating: 4.1, notes: '' }),
        SAMPLE({ id: 'd4', fullName: 'حمید اکبری', phone: '09368889900', nationalCode: '0012345709', licenseNumber: 'L13579', joinDate: addJalaliDays(todayJalali(), -90), status: 'active', availability: 'offline', commissionRate: 18, rating: 3.9, notes: '' })
    ];

    db.vehicles = [
        SAMPLE({ id: 'v1', plateNumber: '۱۲ب۳۴۵', brand: 'پژو', model: '۴۰۵ GLX', color: 'سفید', year: 1398, driverId: 'd1', insuranceExpiry: addJalaliDays(todayJalali(), 120), technicalExpiry: addJalaliDays(todayJalali(), 25), status: 'active', notes: '' }),
        SAMPLE({ id: 'v2', plateNumber: '۴۵۶ج۷۸', brand: 'سمند', model: 'LX', color: 'نقره‌ای', year: 1400, driverId: 'd2', insuranceExpiry: addJalaliDays(todayJalali(), 60), technicalExpiry: addJalaliDays(todayJalali(), 200), status: 'active', notes: '' }),
        SAMPLE({ id: 'v3', plateNumber: '۷۸۹د۱۲', brand: 'تویوتا', model: 'کرولا', color: 'مشکی', year: 1399, driverId: 'd3', insuranceExpiry: addJalaliDays(todayJalali(), 12), technicalExpiry: addJalaliDays(todayJalali(), 90), status: 'active', notes: '' }),
        SAMPLE({ id: 'v4', plateNumber: '۲۳۴س۵۶', brand: 'شاهین', model: '۱۴۰۱', color: 'آبی', year: 1401, driverId: 'd4', insuranceExpiry: addJalaliDays(todayJalali(), 300), technicalExpiry: addJalaliDays(todayJalali(), 280), status: 'inRepair', notes: 'در تعمیرگاه' })
    ];

    db.addresses = [
        SAMPLE({ id: 'a1', title: 'فرودگاه امام', address: 'فرودگاه بین‌المللی امام خمینی، ترمینال ۱', neighborhood: 'فرودگاه', city: 'تهران', notes: '' }),
        SAMPLE({ id: 'a2', title: 'پایانه غرب', address: 'پایانه مسافربری غرب، بزرگراه آزادی', neighborhood: 'آزادی', city: 'تهران', notes: '' }),
        SAMPLE({ id: 'a3', title: 'میدان ونک', address: 'میدان ونک، خیابان گاندی', neighborhood: 'ونک', city: 'تهران', notes: '' }),
        SAMPLE({ id: 'a4', title: 'ترمینال شرق', address: 'ترمینال شرق، بزرگراه شهید بابایی', neighborhood: 'تهرانپارس', city: 'تهران', notes: '' })
    ];

    db.subscribers = [
        SAMPLE({ id: 'p1', subscriptionNumber: 'SUB-0001', type: 'individual', fullName: 'مریم حسینی', phone: '09121234567', subscriptionType: 'monthly', subscriptionStart: addJalaliDays(todayJalali(), -20), subscriptionEnd: addJalaliDays(todayJalali(), 10), subscriptionPrice: 1500000, address: 'تهران، خیابان آزادی، پلاک ۱۲', companyName: '', nationalId: '', companyPhone: '', companyAddress: '', debt: 0, notes: '', createdAt: nowISO() }),
        SAMPLE({ id: 'p2', subscriptionNumber: 'SUB-0002', type: 'corporate', fullName: 'شرکت انصارالمهدی', phone: '02112345678', subscriptionType: 'none', subscriptionStart: '', subscriptionEnd: '', subscriptionPrice: 0, address: '', companyName: 'انصارالمهدی', nationalId: '10320456789', companyPhone: '02112345678', companyAddress: 'تهران، خیابان انقلاب، پلاک ۸۸', debt: 0, notes: 'قرارداد حقوقی', createdAt: nowISO() }),
        SAMPLE({ id: 'p3', subscriptionNumber: 'SUB-0003', type: 'corporate', fullName: 'شرکت راه‌سازان پارس', phone: '02188990011', subscriptionType: 'custom', subscriptionStart: addJalaliDays(todayJalali(), -60), subscriptionEnd: addJalaliDays(todayJalali(), 30), subscriptionPrice: 4000000, address: '', companyName: 'راه‌سازان پارس', nationalId: '10101122334', companyPhone: '02188990011', companyAddress: 'تهران، سعادت‌آباد، بلوار دریا', debt: 0, notes: '', createdAt: nowISO() })
    ];

    /* --- سفرهای نمونه در ۱۰ روز گذشته --- */
    const driverIds = ['d1', 'd2', 'd3', 'd4'];
    const vehicleOf = { d1: 'v1', d2: 'v2', d3: 'v3', d4: 'v4' };
    const pickupDrop = [
        ['فرودگاه امام', 'میدان ونک'], ['پایانه غرب', 'میدان ونک'], ['میدان ونک', 'پایانه غرب'],
        ['میدان ونک', 'فرودگاه امام'], ['ترمینال شرق', 'میدان ونک'], ['پایانه غرب', 'ترمینال شرق']
    ];
    const passengers = [
        { name: 'مهدی کاظمی', phone: '09121110011', sub: '' },
        { name: 'شرکت انصارالمهدی', phone: '02112345678', sub: 'p2' },
        { name: 'سارا احمدی', phone: '09127770022', sub: '' },
        { name: 'شرکت راه‌سازان پارس', phone: '02188990011', sub: 'p3' }
    ];
    const methods = ['cash', 'card', 'subscription', 'online'];
    let tripSeq = 1;
    const rnd = (n) => Math.floor(Math.random() * n);
    for (let day = 9; day >= 0; day--) {
        const dayKey = addJalaliDays(todayJalali(), -day);
        const count = 2 + rnd(3);
        for (let i = 0; i < count; i++) {
            const dIdx = rnd(driverIds.length);
            const dId = driverIds[dIdx];
            const pd = pickupDrop[rnd(pickupDrop.length)];
            const passenger = passengers[rnd(passengers.length)];
            const distance = 4 + rnd(18);
            const hour = 7 + rnd(14);
            /* زمان سفر باید ISO میلادی باشد؛ رشتهٔ «تاریخ شمسی + ساعت» باعث خطای محاسبات تاریخ می‌شود */
            const timeStr = `${String(hour).padStart(2, '0')}:${String(rnd(60)).padStart(2, '0')}`;
            const iso = jalaliDateWithTime(dayKey, timeStr);
            const driver = db.drivers.find((d) => d.id === dId);
            const commissionRate = driver.commissionRate;
            const base = 15000 + distance * 5000;
            const isNight = hour >= 22 || hour < 6;
            const fare = Math.round((base * (isNight ? 1.3 : 1)) / 1000) * 1000;
            const commission = Math.round(fare * (commissionRate / 100));
            const billedTo = passenger.sub ? 'company' : 'driver';
            const statusRoll = rnd(10);
            const status = day === 0 && statusRoll > 6 ? (statusRoll > 8 ? 'pending' : 'inProgress')
                : (statusRoll === 9 ? 'cancelled' : 'completed');
            const cancelled = status === 'cancelled';
            const reasons = ['مشتری لغو کرد', 'راننده نرسید', 'آدرس اشتباه', 'سایر'];
            db.trips.push(SAMPLE({
                id: 't' + tripSeq,
                code: 'T' + String(tripSeq).padStart(5, '0'),
                operatorId: db.operators[rnd(3)].id,
                driverId: dId,
                vehicleId: vehicleOf[dId],
                subscriberId: passenger.sub,
                subscriberName: passenger.name,
                subscriberPhone: passenger.phone,
                pickupAddress: pd[0],
                dropoffAddress: pd[1],
                pickupTime: iso,
                dropoffTime: status === 'completed' ? new Date(new Date(iso).getTime() + (12 + rnd(35)) * 60000).toISOString() : '',
                assignedAt: iso,
                distance,
                fare,
                commission,
                driverShare: fare - commission,
                status,
                priority: rnd(5) === 0 ? 'urgent' : 'reserved',
                cancelReason: cancelled ? reasons[rnd(reasons.length)] : '',
                cancelNote: '',
                paymentMethod: methods[rnd(methods.length)],
                isPaid: status === 'completed' && billedTo !== 'company',
                billedTo,
                companyId: billedTo === 'company' ? passenger.name : '',
                notes: '',
                createdAt: iso
            }));
            tripSeq++;
        }
    }
    db.sequences.trip = tripSeq;

    /* --- پرداخت‌های نمونه --- */
    db.subscriberPayments = [
        SAMPLE({ id: 'sp1', subscriberId: 'p2', amount: 500000, date: addJalaliDays(todayJalali(), -4), method: 'cash', receiptNo: 'R-1001', operatorId: 'op-acc', notes: 'علی‌الحساب', createdAt: nowISO() }),
        SAMPLE({ id: 'sp2', subscriberId: 'p3', amount: 1200000, date: addJalaliDays(todayJalali(), -2), method: 'card', receiptNo: 'R-1002', operatorId: 'op-acc', notes: '', createdAt: nowISO() })
    ];
    db.driverPayments = [
        SAMPLE({ id: 'dp1', driverId: 'd1', amount: 2000000, date: addJalaliDays(todayJalali(), -3), method: 'cash', kind: 'payout', operatorId: 'op-acc', notes: 'تسویه هفتگی', createdAt: nowISO() }),
        SAMPLE({ id: 'dp2', driverId: 'd2', amount: 1500000, date: addJalaliDays(todayJalali(), -1), method: 'card', kind: 'payout', operatorId: 'op-acc', notes: '', createdAt: nowISO() })
    ];
    db.expenses = [
        SAMPLE({ id: 'e1', date: addJalaliDays(todayJalali(), -6), category: 'اینترنت', description: 'شارژ اینترنت دفتر', amount: 450000, createdAt: nowISO() }),
        SAMPLE({ id: 'e2', date: addJalaliDays(todayJalali(), -3), category: 'برق', description: 'قبض برق دفتر', amount: 780000, createdAt: nowISO() }),
        SAMPLE({ id: 'e3', date: addJalaliDays(todayJalali(), -1), category: 'چای و قند', description: 'خرید مایحتاج', amount: 260000, createdAt: nowISO() })
    ];
    db.transactions = [];
    /* همهٔ رکوردهای نمونه متعلق به آژانس پیش‌فرض‌اند */
    ensureAgencyTags(db, DEFAULT_AGENCY_ID);
    db.sequences.subscriber = db.subscribers.length + 1;
    db.sequences.payment = 3;
    db.sequences.driverPayment = 3;
    DB._seedTripRefs = null;

    /* بدهی مشترکین حقوقی — دقیقاً مطابق قاعدهٔ Subscribers.computeDebt
       (همهٔ سفرهای حقوقی غیرلغوشده منهای پرداخت‌ها) تا مقدار ذخیره‌شده با محاسبهٔ زنده یکی باشد */
    db.subscribers.forEach((s) => {
        const companyFare = db.trips
            .filter((t) => t.subscriberId === s.id && t.billedTo === 'company' && t.status !== 'cancelled')
            .reduce((acc, t) => acc + (t.fare || 0), 0);
        const paid = db.subscriberPayments.filter((p) => p.subscriberId === s.id).reduce((a, p) => a + p.amount, 0);
        s.debt = Math.max(0, companyFare - paid);
    });

    return db;
}

/** تابع سراسری مطابق مشخصات پروژه */
export function mutateDB(fn, opts) {
    return DB.mutate(fn, opts);
}

export default DB;
