/* ==========================================================================
 * js/auth.js — احراز هویت سبک محلی، سطح دسترسی و مدیریت شیفت
 * --------------------------------------------------------------------------
 * توجه امنیتی: در این فاز احراز هویت «محلی» است (بدون سرور). رمزها با
 * SHA-256 + Salt تصادفی به‌ازای هر کاربر هش می‌شوند و هرگز به‌صورت متن ساده
 * ذخیره نمی‌شوند. در فاز اتصال به PocketBase/Supabase، این ماژول با
 * AuthAdapter سروری جایگزین می‌شود و بقیه برنامه تغییری نمی‌کند.
 * ========================================================================== */

import { DB, DEFAULT_AGENCY_ID } from './db.js';
import { Agency } from './agency.js';
import { uid, nowISO, todayJalali, toFa, sum } from './utils.js';

export const SESSION_KEY = 'taxi_session_v6';
export const LEGACY_SESSION_KEY = 'taxi_session_v5';
const SESSION_TTL_HOURS = 12;

/* ------------------------------ SHA-256 ------------------------------ */

const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

const rotr = (n, x) => (x >>> n) | (x << (32 - n));

function sha256Bytes(bytes) {
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const len = bytes.length;
    const total = (((len + 9) >> 6) + 1) << 6;
    const buf = new Uint8Array(total);
    buf.set(bytes);
    buf[len] = 0x80;
    const dv = new DataView(buf.buffer);
    const bits = len * 8;
    dv.setUint32(total - 4, bits >>> 0);
    dv.setUint32(total - 8, Math.floor(bits / 4294967296));

    const w = new Uint32Array(64);
    for (let i = 0; i < total; i += 64) {
        for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4);
        for (let t = 16; t < 64; t++) {
            const s0 = rotr(7, w[t - 15]) ^ rotr(18, w[t - 15]) ^ (w[t - 15] >>> 3);
            const s1 = rotr(17, w[t - 2]) ^ rotr(19, w[t - 2]) ^ (w[t - 2] >>> 10);
            w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
        }
        let [a, b, c, d, e, f, g, h] = H;
        for (let t = 0; t < 64; t++) {
            const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
            const ch = (e & f) ^ (~e & g);
            const t1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
            const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const t2 = (S0 + maj) >>> 0;
            h = g; g = f; f = e;
            e = (d + t1) >>> 0;
            d = c; c = b; b = a;
            a = (t1 + t2) >>> 0;
        }
        H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
        H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    return H.map((x) => x.toString(16).padStart(8, '0')).join('');
}

/** هش SHA-256 رشته (UTF-8) به‌صورت hex — با WebCrypto در صورت وجود */
export async function sha256(text) {
    const bytes = new TextEncoder().encode(String(text));
    if (globalThis.crypto?.subtle?.digest) {
        try {
            const digest = await crypto.subtle.digest('SHA-256', bytes);
            return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
        } catch (_) { /* در محیط غیر امن به پیاده‌سازی JS برمی‌گردیم */ }
    }
    return sha256Bytes(bytes);
}

export function randomSalt(len = 12) {
    const arr = new Uint8Array(len);
    if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(arr);
    else for (let i = 0; i < len; i++) arr[i] = Math.floor(Math.random() * 256);
    return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password, salt) {
    return sha256(`${salt}::${password}`);
}

/* --------------------------- نقش‌ها و دسترسی --------------------------- */

export const ROLES = ['admin', 'operator', 'accountant'];

export const ROLE_LABELS = { admin: 'مدیر سامانه', operator: 'اپراتور', accountant: 'حسابدار' };

/** سطح دسترسی مورد نیاز برای مدیریت آژانس‌ها */
export const SUPER_ADMIN_ONLY_PAGES = ['agencies'];

