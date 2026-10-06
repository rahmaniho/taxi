/* ==========================================================================
 * js/pages/drivers.js — رانندگان و خودروها (با وضعیت آنی و هشدار مدارک)
 * ========================================================================== */

import { DB } from '../db.js';
import { Auth } from '../auth.js';
import { Drivers, Trips, Reports } from '../domain.js';
import { Toast, toastError } from '../components/toast.js';
import { Modal } from '../components/modal.js';
import { openForm } from '../components/form.js';
import { renderTable } from '../components/table.js';
import { icon } from '../components/icons.js';
import { statusBadge, availabilityBadge, availabilityLabel, pageHeader, ratingStars } from '../components/ui.js';
import { JalaliDatepicker } from '../jalali.js';
import {
    todayJalali, formatJalali, formatNumber, formatMoney, escapeHTML, toFa, diffJalaliDays, sum
} from '../utils.js';

export default {
    id: 'drivers',
    title: 'رانندگان و خودروها',

    render(view) {
        view.innerHTML = `
        <section class="page-section active">
          ${pageHeader({
            title: 'رانندگان و خودروها', iconName: 'user-tie',
            subtitle: 'برای تغییر وضعیت آنی راننده (آزاد/در سفر/استراحت/آفلاین) روی نشان وضعیت کلیک کنید.',
            actions: `
              <button class="btn btn-outline btn-sm" type="button" data-go="reports-drivers">${icon('bar-chart')} گزارش عملکرد</button>
              <button class="btn btn-gold btn-sm" type="button" data-add>${icon('user-plus')} ثبت راننده + خودرو</button>`
          })}
          <div class="kpi-tiles mb-16">
            ${kpi('رانندگان فعال', Drivers.active().length, 'user-check', 'var(--green)')}
            ${kpi('آزاد', Drivers.all().filter((d) => d.availability === 'available' && d.status === 'active').length, 'check-circle', 'var(--green)')}
            ${kpi('در سفر', Drivers.all().filter((d) => d.availability === 'busy').length, 'route', 'var(--blue)')}
            ${kpi('آفلاین / استراحت', Drivers.all().filter((d) => ['offline', 'rest'].includes(d.availability)).length, 'wifi-off', 'var(--yellow)')}
          </div>
          <div class="card"><div id="driversTable"></div></div>
        </section>`;

        const root = view.querySelector('.page-section');
        const host = root.querySelector('#driversTable');
        let filterStatus = '';
        let filterAvail = '';

        const buildCfg = () => ({
            key: 'drivers-table',
            columns: [
                {
                    key: 'fullName', label: 'راننده', sortable: true,
                    render: (d) => `<span class="driver-name-link" data-view="${d.id}">${escapeHTML(d.fullName)}</span>
                        <span class="cell-sub">${toFa(d.phone)}${d.licenseNumber ? ' · گواهینامه ' + toFa(d.licenseNumber) : ''}</span>`
                },
                {
                    key: 'availability', label: 'وضعیت آنی', sortable: true, align: 'center',
                    render: (d) => availabilityBadge(d)
                },
                { key: 'status', label: 'وضعیت پرونده', sortable: true, align: 'center', render: (d) => statusBadge(d.status) },
                {
                    key: 'vehicle', label: 'خودرو', sortable: false,
                    render: (d) => {
                        const v = Drivers.vehicleOf(d.id);
                        return v ? `${escapeHTML(v.brand)} ${escapeHTML(v.model || '')}<span class="cell-sub">${escapeHTML(v.plateNumber)} · ${v.status === 'inRepair' ? 'در تعمیر' : 'فعال'}</span>` : '<span class="text-muted">بدون خودرو</span>';
                    }
                },
                {
                    key: 'docs', label: 'مدارک', sortable: false, align: 'center',
                    render: (d) => {
                        const v = Drivers.vehicleOf(d.id);
                        if (!v) return '—';
                        const today = todayJalali();
                        const parts = [];
                        if (v.insuranceExpiry) {
                            const days = diffJalaliDays(today, v.insuranceExpiry);
                            parts.push(days < 0 ? `<span class="chip chip-red">بیمه منقضی</span>`
                                : days <= 30 ? `<span class="chip chip-red">بیمه ${toFa(days)} روز</span>` : `<span class="chip chip-green">بیمه ${toFa(days)} روز</span>`);
                        }
                        if (v.technicalExpiry) {
                            const days = diffJalaliDays(today, v.technicalExpiry);
                            parts.push(days < 0 ? `<span class="chip chip-red">فنی منقضی</span>`
                                : days <= 30 ? `<span class="chip chip-red">فنی ${toFa(days)} روز</span>` : `<span class="chip">فنی ${toFa(days)} روز</span>`);
                        }
                        return parts.join(' ') || '—';
                    }
                },
                { key: 'commissionRate', label: 'کمیسیون', sortable: true, align: 'center', render: (d) => toFa(d.commissionRate) + '٪' },
                { key: 'todayTrips', label: 'سفر امروز', sortable: true, align: 'center', sortValue: (d) => Drivers.todayTripCount(d.id), render: (d) => formatNumber(Drivers.todayTripCount(d.id)) },
                {
                    key: 'trips', label: 'کل سفرها', sortable: true, align: 'center',
                    sortValue: (d) => Trips.byDriver(d.id).filter((t) => t.status === 'completed').length,
                    render: (d) => formatNumber(Trips.byDriver(d.id).filter((t) => t.status === 'completed').length)
                },
                { key: 'rating', label: 'امتیاز', sortable: true, align: 'center', render: (d) => ratingStars(d.rating) },
                {
                    key: 'actions', label: 'عملیات', sortable: false, align: 'center',
                    render: (d) => `
                      <button class="btn-icon" data-statement="${d.id}" title="صورت‌حساب">${icon('file-text')}</button>
                      <button class="btn-icon edit" data-edit="${d.id}" title="ویرایش">${icon('pencil')}</button>
                      <button class="btn-icon danger" data-del="${d.id}" title="حذف">${icon('trash')}</button>`
                }
            ],
            rows: Drivers.all(),
            filter: (d) => (!filterStatus || d.status === filterStatus) && (!filterAvail || d.availability === filterAvail),
            search: { keys: ['fullName', 'phone', 'nationalCode', 'licenseNumber'] },
            pageSize: 10,
            initialSort: { key: 'fullName', dir: 'asc' },
            csv: { filename: `drivers-${todayJalali()}` },
            emptyText: 'راننده‌ای با این فیلترها یافت نشد',
            emptyIcon: 'user-tie',
            toolbar: (st) => `
              <select class="form-select" data-flt-status style="max-width:150px; font-size:0.72rem">
                <option value="">همه وضعیت‌ها</option>
                <option value="active" ${filterStatus === 'active' ? 'selected' : ''}>فعال</option>
                <option value="inactive" ${filterStatus === 'inactive' ? 'selected' : ''}>غیرفعال</option>
                <option value="suspended" ${filterStatus === 'suspended' ? 'selected' : ''}>تعلیق</option>
              </select>
              <select class="form-select" data-flt-avail style="max-width:150px; font-size:0.72rem">
                <option value="">همه وضعیت‌های آنی</option>
                ${['available', 'busy', 'rest', 'offline'].map((a) => `<option value="${a}" ${filterAvail === a ? 'selected' : ''}>${availabilityLabel(a)}</option>`).join('')}
              </select>`,
            onRowClick: null
        });

        renderTable(host, buildCfg());

        host.addEventListener('change', (e) => {
            if (e.target.matches('[data-flt-status]')) { filterStatus = e.target.value; renderTable(host, buildCfg()); }
            if (e.target.matches('[data-flt-avail]')) { filterAvail = e.target.value; renderTable(host, buildCfg()); }
        });

        host.addEventListener('click', async (e) => {
            const avail = e.target.closest('[data-avail-toggle]');
            if (avail) {
                if (!Auth.can('driver.availability')) { Toast.error('اجازه تغییر وضعیت راننده را ندارید'); return; }
                try {
                    const next = Drivers.cycleAvailability(avail.dataset.availToggle);
                    Toast.success('وضعیت راننده: ' + availabilityLabel(next));
                    window.App.reload();
                } catch (err) { toastError(err); }
                return;
            }
            const vw = e.target.closest('[data-view]');
            if (vw) { showDriverDetails(vw.dataset.view); return; }
            const st = e.target.closest('[data-statement]');
            if (st) { window.App.navigate('acc-driver', { driverId: st.dataset.statement }); return; }
            const ed = e.target.closest('[data-edit]');
            if (ed) { openDriverForm(ed.dataset.edit); return; }
            const del = e.target.closest('[data-del]');
            if (del) {
                const d = DB.get('drivers', del.dataset.del);
                const ok = await Modal.confirm({
                    title: 'حذف راننده',
                    message: `راننده «${d.fullName}» و خودروی مرتبط حذف شوند؟`,
                    hint: 'حذف نرم است؛ در «گزارش تغییرات» می‌توانید بازیابی کنید.',
                    danger: true, okText: 'حذف'
                });
                if (!ok) return;
                try {
                    const vehicle = DB.list('vehicles').find((v) => v.driverId === d.id);
                    if (vehicle) DB.remove('vehicles', vehicle.id);
                    DB.remove('drivers', d.id);
                    Toast.success('راننده و خودرو حذف شدند');
                    window.App.reload();
                } catch (err) { toastError(err); }
            }
        });

        root.querySelector('[data-add]').addEventListener('click', () => openDriverForm());
        root.querySelector('[data-go]')?.addEventListener('click', () => window.App.navigate('reports-drivers'));
    }
};

