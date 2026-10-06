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
    currentJalaliMonth, jalaliKey, sortBy
} from './utils.js';

export const SCHEMA_VERSION = 5;
export const DB_KEY = 'taxi_dispatch_db_v5';
export const LEGACY_KEYS = ['taxi_dispatch_db_v4'];
export const API_CONFIG_KEY = 'taxi_api_config';

/* ترتیب مجموعه‌ها (برای خروجی/ورودی و پیمایش) */
export const COLLECTIONS = [
    'drivers', 'vehicles', 'addresses', 'subscribers', 'trips',
    'subscriberPayments', 'driverPayments', 'transactions', 'expenses',
    'operators', 'shifts', 'auditLog'
];

export const COLLECTION_LABELS = {
    drivers: 'راننده', vehicles: 'خودرو', addresses: 'آدرس', subscribers: 'مشترک',
    trips: 'سفر', subscriberPayments: 'پرداخت مشترک', driverPayments: 'پرداخت راننده',
    transactions: 'تراکنش', expenses: 'هزینه', operators: 'کاربر', shifts: 'شیفت',
    auditLog: 'گزارش تغییرات'
};

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
        sequences: { trip: 1, subscriber: 1, payment: 1, driverPayment: 1, operator: 1, shift: 1 },
        auditLog: []
    };
    COLLECTIONS.forEach((c) => {
        if (c === 'auditLog') return;
        db[c] = [];
    });
    return db;
}

/* ------------------------------- Adapter ها ------------------------------- */

/** ذخیره‌سازی محلی (فاز جاری) */
export const LocalStorageAdapter = {
    name: 'local',
    available: () => {
        try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true; } catch (_) { return false; }
    },
    async load() {
        const raw = localStorage.getItem(DB_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
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
let _actor = { id: '', name: 'سیستم' };
let _saveTimer = null;
let _ready = false;

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

        try {
            let data = await _adapter.load();
            if (!data) data = await migrateOrSeed();
            _db = normalizeDB(data);
        } catch (e) {
            console.error('DB init failed', e);
            _db = migrateSeedSync();
        }
        _ready = true;
        DB.persist(true);
        return _db;
    },

    isReady: () => _ready,
    adapterName: () => _adapter.name,

    setActor(actor) {
        _actor = { id: actor?.id || '', name: actor?.fullName || actor?.username || 'سیستم' };
    },

    /* ---------- خواندن ---------- */
    /** سند کامل (فقط برای پشتیبان‌گیری/دیباگ) */
    raw() { return _db; },

    /** همهٔ رکوردهای یک مجموعه، بدون حذف‌شده‌ها */
    list(name) {
        const arr = _db?.[name] || [];
        return arr.filter((r) => !r.deletedAt);
    },

    /** همهٔ رکوردهای یک مجموعه، شامل حذف‌شده‌ها */
    listAll(name) {
        return clone(_db?.[name] || []);
    },

    listDeleted(name) {
        return (_db?.[name] || []).filter((r) => !!r.deletedAt);
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

        _db.meta = { ...(_db.meta || {}), version: SCHEMA_VERSION, updatedAt: nowISO() };

        if (!silent) {
            descriptors.forEach((d) => DB.writeAudit(d, before));
        }
        if (!noPersist) schedulePersist();

        const summary = descriptors.length
            ? { action: descriptors[0].action, entity: descriptors[0].entity, count: descriptors.length }
            : { action: 'update', entity: 'db', count: 0 };
        notify(summary);
        return result;
    },

    insert(name, obj, opts = {}) {
        opts = DB._opts(opts);
        const rec = { id: obj.id || uid(name.slice(0, 3)), createdAt: nowISO(), ...obj };
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

    /* ---------- پشتیبان‌گیری ---------- */
    exportObject() {
        return clone(_db);
    },

    async importObject(obj, { merge = false } = {}) {
        if (!obj || typeof obj !== 'object') throw new Error('فایل پشتیبان نامعتبر است');
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
    return db;
}

/** تلاش برای مهاجرت از نسخه دموی v4 و در غیر این صورت داده نمونه */
async function migrateOrSeed() {
    for (const key of LEGACY_KEYS) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        try {
            const old = JSON.parse(raw);
            if (old && (old.drivers || old.trips)) {
                console.info('مهاجرت داده‌ها از نسخه دموی قبلی انجام شد');
                return migrateFromV4(old);
            }
        } catch (e) {
            console.error('legacy migrate failed', e);
        }
    }
    return seedSampleDB();
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

    /* تعطیلات ثابت سال جاری */
    const jy = Number(currentJalaliMonth().slice(0, 4));
    db.settings.holidays = [
        jalaliKey(jy, 1, 1), jalaliKey(jy, 1, 2), jalaliKey(jy, 1, 3), jalaliKey(jy, 1, 4),
        jalaliKey(jy, 1, 12), jalaliKey(jy, 1, 13), jalaliKey(jy, 11, 22), jalaliKey(jy, 12, 29)
    ];

    /* کاربران پیش‌فرض (رمزها در auth.js ساخته می‌شوند: admin123 / operator123 / account123) */
    db.operators = [
        SAMPLE({ id: 'op-admin', fullName: 'مدیر سامانه', username: 'admin', role: 'admin', status: 'active', phone: '', passwordHash: '', notes: 'حساب پیش‌فرض مدیر' }),
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
            const iso = `${dayKey}T${String(hour).padStart(2, '0')}:${String(rnd(60)).padStart(2, '0')}:00`;
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