/** صفحه‌های مجاز هر نقش (کلیدها همان id بخش‌های SPA هستند) */
export const PAGES_BY_ROLE = {
    admin: [
        'dashboard', 'queue', 'trips-new', 'trips-list', 'drivers', 'addresses', 'subscribers',
        'acc-driver', 'acc-report', 'acc-commissions', 'acc-subscribers', 'acc-payments', 'acc-expenses',
        'reports-operator', 'reports-cancel', 'reports-debtors', 'reports-drivers',
        'journal', 'account-ledger', 'trial', 'pl', 'chart',
        'audit', 'settings', 'operators', 'agencies', 'backup', 'training', 'about'
    ],
    operator: [
        'dashboard', 'queue', 'trips-new', 'trips-list', 'drivers', 'addresses', 'subscribers',
        'acc-subscribers', 'reports-cancel', 'training', 'about'
    ],
    accountant: [
        'dashboard', 'subscribers', 'drivers',
        'acc-driver', 'acc-report', 'acc-commissions', 'acc-subscribers', 'acc-payments', 'acc-expenses',
        'journal', 'account-ledger', 'trial', 'pl', 'chart',
        'reports-operator', 'reports-debtors', 'reports-drivers',
        'backup', 'training', 'about'
    ]
};

/** توانایی‌های ریز (capabilities) */
const CAPS = {
    admin: ['*'],
    operator: ['trip.create', 'trip.edit', 'trip.status', 'trip.cancel', 'trip.assign', 'trip.delete',
        'driver.availability', 'driver.view', 'subscriber.edit', 'subscriber.payment',
        'address.edit', 'queue.manage'],
    accountant: ['subscriber.payment', 'driver.payment', 'expense.edit', 'driver.view',
        'subscriber.edit', 'report.export', 'trip.delete']
};

/** پیش‌فرض رمز کاربران نمونه (کاربر باید آن را تغییر دهد) */
const DEFAULT_PASSWORDS = { admin: 'admin', operator: 'operator123', accountant: 'account123' };

/** توضیح: رمز پیش‌فرض مدیر سامانه طبق درخواست کارفرما «admin» است (نام کاربری: admin). */

/* ------------------------------- هستهٔ Auth ------------------------------- */

let _session = null;

