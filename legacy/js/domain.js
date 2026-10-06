/* ==========================================================================
 * js/domain.js — منطق کسب‌وکار (فارغ از DOM)
 * --------------------------------------------------------------------------
 * همهٔ قواعد تاکسی تلفنی اینجا متمرکز است تا صفحات فقط «نمایش» باشند:
 * محاسبه کرایه پلکانی، چرخهٔ وضعیت سفر، وضعیت آنی راننده، بدهی مشترکین،
 * تسویه راننده (تفکیک طلب آژانس/راننده)، گزارش‌ها و هشدارها.
 * ========================================================================== */

import { DB } from './db.js';
import {
    uid, todayJalali, nowISO, isoToJalaliKey, jalaliDateWithTime, calculateFare, isHolidayKey,
    diffJalaliDays, sum, groupBy, addJalaliDays, minutesBetween, normalizeJalaliKey
} from './utils.js';

/* ============================ کرایه ============================ */

export function fareFor(distance, timeISO, { holiday } = {}) {
    const s = DB.settings();
    const key = isoToJalaliKey(timeISO || nowISO());
    const isHoliday = holiday !== undefined ? holiday : isHolidayKey(key, s);
    return calculateFare(distance, timeISO || nowISO(), isHoliday, s);
}

/* ============================ رانندگان ============================ */

export const Drivers = {
    all() {
        return DB.list('drivers');
    },

    active() {
        return DB.list('drivers').filter((d) => d.status === 'active');
    },

    vehicleOf(driverId) {
        return DB.list('vehicles').find((v) => v.driverId === driverId && v.status !== 'inRepair') ||
            DB.list('vehicles').find((v) => v.driverId === driverId) || null;
    },

    /** تعداد سفر امروز راننده (برای مرتب‌سازی تخصیص) */
    todayTripCount(driverId) {
        const today = todayJalali();
        return DB.list('trips').filter((t) => t.driverId === driverId &&
            isoToJalaliKey(t.pickupTime) === today && t.status !== 'cancelled').length;
    },

    /** رانندگان آزاد: مرتب بر اساس تعداد سفر امروز (کمتر اول) و سپس امتیاز */
    free({ includeBusy = false } = {}) {
        return Drivers.active()
            .filter((d) => d.availability === 'available' || (includeBusy && d.availability === 'busy'))
            .map((d) => ({
                ...d,
                todayTrips: Drivers.todayTripCount(d.id),
                score: (Number(d.rating) || 4) * 10 - Drivers.todayTripCount(d.id)
            }))
            .sort((a, b) => (a.todayTrips - b.todayTrips) || (Number(b.rating || 0) - Number(a.rating || 0)));
    },

    setAvailability(driverId, availability) {
        const allowed = ['available', 'busy', 'offline', 'rest'];
        if (!allowed.includes(availability)) throw new Error('وضعیت راننده نامعتبر است');
        return DB.update('drivers', driverId, { availability, availabilityChangedAt: nowISO() });
    },

    /** چرخش وضعیت با کلیک روی نشان */
    cycleAvailability(driverId) {
        const d = DB.get('drivers', driverId);
        if (!d) throw new Error('راننده یافت نشد');
        const order = ['available', 'busy', 'rest', 'offline'];
        const next = order[(order.indexOf(d.availability || 'offline') + 1) % order.length];
        Drivers.setAvailability(driverId, next);
        return next;
    },

    /**
     * صورت‌حساب راننده با تفکیک دقیق دو طرف
     *  - طلب آژانس از راننده: کمیسیون سفرهای نقدی − تسویه‌های نقدی راننده
     *  - طلب راننده از آژانس: سهم راننده از سفرهای حقوقی − پرداخت‌های انجام‌شده
     *  - مانده قابل پرداخت: خالص (اگر مثبت باشد آژانس بدهکار است)
     */
    statement(driverId, from = '', to = '') {
        const driver = DB.get('drivers', driverId);
        if (!driver) return null;
        const all = DB.list('trips').filter((t) => t.driverId === driverId && t.status === 'completed');
        const trips = all.filter((t) => {
            const k = isoToJalaliKey(t.pickupTime);
            if (from && k < from) return false;
            if (to && k > to) return false;
            return true;
        });

        const cashTrips = trips.filter((t) => t.billedTo !== 'company');
        const corporateTrips = trips.filter((t) => t.billedTo === 'company');

        const totalFare = sum(trips, (t) => t.fare);
        const totalCommission = sum(trips, (t) => t.commission);
        const totalShare = sum(trips, (t) => t.driverShare);
        const commissionFromCash = sum(cashTrips, (t) => t.commission);
        const corporateShare = sum(corporateTrips, (t) => t.driverShare);
        const corporateFare = sum(corporateTrips, (t) => t.fare);

        const payments = DB.list('driverPayments').filter((p) => {
            if (p.driverId !== driverId) return false;
            if (from && p.date && p.date < from) return false;
            if (to && p.date && p.date > to) return false;
            return true;
        });
        const payouts = sum(payments.filter((p) => (p.kind || 'payout') === 'payout'), (p) => p.amount);
        const settlements = sum(payments.filter((p) => p.kind === 'settle'), (p) => p.amount);

        const agencyClaim = Math.max(0, commissionFromCash - settlements);
        const driverClaim = Math.max(0, corporateShare - payouts);
        const net = driverClaim - agencyClaim;

        /* تفکیک بر اساس شرکت */
        const companyGroups = Object.entries(groupBy(corporateTrips, (t) => t.companyId || t.subscriberName || 'سایر'))
            .map(([name, list]) => ({
                name,
                count: list.length,
                fare: sum(list, (t) => t.fare),
                share: sum(list, (t) => t.driverShare),
                commission: sum(list, (t) => t.commission)
            }))
            .sort((a, b) => b.share - a.share);

        return {
            driver,
            trips,
            cashTrips,
            corporateTrips,
            totalFare,
            totalCommission,
            totalShare,
            commissionFromCash,
            corporateShare,
            corporateFare,
            payments,
            payouts,
            settlements,
            agencyClaim,
            driverClaim,
            net,
            payable: net > 0 ? net : 0,
            receivableFromDriver: net < 0 ? -net : 0,
            companyGroups,
            from: from || '',
            to: to || ''
        };
    },

    /** راننده‌هایی که در بازه ۳۰ روز گذشته کم‌کار/پرکار بوده‌اند */
    activity(days = 30) {
        const from = addJalaliDays(todayJalali(), -days + 1);
        return DB.list('drivers').map((d) => {
            const trips = DB.list('trips').filter((t) => t.driverId === d.id && t.status === 'completed' &&
                isoToJalaliKey(t.pickupTime) >= from);
            return {
                driver: d,
                tripCount: trips.length,
                fare: sum(trips, (t) => t.fare),
                share: sum(trips, (t) => t.driverShare),
                commission: sum(trips, (t) => t.commission),
                rating: Number(d.rating) || 0,
                availability: d.availability,
                avgFare: trips.length ? Math.round(sum(trips, (t) => t.fare) / trips.length) : 0
            };
        });
    }
};

