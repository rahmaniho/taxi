/* ==========================================================================
 * js/ledger.js — موتور حسابداری دوطرفه (دفتر روزنامه، تراز، سود و زیان، معین)
 * --------------------------------------------------------------------------
 * چرا حسابداری دوطرفه؟
 *   کاربر «حسابداری پیشرفته» خواست. حسابداری تک‌طرفهٔ قبلی (فقط جمع درآمد و
 *   هزینه) برای گزارش‌های مالی کافی نیست؛ این ماژول دفتر روزنامهٔ استاندارد
 *   (بدهکار = بستانکار در هر سند) + تراز آزمایشی + صورت سود و زیان + دفتر معین
 *   را اضافه می‌کند و اسناد سفرها/پرداخت‌ها/هزینه‌ها را خودکار ثبت می‌کند.
 *
 * قواعد ثبت خودکار (همه به‌صورت سند متوازن):
 *   • سفر تکمیل‌شده (نقدی):    بدهکار صندوق ۱۰۰۰ = جمع کرایه
 *                              بستانکار درآمد کمیسیون ۴۰۰۰ = کمیسیون
 *                              بستانکار پرداختنی رانندگان ۲۰۰۰ = سهم راننده
 *   • سفر تکمیل‌شده (حقوقی):   بدهکار دریافتنی مشترکین ۱۰۲۰ + همان دو بستانکار
 *   • دریافت از مشترک:         بدهکار صندوق/بانک = بستانکار دریافتنی مشترکین
 *   • تسویه با راننده:         بدهکار پرداختنی رانندگان = بستانکار صندوق
 *   • هزینهٔ جانبی:            بدهکار حساب هزینهٔ مربوطه = بستانکار صندوق
 * ========================================================================== */

import { DB } from './db.js';
import { todayJalali, isoToJalaliKey, addJalaliDays, sum, formatNumber, toFa, uid } from './utils.js';

/* ------------------------------ نقشهٔ حساب‌ها ------------------------------ */

export const ACCOUNT_MAP = {
    cash: '1000',
    bank: '1010',
    subscriberReceivable: '1020',
    driverReceivable: '1030',
    driverPayable: '2000',
    vat: '2010',
    capital: '3000',
    ownerDraw: '3010',
    commissionIncome: '4000',
    subscriptionIncome: '4010',
    otherIncome: '4020',
    defaultExpense: '5050'
};

/** نگاشت کلیدواژهٔ دستهٔ هزینه به کد حساب */
const EXPENSE_KEYWORDS = [
    [/حقوق|دستمزد|پرسنل/, '5000'],
    [/اجاره/, '5010'],
    [/آب|برق|گاز|اینترنت|تلفن|شارژ/, '5020'],
    [/تعمیر|نگهداری|سرویس|لاستیک/, '5030'],
    [/سوخت|بنزین|گازوئیل|CNG/i, '5040'],
    [/تبلیغ|بازاریابی|رپورتاژ/, '5060'],
    [/مالیات|عوارض/, '2010']
];

export function expenseAccountCode(category) {
    const text = String(category || '').trim();
    for (const [re, code] of EXPENSE_KEYWORDS) if (re.test(text)) return code;
    return ACCOUNT_MAP.defaultExpense;
}

export const ACCOUNT_TYPE_LABELS = { asset: 'دارایی', liability: 'بدهی', equity: 'سرمایه', income: 'درآمد', expense: 'هزینه' };
/** ماهیت حساب: بدهکار (D) یا بستانکار (C) */
export const ACCOUNT_NATURE = { asset: 'D', expense: 'D', liability: 'C', equity: 'C', income: 'C' };

const PAYMENT_ACCOUNTS = { cash: ACCOUNT_MAP.cash, card: ACCOUNT_MAP.bank, online: ACCOUNT_MAP.bank, transfer: ACCOUNT_MAP.bank };

/* --------------------------------- حساب‌ها -------------------------------- */