function kpi(label, value, ic, color) {
    return `<div class="kpi"><div class="k-label">${icon(ic)} ${label}</div><div class="k-value" style="color:${color || ''}">${formatNumber(value)}</div></div>`;
}

/* ------------------------- فرم ثبت/ویرایش راننده ------------------------- */

export function openDriverForm(driverId) {
    const driver = driverId ? DB.get('drivers', driverId) : null;
    const vehicle = driverId ? Drivers.vehicleOf(driverId) : null;
    const settings = DB.settings();
    const unmasked = ['available', 'busy', 'offline', 'rest'];

    openForm({
        title: driver ? `ویرایش ${driver.fullName}` : 'ثبت راننده و خودرو',
        size: 'modal-lg',
        description: 'اطلاعات راننده و خودروی او در یک فرم ثبت می‌شود. کد ملی و پلاک به‌صورت خودکار اعتبارسنجی می‌شوند.',
        values: {
            fullName: driver?.fullName || '',
            phone: driver?.phone || '',
            nationalCode: driver?.nationalCode || '',
            licenseNumber: driver?.licenseNumber || '',
            joinDate: driver?.joinDate || todayJalali(),
            commissionRate: driver?.commissionRate ?? settings.commissionDefault,
            status: driver?.status || 'active',
            availability: driver?.availability || 'offline',
            rating: driver?.rating ?? 4,
            notes: driver?.notes || '',
            plateNumber: vehicle?.plateNumber || '',
            brand: vehicle?.brand || '',
            model: vehicle?.model || '',
            color: vehicle?.color || '',
            year: vehicle?.year || '',
            vehicleStatus: vehicle?.status || 'active',
            insuranceExpiry: vehicle?.insuranceExpiry || '',
            technicalExpiry: vehicle?.technicalExpiry || '',
            vehicleNotes: vehicle?.notes || ''
        },
        fields: [
            { name: 'fullName', label: 'نام و نام خانوادگی', type: 'text', required: true },
            { name: 'phone', label: 'تلفن همراه', type: 'mobile', required: true, placeholder: '۰۹۱۲۳۴۵۶۷۸۹' },
            { name: 'nationalCode', label: 'کد ملی', type: 'nationalCode', hint: '۱۰ رقم با رقم کنترل معتبر' },
            { name: 'licenseNumber', label: 'شماره گواهینامه', type: 'text' },
            { name: 'joinDate', label: 'تاریخ شروع همکاری', type: 'date' },
            { name: 'commissionRate', label: 'درصد کمیسیون آژانس', type: 'number', required: true, min: 0, max: 100, step: '0.5' },
            { name: 'status', label: 'وضعیت پرونده', type: 'select', placeholder: false, options: [{ value: 'active', label: 'فعال' }, { value: 'inactive', label: 'غیرفعال' }, { value: 'suspended', label: 'تعلیق' }] },
            { name: 'availability', label: 'وضعیت آنی', type: 'select', placeholder: false, options: unmasked.map((a) => ({ value: a, label: availabilityLabel(a) })) },
            { name: 'rating', label: 'امتیاز (۰ تا ۵)', type: 'number', min: 0, max: 5, step: '0.1' },
            { name: 'notes', label: 'یادداشت راننده', type: 'textarea', rows: 2 },
            { name: '__vehicle', label: '', type: 'static', html: `<div class="section-label">${icon('car')} اطلاعات خودرو</div>` },
            { name: 'plateNumber', label: 'شماره پلاک', type: 'plate', placeholder: '۱۲ب۳۴۵', required: true },
            { name: 'brand', label: 'برند', type: 'text', required: true, placeholder: 'پژو' },
            { name: 'model', label: 'مدل', type: 'text', placeholder: '۴۰۵ GLX' },
            { name: 'color', label: 'رنگ', type: 'text' },
            { name: 'year', label: 'سال ساخت (شمسی)', type: 'number', min: 1350, max: 1420 },
            { name: 'vehicleStatus', label: 'وضعیت خودرو', type: 'select', placeholder: false, options: [{ value: 'active', label: 'فعال' }, { value: 'inactive', label: 'غیرفعال' }, { value: 'inRepair', label: 'در تعمیر' }] },
            { name: 'insuranceExpiry', label: 'انقضای بیمه', type: 'date' },
            { name: 'technicalExpiry', label: 'انقضای معاینه فنی', type: 'date' },
            { name: 'vehicleNotes', label: 'یادداشت خودرو', type: 'textarea', rows: 2, col: 3 }
        ],
        submitText: driver ? 'ذخیره تغییرات' : 'ثبت راننده و خودرو',
        onMount: (node) => JalaliDatepicker.init(node),
        onSubmit: (v) => {
            const dupPlate = DB.list('vehicles').find((x) => x.plateNumber === v.plateNumber && x.driverId !== driverId);
            if (dupPlate) throw new Error('این شماره پلاک قبلاً برای راننده دیگری ثبت شده است');
            const dupPhone = DB.list('drivers').find((x) => x.phone === v.phone && x.id !== driverId);
            if (dupPhone) throw new Error('این شماره تماس برای راننده دیگری ثبت شده است');

            const driverData = {
                fullName: v.fullName,
                phone: v.phone,
                nationalCode: v.nationalCode,
                licenseNumber: v.licenseNumber,
                joinDate: v.joinDate,
                commissionRate: Number(v.commissionRate) || settings.commissionDefault,
                status: v.status,
                availability: v.availability,
                rating: Number(v.rating) || 0,
                notes: v.notes
            };

            let newDriverId = driverId;
            if (driver) {
                DB.update('drivers', driverId, driverData);
            } else {
                newDriverId = DB.insert('drivers', driverData).id;
            }

            const vehicleData = {
                plateNumber: v.plateNumber,
                brand: v.brand,
                model: v.model,
                color: v.color,
                year: Number(v.year) || '',
                driverId: newDriverId,
                insuranceExpiry: v.insuranceExpiry,
                technicalExpiry: v.technicalExpiry,
                status: v.vehicleStatus,
                notes: v.vehicleNotes
            };
            const existing = DB.list('vehicles').find((x) => x.driverId === newDriverId);
            if (existing) DB.update('vehicles', existing.id, vehicleData);
            else DB.insert('vehicles', vehicleData);

            Toast.success(driver ? 'اطلاعات راننده و خودرو ذخیره شد' : 'راننده و خودرو ثبت شد');
            window.App.reload();
        }
    });
}