/* ============================ سفرها ============================ */

const AUTO_RELEASE = true; // آزادسازی خودکار راننده پس از تکمیل/لغو

export const Trips = {
    all() {
        return DB.list('trips');
    },

    pendingQueue() {
        return DB.list('trips')
            .filter((t) => t.status === 'pending')
            .map((t) => ({ ...t, waitMinutes: minutesBetween(t.createdAt || t.pickupTime, nowISO()) }))
            .sort((a, b) => {
                /* اولویت: فوری قبل از رزرو، سپس FIFO */
                const pa = a.priority === 'urgent' ? 0 : 1;
                const pb = b.priority === 'urgent' ? 0 : 1;
                if (pa !== pb) return pa - pb;
                return new Date(a.createdAt || a.pickupTime) - new Date(b.createdAt || b.pickupTime);
            });
    },

    byDriver(driverId) {
        return DB.list('trips').filter((t) => t.driverId === driverId);
    },

    nextCode() {
        const seq = DB.nextSequence('trip');
        return 'T' + String(seq).padStart(5, '0');
    },

    /**
     * ثبت سفر جدید
     * @param {object} payload
     *  subscriberId, subscriberName, subscriberPhone, pickupAddress, dropoffAddress,
     *  tripDate (کلید شمسی), pickupTime (ISO اختیاری), dropoffTime (ISO اختیاری),
     *  distance, fare, paymentMethod, billedTo, companyId, priority, status,
     *  driverId, vehicleId, isPaid, notes, operatorId
     */
    create(payload = {}) {
        const s = DB.settings();
        const dateKey = normalizeJalaliKey(payload.tripDate) || todayJalali();
        const pickupISO = payload.pickupTime || jalaliDateWithTime(dateKey);
        const distance = Number(payload.distance) || 0;
        const breakdown = payload.fare ? null : fareFor(distance, pickupISO);
        const fare = Number(payload.fare) || breakdown?.fare || 0;
        if (fare <= 0) throw new Error('کرایه باید بزرگ‌تر از صفر باشد');

        const driver = payload.driverId ? DB.get('drivers', payload.driverId) : null;
        const commissionRate = driver ? (Number(driver.commissionRate) || s.commissionDefault) : s.commissionDefault;
        const commission = Math.round(fare * (commissionRate / 100));

        let vehicleId = payload.vehicleId || '';
        if (!vehicleId && driver) vehicleId = Drivers.vehicleOf(driver.id)?.id || '';

        const operatorId = payload.operatorId || '';
        const trip = {
            id: uid('trp'),
            code: Trips.nextCode(),
            operatorId,
            driverId: payload.driverId || '',
            vehicleId,
            subscriberId: payload.subscriberId || '',
            subscriberName: String(payload.subscriberName || '').trim(),
            subscriberPhone: String(payload.subscriberPhone || '').trim(),
            pickupAddress: String(payload.pickupAddress || '').trim(),
            dropoffAddress: String(payload.dropoffAddress || '').trim(),
            pickupTime: pickupISO,
            dropoffTime: payload.dropoffTime || '',
            assignedAt: payload.driverId ? nowISO() : '',
            distance,
            fare,
            commission,
            commissionRate,
            driverShare: fare - commission,
            status: payload.status || (payload.driverId ? 'inProgress' : 'pending'),
            priority: payload.priority || 'reserved',
            paymentMethod: payload.paymentMethod || 'cash',
            /* سفر حقوقی/شرکتی به‌صورت پیش‌فرض «تسویه‌نشده» است تا در بدهی مشترک دیده شود؛
               سفر نقدی به‌صورت پیش‌فرض پرداخت‌شده فرض می‌شود */
            isPaid: payload.isPaid !== undefined ? !!payload.isPaid : ((payload.billedTo || 'driver') !== 'company'),
            billedTo: payload.billedTo || 'driver',
            companyId: payload.companyId || '',
            notes: payload.notes || '',
            createdBy: payload.createdBy || '',
            createdAt: nowISO()
        };

        DB.mutate((db) => {
            db.trips = db.trips || [];
            db.trips.push(trip);
            return { action: 'create', entity: 'trips', entityId: trip.id, newValue: trip };
        });

        if (trip.driverId && trip.status !== 'pending' && s.autoBusyOnAssign !== false) {
            Drivers.setAvailability(trip.driverId, 'busy');
        }
        if (trip.billedTo === 'company' && trip.subscriberId) Subscribers.recalcDebt(trip.subscriberId);

        return trip;
    },

    update(id, patch) {
        const before = DB.get('trips', id);
        if (!before) throw new Error('سفر یافت نشد');
        const updated = DB.update('trips', id, patch);
        if (updated.billedTo === 'company' && updated.subscriberId) Subscribers.recalcDebt(updated.subscriberId);
        if (before.subscriberId && before.subscriberId !== updated.subscriberId) Subscribers.recalcDebt(before.subscriberId);
        return updated;
    },

    /**
     * تغییر وضعیت سفر با رعایت قواعد
     * @param {string} id
     * @param {'pending'|'inProgress'|'completed'|'cancelled'} status
     * @param {{reason?:string, note?:string, dropoffTime?:string}} opts
     */
    setStatus(id, status, opts = {}) {
        const trip = DB.get('trips', id);
        if (!trip) throw new Error('سفر یافت نشد');
        if (status === 'cancelled' && !opts.reason) throw new Error('دلیل لغو سفر الزامی است');

        const patch = { status, statusChangedAt: nowISO() };
        if (status === 'inProgress') {
            patch.startedAt = patch.startedAt || nowISO();
        }
        if (status === 'completed') {
            patch.dropoffTime = opts.dropoffTime || trip.dropoffTime || nowISO();
            patch.completedAt = nowISO();
            if (!patch.startedAt) patch.startedAt = trip.assignedAt || trip.pickupTime;
        }
        if (status === 'cancelled') {
            patch.cancelReason = opts.reason;
            patch.cancelNote = opts.note || '';
            patch.cancelledAt = nowISO();
            patch.cancelledBy = opts.by || '';
        }
        if (trip.status === 'cancelled' && status !== 'cancelled') {
            patch.cancelReason = '';
            patch.cancelNote = '';
        }

        const updated = Trips.update(id, patch);

        /* وضعیت آنی راننده */
        if (trip.driverId && AUTO_RELEASE) {
            if (status === 'completed' || status === 'cancelled') {
                const stillBusy = DB.list('trips').some((t) => t.id !== id && t.driverId === trip.driverId &&
                    ['pending', 'inProgress'].includes(t.status));
                const d = DB.get('drivers', trip.driverId);
                if (d && d.availability === 'busy' && !stillBusy) {
                    Drivers.setAvailability(trip.driverId, 'available');
                }
            }
        }
        if (updated.billedTo === 'company' && updated.subscriberId) Subscribers.recalcDebt(updated.subscriberId);
        return updated;
    },

    /** تخصیص سریع سفر به راننده آزاد */
    assign(id, driverId, { silent = false } = {}) {
        const trip = DB.get('trips', id);
        const driver = DB.get('drivers', driverId);
        if (!trip) throw new Error('سفر یافت نشد');
        if (!driver) throw new Error('راننده یافت نشد');
        const vehicle = Drivers.vehicleOf(driverId);
        const updated = Trips.update(id, {
            driverId,
            vehicleId: vehicle?.id || trip.vehicleId || '',
            assignedAt: nowISO(),
            status: trip.status === 'pending' ? 'inProgress' : trip.status
        });
        Drivers.setAvailability(driverId, 'busy');
        if (!silent) DB.mutate(() => ([{ action: 'assign', entity: 'trips', entityId: id, newValue: { driverId, driverName: driver.fullName } }]));
        return updated;
    },

    cancel(id, reason, note = '') {
        return Trips.setStatus(id, 'cancelled', { reason, note });
    },

    complete(id, dropoffTime = '') {
        return Trips.setStatus(id, 'completed', { dropoffTime });
    },

    /** محاسبه مجدد کرایه/کمیسیون پس از تغییر کرایه یا مسافت */
    recalc(id) {
        const trip = DB.get('trips', id);
        if (!trip) throw new Error('سفر یافت نشد');
        const driver = trip.driverId ? DB.get('drivers', trip.driverId) : null;
        const rate = driver ? (Number(driver.commissionRate) || DB.settings().commissionDefault) : DB.settings().commissionDefault;
        const commission = Math.round(trip.fare * (rate / 100));
        return Trips.update(id, { commission, commissionRate: rate, driverShare: trip.fare - commission });
    },

    deleteMany(ids) {
        DB.removeMany('trips', ids);
    }
};

