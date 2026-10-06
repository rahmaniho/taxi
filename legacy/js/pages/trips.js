/* ==========================================================================
 * js/pages/trips.js — ثبت سفر جدید (فرم سادهٔ ۴ فیلدی) و لیست پیشرفته سفرها
 * ========================================================================== */

import { DB } from '../db.js';
import { Auth } from '../auth.js';
import { Trips, Drivers, Subscribers, fareFor } from '../domain.js';
import { Toast, toastError } from '../components/toast.js';
import { Modal } from '../components/modal.js';
import { openForm } from '../components/form.js';
import { renderTable } from '../components/table.js';
import { icon } from '../components/icons.js';
import { card, statusBadge, tripStepper, priorityBadge, paymentBadge, pageHeader, tripTimeRange } from '../components/ui.js';
import { JalaliDatepicker, read as readJalali } from '../jalali.js';
import {
    todayJalali, formatJalali, formatDateTime, formatNumber, formatMoney, escapeHTML, toFa, toEn, parseNumber,
    isValidPhone, minutesBetween, nowISO, formatTime, sum, isoToJalaliKey
} from '../utils.js';

/* =========================================================================
 * ۱) ثبت سفر جدید — فقط ۴ فیلد ضروری در نمای اول
 * ========================================================================= */

export const tripsNew = {
    id: 'trips-new',
    title: 'ثبت سفر جدید',

    render(view) {
        const settings = DB.settings();
        const subscribers = Subscribers.all();
        const addresses = DB.list('addresses');
        const drivers = Drivers.active();
        const today = todayJalali();

        view.innerHTML = `
        <section class="page-section active">
          ${pageHeader({
            title: 'ثبت سفر جدید', iconName: 'plus-circle',
            subtitle: 'فقط چهار فیلد ضروری را پر کنید؛ سایر تنظیمات در بخش «پیشرفته» است. اگر راننده انتخاب نکنید، سفر به صف انتظار می‌رود.',
            actions: `<button class="btn btn-outline btn-sm" type="button" data-go="queue">${icon('queue')} صف انتظار</button>`
        })}

          <div class="grid-2">
            <div class="card">
              <form id="quickTripForm" novalidate>
                <div class="section-label">${icon('user')} اطلاعات مسافر</div>
                <div class="form-row mb-10">
                  <div class="form-group">
                    <label class="form-label">نام مسافر *</label>
                    <input class="form-input" type="text" name="subscriberName" list="subscriberList" required placeholder="نام و نام خانوادگی">
                    <datalist id="subscriberList">
                      ${subscribers.map((s) => `<option value="${escapeHTML(s.fullName)}">`).join('')}
                    </datalist>
                    <div class="field-error" data-error-for="subscriberName"></div>
                  </div>
                  <div class="form-group">
                    <label class="form-label">شماره تماس *</label>
                    <input class="form-input" type="tel" inputmode="tel" name="subscriberPhone" required placeholder="۰۹۱۲۳۴۵۶۷۸۹">
                    <div class="field-error" data-error-for="subscriberPhone"></div>
                  </div>
                </div>
                <div class="form-row mb-10">
                  <div class="form-group">
                    <label class="form-label">مبدأ *</label>
                    <select class="form-select mb-6" data-addr="pickup">
                      <option value="">— انتخاب از آدرس‌های پرکاربرد —</option>
                      ${addresses.map((a) => `<option value="${escapeHTML(a.address)}">${escapeHTML(a.title)} - ${escapeHTML(a.address)}</option>`).join('')}
                    </select>
                    <input class="form-input" type="text" name="pickupAddress" required placeholder="آدرس مبدأ">
                    <div class="field-error" data-error-for="pickupAddress"></div>
                  </div>
                  <div class="form-group">
                    <label class="form-label">مقصد *</label>
                    <select class="form-select mb-6" data-addr="dropoff">
                      <option value="">— انتخاب از آدرس‌های پرکاربرد —</option>
                      ${addresses.map((a) => `<option value="${escapeHTML(a.address)}">${escapeHTML(a.title)} - ${escapeHTML(a.address)}</option>`).join('')}
                    </select>
                    <input class="form-input" type="text" name="dropoffAddress" required placeholder="آدرس مقصد">
                    <div class="field-error" data-error-for="dropoffAddress"></div>
                  </div>
                </div>

                <div class="form-row mb-10">
                  <div class="form-group">
                    <label class="form-label">مشترک ثبت‌شده (اختیاری)</label>
                    <select class="form-select" name="subscriberId">
                      <option value="">— مسافر آزاد —</option>
                      ${subscribers.map((s) => `<option value="${s.id}" data-phone="${escapeHTML(s.phone)}" data-type="${s.type}">${escapeHTML(s.fullName)} ${s.subscriptionNumber ? `[${escapeHTML(s.subscriptionNumber)}]` : ''}</option>`).join('')}
                    </select>
                    <div class="hint">با انتخاب مشترک، نام و تلفن خودکار پر می‌شود.</div>
                  </div>
                  <div class="form-group">
                    <label class="form-label">نوع سفر</label>
                    <select class="form-select" name="priority">
                      <option value="reserved">رزرو</option>
                      <option value="urgent">فوری</option>
                    </select>
                  </div>
                </div>

                <details class="mt-10" ${settings.simpleTripForm === false ? 'open' : ''}>
                  <summary class="clickable text-bold text-gold" style="cursor:pointer; padding:8px 0">
                    ${icon('settings')} تنظیمات پیشرفته (راننده، کرایه، پرداخت، زمان‌ها)
                  </summary>
                  <div class="mt-10">
                    <div class="form-row mb-10">
                      <div class="form-group">
                        <label class="form-label">راننده</label>
                        <select class="form-select" name="driverId">
                          <option value="">— بدون راننده (ارسال به صف) —</option>
                          ${drivers.map((d) => `<option value="${d.id}">${escapeHTML(d.fullName)} · ${d.availability === 'available' ? 'آزاد' : d.availability === 'busy' ? 'در سفر' : d.availability === 'rest' ? 'استراحت' : 'آفلاین'}</option>`).join('')}
                        </select>
                      </div>
                      <div class="form-group">
                        <label class="form-label">خودرو</label>
                        <select class="form-select" name="vehicleId"><option value="">— خودکار بر اساس راننده —</option></select>
                      </div>
                    </div>
                    <div class="form-row mb-10">
                      <div class="form-group">
                        <label class="form-label">تاریخ سفر (شمسی)</label>
                        <input class="form-input jalali-date" name="tripDate" value="${today}" data-key="${today}">
                      </div>
                      <div class="form-group">
                        <label class="form-label">مسافت (کیلومتر)</label>
                        <input class="form-input" type="number" min="0" step="0.1" name="distance" placeholder="مثلاً ۱۲">
                      </div>
                    </div>
                    <div class="form-row mb-10">
                      <div class="form-group">
                        <label class="form-label">کرایه (تومان)</label>
                        <div class="flex gap-8" style="align-items:center">
                          <input class="form-input" type="number" min="0" step="1000" name="fare" placeholder="خودکار محاسبه می‌شود">
                          <button class="btn btn-outline btn-sm" type="button" id="fareAuto" title="بازگشت به محاسبهٔ خودکار">${icon('calculator')} محاسبه خودکار</button>
                        </div>
                        <div class="hint" data-fare-hint><span class="chip" id="fareModeChip">محاسبهٔ خودکار</span></div>
                      </div>
                      <div class="form-group">
                        <label class="form-label">زمان پایان سفر (اختیاری)</label>
                        <input class="form-input" type="time" name="dropoffTime" step="60">
                        <div class="hint">اگر خالی بماند، هنگام «تکمیل سفر» خودکار ثبت می‌شود.</div>
                      </div>
                    </div>
                    <div class="form-row mb-10">
                      <div class="form-group">
                        <label class="form-label">روش پرداخت</label>
                        <select class="form-select" name="paymentMethod">
                          <option value="cash">نقدی</option>
                          <option value="card">کارتی</option>
                          <option value="subscription">اشتراک</option>
                          <option value="online">آنلاین</option>
                        </select>
                      </div>
                      <div class="form-group">
                        <label class="form-label">نوع تسویه</label>
                        <select class="form-select" name="billedTo">
                          <option value="driver">نقدی به راننده</option>
                          <option value="company">پرداخت به آژانس (حقوقی)</option>
                        </select>
                      </div>
                    </div>
                    <div class="form-row mb-10">
                      <div class="form-group">
                        <label class="form-label">وضعیت اولیه</label>
                        <select class="form-select" name="status">
                          <option value="pending">در انتظار (صف)</option>
                          <option value="inProgress">در حال انجام</option>
                          <option value="completed">تکمیل شده</option>
                        </select>
                      </div>
                      <div class="form-group">
                        <label class="form-label">شناسه/نام شرکت (حقوقی)</label>
                        <input class="form-input" type="text" name="companyId" placeholder="اختیاری">
                      </div>
                    </div>
                    <div class="form-group mb-10">
                      <label class="form-label">یادداشت</label>
                      <textarea class="form-textarea" name="notes" rows="2" placeholder="توضیحات اختیاری..."></textarea>
                    </div>
                    <label class="check-wrap mb-10">
                      <input type="checkbox" class="chk" name="isPaid" checked> پرداخت شده است
                    </label>
                  </div>
                </details>

                <div class="divider"></div>
                <div class="flex gap-12" style="flex-wrap:wrap">
                  <button class="btn btn-gold" type="submit">${icon('save')} ثبت سفر</button>
                  <button class="btn btn-outline" type="reset">${icon('refresh')} پاک کردن فرم</button>
                </div>
              </form>
            </div>

            <div>
              <div class="card mb-16">
                <div class="card-header"><div class="card-title">${icon('calculator')} برآورد کرایه (تعرفه فعلی)</div></div>
                <div class="kpi-tiles" id="farePreview"></div>
                <div class="soft-box mt-16" id="fareRules"></div>
              </div>
              <div class="card">
                <div class="card-header"><div class="card-title">${icon('clock')} آخرین سفرهای امروز</div></div>
                <div id="todayTrips"></div>
              </div>
            </div>
          </div>
        </section>`;

        const root = view.querySelector('.page-section');
        const form = root.querySelector('#quickTripForm');
        JalaliDatepicker.init(root);

        /* --- خودکارسازی‌ها --- */
        const driverSelect = form.querySelector('[name="driverId"]');
        const vehicleSelect = form.querySelector('[name="vehicleId"]');

        function refreshVehicles() {
            const driverId = driverSelect.value;
            const list = driverId
                ? DB.list('vehicles').filter((v) => v.driverId === driverId)
                : [];
            vehicleSelect.innerHTML = '<option value="">— خودکار بر اساس راننده —</option>' +
                list.map((v) => `<option value="${v.id}">${escapeHTML(v.plateNumber)} - ${escapeHTML(v.brand)} ${escapeHTML(v.model || '')}</option>`).join('');
            if (list.length === 1) vehicleSelect.value = list[0].id;
        }
        driverSelect.addEventListener('change', refreshVehicles);
        refreshVehicles();

        /**
         * به‌روزرسانی فهرست پیشنهاد مبدأ (باگ ۲٫۴).
         * آدرس ثبت‌شدهٔ مشترک «آدرس منزل» است و لزوماً محل سوار شدن نیست؛
         * بنابراین فقط پیشنهاد می‌شود و خودکار در فیلد نمی‌نشیند.
         */
        function refreshPickupOptions(sub) {
            const sel = root.querySelector('[data-addr="pickup"]');
            if (!sel) return;
            const common = addresses.map((a) => ({ label: `${a.title} - ${a.address}`, value: a.address }));
            let recent = [];
            if (sub) {
                const seen = new Set();
                recent = Trips.all()
                    .filter((t) => t.subscriberId === sub.id && t.pickupAddress)
                    .sort((a, b) => new Date(b.createdAt || b.pickupTime) - new Date(a.createdAt || a.pickupTime))
                    .map((t) => t.pickupAddress)
                    .concat(sub.address ? [sub.address] : [])
                    .filter((addr) => {
                        const k = String(addr).trim();
                        if (!k || seen.has(k)) return false;
                        seen.add(k);
                        return true;
                    })
                    .slice(0, 6)
                    .map((addr) => ({ label: addr === sub.address ? `${addr} (آدرس ثبت‌شده)` : addr, value: addr }));
            }
            const opts = (list) => list.map((o) => `<option value="${escapeHTML(o.value)}">${escapeHTML(o.label)}</option>`).join('');
            sel.innerHTML = `<option value="">— انتخاب از آدرس‌های پیشنهادی —</option>`
                + (recent.length ? `<optgroup label="آدرس‌های اخیر مشترک">${opts(recent)}</optgroup>` : '')
                + `<optgroup label="آدرس‌های پرکاربرد">${opts(common)}</optgroup>`;
        }

        root.querySelectorAll('[data-addr]').forEach((sel) => {
            sel.addEventListener('change', () => {
                if (!sel.value) return;
                form.querySelector(sel.dataset.addr === 'pickup' ? '[name="pickupAddress"]' : '[name="dropoffAddress"]').value = sel.value;
            });
        });

        form.querySelector('[name="subscriberId"]').addEventListener('change', (e) => {
            const opt = e.target.selectedOptions[0];
            const sub = opt?.value ? DB.get('subscribers', opt.value) : null;
            /* باگ ۲٫۴: مبدأ دیگر خودکار پر نمی‌شود؛ فقط فهرست پیشنهاد به‌روز می‌شود */
            refreshPickupOptions(sub);
            if (sub) {
                form.querySelector('[name="subscriberName"]').value = sub.fullName;
                form.querySelector('[name="subscriberPhone"]').value = sub.phone;
                if (sub.type === 'corporate') {
                    form.querySelector('[name="billedTo"]').value = 'company';
                    form.querySelector('[name="companyId"]').value = sub.companyName || sub.fullName;
                    form.querySelector('[name="paymentMethod"]').value = 'subscription';
                    if (!form.querySelector('[name="driverId"]').value) form.querySelector('[name="status"]').value = 'pending';
                }
            }
        });

        const distanceInput = form.querySelector('[name="distance"]');
        const fareInput = form.querySelector('[name="fare"]');
        /* باگ ۲٫۳: وضعیت «محاسبهٔ دستی/خودکار» همیشه برای کاربر دیده می‌شود */
        let manualFare = false;
        const fareChip = root.querySelector('#fareModeChip');
        function setFareMode(manual) {
            manualFare = manual;
            if (!fareChip) return;
            fareChip.textContent = manual ? 'محاسبه دستی' : 'محاسبهٔ خودکار';
            fareChip.className = manual ? 'chip chip-gold' : 'chip';
            root.querySelector('#fareAuto').disabled = !manual;
        }
        fareInput.addEventListener('input', () => setFareMode(true));
        distanceInput.addEventListener('input', () => updateFarePreview());
        root.querySelector('#fareAuto').addEventListener('click', () => {
            setFareMode(false);
            updateFarePreview();
            Toast.info('کرایه دوباره خودکار محاسبه شد');
        });
        setFareMode(false);

        function updateFarePreview() {
            const distance = parseNumber(distanceInput.value);
            const key = readJalali(form.querySelector('[name="tripDate"]')) || today;
            const b = fareFor(distance, key + 'T' + new Date().toTimeString().slice(0, 8));
            if (!manualFare || !fareInput.value) fareInput.value = distance > 0 ? b.fare : '';
            const host = root.querySelector('#farePreview');
            host.innerHTML = `
              ${kpiTile('کرایه پایه', formatMoney(b.base, false), 'coins')}
              ${kpiTile('مسافت × نرخ', `${formatNumber(distance)} کیلومتر × ${formatNumber(b.perKm)}`, 'route')}
              ${kpiTile('کرایه محاسبه‌شده', formatMoney(b.fare, false), 'calculator', 'var(--gold)')}
              ${kpiTile(b.isNight ? 'تعرفه شب (ضریب ' + toFa(b.nightMultiplier) + ')' : (b.isHoliday ? 'تعرفه تعطیلات (ضریب ' + toFa(b.holidayMultiplier) + ')' : 'تعرفه عادی'), b.isNight || b.isHoliday ? 'اعمال شد' : 'بدون تغییر', b.isNight ? 'moon' : 'sun')}`;
            root.querySelector('#fareRules').innerHTML = `
              ${icon('info')} کرایه = کرایه پایه + (مسافت × نرخ هر کیلومتر)، سپس ضریب شب (${toFa(DB.settings().nightStartHour)} تا ${toFa(DB.settings().nightEndHour)}) و ضریب تعطیلات اعمال می‌شود.`;
        }
        function kpiTile(label, value, ic, color) {
            return `<div class="kpi"><div class="k-label">${icon(ic)} ${label}</div><div class="k-value" style="${color ? `color:${color}` : ''}">${value}</div></div>`;
        }
        updateFarePreview();

        /* --- ارسال فرم --- */
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            clearErrors(form);
            try {
                const vals = collectTripForm(form);
                const errors = validateTrip(vals, { simpleOnly: !form.querySelector('details').open });
                if (Object.keys(errors).length) {
                    showErrors(form, errors);
                    Toast.warning(Object.values(errors)[0]);
                    return;
                }
                const trip = Trips.create({ ...vals, operatorId: Auth.current()?.userId || '' });
                if (trip.status === 'pending') {
                    Toast.success(`سفر ${trip.code} ثبت و به صف انتظار اضافه شد`);
                } else {
                    Toast.success(`سفر ${trip.code} ثبت شد`);
                }
                form.reset();
                form.querySelector('[name="tripDate"]').value = formatJalali(today);
                form.querySelector('[name="tripDate"]').dataset.key = today;
                form.querySelector('[name="isPaid"]').checked = true;
                setFareMode(false);
                refreshPickupOptions(null);
                refreshVehicles();
                renderTodayTrips(root, true);
                updateFarePreview();
                window.App.notifyDataChanged();
            } catch (err) {
                toastError(err, 'خطا در ثبت سفر');
            }
        });

        form.querySelector('[type="reset"]').addEventListener('click', () => {
            setTimeout(() => {
                form.querySelector('[name="tripDate"]').dataset.key = today;
                form.querySelector('[name="tripDate"]').value = formatJalali(today);
                form.querySelector('[name="isPaid"]').checked = true;
                clearErrors(form);
                setFareMode(false);
                refreshPickupOptions(null);
                updateFarePreview();
                refreshVehicles();
            }, 10);
        });

        renderTodayTrips(root);
        root.querySelector('[data-go]')?.addEventListener('click', () => window.App.navigate('queue'));
    }
};