/* --------------------------- جزئیات و کارنامه --------------------------- */

function showDriverDetails(driverId) {
    const driver = DB.get('drivers', driverId);
    if (!driver) return;
    const vehicle = Drivers.vehicleOf(driverId);
    const st = Drivers.statement(driverId);
    const recent = Trips.byDriver(driverId)
        .sort((a, b) => new Date(b.pickupTime) - new Date(a.pickupTime))
        .slice(0, 8);

    Modal.open({
        title: `کارنامه ${driver.fullName}`,
        size: 'modal-lg',
        body: `
          <div class="flex justify-between items-center mb-14" style="flex-wrap:wrap; gap:10px">
            <div class="flex gap-12 items-center">
              ${availabilityBadge(driver, { clickable: false })}
              ${statusBadge(driver.status)}
              <span class="chip">${icon('percent')} کمیسیون ${toFa(driver.commissionRate)}٪</span>
              <span class="chip">${ratingStars(driver.rating)}</span>
              <span class="chip">${icon('phone')} ${toFa(driver.phone)}</span>
              <span class="chip">${icon('calendar')} همکاری از ${formatJalali(driver.joinDate)}</span>
            </div>
            ${vehicle ? `<div class="chip chip-gold">${icon('car')} ${escapeHTML(vehicle.brand)} ${escapeHTML(vehicle.model || '')} · ${escapeHTML(vehicle.plateNumber)}</div>` : ''}
          </div>

          <div class="kpi-tiles mb-16">
            ${kpiTile('سفرهای تکمیل‌شده', formatNumber(st.trips.length), 'route')}
            ${kpiTile('مجموع کرایه', formatMoney(st.totalFare, false), 'coins')}
            ${kpiTile('کمیسیون آژانس', formatMoney(st.totalCommission, false), 'percent', 'var(--gold)')}
            ${kpiTile('مانده قابل پرداخت', formatMoney(st.net > 0 ? st.net : 0, false), 'wallet', 'var(--green)')}
          </div>

          <div class="grid-2 mb-16">
            <div class="alert-row info"><span class="a-icon">${icon('wallet')}</span><div>
              <b>طلب راننده از آژانس</b><br>سهم سفرهای حقوقی: ${formatMoney(st.corporateShare, false)}<br>منهای پرداخت‌های انجام‌شده: ${formatMoney(st.payouts, false)}<br>
              <b style="color:var(--green)">${formatMoney(st.driverClaim, false)}</b></div></div>
            <div class="alert-row warn"><span class="a-icon">${icon('coins')}</span><div>
              <b>طلب آژانس از راننده</b><br>کمیسیون سفرهای نقدی: ${formatMoney(st.commissionFromCash, false)}<br>منهای تسویه‌های نقدی: ${formatMoney(st.settlements, false)}<br>
              <b style="color:var(--red)">${formatMoney(st.agencyClaim, false)}</b></div></div>
          </div>

          <div class="card-title mb-10">${icon('route')} آخرین سفرها</div>
          ${recent.length ? `<div class="table-wrapper"><table class="mini-table">
            <thead><tr><th>تاریخ</th><th>مسافر</th><th>مسیر</th><th>کرایه</th><th>سهم راننده</th><th>وضعیت</th></tr></thead>
            <tbody>${recent.map((t) => `<tr>
              <td>${formatJalali(t.pickupTime)}</td>
              <td>${escapeHTML(t.subscriberName)}</td>
              <td class="text-sm">${escapeHTML(t.pickupAddress || '—')} ← ${escapeHTML(t.dropoffAddress || '—')}</td>
              <td class="num">${formatNumber(t.fare)}</td>
              <td class="num">${formatNumber(t.driverShare)}</td>
              <td>${statusBadge(t.status)}</td>
            </tr>`).join('')}</tbody></table></div>`
            : `<div class="empty-state">${icon('route', 'icon-xl')}<p>سفری برای این راننده ثبت نشده است</p></div>`}`,
        footer: `<button class="btn btn-outline" type="button" data-modal-close>بستن</button>
                 <button class="btn btn-outline" type="button" data-edit-driver>${icon('pencil')} ویرایش</button>
                 <button class="btn btn-gold" type="button" data-goto-statement>${icon('file-text')} صورت‌حساب و چاپ رسید</button>`,
        onMount: (node) => {
            node.querySelector('[data-edit-driver]').addEventListener('click', () => {
                Modal.close();
                setTimeout(() => openDriverForm(driverId), 240);
            });
            node.querySelector('[data-goto-statement]').addEventListener('click', () => {
                Modal.close();
                setTimeout(() => window.App.navigate('acc-driver', { driverId }), 240);
            });
        }
    });
}

function kpiTile(label, value, ic, color) {
    return `<div class="kpi"><div class="k-label">${icon(ic)} ${label}</div><div class="k-value" style="${color ? `color:${color}` : ''}">${value}</div></div>`;
}