/* ============================ مشترکین ============================ */

export const Subscribers = {
    all() {
        return DB.list('subscribers');
    },

    /** بدهی جاری = مجموع سفرهای حقوقی غیرلغوشده − مجموع پرداخت‌ها */
    computeDebt(subscriberId) {
        const trips = DB.list('trips').filter((t) => t.subscriberId === subscriberId &&
            t.billedTo === 'company' && t.status !== 'cancelled');
        const payments = DB.list('subscriberPayments').filter((p) => p.subscriberId === subscriberId);
        return Math.max(0, sum(trips, (t) => t.fare) - sum(payments, (p) => p.amount));
    },

    /** به‌روزرسانی مقدار ذخیره‌شدهٔ بدهی (منبع حقیقت: computeDebt) */
    recalcDebt(subscriberId) {
        const debt = Subscribers.computeDebt(subscriberId);
        DB.mutate((db) => {
            const s = (db.subscribers || []).find((x) => x.id === subscriberId);
            if (!s) return [];
            const old = s.debt;
            s.debt = debt;
            return old === debt ? [] : [{ action: 'recalc-debt', entity: 'subscribers', entityId: subscriberId, oldValue: { debt: old }, newValue: { debt } }];
        });
        return debt;
    },

    recalcAllDebts() {
        DB.list('subscribers').forEach((s) => Subscribers.recalcDebt(s.id));
    },

    /** تاریخ قدیمی‌ترین سفر حقوقی تسویه‌نشده → محاسبه سنّ بدهی */
    debtAge(subscriberId) {
        const payments = sum(DB.list('subscriberPayments').filter((p) => p.subscriberId === subscriberId), (p) => p.amount);
        let remaining = payments;
        const trips = DB.list('trips')
            .filter((t) => t.subscriberId === subscriberId && t.billedTo === 'company' && t.status !== 'cancelled')
            .sort((a, b) => new Date(a.pickupTime) - new Date(b.pickupTime));
        for (const t of trips) {
            if (remaining >= t.fare) { remaining -= t.fare; continue; }
            return diffJalaliDays(isoToJalaliKey(t.pickupTime), todayJalali());
        }
        return 0;
    },

    addPayment({ subscriberId, amount, date, method = 'cash', receiptNo = '', notes = '', operatorId = '' }) {
        const sub = DB.get('subscribers', subscriberId);
        if (!sub) throw new Error('مشترک یافت نشد');
        const value = Number(amount) || 0;
        if (value <= 0) throw new Error('مبلغ پرداخت باید بزرگ‌تر از صفر باشد');
        const debt = Subscribers.computeDebt(subscriberId);
        if (value > debt + 1) {
            throw new Error(`مبلغ پرداخت از بدهی (${debt.toLocaleString('en-US')}) بیشتر است`);
        }
        const payment = DB.insert('subscriberPayments', {
            subscriberId,
            subscriberName: sub.fullName,
            amount: value,
            date: normalizeJalaliKey(date) || todayJalali(),
            method,
            receiptNo: receiptNo || ('R-' + String(DB.nextSequence('payment')).padStart(4, '0')),
            operatorId,
            notes
        });
        /* تراکنش درآمد برای گزارش‌های مالی */
        DB.insert('transactions', {
            id: uid('trx'),
            type: 'income',
            category: 'پرداخت مشترک',
            amount: value,
            description: `دریافت از ${sub.fullName}`,
            date: payment.date,
            relatedId: subscriberId,
            refType: 'subscriberPayment',
            refId: payment.id,
            operatorId
        }, { silent: true });
        Subscribers.recalcDebt(subscriberId);
        return payment;
    },

    /**
     * صورت‌حساب مشترک
     */
    statement(subscriberId, from = '', to = '') {
        const sub = DB.get('subscribers', subscriberId);
        if (!sub) return null;
        const inRange = (key) => (!from || key >= from) && (!to || key <= to);
        const trips = DB.list('trips')
            .filter((t) => t.subscriberId === subscriberId && t.status !== 'cancelled')
            .filter((t) => inRange(isoToJalaliKey(t.pickupTime)))
            .sort((a, b) => new Date(a.pickupTime) - new Date(b.pickupTime));
        const payments = DB.list('subscriberPayments')
            .filter((p) => p.subscriberId === subscriberId && inRange(p.date))
            .sort((a, b) => String(a.date).localeCompare(String(b.date)));

        const companyTrips = trips.filter((t) => t.billedTo === 'company');
        const companyGroups = Object.entries(groupBy(companyTrips, (t) => t.companyId || t.subscriberName || 'سایر'))
            .map(([name, list]) => ({ name, count: list.length, fare: sum(list, (t) => t.fare) }));

        return {
            subscriber: sub,
            trips,
            payments,
            totalFare: sum(trips, (t) => t.fare),
            companyFare: sum(companyTrips, (t) => t.fare),
            paidInRange: sum(payments, (p) => p.amount),
            totalPaid: sum(DB.list('subscriberPayments').filter((p) => p.subscriberId === subscriberId), (p) => p.amount),
            debt: Subscribers.computeDebt(subscriberId),
            debtAge: Subscribers.debtAge(subscriberId),
            companyTrips: companyTrips.length,
            companyGroups,
            from,
            to
        };
    }
};