function collectTripForm(form) {
    const dateKey = readJalali(form.querySelector('[name="tripDate"]')) || todayJalali();
    const dropoffTimeInput = form.querySelector('[name="dropoffTime"]').value;
    const pickupTime = `${dateKey}T${new Date().toTimeString().slice(0, 8)}`;
    return {
        subscriberId: form.querySelector('[name="subscriberId"]').value,
        subscriberName: form.querySelector('[name="subscriberName"]').value.trim(),
        subscriberPhone: form.querySelector('[name="subscriberPhone"]').value.trim(),
        pickupAddress: form.querySelector('[name="pickupAddress"]').value.trim(),
        dropoffAddress: form.querySelector('[name="dropoffAddress"]').value.trim(),
        driverId: form.querySelector('[name="driverId"]').value,
        vehicleId: form.querySelector('[name="vehicleId"]').value,
        tripDate: dateKey,
        pickupTime,
        dropoffTime: dropoffTimeInput ? `${dateKey}T${dropoffTimeInput}:00` : '',
        distance: parseNumber(form.querySelector('[name="distance"]').value),
        fare: parseNumber(form.querySelector('[name="fare"]').value),
        priority: form.querySelector('[name="priority"]').value,
        paymentMethod: form.querySelector('[name="paymentMethod"]').value,
        billedTo: form.querySelector('[name="billedTo"]').value,
        companyId: form.querySelector('[name="companyId"]').value.trim(),
        status: form.querySelector('[name="driverId"]').value
            ? (form.querySelector('[name="status"]').value === 'pending' ? 'inProgress' : form.querySelector('[name="status"]').value)
            : 'pending',
        isPaid: form.querySelector('[name="isPaid"]').checked,
        notes: form.querySelector('[name="notes"]').value.trim()
    };
}

