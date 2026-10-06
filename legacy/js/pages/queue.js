/* ==========================================================================
 * js/pages/queue.js — صف انتظار سفر و تخصیص سریع به راننده آزاد
 * --------------------------------------------------------------------------
 * قواعد صف: اولویت «فوری» پیش از «رزرو»، سپس FIFO بر اساس زمان ثبت.
 * dropdown تخصیص بر اساس تعداد سفر امروز (کمتر اول) و امتیاز راننده.
 * ========================================================================== */

import { DB } from '../db.js';
import { Auth } from '../auth.js';
import { Trips, Drivers } from '../domain.js';
import { Toast, toastError } from '../components/toast.js';
import { Modal } from '../components/modal.js';
import { openForm } from '../components/form.js';
import { icon } from '../components/icons.js';
import { availabilityBadge, card, kpi, tripStepper, statusBadge, tripTimeRange } from '../components/ui.js';
import { todayJalali, formatNumber, escapeHTML, toFa, minutesBetween, nowISO, formatDateTime, formatJalali, humanizeMinutes } from '../utils.js';

function waitLabel(t) {
    const min = t.waitMinutes ?? minutesBetween(t.createdAt || t.pickupTime, nowISO());
    const settings = DB.settings();
    const late = min >= (t.priority === 'urgent' ? Number(settings.urgentAlertMinutes || 5) : Number(settings.queueAlertMinutes || 10));
    return `<span class="wait-time ${late ? 'late' : ''}">${icon('clock')} ${humanizeMinutes(min)}</span>`;
}