/* ============================ پرداخت‌ها ============================ */

export const Payments = {
    driver({ driverId, amount, date, method = 'cash', kind = 'payout', notes = '', operatorId = '' }) {
        const driver = DB.get('drivers', driverId);
        if (!driver) throw new Error('راننده یافت نشد');
        const value = Number(amount) || 0;
        if (value <= 0) throw new Error('مبلغ پرداخت باید بزرگ‌تر از صفر باشد');
        const payment = DB.insert('driverPayments', {
            driverId,
            driverName: driver.fullName,
            amount: value,
            date: normalizeJalaliKey(date) || todayJalali(),
            method,
            kind,
            operatorId,
            notes
        });
        DB.insert('transactions', {
            id: uid('trx'),
            type: kind === 'settle' ? 'income' : 'expense',
            category: kind === 'settle' ? 'تسویه راننده' : 'حقوق راننده',
            amount: value,
            description: kind === 'settle'
                ? `تسویه نقدی از ${driver.fullName}`
                : `پرداخت به ${driver.fullName}`,
            date: payment.date,
            relatedId: driverId,
            refType: 'driverPayment',
            refId: payment.id,
            operatorId
        }, { silent: true });
        return payment;
    },

    deleteDriverPayment(id) {
        const p = DB.get('driverPayments', id);
        if (!p) throw new Error('پرداخت یافت نشد');
        /* تراکنش متناظر هم نرم‌حذف می‌شود تا گزارش‌های مالی ناسازگار نشوند */
        const trx = DB.list('transactions').find((t) => t.refType === 'driverPayment' && t.refId === id);
        DB.mutate((db) => {
            const out = [];
            const idx = db.driverPayments.findIndex((x) => x.id === id);
            if (idx >= 0) {
                out.push({ action: 'delete', entity: 'driverPayments', entityId: id, oldValue: db.driverPayments[idx] });
                db.driverPayments[idx] = { ...db.driverPayments[idx], deletedAt: nowISO() };
            }
            if (trx) {
                const ti = db.transactions.findIndex((x) => x.id === trx.id);
                if (ti >= 0) {
                    out.push({ action: 'delete', entity: 'transactions', entityId: trx.id, oldValue: db.transactions[ti] });
                    db.transactions[ti] = { ...db.transactions[ti], deletedAt: nowISO() };
                }
            }
            return out;
        });
        return true;
    },

    deleteSubscriberPayment(id) {
        const p = DB.get('subscriberPayments', id);
        if (!p) throw new Error('پرداخت یافت نشد');
        const trx = DB.list('transactions').find((t) => t.refType === 'subscriberPayment' && t.refId === id);
        DB.mutate((db) => {
            const out = [];
            const idx = db.subscriberPayments.findIndex((x) => x.id === id);
            if (idx >= 0) {
                out.push({ action: 'delete', entity: 'subscriberPayments', entityId: id, oldValue: db.subscriberPayments[idx] });
                db.subscriberPayments[idx] = { ...db.subscriberPayments[idx], deletedAt: nowISO() };
            }
            if (trx) {
                const ti = db.transactions.findIndex((x) => x.id === trx.id);
                if (ti >= 0) {
                    out.push({ action: 'delete', entity: 'transactions', entityId: trx.id, oldValue: db.transactions[ti] });
                    db.transactions[ti] = { ...db.transactions[ti], deletedAt: nowISO() };
                }
            }
            return out;
        });
        Subscribers.recalcDebt(p.subscriberId);
        return true;
    }
};