export const Auth = {
    /** راه‌اندازی: ساخت هش رمز کاربران پیش‌فرض در اولین اجرا + بازیابی نشست */
    async init() {
        await Auth.ensurePasswords();
        await Auth.ensureDemoCredentials();
        Auth.ensureSuperAdmin();
        _session = Auth.loadSession();
        if (_session?.agencyId) DB.setScope(_session.agencyId);
        DB.setActor(_session || { fullName: 'سیستم' });
        return _session;
    },

    /**
     * نصب‌های قبلی رمز «admin123» داشتند؛ کاربر خواست رمز پیش‌فرض «admin» باشد.
     * این تابع فقط زمانی رمز را بازنشانی می‌کند که کاربر هنوز رمز پیش‌فرض مدیریتی
     * را تغییر نداده باشد (mustChangePassword) و همان هش قدیمی را داشته باشد.
     */
    /**
     * کاربر «admin» مدیر سامانه است: تنها کسی که می‌تواند آژانس بسازد، اشتراک را
     * تمدید کند و بین آژانس‌ها جابه‌جا شود. برای نصب‌های قبلی هم این پرچم ست می‌شود.
     */
    ensureSuperAdmin() {
        const admin = DB.findGlobal('operators', 'username', 'admin');
        if (!admin) return false;
        const patch = {};
        if (!admin.superAdmin) patch.superAdmin = true;
        if (!admin.agencyId) patch.agencyId = DEFAULT_AGENCY_ID;
        if (Object.keys(patch).length) DB.update('operators', admin.id, patch, { silent: true });
        return true;
    },

    async ensureDemoCredentials() {
        const admin = DB.findGlobal('operators', 'username', 'admin');
        if (!admin || !admin.passwordHash || !admin.mustChangePassword) return false;
        const legacyHash = await hashPassword('admin123', admin.salt || '');
        if (legacyHash !== admin.passwordHash) return false;
        const salt = randomSalt();
        DB.update('operators', admin.id, { salt, passwordHash: await hashPassword(DEFAULT_PASSWORDS.admin, salt) }, { silent: true });
        return true;
    },

    /** اگر کاربری passwordHash ندارد (کاربر پیش‌فرض یا داده مهاجرت‌شده)، رمز پیش‌فرض می‌سازیم */
    async ensurePasswords() {
        const users = DB.list('operators');
        for (const u of users) {
            if (u.passwordHash) continue;
            const salt = randomSalt();
            const plain = DEFAULT_PASSWORDS[u.username] || '12345678';
            const hash = await hashPassword(plain, salt);
            DB.update('operators', u.id, { salt, passwordHash: hash, mustChangePassword: true }, { silent: true });
        }
        if (!users.length) {
            /* ساخت اولین مدیر در صورت خالی بودن */
            const salt = randomSalt();
            DB.insert('operators', {
                fullName: 'مدیر سامانه', username: 'admin', role: 'admin', status: 'active',
                agencyId: DEFAULT_AGENCY_ID, superAdmin: true,
                salt, passwordHash: await hashPassword(DEFAULT_PASSWORDS.admin, salt), mustChangePassword: true,
                notes: 'حساب پیش‌فرض مدیر سامانه'
            }, { silent: true });
        }
    },

    /* ---------- نشست ---------- */
    loadSession() {
        try {
            let raw = localStorage.getItem(SESSION_KEY);
            if (!raw) {
                /* مهاجرت نشست نسخهٔ ۵ به ۶ */
                const legacy = localStorage.getItem(LEGACY_SESSION_KEY);
                if (legacy) {
                    localStorage.setItem(SESSION_KEY, legacy);
                    localStorage.removeItem(LEGACY_SESSION_KEY);
                    raw = legacy;
                }
            }
            if (!raw) return null;
            const s = JSON.parse(raw);
            if (!s?.userId) return null;
            if (s.expiresAt && new Date(s.expiresAt) < new Date()) {
                localStorage.removeItem(SESSION_KEY);
                return null;
            }
            const user = DB.get('operators', s.userId);
            if (!user || user.status !== 'active') return null;
            const agencyId = user.agencyId || DEFAULT_AGENCY_ID;
            DB.setScope(agencyId);
            return { ...s, role: user.role, fullName: user.fullName, agencyId, superAdmin: !!user.superAdmin };
        } catch (_) {
            return null;
        }
    },

    saveSession(user) {
        const expires = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000).toISOString();
        const s = {
            userId: user.id,
            username: user.username,
            fullName: user.fullName,
            role: user.role,
            agencyId: user.agencyId || DEFAULT_AGENCY_ID,
            superAdmin: !!user.superAdmin,
            loginAt: nowISO(),
            expiresAt: expires
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(s));
        _session = s;
        DB.setScope(s.agencyId);
        DB.setActor(s);
        return s;
    },

    current() {
        return _session;
    },

    isLoggedIn() {
        return !!_session;
    },

    role() {
        return _session?.role || '';
    },

    roleLabel() {
        return ROLE_LABELS[_session?.role] || '';
    },

    /* ---------- ورود/خروج ---------- */
    async login(username, password) {
        const uname = String(username || '').trim().toLowerCase();
        if (!uname || !password) throw new Error('نام کاربری و رمز عبور را وارد کنید');
        /* نام کاربری در کل سامانه یکتاست؛ بنابراین جست‌وجو باید بدون فیلتر آژانس باشد */
        const user = DB.findGlobal('operators', 'username', uname);
        if (!user) throw new Error('نام کاربری یا رمز عبور نادرست است');
        if (user.status !== 'active') throw new Error('حساب کاربری غیرفعال است');

        const hash = await hashPassword(password, user.salt || '');
        if (hash !== user.passwordHash) throw new Error('نام کاربری یا رمز عبور نادرست است');

        /* بررسی وضعیت آژانس و اعتبار اشتراک نرم‌افزار (مدیر سامانه مستثنی است) */
        const agencyId = user.agencyId || DEFAULT_AGENCY_ID;
        if (!user.superAdmin) {
            const check = Agency.canLogin(agencyId);
            if (!check.ok) throw new Error(check.message);
        }

        DB.setScope(agencyId);
        DB.update('operators', user.id, { lastLoginAt: nowISO() }, { silent: true });
        Auth.saveSession(user);
        DB.mutate(() => ([{
            action: 'login', entity: 'operators', entityId: user.id,
            newValue: { username: user.username, role: user.role, agencyId }
        }]), {});
        return _session;
    },

    logout({ silent = false } = {}) {
        const s = _session;
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(LEGACY_SESSION_KEY);
        _session = null;
        DB.setScope(null);
        DB.setActor({ fullName: 'سیستم' });
        if (s && !silent) {
            DB.mutate(() => ([{ action: 'logout', entity: 'operators', entityId: s.userId }]), {});
        }
    },

    async changePassword(userId, oldPassword, newPassword) {
        const user = DB.get('operators', userId);
        if (!user) throw new Error('کاربر یافت نشد');
        if (user.passwordHash) {
            const oldHash = await hashPassword(oldPassword, user.salt || '');
            if (oldHash !== user.passwordHash) throw new Error('رمز عبور فعلی نادرست است');
        }
        if (String(newPassword || '').length < 6) throw new Error('رمز جدید باید حداقل ۶ کاراکتر باشد');
        const salt = randomSalt();
        const hash = await hashPassword(newPassword, salt);
        DB.update('operators', userId, { salt, passwordHash: hash, mustChangePassword: false, passwordChangedAt: nowISO() });
        return true;
    },

    async createUser({ fullName, username, password, role = 'operator', phone = '', notes = '', agencyId = null, superAdmin = false, minPassword = 6 }) {
        const uname = String(username || '').trim().toLowerCase();
        if (!fullName || !uname) throw new Error('نام و نام کاربری الزامی است');
        if (!/^[a-z0-9._-]{3,30}$/.test(uname)) throw new Error('نام کاربری باید ۳ تا ۳۰ کاراکتر انگلیسی، عدد یا . _ - باشد');
        /* نام کاربری در کل سامانه یکتاست (ورود فقط با نام کاربری و رمز انجام می‌شود) */
        if (DB.findGlobal('operators', 'username', uname)) throw new Error('این نام کاربری قبلاً ثبت شده است');
        if (String(password || '').length < minPassword) throw new Error(`رمز عبور باید حداقل ${toFa(minPassword)} کاراکتر باشد`);
        if (!ROLES.includes(role)) throw new Error('سطح دسترسی نامعتبر است');
        const targetAgency = agencyId || DB.scope() || DEFAULT_AGENCY_ID;
        if (!Agency.get(targetAgency)) throw new Error('آژانس انتخابی یافت نشد');
        if (!superAdmin) Agency.assertUserQuota(targetAgency);
        const salt = randomSalt();
        const hash = await hashPassword(password, salt);
        return DB.insert('operators', {
            fullName, username: uname, role, phone, notes, status: 'active',
            agencyId: targetAgency, superAdmin: !!superAdmin,
            salt, passwordHash: hash, mustChangePassword: true
        }, `ایجاد کاربر «${uname}» با نقش ${ROLE_LABELS[role] || role}`);
    },

    /* --------------------------- آژانس و کاربران --------------------------- */

    agency() {
        return Agency.current();
    },

    agencyId() {
        return _session?.agencyId || DB.scope() || DEFAULT_AGENCY_ID;
    },

    isSuperAdmin() {
        return !!_session?.superAdmin;
    },

    /** جابه‌جایی آژانس فعال (فقط مدیر سامانه) */
    switchAgency(agencyId) {
        if (!Auth.isSuperAdmin()) throw new Error('فقط مدیر سامانه می‌تواند آژانس فعال را تغییر دهد');
        const a = Agency.get(agencyId);
        if (!a) throw new Error('آژانس یافت نشد');
        Agency.setCurrent(a.id);
        if (_session) {
            _session.agencyId = a.id;
            localStorage.setItem(SESSION_KEY, JSON.stringify(_session));
        }
        return a;
    },

    /** کاربران آژانس فعال (مدیر سامانه می‌تواند همهٔ آژانس‌ها را ببیند) */
    users(agencyId = null) {
        const all = DB.listGlobal('operators').filter((u) => !u.deletedAt);
        const target = agencyId || DB.scope();
        if (!target) return all;
        return all.filter((u) => (u.agencyId || DEFAULT_AGENCY_ID) === target);
    },

    /** صفحه‌های قابل نمایش برای نقش جاری (با در نظر گرفتن مدیر سامانه) */
    pages() {
        const pages = (PAGES_BY_ROLE[Auth.role()] || []).slice();
        if (pages.includes('agencies') && !Auth.isSuperAdmin()) {
            return pages.filter((p) => p !== 'agencies');
        }
        return pages;
    },

    can(cap) {
        const role = Auth.role();
        if (!role) return false;
        const caps = CAPS[role] || [];
        return caps.includes('*') || caps.includes(cap);
    },

    canAccess(pageId) {
        const role = Auth.role();
        if (!role) return false;
        return Auth.pages().includes(pageId);
    },

    /* ---------- شیفت ---------- */
    currentShift() {
        if (!_session) return null;
        const s = DB.list('shifts').find((x) => x.operatorId === _session.userId && x.status === 'open');
        /* کلون برمی‌گردانیم تا دست‌کاری تصادفی خارج از mutateDB رخ ندهد */
        return s ? { ...s } : null;
    },

    hasOpenShift() {
        return !!Auth.currentShift();
    },

    openShift({ openingCash = 0, notes = '' } = {}) {
        if (!_session) throw new Error('ابتدا وارد سامانه شوید');
        if (Auth.hasOpenShift()) throw new Error('یک شیفت باز دارید؛ ابتدا آن را ببندید');
        const seq = DB.nextSequence('shift');
        const shift = DB.insert('shifts', {
            code: 'SH-' + String(seq).padStart(4, '0'),
            operatorId: _session.userId,
            operatorName: _session.fullName,
            date: todayJalali(),
            startTime: nowISO(),
            endTime: '',
            openingCash: Number(openingCash) || 0,
            closingCash: null,
            status: 'open',
            notes
        });
        return shift;
    },

    closeShift({ closingCash = 0, notes = '' } = {}) {
        const shift = Auth.currentShift();
        if (!shift) throw new Error('شیفت بازی برای بستن وجود ندارد');
        const stats = Auth.shiftStats(shift);
        DB.update('shifts', shift.id, {
            endTime: nowISO(),
            closingCash: Number(closingCash) || 0,
            status: 'closed',
            notes: notes ? `${shift.notes ? shift.notes + ' | ' : ''}${notes}` : shift.notes,
            stats
        }, `شیفت ${shift.code} بسته شد`);
        return { ...(DB.get('shifts', shift.id) || shift), stats };
    },

    /** آمار یک شیفت: تعداد سفر، درآمد نقدی، لغوها */
    shiftStats(shift) {
        const start = new Date(shift.startTime).getTime();
        const end = shift.endTime ? new Date(shift.endTime).getTime() : Date.now();
        const trips = DB.list('trips').filter((t) => {
            const ts = new Date(t.pickupTime || t.createdAt || 0).getTime();
            const byOperator = t.operatorId ? t.operatorId === shift.operatorId : true;
            return byOperator && ts >= start && ts <= end;
        });
        const completed = trips.filter((t) => t.status === 'completed');
        const cash = completed.filter((t) => t.paymentMethod === 'cash').reduce((s, t) => s + (t.fare || 0), 0);
        const commission = completed.reduce((s, t) => s + (t.commission || 0), 0);
        return {
            tripsCount: trips.length,
            completedCount: completed.length,
            cancelledCount: trips.filter((t) => t.status === 'cancelled').length,
            pendingCount: trips.filter((t) => t.status === 'pending').length,
            cashIncome: cash,
            commission,
            fareSum: sum(completed, (t) => t.fare)
        };
    },

    shiftSummaryText(shift) {
        const s = shift.stats || Auth.shiftStats(shift);
        return `سفر: ${toFa(s.tripsCount)} | تکمیل: ${toFa(s.completedCount)} | لغو: ${toFa(s.cancelledCount)}`;
    }
};

export default Auth;