function validateTrip(v, { simpleOnly } = {}) {
    const errors = {};
    if (!v.subscriberName) errors.subscriberName = 'نام مسافر الزامی است';
    const phone = toEn(v.subscriberPhone).replace(/[\s-]/g, '');
    if (!phone) errors.subscriberPhone = 'شماره تماس الزامی است';
    else if (!isValidPhone(phone)) errors.subscriberPhone = 'شماره تماس نامعتبر است (موبایل ۱۱ رقمی با ۰۹ یا ثابت ۱۱ رقمی با ۰)';
    if (!v.pickupAddress) errors.pickupAddress = 'آدرس مبدأ الزامی است';
    if (!v.dropoffAddress) errors.dropoffAddress = 'آدرس مقصد الزامی است';
    if (!simpleOnly) {
        if (v.fare <= 0) errors.fare = 'کرایه باید بزرگ‌تر از صفر باشد';
        if (v.billedTo === 'company' && !v.subscriberId) errors.subscriberId = 'برای تسویه حقوقی باید مشترک ثبت‌شده انتخاب شود';
    }
    return errors;
}

function showErrors(form, errors) {
    Object.entries(errors).forEach(([name, msg]) => {
        const el = form.querySelector(`[data-error-for="${name}"]`);
        if (el) el.textContent = msg;
        form.querySelector(`[name="${name}"]`)?.classList.add('invalid');
    });
    form.querySelector(`[name="${Object.keys(errors)[0]}"]`)?.focus();
}