export const Accounts = {
    all() {
        return DB.list('accounts').sort((a, b) => String(a.code).localeCompare(String(b.code)));
    },

    active() {
        return Accounts.all().filter((a) => a.isActive !== false);
    },

    get(code) {
        return DB.findByScoped('accounts', 'code', String(code)) || DB.findBy('accounts', 'code', String(code)) || null;
    },

    byType(type) {
        return Accounts.all().filter((a) => a.type === type);
    },

    /** اطمینان از وجود کدینگ پیش‌فرض (در اولین اجرا یا پس از بازیابی نسخهٔ قدیمی) */
    ensureChart() {
        const chart = Accounts.all();
        if (chart.length) return chart;
        DB.insert('accounts', { code: ACCOUNT_MAP.cash, name: 'صندوق', type: 'asset', group: 'نقد و بانک', isActive: true }, { silent: true, note: 'ایجاد کدینگ حساب‌ها' });
        return Accounts.all();
    },

    create({ code, name, type, group = '', notes = '' }) {
        const cleanCode = String(code || '').trim();
        if (!/^\d{3,6}$/.test(cleanCode)) throw new Error('کد حساب باید عددی و بین ۳ تا ۶ رقم باشد');
        if (!String(name || '').trim()) throw new Error('نام حساب الزامی است');
        if (!ACCOUNT_TYPE_LABELS[type]) throw new Error('نوع حساب نامعتبر است');
        if (Accounts.get(cleanCode)) throw new Error('این کد حساب قبلاً ثبت شده است');
        return DB.insert('accounts', {
            code: cleanCode, name: String(name).trim(), type, group: String(group || '').trim(),
            notes: String(notes || ''), isActive: true
        }, `ایجاد حساب «${cleanCode} — ${name}»`);
    },

    update(id, patch) {
        const acc = DB.get('accounts', id);
        if (!acc) throw new Error('حساب یافت نشد');
        if (patch.type && !ACCOUNT_TYPE_LABELS[patch.type]) throw new Error('نوع حساب نامعتبر است');
        if (patch.code && patch.code !== acc.code) {
            if (!/^\d{3,6}$/.test(String(patch.code))) throw new Error('کد حساب باید عددی باشد');
            if (Accounts.get(patch.code)) throw new Error('این کد حساب قبلاً ثبت شده است');
            const used = Accounts.usage(acc.code);
            if (used) throw new Error(`این حساب در ${toFa(used)} سند استفاده شده است؛ کد آن قابل تغییر نیست`);
        }
        return DB.update('accounts', id, patch, `ویرایش حساب «${acc.code}»`);
    },

    /** تعداد سطرهای اسنادی که این حساب در آن‌ها آمده است */
    usage(code) {
        return DB.list('journals').reduce((n, j) => n + (j.lines || []).filter((l) => l.accountCode === code).length, 0);
    },

    remove(id) {
        const acc = DB.get('accounts', id);
        if (!acc) throw new Error('حساب یافت نشد');
        const used = Accounts.usage(acc.code);
        if (used) throw new Error(`این حساب در ${toFa(used)} سند استفاده شده است و حذف نمی‌شود؛ می‌توانید آن را غیرفعال کنید`);
        return DB.remove('accounts', id, `حذف حساب «${acc.code}»`);
    },

    /** مانده حساب (بدهکار − بستانکار) تا تاریخ مشخص */
    balance(code, { to = '' } = {}) {
        const rows = DB.list('journals').filter((j) => !to || j.date <= to);
        let debit = 0, credit = 0;
        rows.forEach((j) => (j.lines || []).forEach((l) => {
            if (l.accountCode !== code) return;
            debit += Number(l.debit) || 0;
            credit += Number(l.credit) || 0;
        }));
        return { debit, credit, balance: debit - credit };
    }
};

/* ------------------------------ دفتر روزنامه ------------------------------ */