export default {
    id: 'queue',
    title: 'صف انتظار',

    render(view) {
        const queue = Trips.pendingQueue();
        const free = Drivers.free();
        const allDrivers = Drivers.active();
        const inProgress = Trips.all().filter((t) => t.status === 'inProgress');

        const driverOptions = (selected = '') => free.length
            ? free.map((d) => `<option value="${d.id}" ${selected === d.id ? 'selected' : ''}>${escapeHTML(d.fullName)} · ${toFa(d.todayTrips)} سفر امروز${d.rating ? ` · ★${toFa(d.rating)}` : ''}</option>`).join('')
            : '';

        view.innerHTML = `
        <section class="page-section active">
          <div class="page-header">
            <div class="page-title">${icon('queue')} صف انتظار سفر</div>
            <div class="card-actions">
              <span class="chip chip-gold">${formatJalali(todayJalali())}</span>
              <button class="btn btn-outline btn-sm" type="button" data-refresh>${icon('refresh')} به‌روزرسانی</button>
              <button class="btn btn-gold btn-sm" type="button" data-new-trip>${icon('plus-circle')} ثبت سفر جدید</button>
            </div>
          </div>

          <div class="stats-grid mb-20">
            <div class="stat-card"><div class="stat-icon">${icon('queue')}</div><div class="stat-value">${formatNumber(queue.length)}</div><div class="stat-label">در انتظار تخصیص</div></div>
            <div class="stat-card"><div class="stat-icon">${icon('alert-circle')}</div><div class="stat-value" style="color:var(--red)">${formatNumber(queue.filter((t) => t.priority === 'urgent').length)}</div><div class="stat-label">سفر فوری</div></div>
            <div class="stat-card"><div class="stat-icon">${icon('car')}</div><div class="stat-value" style="color:var(--green)">${formatNumber(free.length)}</div><div class="stat-label">راننده آزاد</div></div>
            <div class="stat-card"><div class="stat-icon">${icon('route')}</div><div class="stat-value" style="color:var(--blue)">${formatNumber(inProgress.length)}</div><div class="stat-label">در حال انجام</div></div>
          </div>

          <div class="card mb-20">
            <div class="card-header">
              <div class="card-title">${icon('car')} وضعیت آنی رانندگان (برای تغییر وضعیت کلیک کنید)</div>
              <span class="hint">${free.length ? `آزاد: ${free.map((d) => escapeHTML(d.fullName)).join('، ')}` : 'راننده آزادی موجود نیست'}</span>
            </div>
            <div class="chips">
              ${allDrivers.length ? allDrivers.map((d) => `
                <span class="chip" style="display:inline-flex; gap:8px; align-items:center">
                  ${escapeHTML(d.fullName)}
                  ${availabilityBadge(d)}
                  <span class="text-xs op-60">${toFa(Drivers.todayTripCount(d.id))} سفر امروز</span>
                </span>`).join('')
            : `<div class="empty-state">${icon('user-plus', 'icon-xl')}<p>راننده‌ای ثبت نشده است</p></div>`}
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <div class="card-title">${icon('list')} سفرهای در انتظار (${formatNumber(queue.length)})</div>
              <span class="hint">اولویت: فوری ‹ سپس FIFO بر اساس زمان ثبت</span>
            </div>
            ${queue.length === 0
                ? `<div class="empty-state">${icon('check-circle', 'icon-xl')}<p>صف خالی است؛ همه سفرها تخصیص یافته‌اند</p></div>`
                : `<div class="queue-grid">
                    ${queue.map((t) => `
                      <div class="queue-card prio-${t.priority === 'urgent' ? 'urgent' : 'reserved'}">
                        <div class="queue-head">
                          <div>
                            <span class="queue-code">${escapeHTML(t.code || '')}</span>
                            ${t.priority === 'urgent' ? '<span class="status-badge status-urgent">فوری</span>' : '<span class="status-badge status-reserved">رزرو</span>'}
                          </div>
                          ${waitLabel(t)}
                        </div>
                        <div class="text-bold">${escapeHTML(t.subscriberName)}</div>
                        <div class="queue-route">
                          <div class="from">${icon('map-pin')}<span>${escapeHTML(t.pickupAddress || '—')}</span></div>
                          <div class="to">${icon('flag')}<span>${escapeHTML(t.dropoffAddress || '—')}</span></div>
                        </div>
                        <div class="queue-meta">
                          <span>${icon('phone')} ${toFa(t.subscriberPhone || '—')}</span>
                          <span>${icon('route')} ${t.distance ? formatNumber(t.distance) + ' کیلومتر' : 'مسافت نامشخص'}</span>
                          <span>${icon('coins')} ${formatNumber(t.fare)} تومان</span>
                          <span>${icon('clock')} ${formatDateTime(t.pickupTime)}</span>
                        </div>
                        <div class="queue-actions">
                          ${free.length
                            ? `<select class="form-select" data-assign-select="${t.id}">
                                 <option value="">تخصیص به راننده...</option>
                                 ${driverOptions()}
                               </select>
                               <button class="btn btn-gold btn-sm" type="button" data-assign="${t.id}">${icon('check')} تخصیص</button>`
                            : `<span class="hint">${icon('alert-circle')} راننده آزادی موجود نیست؛ وضعیت رانندگان را بررسی کنید</span>`}
                        </div>
                        <div class="flex gap-6 mt-6" style="flex-wrap:wrap">
                          <button class="btn btn-outline btn-sm" type="button" data-details="${t.id}">${icon('eye')} جزئیات</button>
                          <button class="btn btn-outline btn-sm" type="button" data-priority="${t.id}">${icon('swap')} ${t.priority === 'urgent' ? 'تبدیل به رزرو' : 'تبدیل به فوری'}</button>
                          <button class="btn btn-outline btn-sm" type="button" data-cancel="${t.id}">${icon('x-circle')} لغو</button>
                        </div>
                      </div>`).join('')}
                  </div>`}
          </div>
        </section>`;

        const root = view.querySelector('.page-section');

        root.addEventListener('click', async (e) => {
            const assignBtn = e.target.closest('[data-assign]');
            if (assignBtn) {
                const tripId = assignBtn.dataset.assign;
                const select = root.querySelector(`[data-assign-select="${tripId}"]`);
                const driverId = select?.value;
                if (!driverId) { Toast.warning('ابتدا راننده را انتخاب کنید'); return; }
                if (!Auth.can('trip.assign')) { Toast.error('شما اجازه تخصیص سفر را ندارید'); return; }
                try {
                    const trip = Trips.assign(tripId, driverId);
                    Toast.success(`سفر ${trip.code} به ${DB.get('drivers', driverId).fullName} تخصیص یافت`);
                    window.App.reload();
                } catch (err) { toastError(err); }
                return;
            }

            const prioBtn = e.target.closest('[data-priority]');
            if (prioBtn) {
                const trip = DB.get('trips', prioBtn.dataset.priority);
                try {
                    Trips.update(trip.id, { priority: trip.priority === 'urgent' ? 'reserved' : 'urgent' });
                    Toast.success('اولویت سفر تغییر کرد');
                    window.App.reload();
                } catch (err) { toastError(err); }
                return;
            }

            const cancelBtn = e.target.closest('[data-cancel]');
            if (cancelBtn) { openCancelModal(cancelBtn.dataset.cancel); return; }

            const detailsBtn = e.target.closest('[data-details]');
            if (detailsBtn) { openTripDetails(detailsBtn.dataset.details); return; }

            if (e.target.closest('[data-refresh]')) { window.App.reload(); return; }

            if (e.target.closest('[data-new-trip]')) { window.App.navigate('trips-new'); return; }

            const avail = e.target.closest('[data-avail-toggle]');
            if (avail) {
                if (!Auth.can('driver.availability')) { Toast.error('اجازه تغییر وضعیت راننده را ندارید'); return; }
                try {
                    Drivers.cycleAvailability(avail.dataset.availToggle);
                    Toast.success('وضعیت راننده تغییر کرد');
                    window.App.reload();
                } catch (err) { toastError(err); }
            }
        });
    }
};