function clearErrors(form) {
    form.querySelectorAll('.field-error').forEach((e) => { e.textContent = ''; });
    form.querySelectorAll('.invalid').forEach((e) => e.classList.remove('invalid'));
}

function renderTodayTrips(root, force = false) {
    const host = root.querySelector('#todayTrips');
    if (!host) return;
    const today = todayJalali();
    const list = Trips.all()
        .filter((t) => (t.createdAt && t.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10)) || t.pickupTime?.slice(0, 10) === new Date().toISOString().slice(0, 10))
        .sort((a, b) => new Date(b.createdAt || b.pickupTime) - new Date(a.createdAt || a.pickupTime))
        .slice(0, 6);
    host.innerHTML = list.length
        ? `<div class="table-wrapper"><table class="mini-table">
            <thead><tr><th>کد</th><th>مسافر</th><th>کرایه</th><th>وضعیت</th></tr></thead>
            <tbody>${list.map((t) => `<tr>
              <td>${escapeHTML(t.code || '—')}</td>
              <td>${escapeHTML(t.subscriberName)}<span class="cell-sub">${tripTimeRange(t)}</span></td>
              <td class="num">${formatNumber(t.fare)}</td>
              <td>${statusBadge(t.status)}</td>
            </tr>`).join('')}</tbody></table></div>`
        : `<div class="empty-state">${icon('route', 'icon-xl')}<p>امروز سفری ثبت نشده است</p></div>`;
}

/* =========================================================================
 * ۲) لیست سفرها — جدول پیشرفته
 * ========================================================================= */

