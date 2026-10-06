/* ==========================================================================
 * js/pages/reports.js — گزارش‌های حرفه‌ای
 *   • گزارش اپراتور (سفر، میانگین زمان پاسخ، لغو، شیفت‌ها)
 *   • گزارش لغو سفرها (دلیل، راننده، ساعت، روز هفته)
 *   • گزارش مشتریان بدهکار (رده‌بندی سنّ بدهی + یادآوری پیامک)
 *   • گزارش عملکرد رانندگان (کم‌کار/پرحرفه، درآمد، امتیاز)
 * ========================================================================== */

import { DB } from '../db.js';
import { Reports, Drivers, Subscribers } from '../domain.js';
import { Toast, toastError } from '../components/toast.js';
import { renderTable } from '../components/table.js';
import { Charts } from '../components/chart.js';
import { icon } from '../components/icons.js';
import { pageHeader, statusBadge, agingBadge, availabilityBadge, previewPrint } from '../components/ui.js';
import { analysisReportHTML } from '../prints.js';
import { openSmsReminder, openDriverPayment } from './accounting.js';
import { openSubscriberPayment } from './subscribers.js';
import { JalaliDatepicker } from '../jalali.js';
import {
    todayJalali, formatJalali, formatNumber, formatMoney, escapeHTML, toFa, sum, addJalaliDays,
    currentJalaliMonthRange, humanizeMinutes, formatPercent, downloadCSV, diffJalaliDays
} from '../utils.js';

function kpi(label, value, ic, color) {
    return `<div class="kpi"><div class="k-label">${icon(ic)} ${label}</div><div class="k-value" style="${color ? `color:${color}` : ''}">${value}</div></div>`;
}

function rangeCard(from, to, prefix, extra = '') {
    return `<div class="card mb-16">
      <div class="form-row-3">
        <div class="form-group"><label class="form-label">از تاریخ</label>
          <input class="form-input jalali-date" id="${prefix}From" value="${from ? formatJalali(from) : ''}" data-key="${from}"></div>
        <div class="form-group"><label class="form-label">تا تاریخ</label>
          <input class="form-input jalali-date" id="${prefix}To" value="${to ? formatJalali(to) : ''}" data-key="${to}"></div>
        <div class="form-group"><label class="form-label">میان‌بُرها</label>
          <div class="flex gap-6" style="flex-wrap:wrap">
            <button class="btn btn-outline btn-sm" type="button" data-range="today">امروز</button>
            <button class="btn btn-outline btn-sm" type="button" data-range="week">۷ روز</button>
            <button class="btn btn-outline btn-sm" type="button" data-range="month">ماه جاری</button>
            <button class="btn btn-outline btn-sm" type="button" data-range="all">همه</button>
            ${extra}
          </div>
        </div>
      </div>
    </div>`;
}

function bindRange(root, prefix, onCompute) {
    const f = root.querySelector(`#${prefix}From`);
    const t = root.querySelector(`#${prefix}To`);
    root.querySelectorAll('[data-range]').forEach((b) => b.addEventListener('click', () => {
        const kind = b.dataset.range;
        let range = { from: '', to: '' };
        if (kind === 'today') range = { from: todayJalali(), to: todayJalali() };
        else if (kind === 'week') range = { from: addJalaliDays(todayJalali(), -6), to: todayJalali() };
        else if (kind === 'month') range = currentJalaliMonthRange();
        f.dataset.key = range.from; f.value = range.from ? formatJalali(range.from) : '';
        t.dataset.key = range.to; t.value = range.to ? formatJalali(range.to) : '';
        onCompute();
    }));
    [f, t].forEach((el) => el.addEventListener('change', onCompute));
    return () => ({ from: f.dataset.key || '', to: t.dataset.key || '' });
}

/* =====================================================================
 * گزارش اپراتور
 * ===================================================================== */