/* ============================ گزارش‌ها ============================ */

export const Reports = {
    /** گزارش اپراتور: سفرها، میانگین زمان پاسخ، لغوها (به تفکیک اپراتور و شیفت) */
    operators(fromKey = '', toKey = '') {
        const inRange = (iso) => {
            const k = isoToJalaliKey(iso);
            if (fromKey && k < fromKey) return false;
            if (toKey && k > toKey) return false;
            return true;
        };
        const trips = DB.list('trips').filter((t) => inRange(t.pickupTime));
        const operators = DB.list('operators');
        const shifts = DB.list('shifts').filter((s) => {
            if (!fromKey && !toKey) return true;
            if (fromKey && s.date < fromKey) return false;
            if (toKey && s.date > toKey) return false;
            return true;
        });

        const byOperator = operators.map((op) => {
            const opTrips = trips.filter((t) => t.operatorId === op.id);
            const responseTimes = opTrips
                .filter((t) => t.assignedAt)
                .map((t) => minutesBetween(t.createdAt || t.pickupTime, t.assignedAt))
                .filter((m) => m >= 0 && m < 600);
            const opShifts = shifts.filter((s) => s.operatorId === op.id);
            return {
                operator: op,
                tripCount: opTrips.length,
                completed: opTrips.filter((t) => t.status === 'completed').length,
                cancelled: opTrips.filter((t) => t.status === 'cancelled').length,
                pending: opTrips.filter((t) => t.status === 'pending').length,
                fareSum: sum(opTrips.filter((t) => t.status === 'completed'), (t) => t.fare),
                avgResponse: responseTimes.length ? Math.round(sum(responseTimes, (x) => x) / responseTimes.length) : 0,
                shiftCount: opShifts.length,
                shiftHours: Math.round(sum(opShifts, (s) => s.endTime ? minutesBetween(s.startTime, s.endTime) : minutesBetween(s.startTime, nowISO())) / 60),
                shifts: opShifts
            };
        }).sort((a, b) => b.tripCount - a.tripCount);

        return { byOperator, shifts, totalTrips: trips.length };
    },

    /** گزارش لغو: بر اساس دلیل، راننده و ساعت/روز */
    cancellations(fromKey = '', toKey = '') {
        const trips = DB.list('trips').filter((t) => {
            if (t.status !== 'cancelled') return false;
            const k = isoToJalaliKey(t.pickupTime);
            if (fromKey && k < fromKey) return false;
            if (toKey && k > toKey) return false;
            return true;
        });

        const byReason = Object.entries(groupBy(trips, (t) => t.cancelReason || 'نامشخص'))
            .map(([reason, list]) => ({ reason, count: list.length }))
            .sort((a, b) => b.count - a.count);

        const byDriver = Object.entries(groupBy(trips, (t) => t.driverId || 'unassigned'))
            .map(([driverId, list]) => ({
                driverId,
                driverName: driverId === 'unassigned' ? 'تخصیص‌نیافته' : (DB.get('drivers', driverId)?.fullName || 'نامشخص'),
                count: list.length
            }))
            .sort((a, b) => b.count - a.count);

        const byHour = Array.from({ length: 24 }, (_, h) => ({
            hour: h,
            count: trips.filter((t) => new Date(t.pickupTime).getHours() === h).length
        }));

        const byWeekday = ['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه']
            .map((name, idx) => ({ name, idx, count: trips.filter((t) => (new Date(t.pickupTime).getDay() + 1) % 7 === idx).length }));

        return { total: trips.length, byReason, byDriver, byHour, byWeekday, trips };
    },

    /** مشتریان بدهکار با رده‌بندی سنّ بدهی */
    debtors() {
        const list = DB.list('subscribers')
            .map((s) => {
                const debt = Subscribers.computeDebt(s.id);
                const age = debt > 0 ? Subscribers.debtAge(s.id) : 0;
                return { subscriber: s, debt, age, lastPayment: DB.list('subscriberPayments')
                    .filter((p) => p.subscriberId === s.id)
                    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null };
            })
            .filter((x) => x.debt > 0)
            .sort((a, b) => b.debt - a.debt);

        const buckets = {
            b0_30: sum(list.filter((x) => x.age <= 30), (x) => x.debt),
            b30_60: sum(list.filter((x) => x.age > 30 && x.age <= 60), (x) => x.debt),
            b60: sum(list.filter((x) => x.age > 60), (x) => x.debt)
        };
        return { list, buckets, total: sum(list, (x) => x.debt) };
    },

    /** خلاصه مالی یک بازه (کلید شمسی) */
    financial(fromKey, toKey) {
        const inRange = (key) => (!fromKey || key >= fromKey) && (!toKey || key <= toKey);
        const trips = DB.list('trips').filter((t) => t.status === 'completed' && inRange(isoToJalaliKey(t.pickupTime)));
        const expenses = DB.list('expenses').filter((e) => inRange(e.date));
        const transactions = DB.list('transactions').filter((t) => inRange(t.date));
        const subscriberPayments = DB.list('subscriberPayments').filter((p) => inRange(p.date));
        const driverPayments = DB.list('driverPayments').filter((p) => inRange(p.date));

        const commission = sum(trips, (t) => t.commission);
        const fareSum = sum(trips, (t) => t.fare);
        const subscriptionIncome = sum(subscriberPayments, (p) => p.amount);
        const expenseSum = sum(expenses, (e) => e.amount) +
            sum(transactions.filter((t) => t.type === 'expense' && t.refType !== 'driverPayment'), (t) => t.amount);
        const driverPaymentSum = sum(driverPayments.filter((p) => (p.kind || 'payout') === 'payout'), (p) => p.amount);
        const settleIncome = sum(driverPayments.filter((p) => p.kind === 'settle'), (p) => p.amount);
        const netIncome = commission + settleIncome;

        return {
            trips,
            tripCount: trips.length,
            fareSum,
            commission,
            subscriptionIncome,
            settleIncome,
            netIncome,
            expenseSum,
            driverPaymentSum,
            profit: netIncome - expenseSum,
            from: fromKey || '',
            to: toKey || ''
        };
    },

    /** آمار روزانه برای داشبورد */
    dailySeries(days = 7) {
        const out = { labels: [], revenue: [], trips: [], commission: [] };
        for (let i = days - 1; i >= 0; i--) {
            const key = addJalaliDays(todayJalali(), -i);
            const list = DB.list('trips').filter((t) => isoToJalaliKey(t.pickupTime) === key && t.status === 'completed');
            out.labels.push(key.slice(8) + '/' + key.slice(5, 7));
            out.revenue.push(sum(list, (t) => t.fare));
            out.trips.push(list.length);
            out.commission.push(sum(list, (t) => t.commission));
        }
        return out;
    },

    paymentMethods(days = 30) {
        const from = addJalaliDays(todayJalali(), -days + 1);
        const trips = DB.list('trips').filter((t) => t.status === 'completed' && isoToJalaliKey(t.pickupTime) >= from);
        const groups = groupBy(trips, (t) => t.paymentMethod || 'cash');
        const labels = { cash: 'نقدی', card: 'کارتی', subscription: 'اشتراک', online: 'آنلاین' };
        return {
            labels: Object.keys(groups).map((k) => labels[k] || k),
            data: Object.values(groups).map((list) => sum(list, (t) => t.fare))
        };
    }
};