export const tripsList = {
    id: 'trips-list',
    title: 'لیست سفرها',

    render(view) {
        const drivers = Drivers.all();
        const settings = DB.settings();
        const fromDefault = todayJalali().slice(0, 8) + '01';

        view.innerHTML = `
        <section class="page-section active">
          ${pageHeader({
            title: 'لیست سفرها', iconName: 'list',
            subtitle: 'مرتب‌سازی با کلیک روی سرستون، انتخاب چندتایی برای عملیات گروهی، و صفحه‌بندی ۱۰/۲۵/۵۰/۱۰۰ رکورد.',
            actions: `<button class="btn btn-gold btn-sm" type="button" data-go="trips-new">${icon('plus-circle')} ثبت سفر</button>`
        })}

          <div class="card mb-16">
            <div class="form-row-3">
              <div class="form-group">
                <label class="form-label">از تاریخ</label>
                <input class="form-input jalali-date" id="trFrom" value="${formatJalali(fromDefault)}" data-key="${fromDefault}">
              </div>
              <div class="form-group">
                <label class="form-label">تا تاریخ</label>
                <input class="form-input jalali-date" id="trTo" value="${formatJalali(todayJalali())}" data-key="${todayJalali()}">
              </div>
              <div class="form-group">
                <label class="form-label">وضعیت</label>
                <select class="form-select" id="trStatus">
                  <option value="">همه وضعیت‌ها</option>
                  <option value="pending">در انتظار</option>
                  <option value="inProgress">در حال انجام</option>
                  <option value="completed">تکمیل شده</option>
                  <option value="cancelled">لغو شده</option>
                </select>
              </div>
            </div>
            <div class="form-row-3">
              <div class="form-group">
                <label class="form-label">راننده</label>
                <select class="form-select" id="trDriver">
                  <option value="">همه رانندگان</option>
                  ${drivers.map((d) => `<option value="${d.id}">${escapeHTML(d.fullName)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">نوع تسویه</label>
                <select class="form-select" id="trBilled">
                  <option value="">همه</option>
                  <option value="driver">نقدی به راننده</option>
                  <option value="company">آژانس (حقوقی)</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">روش پرداخت</label>
                <select class="form-select" id="trPayment">
                  <option value="">همه</option>
                  <option value="cash">نقدی</option>
                  <option value="card">کارتی</option>
                  <option value="subscription">اشتراک</option>
                  <option value="online">آنلاین</option>
                </select>
              </div>
            </div>
            <div class="flex gap-8" style="flex-wrap:wrap">
              <button class="btn btn-gold btn-sm" type="button" id="trApply">${icon('filter')} اعمال فیلتر</button>
              <button class="btn btn-outline btn-sm" type="button" id="trThisMonth">ماه جاری</button>
              <button class="btn btn-outline btn-sm" type="button" id="trToday">امروز</button>
              <button class="btn btn-outline btn-sm" type="button" id="trAll">همه سفرها</button>
            </div>
          </div>

          <div class="card"><div id="tripsTable"></div></div>
        </section>`;

        const root = view.querySelector('.page-section');
        JalaliDatepicker.init(root);

        const filters = {
            from: fromDefault,
            to: todayJalali(),
            status: '',
            driverId: '',
            billedTo: '',
            paymentMethod: ''
        };

        const cfg = () => ({
            key: 'trips-table',
            columns: [
                { key: 'code', label: 'کد', sortable: true, render: (r) => `<span class="text-bold">${escapeHTML(r.code || '—')}</span>` },
                { key: 'pickupTime', label: 'تاریخ و زمان سفر', sortable: true, render: (r) => `${formatJalali(r.pickupTime)}<span class="cell-sub">${tripTimeRange(r)}</span>` },
                { key: 'driverId', label: 'راننده', sortable: true, render: (r) => escapeHTML(DB.get('drivers', r.driverId)?.fullName || '—') },
                { key: 'subscriberName', label: 'مسافر', sortable: true, render: (r) => `${escapeHTML(r.subscriberName)}<span class="cell-sub">${toFa(r.subscriberPhone || '')}</span>` },
                { key: 'pickupAddress', label: 'مسیر', sortable: false, render: (r) => `<span class="text-sm">${escapeHTML(r.pickupAddress || '—')} ← ${escapeHTML(r.dropoffAddress || '—')}</span>` },
                { key: 'fare', label: 'کرایه', sortable: true, align: 'center', render: (r) => formatNumber(r.fare) },
                { key: 'commission', label: 'کمیسیون', sortable: true, align: 'center', render: (r) => `<span class="text-gold">${formatNumber(r.commission)}</span>` },
                { key: 'priority', label: 'اولویت', sortable: true, align: 'center', render: (r) => priorityBadge(r.priority) },
                { key: 'paymentMethod', label: 'پرداخت', sortable: true, align: 'center', render: (r) => `<span class="text-xs">${r.billedTo === 'company' ? 'آژانس' : 'راننده'} · ${r.paymentMethod === 'cash' ? 'نقدی' : r.paymentMethod === 'card' ? 'کارتی' : r.paymentMethod === 'subscription' ? 'اشتراک' : 'آنلاین'}</span>` },
                { key: 'status', label: 'وضعیت', sortable: true, align: 'center', render: (r) => `${statusBadge(r.status)}${r.cancelReason ? `<span class="cell-sub">${escapeHTML(r.cancelReason)}</span>` : ''}` },
                {
                    key: 'actions', label: 'عملیات', sortable: false, align: 'center',
                    render: (r) => `
                      <button class="btn-icon edit" data-trip-status="${r.id}" title="تغییر وضعیت">${icon('swap')}</button>
                      <button class="btn-icon" data-trip-edit="${r.id}" title="ویرایش">${icon('pencil')}</button>
                      <button class="btn-icon" data-trip-view="${r.id}" title="جزئیات">${icon('eye')}</button>
                      <button class="btn-icon danger" data-trip-del="${r.id}" title="حذف">${icon('trash')}</button>`
                }
            ],
            rows: filteredTrips(filters),
            search: { keys: ['code', 'subscriberName', 'subscriberPhone', 'pickupAddress', 'dropoffAddress'] },
            pageSize: 10,
            selectable: true,
            initialSort: { key: 'pickupTime', dir: 'desc' },
            csv: { filename: `trips-${todayJalali()}` },
            emptyText: 'سفری با این فیلترها یافت نشد',
            emptyIcon: 'route',
            bulkActions: [
                { label: 'تکمیل سفرها', icon: 'check', confirm: 'وضعیت سفرهای انتخاب‌شده به «تکمیل شده» تغییر کند؟', onClick: (ids) => { ids.forEach((id) => Trips.complete(id)); Toast.success(`${toFa(ids.length)} سفر تکمیل شد`); } },
                { label: 'در حال انجام', icon: 'route', onClick: (ids) => { ids.forEach((id) => Trips.setStatus(id, 'inProgress')); Toast.success('وضعیت سفرها به‌روزرسانی شد'); } },
                { label: 'لغو سفرها', icon: 'x-circle', danger: true, onClick: (ids) => bulkCancel(ids) },
                { label: 'حذف', icon: 'trash', danger: true, confirm: 'این سفرها حذف نرم شوند؟ (قابل بازیابی از گزارش تغییرات)', onClick: (ids) => { DB.removeMany('trips', ids); Toast.success('سفرها حذف شدند'); } }
            ],
            footer: (pageRows, allRows) => `
              <div class="grid-4 mt-10">
                ${footKpi('تعداد سفر', formatNumber(allRows.length), 'route')}
                ${footKpi('جمع کرایه', formatMoney(sum(allRows, (t) => t.fare), false), 'coins')}
                ${footKpi('جمع کمیسیون', formatMoney(sum(allRows.filter((t) => t.status === 'completed'), (t) => t.commission), false), 'percent')}
                ${footKpi('سهم رانندگان', formatMoney(sum(allRows.filter((t) => t.status === 'completed'), (t) => t.driverShare), false), 'car')}
              </div>`,
            onRowClick: (row) => openTripDetails(row.id)
        });

        const tableHost = root.querySelector('#tripsTable');
        renderTable(tableHost, cfg());

        /* --- فیلترها --- */
        const applyFilters = () => {
            filters.from = root.querySelector('#trFrom').dataset.key || '';
            filters.to = root.querySelector('#trTo').dataset.key || '';
            filters.status = root.querySelector('#trStatus').value;
            filters.driverId = root.querySelector('#trDriver').value;
            filters.billedTo = root.querySelector('#trBilled').value;
            filters.paymentMethod = root.querySelector('#trPayment').value;
            renderTable(tableHost, cfg());
        };
        root.querySelector('#trApply').addEventListener('click', applyFilters);
        ['#trStatus', '#trDriver', '#trBilled', '#trPayment'].forEach((sel) => root.querySelector(sel).addEventListener('change', applyFilters));
        ['#trFrom', '#trTo'].forEach((sel) => root.querySelector(sel).addEventListener('change', applyFilters));
        root.querySelector('#trToday').addEventListener('click', () => {
            setRange(root, todayJalali(), todayJalali());
            applyFilters();
        });
        root.querySelector('#trThisMonth').addEventListener('click', () => {
            setRange(root, todayJalali().slice(0, 8) + '01', todayJalali());
            applyFilters();
        });
        root.querySelector('#trAll').addEventListener('click', () => {
            setRange(root, '', '');
            applyFilters();
        });

        /* --- عملیات ردیف --- */
        tableHost.addEventListener('click', async (e) => {
            const st = e.target.closest('[data-trip-status]');
            if (st) { openStatusModal(st.dataset.tripStatus); return; }
            const ed = e.target.closest('[data-trip-edit]');
            if (ed) { openTripEdit(ed.dataset.tripEdit); return; }
            const vw = e.target.closest('[data-trip-view]');
            if (vw) { openTripDetails(vw.dataset.tripView); return; }
            const del = e.target.closest('[data-trip-del]');
            if (del) {
                const ok = await Modal.confirm({
                    title: 'حذف سفر',
                    message: 'این سفر حذف شود؟',
                    hint: 'حذف به‌صورت نرم انجام می‌شود و از «گزارش تغییرات» قابل بازیابی است.',
                    danger: true, okText: 'حذف'
                });
                if (!ok) return;
                try {
                    DB.remove('trips', del.dataset.tripDel);
                    Toast.success('سفر حذف شد');
                    window.App.reload();
                } catch (err) { toastError(err); }
            }
        });

        root.querySelector('[data-go]')?.addEventListener('click', () => window.App.navigate('trips-new'));

        /* به‌روزرسانی خودکار با تغییر داده */
        root._refresh = applyFilters;
    }
};

function setRange(root, from, to) {
    const a = root.querySelector('#trFrom');
    const b = root.querySelector('#trTo');
    a.dataset.key = from;
    a.value = from ? formatJalali(from) : '';
    b.dataset.key = to;
    b.value = to ? formatJalali(to) : '';
}

function filteredTrips(f) {
    return Trips.all().filter((t) => {
        const jalaliKey = isoToJalaliKey(t.pickupTime);
        if (f.from && jalaliKey && jalaliKey < f.from) return false;
        if (f.to && jalaliKey && jalaliKey > f.to) return false;
        if (f.status && t.status !== f.status) return false;
        if (f.driverId && t.driverId !== f.driverId) return false;
        if (f.billedTo && t.billedTo !== f.billedTo) return false;
        if (f.paymentMethod && t.paymentMethod !== f.paymentMethod) return false;
        return true;
    });
}

function footKpi(label, value, ic) {
    return `<div class="kpi"><div class="k-label">${icon(ic)} ${label}</div><div class="k-value">${value}</div></div>`;
}

/* ------------------------------ مودال‌ها ------------------------------ */

export function openStatusModal(tripId, onDone) {
    const trip = DB.get('trips', tripId);
    if (!trip) return;
    const statuses = [
        { v: 'pending', label: 'در انتظار', icon: 'clock', hint: 'سفر به صف انتظار برمی‌گردد' },
        { v: 'inProgress', label: 'در حال انجام', icon: 'route', hint: 'راننده در مسیر است' },
        { v: 'completed', label: 'تکمیل شده', icon: 'check-circle', hint: 'زمان پایان خودکار ثبت می‌شود' },
        { v: 'cancelled', label: 'لغو شده', icon: 'x-circle', hint: 'ثبت دلیل لغو الزامی است' }
    ];
    Modal.open({
        title: `تغییر وضعیت سفر ${escapeHTML(trip.code || '')}`,
        body: `
          ${tripStepper(trip.status)}
          <div class="form-group mb-10">
            <label class="form-label">وضعیت جدید</label>
            <select class="form-select" id="stSelect">
              ${statuses.map((s) => `<option value="${s.v}" ${s.v === trip.status ? 'selected' : ''}>${s.label}</option>`).join('')}
            </select>
            <div class="hint" id="stHint"></div>
          </div>
          <div id="stCancelBox" hidden>
            <div class="form-group mb-10">
              <label class="form-label">دلیل لغو *</label>
              <select class="form-select" id="stReason">
                ${['مشتری لغو کرد', 'راننده نرسید', 'آدرس اشتباه', 'سایر'].map((r) => `<option value="${r}">${r}</option>`).join('')}
              </select>
            </div>
            <div class="form-group mb-10">
              <label class="form-label">توضیح تکمیلی</label>
              <input class="form-input" id="stNote" placeholder="اختیاری">
            </div>
          </div>
          <div id="stDropoffBox">
            <div class="form-group mb-10">
              <label class="form-label">زمان پایان سفر</label>
              <input class="form-input" type="time" id="stDropoff" step="60" value="${trip.dropoffTime ? formatTime(trip.dropoffTime).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)) : new Date().toTimeString().slice(0, 5)}">
              <div class="hint">اگر خالی بماند، زمان فعلی ثبت می‌شود.</div>
            </div>
          </div>`,
        footer: `<button class="btn btn-outline" type="button" data-modal-close>انصراف</button>
                 <button class="btn btn-gold" type="button" id="stSave">${icon('save')} ثبت وضعیت</button>`,
        onMount: (node) => {
            const sel = node.querySelector('#stSelect');
            const sync = () => {
                const v = sel.value;
                node.querySelector('#stHint').textContent = statuses.find((s) => s.v === v)?.hint || '';
                node.querySelector('#stCancelBox').hidden = v !== 'cancelled';
                node.querySelector('#stDropoffBox').hidden = v !== 'completed';
            };
            sel.addEventListener('change', sync);
            sync();
            node.querySelector('#stSave').addEventListener('click', () => {
                const v = sel.value;
                try {
                    if (v === 'cancelled') {
                        Trips.cancel(tripId, node.querySelector('#stReason').value, node.querySelector('#stNote').value.trim());
                    } else if (v === 'completed') {
                        const time = node.querySelector('#stDropoff').value;
                        const key = trip.pickupTime ? trip.pickupTime.slice(0, 10) : new Date().toISOString().slice(0, 10);
                        const iso = time ? new Date(`${key}T${time}:00`).toISOString() : nowISO();
                        Trips.setStatus(tripId, 'completed', { dropoffTime: iso });
                    } else {
                        Trips.setStatus(tripId, v);
                    }
                    Modal.close();
                    Toast.success('وضعیت سفر به‌روزرسانی شد');
                    if (onDone) onDone(); else window.App.reload();
                } catch (err) { toastError(err); }
            });
        }
    });
}

async function bulkCancel(ids) {
    const reason = await new Promise((resolve) => {
        openForm({
            title: `لغو ${toFa(ids.length)} سفر`,
            description: 'دلیل لغو برای همه سفرهای انتخاب‌شده ثبت می‌شود.',
            fields: [
                { name: 'reason', label: 'دلیل لغو', type: 'select', required: true, options: ['مشتری لغو کرد', 'راننده نرسید', 'آدرس اشتباه', 'سایر'].map((r) => ({ value: r, label: r })) },
                { name: 'note', label: 'توضیح', type: 'text' }
            ],
            submitText: 'ثبت لغو',
            onSubmit: (v) => {
                ids.forEach((id) => Trips.cancel(id, v.reason, v.note));
                resolve(v.reason);
                Toast.success('سفرها لغو شدند');
            },
            onClose: () => resolve(null)
        });
    });
    return reason;
}

export function openTripDetails(tripId) {
    const t = DB.get('trips', tripId);
    if (!t) return;
    const driver = DB.get('drivers', t.driverId);
    const vehicle = DB.get('vehicles', t.vehicleId);
    const sub = DB.get('subscribers', t.subscriberId);
    const wait = t.assignedAt ? minutesBetween(t.createdAt || t.pickupTime, t.assignedAt) : null;
    Modal.open({
        title: `جزئیات سفر ${escapeHTML(t.code || '')}`,
        size: 'modal-lg',
        body: `
          ${tripStepper(t.status)}
          <div class="grid-3 mb-16">
            ${kv('مسافر', escapeHTML(t.subscriberName))}
            ${kv('تلفن', toFa(t.subscriberPhone || '—'))}
            ${kv('مشترک ثبت‌شده', sub ? escapeHTML(sub.fullName + ' (' + (sub.subscriptionNumber || '') + ')') : '—')}
            ${kv('مبدأ', escapeHTML(t.pickupAddress || '—'))}
            ${kv('مقصد', escapeHTML(t.dropoffAddress || '—'))}
            ${kv('مسافت', t.distance ? formatNumber(t.distance) + ' کیلومتر' : '—')}
            ${kv('راننده', driver ? escapeHTML(driver.fullName) : 'تخصیص‌نیافته')}
            ${kv('خودرو', vehicle ? escapeHTML(vehicle.plateNumber + ' - ' + vehicle.brand) : '—')}
            ${kv('اپراتور ثبت‌کننده', escapeHTML(DB.get('operators', t.operatorId)?.fullName || '—'))}
            ${kv('زمان ثبت', formatDateTime(t.createdAt))}
            ${kv('زمان سوار شدن', formatDateTime(t.pickupTime))}
            ${kv('زمان پایان', t.dropoffTime ? formatDateTime(t.dropoffTime) : '—')}
            ${kv('زمان انتظار تخصیص', wait !== null ? toFa(wait) + ' دقیقه' : '—')}
            ${kv('زمان سفر', tripTimeRange(t))}
            ${kv('اولویت', t.priority === 'urgent' ? 'فوری' : 'رزرو')}
            ${kv('کرایه', formatMoney(t.fare, false))}
            ${kv('کمیسیون (' + toFa(t.commissionRate || 0) + '٪)', formatMoney(t.commission, false))}
            ${kv('سهم راننده', formatMoney(t.driverShare, false))}
            ${kv('روش پرداخت / تسویه', `${t.paymentMethod === 'cash' ? 'نقدی' : t.paymentMethod === 'card' ? 'کارتی' : t.paymentMethod === 'subscription' ? 'اشتراک' : 'آنلاین'} · ${t.billedTo === 'company' ? 'آژانس' : 'راننده'}`)}
            ${kv('پرداخت', paymentBadge(t))}
          </div>
          ${t.cancelReason ? `<div class="alert-row danger"><span class="a-icon">${icon('x-circle')}</span><div>دلیل لغو: <b>${escapeHTML(t.cancelReason)}</b>${t.cancelNote ? ' · ' + escapeHTML(t.cancelNote) : ''} ${t.cancelledBy ? '· توسط ' + escapeHTML(t.cancelledBy) : ''}</div></div>` : ''}
          ${t.notes ? `<div class="soft-box mb-10">${icon('info')} یادداشت: ${escapeHTML(t.notes)}</div>` : ''}`,
        footer: `<button class="btn btn-outline" type="button" data-modal-close>بستن</button>
                 <button class="btn btn-gold" type="button" data-details-status>${icon('swap')} تغییر وضعیت</button>`,
        onMount: (node) => {
            node.querySelector('[data-details-status]').addEventListener('click', () => {
                Modal.close();
                setTimeout(() => openStatusModal(tripId), 260);
            });
        }
    });
}

function kv(label, value) {
    return `<div><div class="hint">${label}</div><div class="text-bold">${value}</div></div>`;
}

export function openTripEdit(tripId) {
    const t = DB.get('trips', tripId);
    if (!t) return;
    const drivers = Drivers.all();
    openForm({
        title: `ویرایش سفر ${t.code || ''}`,
        size: 'modal-lg',
        description: 'با تغییر راننده یا کرایه، کمیسیون و سهم راننده خودکار بازمحاسبه می‌شود.',
        values: {
            subscriberName: t.subscriberName,
            subscriberPhone: t.subscriberPhone,
            pickupAddress: t.pickupAddress,
            dropoffAddress: t.dropoffAddress,
            driverId: t.driverId,
            distance: t.distance,
            fare: t.fare,
            paymentMethod: t.paymentMethod,
            billedTo: t.billedTo,
            companyId: t.companyId,
            priority: t.priority,
            notes: t.notes
        },
        fields: [
            { name: 'subscriberName', label: 'نام مسافر', type: 'text', required: true },
            { name: 'subscriberPhone', label: 'تلفن', type: 'phone', required: true },
            { name: 'pickupAddress', label: 'مبدأ', type: 'text', required: true },
            { name: 'dropoffAddress', label: 'مقصد', type: 'text', required: true },
            { name: 'driverId', label: 'راننده', type: 'select', options: [{ value: '', label: '— بدون راننده —' }].concat(drivers.map((d) => ({ value: d.id, label: d.fullName }))) },
            { name: 'priority', label: 'اولویت', type: 'select', placeholder: false, options: [{ value: 'reserved', label: 'رزرو' }, { value: 'urgent', label: 'فوری' }] },
            { name: 'distance', label: 'مسافت (کیلومتر)', type: 'number', step: '0.1' },
            { name: 'fare', label: 'کرایه (تومان)', type: 'money', required: true, min: 1 },
            { name: 'paymentMethod', label: 'روش پرداخت', type: 'select', placeholder: false, options: [['cash', 'نقدی'], ['card', 'کارتی'], ['subscription', 'اشتراک'], ['online', 'آنلاین']].map(([value, label]) => ({ value, label })) },
            { name: 'billedTo', label: 'نوع تسویه', type: 'select', placeholder: false, options: [['driver', 'نقدی به راننده'], ['company', 'آژانس (حقوقی)']].map(([value, label]) => ({ value, label })) },
            { name: 'companyId', label: 'شرکت (حقوقی)', type: 'text' },
            { name: 'notes', label: 'یادداشت', type: 'textarea', rows: 2, col: 3 }
        ],
        submitText: 'ذخیره تغییرات',
        onSubmit: (v) => {
            const driver = v.driverId ? DB.get('drivers', v.driverId) : null;
            const rate = driver ? (Number(driver.commissionRate) || DB.settings().commissionDefault) : DB.settings().commissionDefault;
            const commission = Math.round(v.fare * (rate / 100));
            const vehicle = v.driverId ? Drivers.vehicleOf(v.driverId) : null;
            Trips.update(tripId, {
                ...v,
                commission,
                commissionRate: rate,
                driverShare: v.fare - commission,
                vehicleId: vehicle?.id || ''
            });
            Toast.success('سفر ویرایش شد');
            window.App.reload();
        }
    });
}