export const reportsOperator = {
    id: 'reports-operator',
    title: 'گزارش اپراتور',

    render(view) {
        const range = currentJalaliMonthRange();
        view.innerHTML = `
        <section class="page-section active">
          ${pageHeader({
            title: 'گزارش عملکرد اپراتورها', iconName: 'headset',
            subtitle: 'تعداد سفرهای ثبت‌شده، میانگین زمان پاسخ‌دهی (از ثبت تا تخصیص راننده)، تعداد لغو و ساعت کاری شیفت‌ها.',
            actions: `<button class="btn btn-outline btn-sm" type="button" data-print>${icon('printer')} خروجی PDF</button>`
          })}
          ${rangeCard(range.from, range.to, 'rop')}
          <div class="kpi-tiles mb-16" id="ropKpis"></div>
          <div class="charts-grid mb-16">
            <div class="card"><div class="card-header"><div class="card-title">${icon('bar-chart')} تعداد سفر هر اپراتور</div></div><div class="chart-container" id="ropChart" style="height:220px"></div></div>
            <div class="card"><div class="card-header"><div class="card-title">${icon('clock')} میانگین زمان پاسخ‌دهی (دقیقه)</div></div><div class="chart-container" id="ropResp" style="height:220px"></div></div>
          </div>
          <div class="card mb-16"><div id="ropTable"></div></div>
          <div class="card">
            <div class="card-header"><div class="card-title">${icon('play')} شیفت‌های ثبت‌شده</div></div>
            <div id="ropShifts"></div>
          </div>
        </section>`;

        const root = view.querySelector('.page-section');
        JalaliDatepicker.init(root);
        const getRange = bindRange(root, 'rop', () => compute());

        function compute() {
            const { from, to } = getRange();
            const data = Reports.operators(from, to);
            const totalTrips = data.totalTrips;
            const totalCancelled = sum(data.byOperator, (o) => o.cancelled);
            const avgResp = data.byOperator.filter((o) => o.avgResponse > 0);
            const meanResp = avgResp.length ? Math.round(sum(avgResp, (o) => o.avgResponse) / avgResp.length) : 0;

            root.querySelector('#ropKpis').innerHTML = `
              ${kpi('کل سفرهای دوره', toFa(totalTrips), 'route')}
              ${kpi('لغو شده', toFa(totalCancelled), 'x-circle', 'var(--red)')}
              ${kpi('نرخ لغو', totalTrips ? formatPercent(Math.round((totalCancelled / totalTrips) * 100)) : '۰٪', 'percent')}
              ${kpi('میانگین زمان پاسخ', meanResp ? humanizeMinutes(meanResp) : '—', 'timer')}
              ${kpi('تعداد شیفت‌ها', toFa(data.shifts.length), 'play')}`;

            Charts.bar(root.querySelector('#ropChart'), {
                labels: data.byOperator.map((o) => o.operator.fullName),
                data: data.byOperator.map((o) => o.tripCount),
                emptyText: 'در این بازه سفری ثبت نشده است'
            });
            Charts.bar(root.querySelector('#ropResp'), {
                labels: data.byOperator.filter((o) => o.avgResponse).map((o) => o.operator.fullName),
                data: data.byOperator.filter((o) => o.avgResponse).map((o) => o.avgResponse),
                color: '#3b82f6',
                emptyText: 'زمان پاسخی ثبت نشده است'
            });

            renderTable(root.querySelector('#ropTable'), {
                key: 'reports-operators',
                columns: [
                    { key: 'name', label: 'اپراتور', sortable: true, value: (o) => o.operator.fullName, render: (o) => `<b>${escapeHTML(o.operator.fullName)}</b><span class="cell-sub">${escapeHTML(o.operator.username)} · ${o.operator.role === 'admin' ? 'مدیر' : o.operator.role === 'accountant' ? 'حسابدار' : 'اپراتور'}</span>` },
                    { key: 'tripCount', label: 'ثبت سفر', sortable: true, align: 'center', render: (o) => formatNumber(o.tripCount) },
                    { key: 'completed', label: 'تکمیل', sortable: true, align: 'center', render: (o) => formatNumber(o.completed) },
                    { key: 'cancelled', label: 'لغو', sortable: true, align: 'center', render: (o) => `<span class="${o.cancelled ? 'text-red' : ''}">${formatNumber(o.cancelled)}</span>` },
                    { key: 'avgResponse', label: 'میانگین پاسخ', sortable: true, align: 'center', render: (o) => o.avgResponse ? humanizeMinutes(o.avgResponse) : '—' },
                    { key: 'fareSum', label: 'مجموع کرایه', sortable: true, align: 'center', render: (o) => formatNumber(o.fareSum) },
                    { key: 'shiftCount', label: 'شیفت', sortable: true, align: 'center', render: (o) => formatNumber(o.shiftCount) },
                    { key: 'shiftHours', label: 'ساعت کاری', sortable: true, align: 'center', render: (o) => `${formatNumber(o.shiftHours)} ساعت` }
                ],
                rows: data.byOperator,
                search: { keys: [] },
                pageSize: 10,
                initialSort: { key: 'tripCount', dir: 'desc' },
                emptyText: 'داده‌ای موجود نیست',
                emptyIcon: 'headset'
            });

            const shifts = [...data.shifts].sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
            root.querySelector('#ropShifts').innerHTML = shifts.length ? `
              <div class="table-wrapper"><table>
                <thead><tr><th>کد</th><th>اپراتور</th><th>تاریخ</th><th>شروع</th><th>پایان</th><th>سفر</th><th>لغو</th><th>کمیسیون</th><th>وضعیت</th></tr></thead>
                <tbody>${shifts.slice(0, 30).map((s) => {
                    const st = s.stats || {};
                    return `<tr>
                      <td>${escapeHTML(s.code || '—')}</td>
                      <td>${escapeHTML(s.operatorName || DB.get('operators', s.operatorId)?.fullName || '—')}</td>
                      <td>${formatJalali(s.date)}</td>
                      <td>${new Date(s.startTime).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}</td>
                      <td>${s.endTime ? new Date(s.endTime).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                      <td class="num">${toFa(st.tripsCount || 0)}</td>
                      <td class="num">${toFa(st.cancelledCount || 0)}</td>
                      <td class="num">${formatNumber(st.commission || 0)}</td>
                      <td>${statusBadge(s.status)}</td>
                    </tr>`;
                }).join('')}</tbody>
              </table></div>` : `<div class="empty-state">${icon('play', 'icon-xl')}<p>شیفتی ثبت نشده است</p></div>`;

            root._data = data;
        }

        root.querySelector('[data-print]').addEventListener('click', () => {
            const { from, to } = getRange();
            const d = Reports.operators(from, to);
            previewPrint(analysisReportHTML({
                title: 'گزارش عملکرد اپراتورها',
                subtitle: `بازه: ${from ? formatJalali(from) : 'ابتدا'} تا ${to ? formatJalali(to) : 'اکنون'}`,
                kpis: [
                    { label: 'کل سفرها', value: toFa(d.totalTrips) },
                    { label: 'تعداد شیفت', value: toFa(d.shifts.length) },
                    { label: 'مجموع لغو', value: toFa(sum(d.byOperator, (o) => o.cancelled)) }
                ],
                tables: [{
                    title: 'عملکرد اپراتورها',
                    headers: ['اپراتور', 'ثبت سفر', 'تکمیل', 'لغو', 'میانگین پاسخ (دقیقه)', 'مجموع کرایه', 'شیفت', 'ساعت کاری'],
                    rows: d.byOperator.map((o) => [escapeHTML(o.operator.fullName), toFa(o.tripCount), toFa(o.completed), toFa(o.cancelled),
                        toFa(o.avgResponse), formatNumber(o.fareSum), toFa(o.shiftCount), toFa(o.shiftHours)])
                }]
            }), { title: 'گزارش اپراتورها', filename: `operators-${todayJalali()}` });
        });

        compute();
    }
};

/* =====================================================================
 * گزارش لغو سفرها
 * ===================================================================== */

export const reportsCancel = {
    id: 'reports-cancel',
    title: 'گزارش لغو سفرها',

    render(view) {
        const range = currentJalaliMonthRange();
        view.innerHTML = `
        <section class="page-section active">
          ${pageHeader({
            title: 'گزارش لغو سفرها', iconName: 'x-circle',
            subtitle: 'تحلیل لغو بر اساس دلیل، راننده، ساعت روز و روز هفته — برای کاهش نرخ لغو.',
            actions: `<button class="btn btn-outline btn-sm" type="button" data-print>${icon('printer')} خروجی PDF</button>`
          })}
          ${rangeCard(range.from, range.to, 'rcn')}
          <div class="kpi-tiles mb-16" id="rcnKpis"></div>
          <div class="charts-grid mb-16">
            <div class="card"><div class="card-header"><div class="card-title">${icon('percent')} لغو بر اساس دلیل</div></div><div class="chart-container" id="rcnReason" style="height:230px"></div></div>
            <div class="card"><div class="card-header"><div class="card-title">${icon('clock')} لغو بر اساس ساعت روز</div></div><div class="chart-container" id="rcnHour" style="height:230px"></div></div>
          </div>
          <div class="grid-2 mb-16">
            <div class="card"><div class="card-header"><div class="card-title">${icon('car')} لغو بر اساس راننده</div></div><div id="rcnDriverTable"></div></div>
            <div class="card"><div class="card-header"><div class="card-title">${icon('calendar')} لغو بر اساس روز هفته</div></div><div class="chart-container" id="rcnWeek" style="height:230px"></div></div>
          </div>
          <div class="card"><div class="card-header"><div class="card-title">${icon('list')} ریز سفرهای لغوشده</div></div><div id="rcnTable"></div></div>
        </section>`;

        const root = view.querySelector('.page-section');
        JalaliDatepicker.init(root);
        const getRange = bindRange(root, 'rcn', () => compute());

        function compute() {
            const { from, to } = getRange();
            const data = Reports.cancellations(from, to);
            const allTrips = DB.list('trips');
            const rate = allTrips.length ? (data.total / allTrips.length) * 100 : 0;
            const topReason = data.byReason[0];
            const topDriver = data.byDriver[0];

            root.querySelector('#rcnKpis').innerHTML = `
              ${kpi('تعداد لغو', toFa(data.total), 'x-circle', 'var(--red)')}
              ${kpi('نرخ لغو', formatPercent(Math.round(rate)), 'percent')}
              ${kpi('بیشترین دلیل', topReason ? `${escapeHTML(topReason.reason)} (${toFa(topReason.count)})` : '—', 'alert-circle')}
              ${kpi('بیشترین راننده', topDriver ? `${escapeHTML(topDriver.driverName)} (${toFa(topDriver.count)})` : '—', 'car')}`;

            Charts.pie(root.querySelector('#rcnReason'), {
                labels: data.byReason.map((r) => r.reason),
                data: data.byReason.map((r) => r.count),
                donut: false,
                emptyText: 'لغوی در این بازه ثبت نشده است'
            });
            Charts.bar(root.querySelector('#rcnHour'), {
                labels: data.byHour.filter((h) => h.count > 0).map((h) => toFa(h.hour) + ':۰۰'),
                data: data.byHour.filter((h) => h.count > 0).map((h) => h.count),
                color: '#ef4444',
                emptyText: 'داده‌ای موجود نیست'
            });
            Charts.bar(root.querySelector('#rcnWeek'), {
                labels: data.byWeekday.map((w) => w.name),
                data: data.byWeekday.map((w) => w.count),
                color: '#f59e0b',
                emptyText: 'داده‌ای موجود نیست'
            });

            renderTable(root.querySelector('#rcnDriverTable'), {
                key: 'cancel-drivers',
                columns: [
                    { key: 'driverName', label: 'راننده', sortable: true },
                    { key: 'count', label: 'تعداد لغو', sortable: true, align: 'center', render: (r) => `<span class="text-red">${formatNumber(r.count)}</span>` },
                    {
                        key: 'rate', label: 'سهم از لغوها', sortable: true, align: 'center',
                        sortValue: (r) => r.count,
                        render: (r) => formatPercent(data.total ? Math.round((r.count / data.total) * 100) : 0)
                    }
                ],
                rows: data.byDriver,
                search: { keys: ['driverName'] },
                pageSize: 10,
                initialSort: { key: 'count', dir: 'desc' },
                emptyText: 'لغوی ثبت نشده است',
                emptyIcon: 'car'
            });

            renderTable(root.querySelector('#rcnTable'), {
                key: 'cancel-trips',
                columns: [
                    { key: 'code', label: 'کد', sortable: true },
                    { key: 'pickupTime', label: 'تاریخ', sortable: true, render: (t) => formatJalali(t.pickupTime) },
                    { key: 'subscriberName', label: 'مسافر', sortable: true },
                    { key: 'driverId', label: 'راننده', sortable: true, render: (t) => escapeHTML(DB.get('drivers', t.driverId)?.fullName || 'تخصیص‌نیافته') },
                    { key: 'pickupAddress', label: 'مبدأ', sortable: true },
                    { key: 'cancelReason', label: 'دلیل لغو', sortable: true, render: (t) => `<span class="status-badge status-cancelled">${escapeHTML(t.cancelReason || 'نامشخص')}</span>` },
                    { key: 'cancelNote', label: 'توضیح', sortable: false, render: (t) => `<span class="text-sm op-60">${escapeHTML(t.cancelNote || '')}</span>` },
                    { key: 'cancelledBy', label: 'ثبت‌کننده', sortable: false, render: (t) => escapeHTML(t.cancelledBy || '—') }
                ],
                rows: data.trips,
                search: { keys: ['code', 'subscriberName', 'cancelReason', 'cancelNote'] },
                pageSize: 10,
                initialSort: { key: 'pickupTime', dir: 'desc' },
                csv: { filename: `cancellations-${todayJalali()}` },
                emptyText: 'لغوی در این بازه ثبت نشده است',
                emptyIcon: 'x-circle'
            });
            root._data = data;
        }

        root.querySelector('[data-print]').addEventListener('click', () => {
            const { from, to } = getRange();
            const d = Reports.cancellations(from, to);
            previewPrint(analysisReportHTML({
                title: 'گزارش لغو سفرها',
                subtitle: `بازه: ${from ? formatJalali(from) : 'ابتدا'} تا ${to ? formatJalali(to) : 'اکنون'}`,
                kpis: [{ label: 'تعداد لغو', value: toFa(d.total) }],
                tables: [
                    { title: 'لغو بر اساس دلیل', headers: ['دلیل', 'تعداد'], rows: d.byReason.map((r) => [escapeHTML(r.reason), toFa(r.count)]) },
                    { title: 'لغو بر اساس راننده', headers: ['راننده', 'تعداد'], rows: d.byDriver.map((r) => [escapeHTML(r.driverName), toFa(r.count)]) },
                    { title: 'لغو بر اساس ساعت', headers: ['ساعت', 'تعداد'], rows: d.byHour.filter((h) => h.count).map((h) => [toFa(h.hour) + ':۰۰', toFa(h.count)]) }
                ]
            }), { title: 'گزارش لغو سفرها', filename: `cancellations-${todayJalali()}` });
        });

        compute();
    }
};

/* =====================================================================
 * گزارش مشتریان بدهکار
 * ===================================================================== */

export const reportsDebtors = {
    id: 'reports-debtors',
    title: 'مشتریان بدهکار',

    render(view) {
        view.innerHTML = `
        <section class="page-section active">
          ${pageHeader({
            title: 'گزارش مشتریان بدهکار', iconName: 'wallet',
            subtitle: 'رده‌بندی سنّ بدهی: ۰ تا ۳۰ روز، ۳۱ تا ۶۰ روز و بیش از ۶۰ روز. یادآوری پیامک در این فاز فقط متنی است.',
            actions: `<button class="btn btn-outline btn-sm" type="button" data-print>${icon('printer')} خروجی PDF</button>`
          })}
          <div class="kpi-tiles mb-16" id="dbtKpis"></div>
          <div class="grid-3 mb-16" id="dbtBuckets"></div>
          <div class="card"><div id="dbtTable"></div></div>
        </section>`;

        const root = view.querySelector('.page-section');
        const nameOf = (x) => x.subscriber.fullName;
        const refresh = () => {
            const d = Reports.debtors();
            root.querySelector('#dbtKpis').innerHTML = `
              ${kpi('مشتریان بدهکار', toFa(d.list.length), 'users', 'var(--red)')}
              ${kpi('مجموع بدهی', formatMoney(d.total, false), 'wallet', 'var(--red)')}
              ${kpi('بیشترین بدهی', d.list[0] ? escapeHTML(nameOf(d.list[0])) : '—', 'alert-circle')}
              ${kpi('میانگین بدهی', formatMoney(d.list.length ? d.total / d.list.length : 0, false), 'calculator')}`;

            root.querySelector('#dbtBuckets').innerHTML = `
              <div class="card"><div class="card-title mb-8">${icon('clock')} ۰ تا ۳۰ روز</div>
                <div class="stat-value" style="font-size:1.2rem">${formatMoney(d.buckets.b0_30, false)}</div>
                <div class="hint">${toFa(d.list.filter((x) => x.age <= 30).length)} مشترک</div></div>
              <div class="card"><div class="card-title mb-8">${icon('clock')} ۳۱ تا ۶۰ روز</div>
                <div class="stat-value" style="font-size:1.2rem;color:var(--yellow)">${formatMoney(d.buckets.b30_60, false)}</div>
                <div class="hint">${toFa(d.list.filter((x) => x.age > 30 && x.age <= 60).length)} مشترک</div></div>
              <div class="card"><div class="card-title mb-8">${icon('alert-triangle')} بیش از ۶۰ روز</div>
                <div class="stat-value" style="font-size:1.2rem;color:var(--red)">${formatMoney(d.buckets.b60, false)}</div>
                <div class="hint">${toFa(d.list.filter((x) => x.age > 60).length)} مشترک — پیگیری فوری</div></div>`;

            renderTable(root.querySelector('#dbtTable'), {
                key: 'debtors-table',
                columns: [
                    {
                        key: 'name', label: 'مشترک', sortable: true, value: (x) => x.subscriber.fullName,
                        render: (x) => `<b>${escapeHTML(x.subscriber.fullName)}</b><span class="cell-sub">${escapeHTML(x.subscriber.subscriptionNumber || '')} · ${toFa(x.subscriber.phone)}</span>`
                    },
                    { key: 'type', label: 'نوع', sortable: true, align: 'center', value: (x) => x.subscriber.type, render: (x) => statusBadge(x.subscriber.type) },
                    { key: 'debt', label: 'بدهی', sortable: true, align: 'center', render: (x) => `<span class="text-red text-bold">${formatNumber(x.debt)}</span>` },
                    { key: 'age', label: 'سنّ بدهی', sortable: true, align: 'center', render: (x) => `${toFa(x.age)} روز ${agingBadge(x.age)}` },
                    {
                        key: 'lastPayment', label: 'آخرین پرداخت', sortable: true, align: 'center',
                        sortValue: (x) => x.lastPayment?.date || '',
                        render: (x) => x.lastPayment ? `${formatJalali(x.lastPayment.date)}<span class="cell-sub">${formatNumber(x.lastPayment.amount)}</span>` : '<span class="text-muted">ندارد</span>'
                    },
                    {
                        key: 'actions', label: 'عملیات', sortable: false, align: 'center',
                        render: (x) => `
                          <button class="btn-icon" data-pay="${x.subscriber.id}" title="ثبت پرداخت">${icon('wallet')}</button>
                          <button class="btn-icon" data-sms="${x.subscriber.id}" title="یادآوری پیامک">${icon('message')}</button>
                          <button class="btn-icon" data-statement="${x.subscriber.id}" title="صورت‌حساب">${icon('file-text')}</button>`
                    }
                ],
                rows: d.list,
                search: { keys: [] },
                pageSize: 10,
                initialSort: { key: 'debt', dir: 'desc' },
                csv: { filename: `debtors-${todayJalali()}` },
                emptyText: 'هیچ مشترکی بدهکار نیست 🎉',
                emptyIcon: 'check-circle',
                footer: (rows, allRows) => `<div class="kpi-tiles"><div class="kpi"><div class="k-label">جمع بدهی مشتریان فهرست‌شده</div><div class="k-value text-red">${formatMoney(sum(allRows, (x) => x.debt))}</div></div></div>`
            });
            root._debtors = d;
        };

        root.addEventListener('click', (e) => {
            const pay = e.target.closest('[data-pay]');
            if (pay) { openSubscriberPayment(pay.dataset.pay, { onDone: refresh }); return; }
            const sms = e.target.closest('[data-sms]');
            if (sms) {
                const st = Subscribers.statement(sms.dataset.sms);
                openSmsReminder(st);
                return;
            }
            const stBtn = e.target.closest('[data-statement]');
            if (stBtn) { window.App.navigate('acc-subscribers', { subscriberId: stBtn.dataset.statement }); }
        });

        root.querySelector('[data-print]').addEventListener('click', () => {
            const d = Reports.debtors();
            previewPrint(analysisReportHTML({
                title: 'گزارش مشتریان بدهکار',
                kpis: [
                    { label: 'تعداد بدهکاران', value: toFa(d.list.length) },
                    { label: 'مجموع بدهی', value: formatMoney(d.total, false) },
                    { label: '۰-۳۰ روز', value: formatMoney(d.buckets.b0_30, false) },
                    { label: '۳۱-۶۰ روز', value: formatMoney(d.buckets.b30_60, false) },
                    { label: 'بیش از ۶۰ روز', value: formatMoney(d.buckets.b60, false) }
                ],
                tables: [{
                    title: 'فهرست بدهکاران',
                    headers: ['مشترک', 'تلفن', 'نوع', 'بدهی', 'سنّ بدهی (روز)', 'آخرین پرداخت'],
                    rows: d.list.map((x) => [
                        escapeHTML(x.subscriber.fullName), toFa(x.subscriber.phone), x.subscriber.type === 'corporate' ? 'حقوقی' : 'حقیقی',
                        formatNumber(x.debt), toFa(x.age), x.lastPayment ? formatJalali(x.lastPayment.date) : '—'
                    ])
                }]
            }), { title: 'گزارش بدهکاران', filename: `debtors-${todayJalali()}` });
        });

        refresh();
    }
};

/* =====================================================================
 * گزارش عملکرد رانندگان
 * ===================================================================== */

export const reportsDrivers = {
    id: 'reports-drivers',
    title: 'عملکرد رانندگان',

    render(view) {
        let days = 30;
        view.innerHTML = `
        <section class="page-section active">
          ${pageHeader({
            title: 'گزارش عملکرد رانندگان', iconName: 'car',
            subtitle: 'مرتب‌سازی بر اساس تعداد سفر (کم‌کار/پرحرفه)، درآمد و امتیاز مشتریان.',
            actions: `<button class="btn btn-outline btn-sm" type="button" data-print>${icon('printer')} خروجی PDF</button>`
          })}
          <div class="card mb-16">
            <div class="segmented" id="drvDays">
              ${[7, 30, 90].map((d) => `<button type="button" data-days="${d}" class="${d === days ? 'active' : ''}">${toFa(d)} روز اخیر</button>`).join('')}
              <button type="button" data-days="3650">کل دوره</button>
            </div>
          </div>
          <div class="kpi-tiles mb-16" id="drvKpis"></div>
          <div class="charts-grid mb-16">
            <div class="card"><div class="card-header"><div class="card-title">${icon('bar-chart')} تعداد سفر رانندگان</div></div><div class="chart-container" id="drvTrips" style="height:230px"></div></div>
            <div class="card"><div class="card-header"><div class="card-title">${icon('wallet')} درآمد رانندگان (سهم راننده)</div></div><div class="chart-container" id="drvIncome" style="height:230px"></div></div>
          </div>
          <div class="card"><div id="drvTable"></div></div>
        </section>`;

        const root = view.querySelector('.page-section');
        const refresh = () => {
            const data = Drivers.activity(days);
            const sorted = [...data].sort((a, b) => b.tripCount - a.tripCount);
            const active = sorted.filter((d) => d.tripCount > 0);
            const idle = sorted.filter((d) => d.tripCount === 0);
            const totalTrips = sum(data, (d) => d.tripCount);

            root.querySelector('#drvKpis').innerHTML = `
              ${kpi('رانندگان فعال', toFa(active.length), 'user-check', 'var(--green)')}
              ${kpi('رانندگان کم‌کار/بی‌کار', toFa(idle.length), 'wifi-off', 'var(--yellow)')}
              ${kpi('مجموع سفر دوره', toFa(totalTrips), 'route')}
              ${kpi('پرحرفه‌ترین راننده', sorted[0] ? escapeHTML(sorted[0].driver.fullName) : '—', 'star')}
              ${kpi('میانگین سفر هر راننده', toFa(data.length ? Math.round(totalTrips / Math.max(1, active.length)) : 0), 'activity')}`;

            Charts.bar(root.querySelector('#drvTrips'), {
                labels: sorted.map((d) => d.driver.fullName),
                data: sorted.map((d) => d.tripCount),
                emptyText: 'در این دوره سفری ثبت نشده است'
            });
            Charts.bar(root.querySelector('#drvIncome'), {
                labels: sorted.map((d) => d.driver.fullName),
                data: sorted.map((d) => d.share),
                color: '#10b981',
                emptyText: 'درآمدی ثبت نشده است'
            });

            renderTable(root.querySelector('#drvTable'), {
                key: 'drivers-activity',
                columns: [
                    { key: 'name', label: 'راننده', sortable: true, value: (d) => d.driver.fullName, render: (d) => `<b>${escapeHTML(d.driver.fullName)}</b><span class="cell-sub">${toFa(d.driver.phone)}</span>` },
                    { key: 'availability', label: 'وضعیت', sortable: true, align: 'center', value: (d) => d.driver.availability, render: (d) => availabilityBadge(d.driver, { clickable: false }) },
                    { key: 'tripCount', label: 'تعداد سفر', sortable: true, align: 'center', render: (d) => formatNumber(d.tripCount) },
                    { key: 'fare', label: 'مجموع کرایه', sortable: true, align: 'center', render: (d) => formatNumber(d.fare) },
                    { key: 'commission', label: 'کمیسیون آژانس', sortable: true, align: 'center', render: (d) => `<span class="text-gold">${formatNumber(d.commission)}</span>` },
                    { key: 'share', label: 'سهم راننده', sortable: true, align: 'center', render: (d) => `<span class="text-green">${formatNumber(d.share)}</span>` },
                    { key: 'avgFare', label: 'میانگین کرایه', sortable: true, align: 'center', render: (d) => formatNumber(d.avgFare) },
                    { key: 'rating', label: 'امتیاز', sortable: true, align: 'center', render: (d) => toFa(d.rating || 0) },
                    {
                        key: 'actions', label: 'عملیات', sortable: false, align: 'center',
                        render: (d) => `<button class="btn-icon" data-statement="${d.driver.id}" title="صورت‌حساب">${icon('file-text')}</button>
                                        <button class="btn-icon" data-pay="${d.driver.id}" title="ثبت پرداخت">${icon('wallet')}</button>`
                    }
                ],
                rows: data,
                search: { keys: [] },
                pageSize: 10,
                initialSort: { key: 'tripCount', dir: 'desc' },
                csv: { filename: `driver-performance-${todayJalali()}` },
                emptyText: 'راننده‌ای ثبت نشده است',
                emptyIcon: 'car',
                footer: (rows, allRows) => `
                  <div class="kpi-tiles">
                    ${kpi('جمع سفرها', toFa(sum(allRows, (d) => d.tripCount)), 'route')}
                    ${kpi('جمع کرایه', formatMoney(sum(allRows, (d) => d.fare), false), 'coins')}
                    ${kpi('جمع کمیسیون', formatMoney(sum(allRows, (d) => d.commission), false), 'percent', 'var(--gold)')}
                    ${kpi('جمع سهم رانندگان', formatMoney(sum(allRows, (d) => d.share), false), 'user-check', 'var(--green)')}
                  </div>`
            });
            root._data = data;
        };

        root.querySelector('#drvDays').addEventListener('click', (e) => {
            const b = e.target.closest('[data-days]');
            if (!b) return;
            days = Number(b.dataset.days);
            root.querySelectorAll('#drvDays button').forEach((x) => x.classList.toggle('active', x === b));
            refresh();
        });

        root.addEventListener('click', (e) => {
            const st = e.target.closest('[data-statement]');
            if (st) { window.App.navigate('acc-driver', { driverId: st.dataset.statement }); return; }
            const pay = e.target.closest('[data-pay]');
            if (pay) openDriverPayment(pay.dataset.pay, { onDone: refresh });
        });

        root.querySelector('[data-print]').addEventListener('click', () => {
            const data = Drivers.activity(days);
            previewPrint(analysisReportHTML({
                title: 'گزارش عملکرد رانندگان',
                subtitle: `دوره: ${days > 365 ? 'کل دوره' : toFa(days) + ' روز اخیر'}`,
                kpis: [
                    { label: 'تعداد رانندگان', value: toFa(data.length) },
                    { label: 'مجموع سفر', value: toFa(sum(data, (d) => d.tripCount)) },
                    { label: 'مجموع سهم رانندگان', value: formatMoney(sum(data, (d) => d.share), false) }
                ],
                tables: [{
                    title: 'عملکرد رانندگان',
                    headers: ['راننده', 'تعداد سفر', 'مجموع کرایه', 'کمیسیون', 'سهم راننده', 'میانگین کرایه', 'امتیاز'],
                    rows: [...data].sort((a, b) => b.tripCount - a.tripCount).map((d) => [
                        escapeHTML(d.driver.fullName), toFa(d.tripCount), formatNumber(d.fare),
                        formatNumber(d.commission), formatNumber(d.share), formatNumber(d.avgFare), toFa(d.rating || 0)
                    ])
                }]
            }), { title: 'عملکرد رانندگان', filename: `drivers-performance-${todayJalali()}` });
        });

        refresh();
    }
};

export default { reportsOperator, reportsCancel, reportsDebtors, reportsDrivers };