/* ============================ هشدارها ============================ */

export const Alerts = {
    /** مدارک رو به انقضا (بیمه/معاینه فنی) */
    expiringDocs(days = 30) {
        const today = todayJalali();
        const limit = addJalaliDays(today, days);
        const out = [];
        DB.list('vehicles').forEach((v) => {
            const driver = v.driverId ? DB.get('drivers', v.driverId) : null;
            const who = driver ? driver.fullName : 'بدون راننده';
            [['insuranceExpiry', 'بیمه'], ['technicalExpiry', 'معاینه فنی']].forEach(([field, label]) => {
                const val = v[field];
                if (!val) return;
                if (val < today) out.push({ type: 'danger', text: `پلاک ${v.plateNumber} (${who}): ${label} منقضی شده است (${val})`, icon: 'alert-triangle' });
                else if (val <= limit) {
                    const d = diffJalaliDays(today, val);
                    out.push({ type: 'warn', text: `پلاک ${v.plateNumber} (${who}): ${label} تا ${d} روز دیگر منقضی می‌شود`, icon: 'alert-triangle' });
                }
            });
        });
        return out;
    },

    subscriptionExpiry(days = 7) {
        const today = todayJalali();
        const limit = addJalaliDays(today, days);
        return DB.list('subscribers')
            .filter((s) => s.subscriptionType && s.subscriptionType !== 'none' && s.subscriptionEnd)
            .filter((s) => s.subscriptionEnd <= limit)
            .map((s) => ({
                type: s.subscriptionEnd < today ? 'danger' : 'warn',
                icon: 'calendar',
                text: s.subscriptionEnd < today
                    ? `اشتراک «${s.fullName}» در ${s.subscriptionEnd} به پایان رسیده است`
                    : `اشتراک «${s.fullName}» تا ${diffJalaliDays(today, s.subscriptionEnd)} روز دیگر به پایان می‌رسد`
            }));
    },

    overdueQueue() {
        const s = DB.settings();
        const limit = Number(s.queueAlertMinutes || 10);
        return Trips.pendingQueue()
            .filter((t) => t.waitMinutes >= limit)
            .map((t) => ({
                type: t.priority === 'urgent' || t.waitMinutes > limit * 2 ? 'danger' : 'warn',
                icon: 'clock',
                text: `سفر ${t.code} (${t.priority === 'urgent' ? 'فوری' : 'رزرو'}) ${t.waitMinutes} دقیقه در صف منتظر است`
            }));
    },

    heavyDebts(threshold = 1000000) {
        return DB.list('subscribers')
            .map((s) => ({ s, debt: Subscribers.computeDebt(s.id) }))
            .filter((x) => x.debt >= threshold)
            .map((x) => ({
                type: 'warn',
                icon: 'alert-circle',
                text: `بدهی «${x.s.fullName}» به ${Math.round(x.debt / 1000)} هزار تومان رسیده است`
            }));
    },

    all() {
        return [
            ...Alerts.overdueQueue(),
            ...Alerts.expiringDocs(30),
            ...Alerts.subscriptionExpiry(7),
            ...Alerts.heavyDebts(1000000)
        ];
    }
};

export default { fareFor, Drivers, Trips, Subscribers, Payments, Reports, Alerts };