export const Journals = {
    all() {
        return DB.list('journals').slice().sort((a, b) =>
            String(b.date).localeCompare(String(a.date)) || String(b.number).localeCompare(String(a.number)));
    },

    get(id) {
        return DB.get('journals', id);
    },

    /** جمع بدهکار/بستانکار یک مجموعه سطر */
    totals(lines) {
        return {
            debit: sum(lines, (l) => Number(l.debit) || 0),
            credit: sum(lines, (l) => Number(l.credit) || 0)
        };
    },

    /** اعتبارسنجی سند متوازن؛ در صورت اشکال، خطای فارسی پرتاب می‌کند */
    validate(lines) {
        const rows = (lines || []).filter((l) => l && (Number(l.debit) || Number(l.credit)));
        if (rows.length < 2) throw new Error('هر سند باید حداقل دو سطر (بدهکار و بستانکار) داشته باشد');
        rows.forEach((l, i) => {
            const debit = Number(l.debit) || 0;
            const credit = Number(l.credit) || 0;
            if (!l.accountCode) throw new Error(`حساب سطر ${toFa(i + 1)} انتخاب نشده است`);
            if (!Accounts.get(l.accountCode)) throw new Error(`حساب سطر ${toFa(i + 1)} در کدینگ وجود ندارد`);
            if (debit < 0 || credit < 0) throw new Error('مبالغ بدهکار/بستانکار نمی‌توانند منفی باشند');
            if (debit > 0 && credit > 0) throw new Error(`سطر ${toFa(i + 1)} نمی‌تواند هم بدهکار و هم بستانکار باشد`);
            if (!debit && !credit) throw new Error(`مبلغ سطر ${toFa(i + 1)} وارد نشده است`);
        });
        const { debit, credit } = Journals.totals(rows);
        if (debit !== credit) {
            throw new Error(`سند متوازن نیست: جمع بدهکار ${formatNumber(debit)} و جمع بستانکار ${formatNumber(credit)} تومان است`);
        }
        if (debit === 0) throw new Error('جمع مبالغ سند باید بزرگ‌تر از صفر باشد');
        return true;
    },

    /** سند ثبت‌شده برای یک مرجع (سفر/پرداخت/هزینه) */
    findRef(refType, refId) {
        if (!refType || !refId) return null;
        return DB.list('journals').find((j) => j.refType === refType && j.refId === refId) || null;
    },

    /**
     * ثبت سند جدید
     * @param {{date?:string, description:string, lines:Array, refType?:string, refId?:string, auto?:boolean}} cfg
     */
    create({ date = '', description = '', lines = [], refType = 'manual', refId = '', auto = false, silent = false }) {
        const cleanLines = (lines || [])
            .filter((l) => l && l.accountCode)
            .map((l) => {
                const acc = Accounts.get(l.accountCode);
                return {
                    accountCode: l.accountCode,
                    accountName: acc?.name || l.accountName || '',
                    debit: Number(l.debit) || 0,
                    credit: Number(l.credit) || 0,
                    description: String(l.description || '').trim()
                };
            });
        Journals.validate(cleanLines);
        const seq = DB.nextSequence('journal');
        const rec = {
            number: 'JV-' + String(seq).padStart(4, '0'),
            date: date || todayJalali(),
            description: String(description || '').trim() || 'سند بدون شرح',
            refType, refId,
            lines: cleanLines,
            status: 'posted',
            auto: !!auto,
            createdAt: new Date().toISOString()
        };
        return DB.insert('journals', rec, { silent: silent || auto, note: `${auto ? 'ثبت خودکار' : 'ثبت'} سند حسابداری ${rec.number}` });
    },

    remove(id) {
        const j = Journals.get(id);
        if (!j) throw new Error('سند یافت نشد');
        return DB.remove('journals', id, `حذف سند حسابداری ${j.number}`);
    },

    /** اسناد یک بازهٔ شمسی */
    inRange(from = '', to = '') {
        return Journals.all().filter((j) => (!from || j.date >= from) && (!to || j.date <= to));
    },

    /* ------------------------------ گزارش‌ها ------------------------------ */

    /** تراز آزمایشی */
    trialBalance({ from = '', to = '' } = {}) {
        const map = new Map();
        Accounts.all().forEach((a) => map.set(a.code, {
            code: a.code, name: a.name, type: a.type, group: a.group || '',
            debit: 0, credit: 0
        }));
        Journals.inRange(from, to).forEach((j) => (j.lines || []).forEach((l) => {
            if (!map.has(l.accountCode)) {
                map.set(l.accountCode, { code: l.accountCode, name: l.accountName || '—', type: 'asset', group: '', debit: 0, credit: 0 });
            }
            const row = map.get(l.accountCode);
            row.debit += Number(l.debit) || 0;
            row.credit += Number(l.credit) || 0;
        }));
        const rows = Array.from(map.values())
            .filter((r) => r.debit || r.credit)
            .map((r) => ({ ...r, balance: r.debit - r.credit, nature: ACCOUNT_NATURE[r.type] || 'D' }))
            .sort((a, b) => String(a.code).localeCompare(String(b.code)));
        const totalDebit = sum(rows, (r) => r.debit);
        const totalCredit = sum(rows, (r) => r.credit);
        return { rows, totalDebit, totalCredit, balanced: totalDebit === totalCredit, from, to };
    },

    /** صورت سود و زیان دوره */
    incomeStatement({ from = '', to = '' } = {}) {
        const tb = Journals.trialBalance({ from, to });
        const incomes = tb.rows
            .filter((r) => r.type === 'income')
            .map((r) => ({ code: r.code, name: r.name, amount: r.credit - r.debit }));
        const expenses = tb.rows
            .filter((r) => r.type === 'expense')
            .map((r) => ({ code: r.code, name: r.name, amount: r.debit - r.credit }));
        const totalIncome = sum(incomes, (r) => r.amount);
        const totalExpense = sum(expenses, (r) => r.amount);
        return { incomes, expenses, totalIncome, totalExpense, profit: totalIncome - totalExpense, from, to };
    },

    /** ترازنامه تا تاریخ مشخص */
    balanceSheet({ to = '' } = {}) {
        const tb = Journals.trialBalance({ to });
        const pick = (type, pickSide) => tb.rows.filter((r) => r.type === type).map((r) => ({
            code: r.code, name: r.name,
            balance: pickSide === 'D' ? r.debit - r.credit : r.credit - r.debit
        }));
        const assets = pick('asset', 'D');
        const liabilities = pick('liability', 'C');
        const equity = pick('equity', 'C');
        const profit = Journals.incomeStatement({ to }).profit;
        const totalAssets = sum(assets, (r) => r.balance);
        const totalLiabilities = sum(liabilities, (r) => r.balance);
        const totalEquity = sum(equity, (r) => r.balance) + profit;
        return { assets, liabilities, equity, profit, totalAssets, totalLiabilities, totalEquity, balanced: totalAssets === totalLiabilities + totalEquity, to };
    },

    /** دفتر معین یک حساب با ماندهٔ جاری */
    accountLedger(code, { from = '', to = '' } = {}) {
        const acc = Accounts.get(code);
        if (!acc) throw new Error('حساب یافت نشد');
        const all = Journals.all().filter((j) => !to || j.date <= to).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
        let opening = 0;
        const rows = [];
        let balance = 0;
        all.forEach((j) => {
            const lines = (j.lines || []).filter((l) => l.accountCode === code);
            if (!lines.length) return;
            const debit = sum(lines, (l) => Number(l.debit) || 0);
            const credit = sum(lines, (l) => Number(l.credit) || 0);
            if (from && j.date < from) { opening += debit - credit; balance += debit - credit; return; }
            balance += debit - credit;
            rows.push({ id: j.id, date: j.date, number: j.number, description: j.description, debit, credit, balance });
        });
        const totalDebit = sum(rows, (r) => r.debit);
        const totalCredit = sum(rows, (r) => r.credit);
        return { account: acc, opening, rows, totalDebit, totalCredit, closing: opening + totalDebit - totalCredit, from, to };
    },

    /* --------------------------- ثبت خودکار اسناد --------------------------- */

    /** سند سفر تکمیل‌شده */
    postTrip(trip) {
        if (!trip || trip.status !== 'completed') return null;
        if (Journals.findRef('trip', trip.id)) return null;
        const fare = Number(trip.fare) || 0;
        const commission = Number(trip.commission) || 0;
        const driverShare = Number(trip.driverShare ?? (fare - commission)) || 0;
        if (!fare) return null;
        const corporate = trip.billedTo === 'company';
        const lines = [
            {
                accountCode: corporate ? ACCOUNT_MAP.subscriberReceivable : ACCOUNT_MAP.cash,
                debit: fare, credit: 0,
                description: corporate ? 'بدهی مشترک بابت سفر' : 'دریافت نقدی کرایه'
            },
            { accountCode: ACCOUNT_MAP.commissionIncome, debit: 0, credit: commission, description: 'درآمد کمیسیون آژانس' }
        ];
        if (driverShare > 0) lines.push({ accountCode: ACCOUNT_MAP.driverPayable, debit: 0, credit: driverShare, description: 'سهم راننده از کرایه' });
        const balanced = Journals.totals(lines);
        if (balanced.debit !== balanced.credit) {
            /* اختلاف (مثلاً سفر با تخفیف): مابه‌التفاوت به درآمد متفرقه می‌رود تا سند متوازن بماند */
            lines.push({ accountCode: ACCOUNT_MAP.otherIncome, debit: 0, credit: balanced.debit - balanced.credit, description: 'تعدیل کرایه' });
        }
        return Journals.create({
            date: isoToJalaliKey(trip.pickupTime || trip.createdAt || todayJalali()),
            description: `سفر ${trip.code || ''} ${corporate ? '(حقوقی)' : '(نقدی)'} — ${trip.subscriberName || 'مسافر'}`.trim(),
            lines, refType: 'trip', refId: trip.id, auto: true
        });
    },

    /** سند دریافت از مشترک */
    postSubscriberPayment(p) {
        if (!p || Journals.findRef('subscriberPayment', p.id)) return null;
        const amount = Number(p.amount) || 0;
        if (!amount) return null;
        const sub = DB.get('subscribers', p.subscriberId);
        return Journals.create({
            date: p.date || todayJalali(),
            description: `دریافت از مشترک ${sub?.fullName || ''}${p.receiptNo ? ' — رسید ' + p.receiptNo : ''}`.trim(),
            lines: [
                { accountCode: PAYMENT_ACCOUNTS[p.method] || ACCOUNT_MAP.cash, debit: amount, credit: 0, description: 'دریافت وجه' },
                { accountCode: ACCOUNT_MAP.subscriberReceivable, debit: 0, credit: amount, description: 'کاهش بدهی مشترک' }
            ],
            refType: 'subscriberPayment', refId: p.id, auto: true
        });
    },

    /** سند تسویه با راننده */
    postDriverPayment(p) {
        if (!p || Journals.findRef('driverPayment', p.id)) return null;
        const amount = Number(p.amount) || 0;
        if (!amount) return null;
        const driver = DB.get('drivers', p.driverId);
        return Journals.create({
            date: p.date || todayJalali(),
            description: `تسویه با راننده ${driver?.fullName || ''}${p.notes ? ' — ' + p.notes : ''}`.trim(),
            lines: [
                { accountCode: ACCOUNT_MAP.driverPayable, debit: amount, credit: 0, description: 'کاهش بدهی به راننده' },
                { accountCode: PAYMENT_ACCOUNTS[p.method] || ACCOUNT_MAP.cash, debit: 0, credit: amount, description: 'پرداخت وجه' }
            ],
            refType: 'driverPayment', refId: p.id, auto: true
        });
    },

    /** سند هزینهٔ جانبی */
    postExpense(e) {
        if (!e || Journals.findRef('expense', e.id)) return null;
        const amount = Number(e.amount) || 0;
        if (!amount) return null;
        return Journals.create({
            date: e.date || todayJalali(),
            description: `هزینه ${e.category || 'متفرقه'}${e.description ? ' — ' + e.description : ''}`,
            lines: [
                { accountCode: expenseAccountCode(e.category), debit: amount, credit: 0, description: e.description || e.category || 'هزینه' },
                { accountCode: ACCOUNT_MAP.cash, debit: 0, credit: amount, description: 'پرداخت هزینه' }
            ],
            refType: 'expense', refId: e.id, auto: true
        });
    },

    /** سند دستی برای هر رکورد بر اساس نوع آن (استفاده در قلاب نوشتن) */
    autoPostDescriptor(d) {
        if (!d || !d.entityId) return null;
        const row = DB.raw()?.[d.entity]?.find((r) => r.id === d.entityId);
        if (!row || row.deletedAt) return null;
        switch (d.entity) {
            case 'trips': return row.status === 'completed' ? Journals.postTrip(row) : null;
            case 'subscriberPayments': return d.action === 'create' ? Journals.postSubscriberPayment(row) : null;
            case 'driverPayments': return d.action === 'create' ? Journals.postDriverPayment(row) : null;
            case 'expenses': return d.action === 'create' ? Journals.postExpense(row) : null;
            default: return null;
        }
    },

    /* --------------------------- وضعیت و تکمیل --------------------------- */

    /** مقایسهٔ دادهٔ عملیاتی با اسناد ثبت‌شده (برای دکمهٔ «تولید اسناد از دادهٔ موجود») */
    coverage() {
        const completed = DB.list('trips').filter((t) => t.status === 'completed' && (Number(t.fare) || 0) > 0);
        const subs = DB.list('subscriberPayments');
        const drivers = DB.list('driverPayments');
        const expenses = DB.list('expenses');
        const posted = DB.list('journals');
        const has = (type, id) => posted.some((j) => j.refType === type && j.refId === id);
        return {
            trips: { total: completed.length, posted: completed.filter((t) => has('trip', t.id)).length },
            subscriberPayments: { total: subs.length, posted: subs.filter((p) => has('subscriberPayment', p.id)).length },
            driverPayments: { total: drivers.length, posted: drivers.filter((p) => has('driverPayment', p.id)).length },
            expenses: { total: expenses.length, posted: expenses.filter((e) => has('expense', e.id)).length },
            journals: posted.length
        };
    },

    /** تولید اسناد برای همهٔ رکوردهای بدون سند (idempotent) */
    backfill({ from = '' } = {}) {
        const created = { trips: 0, subscriberPayments: 0, driverPayments: 0, expenses: 0 };
        DB.list('trips')
            .filter((t) => t.status === 'completed' && (Number(t.fare) || 0) > 0)
            .filter((t) => !from || isoToJalaliKey(t.pickupTime || t.createdAt) >= from)
            .forEach((t) => { if (Journals.postTrip(t)) created.trips++; });
        DB.list('subscriberPayments').forEach((p) => { if (Journals.postSubscriberPayment(p)) created.subscriberPayments++; });
        DB.list('driverPayments').forEach((p) => { if (Journals.postDriverPayment(p)) created.driverPayments++; });
        DB.list('expenses').forEach((e) => { if (Journals.postExpense(e)) created.expenses++; });
        return created;
    },

    /** خلاصهٔ یک بازه برای داشبورد/صورت سود و زیان */
    summary({ from = '', to = '' } = {}) {
        const pl = Journals.incomeStatement({ from, to });
        const entries = Journals.inRange(from, to);
        return { ...pl, entries: entries.length, lastEntry: entries[0]?.date || '' };
    },

    /** ماندهٔ حساب‌های اصلی برای کارت‌های داشبورد */
    keyBalances({ to = '' } = {}) {
        const codes = [ACCOUNT_MAP.cash, ACCOUNT_MAP.bank, ACCOUNT_MAP.subscriberReceivable, ACCOUNT_MAP.driverPayable];
        const out = {};
        codes.forEach((c) => { out[c] = Accounts.balance(c, { to }); });
        return out;
    }
};

/* --------------------------- قلاب ثبت خودکار --------------------------- */

let _posting = false;
let _registered = false;

/**
 * فعال‌سازی ثبت خودکار اسناد. یک بار در راه‌اندازی برنامه صدا زده می‌شود.
 * حلقهٔ بازگشتی ندارد چون سندهای خودکار در مجموعهٔ journals نوشته می‌شوند و
 * آن مجموعه در قلاب نادیده گرفته می‌شود.
 */
export function registerLedgerAutoPosting() {
    if (_registered) return false;
    _registered = true;
    Accounts.ensureChart();
    DB.onWrite((descriptors) => {
        if (_posting || !DB.isReady()) return;
        const relevant = (descriptors || []).filter((d) =>
            ['trips', 'subscriberPayments', 'driverPayments', 'expenses'].includes(d.entity));
        if (!relevant.length) return;
        _posting = true;
        try {
            relevant.forEach((d) => { Journals.autoPostDescriptor(d); });
        } finally {
            _posting = false;
        }
    });
    return true;
}

export const Ledger = { Accounts, Journals, registerLedgerAutoPosting, ACCOUNT_MAP, ACCOUNT_TYPE_LABELS, expenseAccountCode };

export default Ledger;