/* --------------------------- مودال‌های صف --------------------------- */

export function openCancelModal(tripId, onDone) {
    const trip = DB.get('trips', tripId);
    if (!trip) return;
    const S = [{ v: 'مشتری لغو کرد' }, { v: 'راننده نرسید' }, { v: 'آدرس اشتباه' }, { v: 'سایر' }];
    openForm({
        title: `لغو سفر ${trip.code || ''}`,
        size: '',
        description: 'برای حفظ کیفیت خدمات، دلیل لغو سفر ثبت می‌شود و در گزارش لغوها نمایش داده می‌شود.',
        fields: [
            { name: 'reason', label: 'دلیل لغو', type: 'select', required: true, options: S.map((x) => ({ value: x.v, label: x.v })) },
            { name: 'note', label: 'توضیح تکمیلی', type: 'textarea', rows: 2, placeholder: 'اختیاری...' }
        ],
        submitText: 'ثبت لغو سفر',
        onSubmit: (values) => {
            Trips.cancel(tripId, values.reason, values.note);
            Toast.success('سفر با ثبت دلیل لغو شد');
            if (onDone) onDone(); else window.App.reload();
        }
    });
}

function openTripDetails(tripId) {
    const t = DB.get('trips', tripId);
    if (!t) return;
    const driver = DB.get('drivers', t.driverId);
    const vehicle = DB.get('vehicles', t.vehicleId);
    Modal.open({
        title: 'جزئیات سفر ' + (t.code || ''),
        body: `
          ${tripStepper(t.status)}
          <div class="grid-2 mb-12">
            <div>${row('مسافر', escapeHTML(t.subscriberName))}</div>
            <div>${row('تلفن', toFa(t.subscriberPhone || '—'))}</div>
            <div>${row('مبدأ', escapeHTML(t.pickupAddress || '—'))}</div>
            <div>${row('مقصد', escapeHTML(t.dropoffAddress || '—'))}</div>
            <div>${row('زمان ثبت', formatDateTime(t.createdAt))}</div>
            <div>${row('زمان سوار شدن', formatDateTime(t.pickupTime))}</div>
            <div>${row('زمان پایان', t.dropoffTime ? formatDateTime(t.dropoffTime) : '—')}</div>
            <div>${row('مدت سفر', tripTimeRange(t))}</div>
            <div>${row('راننده', driver ? escapeHTML(driver.fullName) : '—')}</div>
            <div>${row('خودرو', vehicle ? escapeHTML(vehicle.plateNumber + ' - ' + vehicle.brand) : '—')}</div>
            <div>${row('مسافت', t.distance ? formatNumber(t.distance) + ' کیلومتر' : '—')}</div>
            <div>${row('کرایه', formatNumber(t.fare) + ' تومان')}</div>
            <div>${row('کمیسیون', formatNumber(t.commission) + ' تومان')}</div>
            <div>${row('سهم راننده', formatNumber(t.driverShare) + ' تومان')}</div>
            <div>${row('روش پرداخت', t.paymentMethod === 'cash' ? 'نقدی' : t.paymentMethod === 'card' ? 'کارتی' : t.paymentMethod === 'subscription' ? 'اشتراک' : 'آنلاین')}</div>
            <div>${row('نوع تسویه', t.billedTo === 'company' ? 'آژانس (حقوقی)' : 'نقدی به راننده')}</div>
            <div>${row('وضعیت', statusBadge(t.status))}</div>
          </div>
          ${t.cancelReason ? `<div class="alert-row danger">${icon('x-circle')} دلیل لغو: ${escapeHTML(t.cancelReason)} ${t.cancelNote ? '· ' + escapeHTML(t.cancelNote) : ''}</div>` : ''}
          ${t.notes ? `<div class="soft-box">${icon('info')} یادداشت: ${escapeHTML(t.notes)}</div>` : ''}`,
        footer: `<button class="btn btn-outline" type="button" data-modal-close>بستن</button>`
    });
}

function row(label, value) {
    return `<div><div class="hint">${label}</div><div class="text-bold">${value}</div></div>`;
}
