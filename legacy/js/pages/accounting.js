/* ==========================================================================
 * js/pages/accounting.js — حسابداری: صورت‌حساب راننده، گزارش مالی، کمیسیون‌ها،
 *                          حسابداری مشترکین، پرداخت‌ها، هزینه‌ها
 * --------------------------------------------------------------------------
 * رفع باگ تسویه حقوقی راننده (فاز ۱.۶): مانده قابل پرداخت از تفاضل دقیق
 * «طلب راننده از آژانس» و «طلب آژانس از راننده» محاسبه می‌شود و پویا است.
 * ========================================================================== */

import { DB } from '../db.js';
import { Auth } from '../auth.js';
import { Drivers, Subscribers, Payments, Trips, Reports } from '../domain.js';
import { Toast, toastError } from '../components/toast.js';
import { Modal } from '../components/modal.js';
import { openForm } from '../components/form.js';
import { renderTable } from '../components/table.js';
import { Charts } from '../components/chart.js';
import { icon } from '../components/icons.js';
import { statusBadge, pageHeader, previewPrint } from '../components/ui.js';
import { invoiceHTML, driverReceiptHTML, financialReportHTML } from '../prints.js';
import { openSubscriberPayment } from './subscribers.js';
import { JalaliDatepicker } from '../jalali.js';
import {
    todayJalali, formatJalali, formatNumber, formatMoney, escapeHTML, toFa, sum,
    lastJalaliMonths, jalaliMonthLabel, currentJalaliMonthRange, isoToJalaliKey, downloadCSV, addJalaliDays
} from '../utils.js';

const EXPENSE_CATEGORIES = ['برق', 'تلفن', 'آب', 'گاز', 'لوازم اداری', 'کاغذ', 'اینترنت', 'چای و قند', 'تعمیرات', 'تبلیغات', 'سایر'];

function kpi(label, value, ic, color) {
    return `<div class="kpi"><div class="k-label">${icon(ic)} ${label}</div><div class="k-value" style="${color ? `color:${color}` : ''}">${value}</div></div>`;
}

function dateRangeCard({ from, to, idPrefix = 'acc' }) {
    return `
      <div class="form-row-3">
        <div class="form-group">
          <label class="form-label">از تاریخ</label>
          <input class="form-input jalali-date" id="${idPrefix}From" value="${from ? formatJalali(from) : ''}" data-key="${from}">
        </div>
        <div class="form-group">
          <label class="form-label">تا تاریخ</label>
          <input class="form-input jalali-date" id="${idPrefix}To" value="${to ? formatJalali(to) : ''}" data-key="${to}">
        </div>
        <div class="form-group">
          <label class="form-label">&nbsp;</label>
          <div class="flex gap-6" style="flex-wrap:wrap">
            <button class="btn btn-outline btn-sm" type="button" data-range="today">امروز</button>
            <button class="btn btn-outline btn-sm" type="button" data-range="month">ماه جاری</button>
            <button class="btn btn-outline btn-sm" type="button" data-range="all">همه</button>
          </div>
        </div>
      </div>`;
}

function bindRange(root, idPrefix, onChange) {
    const f = root.querySelector(`#${idPrefix}From`);
    const t = root.querySelector(`#${idPrefix}To`);
    root.querySelectorAll('[data-range]').forEach((b) => b.addEventListener('click', () => {
        const kind = b.dataset.range;
        const range = kind === 'today' ? { from: todayJalali(), to: todayJalali() }
            : kind === 'month' ? currentJalaliMonthRange()
                : { from: '', to: '' };
        f.dataset.key = range.from; f.value = range.from ? formatJalali(range.from) : '';
        t.dataset.key = range.to; t.value = range.to ? formatJalali(range.to) : '';
        onChange?.();
    }));
    [f, t].forEach((el) => el.addEventListener('change', () => onChange?.()));
    return () => ({ from: f.dataset.key || '', to: t.dataset.key || '' });
}

/* =====================================================================
 * صورت‌حساب رانندگان
 * ===================================================================== */

export const accDriver = {
    id: 'acc-driver',
    title: 'صورت‌حساب رانندگان',

    render(view, params = {}) {
        const drivers = Drivers.all();
        const initialDriver = params.driverId || '';
        const range = currentJalaliMonthRange();

        view.innerHTML = `
        <section class="page-section active">
          ${pageHeader({
            title: 'صورت‌حساب رانندگان', iconName: 'file-text',
            subtitle: 'مانده قابل پرداخت = طلب راننده از آژانس (سهم سفرهای حقوقی منهای پرداخت‌ها) − طلب آژانس از راننده (کمیسیون نقدی منهای تسویه‌ها)',
            actions: `<button class="btn btn-outline btn-sm" type="button" data-payments-page>${icon('wallet')} همه پرداخت‌ها</button>`
          })}

          <div class="card mb-16">
            <div class="form-row mb-10">
              <div class="form-group">
                <label class="form-label">راننده</label>
                <select class="form-select" id="accDriverSelect">
                  <option value="">انتخاب راننده...</option>
                  ${drivers.map((d) => `<option value="${d.id}" ${d.id === initialDriver ? 'selected' : ''}>${escapeHTML(d.fullName)} · کمیسیون ${toFa(d.commissionRate)}٪</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">بازه گزارش</label>
                <div class="flex gap-6" style="flex-wrap:wrap">
                  <button class="btn btn-gold btn-sm" type="button" id="accShow">${icon('bar-chart')} نمایش صورت‌حساب</button>
                  <button class="btn btn-outline btn-sm" type="button" id="accPay" disabled>${icon('wallet')} ثبت پرداخت</button>
                  <button class="btn btn-outline btn-sm" type="button" id="accPrint" disabled>${icon('printer')} چاپ رسید</button>
                  <button class="btn btn-outline btn-sm" type="button" id="accCsv" disabled>${icon('file-csv')} خروجی CSV</button>
                </div>
              </div>
            </div>
            ${dateRangeCard({ from: range.from, to: range.to, idPrefix: 'accDriver' })}
          </div>

          <div id="accDriverResult">
            <div class="card"><div class="empty-state">${icon('file-text', 'icon-xl')}<p>برای مشاهده صورت‌حساب، راننده را انتخاب کنید</p></div></div>
          </div>
        </section>`;

        const root = view.querySelector('.page-section');
        JalaliDatepicker.init(root);
        const getRange = bindRange(root, 'accDriver', () => {});
        const result = root.querySelector('#accDriverResult');
        const btns = {
            pay: root.querySelector('#accPay'),
            print: root.querySelector('#accPrint'),
            csv: root.querySelector('#accCsv')
        };

        const update = () => {
            const driverId = root.querySelector('#accDriverSelect').value;
            const { from, to } = getRange();
            if (!driverId) {
                result.innerHTML = `<div class="card"><div class="empty-state">${icon('file-text', 'icon-xl')}<p>راننده را انتخاب کنید</p></div></div>`;
                Object.values(btns).forEach((b) => b.setAttribute('disabled', 'disabled'));
                return;
            }
            const st = Drivers.statement(driverId, from, to);
            result.innerHTML = renderDriverStatement(st);
            Object.values(btns).forEach((b) => b.removeAttribute('disabled'));
            result._statement = st;
        };

        root.querySelector('#accShow').addEventListener('click', update);
        root.querySelector('#accDriverSelect').addEventListener('change', update);
        root.addEventListener('change', (e) => { if (e.target.closest('#accDriverFrom, #accDriverTo')) update(); });

        btns.pay.addEventListener('click', () => {
            const st = result._statement;
            if (!st) return;
            openDriverPayment(st.driver.id, { onDone: update });
        });
        btns.print.addEventListener('click', () => {
            const st = result._statement;
            if (!st) return;
            previewPrint(driverReceiptHTML(st), { title: `رسید راننده — ${st.driver.fullName}`, filename: `driver-receipt-${st.driver.fullName}` });
        });
        btns.csv.addEventListener('click', () => {
            const st = result._statement;
            if (!st) return;
            downloadCSV(`driver-${st.driver.fullName}-${todayJalali()}.csv`,
                ['تاریخ', 'مسافر', 'مبدأ', 'مقصد', 'کرایه', 'کمیسیون', 'سهم راننده', 'نوع تسویه', 'وضعیت'],
                st.trips.map((t) => [
                    formatJalali(t.pickupTime), t.subscriberName, t.pickupAddress, t.dropoffAddress,
                    t.fare, t.commission, t.driverShare, t.billedTo === 'company' ? 'آژانس' : 'راننده', t.status
                ]));
            Toast.success('خروجی CSV دانلود شد');
        });

        root.querySelector('[data-payments-page]').addEventListener('click', () => window.App.navigate('acc-payments'));

        if (initialDriver) update();
    }
};

function renderDriverStatement(st) {
    const payments = [...st.payments].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return `
      <div class="card mb-16">
        <div class="card-header">
          <div class="card-title">${icon('user')} ${escapeHTML(st.driver.fullName)}
            <span class="chip">${toFa(st.driver.commissionRate)}٪ کمیسیون</span>
            ${st.driver.vehicleId ? '' : ''}
          </div>
          <span class="hint">${st.from || st.to ? `بازه: ${st.from ? formatJalali(st.from) : 'ابتدا'} تا ${st.to ? formatJalali(st.to) : 'اکنون'}` : 'کل دوره'}</span>
        </div>

        <div class="kpi-tiles mb-16">
          ${kpi('سفرهای تکمیل‌شده', toFa(st.trips.length), 'route')}
          ${kpi('مجموع کرایه‌ها', formatMoney(st.totalFare, false), 'coins')}
          ${kpi('کمیسیون آژانس', formatMoney(st.totalCommission, false), 'percent', 'var(--gold)')}
          ${kpi('سهم راننده', formatMoney(st.totalShare, false), 'user-check')}
          ${kpi('پرداخت‌شده به راننده', formatMoney(st.payouts, false), 'wallet', 'var(--blue)')}
          ${kpi('مانده قابل پرداخت', formatMoney(st.payable, false), 'wallet', st.payable > 0 ? 'var(--green)' : 'var(--text-muted)')}
        </div>

        <div class="grid-2 mb-16">
          <div class="soft-box">
            <b>${icon('user-check')} طلب راننده از آژانس</b><br>
            سهم راننده از سفرهای حقوقی: ${formatMoney(st.corporateShare, false)}<br>
            منهای پرداخت‌های انجام‌شده: ${formatMoney(st.payouts, false)}<br>
            <b style="color:var(--green); font-size:1rem">= ${formatMoney(st.driverClaim, false)}</b><br>
            <span class="hint">سهم سفرهای نقدی (${formatMoney(st.totalShare - st.corporateShare, false)}) در اختیار خود راننده است و بدهی آژانس محسوب نمی‌شود.</span>
          </div>
          <div class="soft-box">
            <b>${icon('coins')} طلب آژانس از راننده</b><br>
            کمیسیون سفرهای نقدی: ${formatMoney(st.commissionFromCash, false)}<br>
            منهای تسویه‌های نقدی راننده: ${formatMoney(st.settlements, false)}<br>
            <b style="color:var(--red); font-size:1rem">= ${formatMoney(st.agencyClaim, false)}</b>
          </div>
        </div>

        <div class="alert-row ${st.net >= 0 ? 'info' : 'warn'}">
          <span class="a-icon">${icon('calculator')}</span>
          <div>
            خالص حساب: <b style="color:${st.net >= 0 ? 'var(--green)' : 'var(--red)'}">${formatMoney(Math.abs(st.net), false)}</b>
            ${st.net >= 0 ? ' به نفع راننده (باید به راننده پرداخت شود)' : ' به نفع آژانس (راننده باید تسویه کند)'}
          </div>
        </div>
      </div>

      ${st.companyGroups.length ? `
      <div class="card mb-16">
        <div class="card-header"><div class="card-title">${icon('building')} تفکیک سفرهای حقوقی بر اساس شرکت</div></div>
        <div class="table-wrapper"><table>
          <thead><tr><th>شرکت</th><th>تعداد سفر</th><th>مجموع کرایه</th><th>کمیسیون آژانس</th><th>سهم راننده</th></tr></thead>
          <tbody>${st.companyGroups.map((g) => `<tr>
            <td>${escapeHTML(g.name)}</td><td class="num">${formatNumber(g.count)}</td>
            <td class="num">${formatNumber(g.fare)}</td><td class="num">${formatNumber(g.commission)}</td>
            <td class="num text-green">${formatNumber(g.share)}</td></tr>`).join('')}</tbody>
        </table></div>
      </div>` : ''}

      <div class="card mb-16">
        <div class="card-header"><div class="card-title">${icon('route')} ریز سفرها (${toFa(st.trips.length)})</div></div>
        <div class="table-wrapper"><table>
          <thead><tr><th>تاریخ</th><th>مسافر</th><th>مسیر</th><th>کرایه</th><th>کمیسیون</th><th>سهم راننده</th><th>تسویه</th></tr></thead>
          <tbody>${st.trips.length ? st.trips.map((t) => `<tr>
            <td>${formatJalali(t.pickupTime)}</td><td>${escapeHTML(t.subscriberName)}</td>
            <td class="text-sm">${escapeHTML(t.pickupAddress || '—')} ← ${escapeHTML(t.dropoffAddress || '—')}</td>
            <td class="num">${formatNumber(t.fare)}</td><td class="num">${formatNumber(t.commission)}</td>
            <td class="num">${formatNumber(t.driverShare)}</td>
            <td>${t.billedTo === 'company' ? '<span class="status-badge status-subscription">آژانس</span>' : '<span class="status-badge status-active">راننده</span>'}</td>
          </tr>`).join('') : '<tr><td colspan="7" class="text-center">سفری در این بازه ثبت نشده است</td></tr>'}</tbody>
        </table></div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">${icon('wallet')} پرداخت‌ها و تسویه‌ها (${toFa(payments.length)})</div></div>
        <div class="table-wrapper"><table>
          <thead><tr><th>تاریخ</th><th>نوع</th><th>مبلغ</th><th>روش</th><th>توضیحات</th><th>عملیات</th></tr></thead>
          <tbody>${payments.length ? payments.map((p) => `<tr>
            <td>${formatJalali(p.date)}</td>
            <td>${(p.kind || 'payout') === 'settle' ? '<span class="status-badge status-active">تسویه نقدی راننده</span>' : '<span class="status-badge status-subscription">پرداخت به راننده</span>'}</td>
            <td class="num">${formatNumber(p.amount)}</td>
            <td>${p.method === 'cash' ? 'نقدی' : p.method === 'card' ? 'کارتی' : 'سایر'}</td>
            <td class="text-sm">${escapeHTML(p.notes || '')}</td>
            <td><button class="btn-icon danger" data-del-payment="${p.id}" title="حذف پرداخت">${icon('trash')}</button></td>
          </tr>`).join('') : '<tr><td colspan="6" class="text-center">پرداختی ثبت نشده است</td></tr>'}</tbody>
        </table></div>
      </div>`;
}

/** ثبت پرداخت به راننده یا تسویه نقدی از راننده */
export function openDriverPayment(driverId, { onDone } = {}) {
    const st = Drivers.statement(driverId);
    if (!st) return;
    openForm({
        title: `ثبت پرداخت — ${st.driver.fullName}`,
        description: `مانده قابل پرداخت: ${formatMoney(st.payable, false)} · طلب آژانس از راننده: ${formatMoney(st.agencyClaim, false)}`,
        values: {
            kind: 'payout',
            amount: st.payable || st.agencyClaim || 0,
            date: todayJalali(),
            method: 'cash',
            notes: ''
        },
        fields: [
            {
                name: 'kind', label: 'نوع تراکنش', type: 'select', placeholder: false,
                options: [
                    { value: 'payout', label: 'پرداخت به راننده (آژانس → راننده)' },
                    { value: 'settle', label: 'دریافت نقدی از راننده (راننده → آژانس)' }
                ]
            },
            { name: 'amount', label: 'مبلغ (تومان)', type: 'money', required: true, min: 1 },
            { name: 'date', label: 'تاریخ', type: 'date', required: true },
            { name: 'method', label: 'روش', type: 'select', placeholder: false, options: [['cash', 'نقدی'], ['card', 'کارتی'], ['cheque', 'چک']].map(([value, label]) => ({ value, label })) },
            { name: 'notes', label: 'توضیحات', type: 'text', col: 3 }
        ],
        submitText: 'ثبت',
        onMount: (node) => JalaliDatepicker.init(node),
        onSubmit: (v) => {
            Payments.driver({
                driverId,
                amount: v.amount,
                date: v.date,
                method: v.method,
                kind: v.kind,
                notes: v.notes,
                operatorId: Auth.current()?.userId || ''
            });
            const after = Drivers.statement(driverId);
            Toast.success(v.kind === 'settle'
                ? `دریافت نقدی ثبت شد · طلب آژانس از راننده: ${formatMoney(after.agencyClaim, false)}`
                : `پرداخت ثبت شد · مانده قابل پرداخت: ${formatMoney(after.payable, false)}`);
            if (onDone) onDone(); else window.App.reload();
        }
    });
}

/* =====================================================================
 * گزارش درآمد/هزینه
 * ===================================================================== */

export const accReport = {
    id: 'acc-report',
    title: 'گزارش درآمد/هزینه',

    render(view) {
        const range = currentJalaliMonthRange();
        view.innerHTML = `
        <section class="page-section active">
          ${pageHeader({
            title: 'گزارش درآمد و هزینه', iconName: 'bar-chart',
            subtitle: 'درآمد آژانس = کمیسیون سفرها + تسویه‌های نقدی رانندگان + دریافتی مشترکین. هزینه = پرداخت به رانندگان + هزینه‌های جانبی.',
            actions: `
              <button class="btn btn-outline btn-sm" type="button" data-print-report>${icon('printer')} خروجی PDF</button>
              <button class="btn btn-outline btn-sm" type="button" data-csv-report>${icon('file-csv')} خروجی CSV</button>`
          })}

          <div class="card mb-16">
            ${dateRangeCard({ from: range.from, to: range.to, idPrefix: 'accRep' })}
            <button class="btn btn-gold btn-sm mt-10" type="button" id="accRepShow">${icon('refresh')} محاسبه گزارش</button>
          </div>

          <div class="kpi-tiles mb-16" id="accRepKpis"></div>

          <div class="charts-grid mb-16">
            <div class="card">
              <div class="card-header"><div class="card-title">${icon('bar-chart')} مقایسه ماهانه درآمد و هزینه (۱۲ ماه)</div></div>
              <div class="chart-container" id="accRepChart" style="height:240px"></div>
            </div>
            <div class="card">
              <div class="card-header"><div class="card-title">${icon('trending-up')} روند کرایه روزانه دوره</div></div>
              <div class="chart-container" id="accRepLine" style="height:240px"></div>
            </div>
          </div>

          <div class="card">
            <div class="card-header"><div class="card-title">${icon('calculator')} خلاصه مالی دوره</div></div>
            <div id="accRepTable"></div>
          </div>
        </section>`;

        const root = view.querySelector('.page-section');
        JalaliDatepicker.init(root);
        const getRange = bindRange(root, 'accRep', () => compute());

        function compute() {
            const { from, to } = getRange();
            const f = Reports.financial(from, to);
            const series = [];
            const months = lastJalaliMonths(12);
            const income = [];
            const expense = [];
            months.forEach((m) => {
                const monthFrom = m + '-01';
                const monthTo = m + '-30';
                const mf = Reports.financial(monthFrom, monthTo);
                income.push(mf.netIncome);
                expense.push(mf.expenseSum + mf.driverPaymentSum);
            });
            Charts.groupedBar(root.querySelector('#accRepChart'), {
                labels: months.map((m) => jalaliMonthLabel(m)),
                series: [
                    { label: 'درآمد (تومان)', data: income, color: '#10b981' },
                    { label: 'هزینه (تومان)', data: expense, color: '#ef4444' }
                ],
                emptyText: 'داده‌ای برای نمایش نیست'
            });

            /* روند روزانه دوره */
            const days = [];
            let cursor = from || (todayJalali().slice(0, 8) + '01');
            const end = to || todayJalali();
            let guard = 0;
            const completedTrips = DB.list('trips').filter((t) => t.status === 'completed');
            while (cursor <= end && guard++ < 180) {
                const fare = sum(completedTrips.filter((t) => isoToJalaliKey(t.pickupTime) === cursor), (t) => t.fare);
                days.push({ key: cursor, fare });
                cursor = addJalaliDays(cursor, 1);
            }
            Charts.line(root.querySelector('#accRepLine'), {
                labels: days.map((d) => toFa(d.key.slice(8) + '/' + d.key.slice(5, 7))),
                data: days.map((d) => d.fare),
                emptyText: 'در این دوره سفری ثبت نشده است'
            });

            root.querySelector('#accRepKpis').innerHTML = `
              ${kpi('تعداد سفر تکمیل‌شده', toFa(f.tripCount), 'route')}
              ${kpi('مجموع کرایه‌ها', formatMoney(f.fareSum, false), 'coins')}
              ${kpi('درآمد آژانس', formatMoney(f.netIncome, false), 'trending-up', 'var(--green)')}
              ${kpi('هزینه‌ها', formatMoney(f.expenseSum + f.driverPaymentSum, false), 'receipt', 'var(--red)')}
              ${kpi('سود خالص', formatMoney(f.profit, false), 'percent', f.profit >= 0 ? 'var(--green)' : 'var(--red)')}`;

            root.querySelector('#accRepTable').innerHTML = `
              <div class="table-wrapper"><table>
                <thead><tr><th>شرح</th><th>مبلغ (تومان)</th></tr></thead>
                <tbody>
                  <tr><td>کمیسیون از سفرها</td><td class="num">${formatNumber(f.commission)}</td></tr>
                  <tr><td>تسویه‌های نقدی رانندگان</td><td class="num">${formatNumber(f.settleIncome)}</td></tr>
                  <tr><td>دریافتی از مشترکین</td><td class="num">${formatNumber(f.subscriptionIncome)}</td></tr>
                  <tr style="font-weight:700"><td>جمع درآمد</td><td class="num text-green">${formatNumber(f.netIncome)}</td></tr>
                  <tr><td>پرداخت به رانندگان</td><td class="num">${formatNumber(f.driverPaymentSum)}</td></tr>
                  <tr><td>هزینه‌های جانبی</td><td class="num">${formatNumber(f.expenseSum)}</td></tr>
                  <tr style="font-weight:700"><td>جمع هزینه</td><td class="num text-red">${formatNumber(f.expenseSum + f.driverPaymentSum)}</td></tr>
                  <tr style="font-weight:700;border-top:2px solid var(--gold)"><td>سود خالص دوره</td><td class="num ${f.profit >= 0 ? 'text-green' : 'text-red'}">${formatNumber(f.profit)}</td></tr>
                </tbody>
              </table></div>`;
            root._financial = f;
        }

        root.querySelector('#accRepShow').addEventListener('click', compute);
        root.querySelector('[data-print-report]').addEventListener('click', () => {
            const { from, to } = getRange();
            const f = Reports.financial(from, to);
            previewPrint(financialReportHTML(f, { from, to }), { title: 'گزارش مالی دوره', filename: `financial-${todayJalali()}` });
        });
        root.querySelector('[data-csv-report]').addEventListener('click', () => {
            const { from, to } = getRange();
            const f = Reports.financial(from, to);
            downloadCSV(`financial-${from || 'all'}-${to || todayJalali()}.csv`, ['شرح', 'مبلغ'],
                [['کمیسیون سفرها', f.commission], ['تسویه رانندگان', f.settleIncome], ['دریافتی مشترکین', f.subscriptionIncome],
                 ['پرداخت به رانندگان', f.driverPaymentSum], ['هزینه‌های جانبی', f.expenseSum], ['سود خالص', f.profit]]);
            Toast.success('خروجی CSV دانلود شد');
        });

        compute();
    }
};

/* =====================================================================
 * کمیسیون‌ها
 * ===================================================================== */

export const accCommissions = {
    id: 'acc-commissions',
    title: 'کمیسیون‌ها',

    render(view) {
        const range = currentJalaliMonthRange();
        view.innerHTML = `
        <section class="page-section active">
          ${pageHeader({ title: 'کمیسیون رانندگان', iconName: 'percent', subtitle: 'مجموع کمیسیون آژانس از سفرهای تکمیل‌شده در بازه انتخابی.' })}
          <div class="card mb-16">
            ${dateRangeCard({ from: range.from, to: range.to, idPrefix: 'accCom' })}
          </div>
          <div class="card mb-16">
            <div class="card-header"><div class="card-title">${icon('bar-chart')} مقایسه کمیسیون رانندگان</div></div>
            <div class="chart-container" id="comChart" style="height:240px"></div>
          </div>
          <div class="card"><div id="comTable"></div></div>
        </section>`;

        const root = view.querySelector('.page-section');
        JalaliDatepicker.init(root);
        const getRange = bindRange(root, 'accCom', () => compute());

        function compute() {
            const { from, to } = getRange();
            const rows = Drivers.all().map((d) => {
                const trips = DB.list('trips').filter((t) => t.driverId === d.id && t.status === 'completed')
                    .filter((t) => {
                        const k = isoToJalaliKey(t.pickupTime);
                        return (!from || k >= from) && (!to || k <= to);
                    });
                return {
                    driver: d,
                    tripCount: trips.length,
                    count: trips.length,
                    fare: sum(trips, (t) => t.fare),
                    commission: sum(trips, (t) => t.commission),
                    share: sum(trips, (t) => t.driverShare)
                };
            }).sort((a, b) => b.commission - a.commission);

            Charts.bar(root.querySelector('#comChart'), {
                labels: rows.filter((r) => r.commission > 0).map((r) => r.driver.fullName),
                data: rows.filter((r) => r.commission > 0).map((r) => r.commission),
                emptyText: 'کمیسیونی در این بازه ثبت نشده است'
            });

            renderTable(root.querySelector('#comTable'), {
                key: 'commissions-table',
                columns: [
                    { key: 'name', label: 'راننده', sortable: true, value: (r) => r.driver.fullName },
                    { key: 'tripCount', label: 'تعداد سفر', sortable: true, align: 'center', render: (r) => formatNumber(r.tripCount) },
                    { key: 'fare', label: 'مجموع کرایه', sortable: true, align: 'center', render: (r) => formatNumber(r.fare) },
                    { key: 'commission', label: 'کمیسیون آژانس', sortable: true, align: 'center', render: (r) => `<span class="text-gold text-bold">${formatNumber(r.commission)}</span>` },
                    { key: 'share', label: 'سهم راننده', sortable: true, align: 'center', render: (r) => formatNumber(r.share) },
                    { key: 'rate', label: 'درصد', sortable: true, align: 'center', value: (r) => r.driver.commissionRate, render: (r) => toFa(r.driver.commissionRate) + '٪' }
                ],
                rows,
                search: { keys: [] },
                pageSize: 10,
                initialSort: { key: 'commission', dir: 'desc' },
                csv: { filename: `commissions-${todayJalali()}` },
                emptyText: 'راننده‌ای ثبت نشده است',
                footer: (pageRows, allRows) => `
                  <div class="kpi-tiles">
                    ${kpi('جمع کمیسیون', formatMoney(sum(allRows, (r) => r.commission), false), 'percent', 'var(--gold)')}
                    ${kpi('جمع کرایه', formatMoney(sum(allRows, (r) => r.fare), false), 'coins')}
                    ${kpi('جمع سهم رانندگان', formatMoney(sum(allRows, (r) => r.share), false), 'user-check')}
                  </div>`
            });
        }
        compute();
    }
};

/* =====================================================================
 * حسابداری مشترکین
 * ===================================================================== */

export const accSubscribers = {
    id: 'acc-subscribers',
    title: 'حسابداری مشترکین',

    render(view, params = {}) {
        const subs = Subscribers.all();
        const range = currentJalaliMonthRange();
        const initial = params.subscriberId || '';

        view.innerHTML = `
        <section class="page-section active">
          ${pageHeader({
            title: 'حسابداری مشترکین', iconName: 'user-tag',
            subtitle: 'صورت‌حساب، ثبت پرداخت و تاریخچه پرداخت‌های هر مشترک. بدهی همیشه از سفرهای حقوقی منهای پرداخت‌ها محاسبه می‌شود.',
            actions: `<button class="btn btn-outline btn-sm" type="button" data-goto-debtors>${icon('wallet')} گزارش بدهکاران</button>`
          })}
          <div class="card mb-16">
            <div class="form-row mb-10">
              <div class="form-group">
                <label class="form-label">مشترک</label>
                <select class="form-select" id="accSubSelect">
                  <option value="">انتخاب مشترک...</option>
                  ${subs.map((s) => `<option value="${s.id}" ${s.id === initial ? 'selected' : ''}>${escapeHTML(s.fullName)} ${s.subscriptionNumber ? '[' + escapeHTML(s.subscriptionNumber) + ']' : ''}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">عملیات</label>
                <div class="flex gap-6" style="flex-wrap:wrap">
                  <button class="btn btn-gold btn-sm" type="button" id="accSubShow">${icon('bar-chart')} نمایش صورت‌حساب</button>
                  <button class="btn btn-outline btn-sm" type="button" id="accSubPay" disabled>${icon('wallet')} ثبت پرداخت</button>
                  <button class="btn btn-outline btn-sm" type="button" id="accSubPrint" disabled>${icon('printer')} چاپ فاکتور</button>
                  <button class="btn btn-outline btn-sm" type="button" id="accSubSms" disabled>${icon('message')} یادآوری پیامک</button>
                  <button class="btn btn-outline btn-sm" type="button" id="accSubCsv" disabled>${icon('file-csv')} خروجی CSV</button>
                </div>
              </div>
            </div>
            ${dateRangeCard({ from: range.from, to: range.to, idPrefix: 'accSub' })}
          </div>
          <div id="accSubResult">
            <div class="card"><div class="empty-state">${icon('user-tag', 'icon-xl')}<p>برای مشاهده صورت‌حساب، مشترک را انتخاب کنید</p></div></div>
          </div>
        </section>`;

        const root = view.querySelector('.page-section');
        JalaliDatepicker.init(root);
        const getRange = bindRange(root, 'accSub', () => {});
        const result = root.querySelector('#accSubResult');
        const btns = {
            pay: root.querySelector('#accSubPay'),
            print: root.querySelector('#accSubPrint'),
            sms: root.querySelector('#accSubSms'),
            csv: root.querySelector('#accSubCsv')
        };

        function update() {
            const id = root.querySelector('#accSubSelect').value;
            const { from, to } = getRange();
            if (!id) {
                result.innerHTML = `<div class="card"><div class="empty-state">${icon('user-tag', 'icon-xl')}<p>مشترک را انتخاب کنید</p></div></div>`;
                Object.values(btns).forEach((b) => b.setAttribute('disabled', 'disabled'));
                return;
            }
            const st = Subscribers.statement(id, from, to);
            result.innerHTML = renderSubscriberStatement(st);
            result._statement = st;
            Object.values(btns).forEach((b) => b.removeAttribute('disabled'));
        }

        root.querySelector('#accSubShow').addEventListener('click', update);
        root.querySelector('#accSubSelect').addEventListener('change', update);
        root.addEventListener('change', (e) => { if (e.target.closest('#accSubFrom, #accSubTo')) update(); });

        btns.pay.addEventListener('click', () => {
            if (result._statement) openSubscriberPayment(result._statement.subscriber.id, { onDone: update });
        });
        btns.print.addEventListener('click', () => {
            if (result._statement) previewPrint(invoiceHTML(result._statement), { title: 'فاکتور مشترک', filename: `invoice-${result._statement.subscriber.fullName}` });
        });
        btns.sms.addEventListener('click', () => {
            if (result._statement) openSmsReminder(result._statement);
        });
        btns.csv.addEventListener('click', () => {
            const st = result._statement;
            if (!st) return;
            downloadCSV(`subscriber-${st.subscriber.subscriptionNumber || st.subscriber.fullName}-${todayJalali()}.csv`,
                ['تاریخ', 'راننده', 'مبدأ', 'مقصد', 'کرایه', 'تسویه', 'وضعیت'],
                st.trips.map((t) => [formatJalali(t.pickupTime), DB.get('drivers', t.driverId)?.fullName || '', t.pickupAddress, t.dropoffAddress, t.fare, t.billedTo === 'company' ? 'آژانس' : 'راننده', t.status]));
            Toast.success('خروجی CSV دانلود شد');
        });

        result.addEventListener('click', async (e) => {
            const del = e.target.closest('[data-del-payment]');
            if (del) {
                const ok = await Modal.confirm({
                    title: 'حذف پرداخت',
                    message: 'این پرداخت حذف شود؟ مبلغ به بدهی مشترک برگردانده می‌شود.',
                    danger: true, okText: 'حذف'
                });
                if (!ok) return;
                try {
                    Payments.deleteSubscriberPayment(del.dataset.delPayment);
                    Toast.success('پرداخت حذف شد و بدهی بازمحاسبه گردید');
                    update();
                } catch (err) { toastError(err); }
            }
        });

        root.querySelector('[data-goto-debtors]').addEventListener('click', () => window.App.navigate('reports-debtors'));
        if (initial) update();
    }
};

function renderSubscriberStatement(st) {
    const s = st.subscriber;
    const payments = [...st.payments].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return `
      <div class="card mb-16">
        <div class="card-header">
          <div class="card-title">${icon('user-tag')} ${escapeHTML(s.fullName)}
            <span class="chip chip-gold">${escapeHTML(s.subscriptionNumber || '—')}</span>
            ${statusBadge(s.type)}
          </div>
          <span class="hint">${st.from || st.to ? `بازه: ${st.from ? formatJalali(st.from) : 'ابتدا'} تا ${st.to ? formatJalali(st.to) : 'اکنون'}` : 'کل دوره'}</span>
        </div>
        <div class="kpi-tiles mb-16">
          ${kpi('سفرهای مرتبط', toFa(st.trips.length), 'route')}
          ${kpi('مجموع کرایه‌ها', formatMoney(st.totalFare, false), 'coins')}
          ${kpi('کرایه با تسویه آژانس', formatMoney(st.companyFare, false), 'building')}
          ${kpi('پرداخت‌شده (کل)', formatMoney(st.totalPaid, false), 'wallet', 'var(--green)')}
          ${kpi('بدهی جاری', formatMoney(st.debt, false), 'alert-circle', st.debt > 0 ? 'var(--red)' : 'var(--green)')}
          ${kpi('سنّ بدهی', st.debt > 0 ? toFa(st.debtAge) + ' روز' : '—', 'clock')}
        </div>
        ${st.debt > 0 ? `<div class="alert-row warn"><span class="a-icon">${icon('alert-circle')}</span><div>این مشترک ${formatMoney(st.debt)} بدهی دارد (${toFa(st.debtAge)} روز). با دکمه «ثبت پرداخت» بدهی کاهش می‌یابد.</div></div>`
            : `<div class="alert-row info"><span class="a-icon">${icon('check-circle')}</span><div>بدهی این مشترک تسویه است.</div></div>`}
      </div>

      ${st.companyGroups.length ? `
      <div class="card mb-16">
        <div class="card-header"><div class="card-title">${icon('building')} تفکیک بر اساس شرکت</div></div>
        <div class="table-wrapper"><table>
          <thead><tr><th>شرکت</th><th>تعداد سفر</th><th>مجموع کرایه</th></tr></thead>
          <tbody>${st.companyGroups.map((g) => `<tr><td>${escapeHTML(g.name)}</td><td class="num">${formatNumber(g.count)}</td><td class="num">${formatNumber(g.fare)}</td></tr>`).join('')}</tbody>
        </table></div>
      </div>` : ''}

      <div class="card mb-16">
        <div class="card-header"><div class="card-title">${icon('route')} سفرهای بازه (${toFa(st.trips.length)})</div></div>
        <div class="table-wrapper"><table>
          <thead><tr><th>تاریخ</th><th>راننده</th><th>مبدأ</th><th>مقصد</th><th>کرایه</th><th>تسویه</th><th>وضعیت</th></tr></thead>
          <tbody>${st.trips.length ? st.trips.map((t) => `<tr>
            <td>${formatJalali(t.pickupTime)}</td>
            <td>${escapeHTML(DB.get('drivers', t.driverId)?.fullName || '—')}</td>
            <td class="text-sm">${escapeHTML(t.pickupAddress || '—')}</td>
            <td class="text-sm">${escapeHTML(t.dropoffAddress || '—')}</td>
            <td class="num">${formatNumber(t.fare)}</td>
            <td>${t.billedTo === 'company' ? '<span class="status-badge status-subscription">آژانس</span>' : '<span class="status-badge status-active">راننده</span>'}</td>
            <td>${statusBadge(t.status)}</td>
          </tr>`).join('') : '<tr><td colspan="7" class="text-center">سفری در این بازه نیست</td></tr>'}</tbody>
        </table></div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">${icon('wallet')} تاریخچه پرداخت‌ها (${toFa(payments.length)})</div>
          <span class="hint">جمع پرداخت‌های دوره: ${formatMoney(sum(payments, (p) => p.amount), false)}</span>
        </div>
        <div class="table-wrapper"><table>
          <thead><tr><th>تاریخ</th><th>مبلغ</th><th>روش</th><th>شماره رسید</th><th>ثبت‌کننده</th><th>توضیحات</th><th>عملیات</th></tr></thead>
          <tbody>${payments.length ? payments.map((p) => `<tr>
            <td>${formatJalali(p.date)}</td>
            <td class="num text-green">${formatNumber(p.amount)}</td>
            <td>${p.method === 'cash' ? 'نقدی' : p.method === 'card' ? 'کارتی' : p.method === 'online' ? 'آنلاین' : 'چک'}</td>
            <td>${escapeHTML(p.receiptNo || '—')}</td>
            <td>${escapeHTML(DB.get('operators', p.operatorId)?.fullName || '—')}</td>
            <td class="text-sm">${escapeHTML(p.notes || '')}</td>
            <td><button class="btn-icon danger" data-del-payment="${p.id}" title="حذف پرداخت">${icon('trash')}</button></td>
          </tr>`).join('') : '<tr><td colspan="7" class="text-center">پرداختی ثبت نشده است</td></tr>'}</tbody>
        </table></div>
      </div>`;
}

/** یادآوری پیامک (فقط UI — بدون اتصال واقعی در این فاز) */
export function openSmsReminder(statement) {
    const s = statement.subscriber;
    const text = `${s.fullName} عزیز، بدهی شما به آژانس تاکسی تلفنی ${DB.settings().companyName || 'کارن‌سافت'} مبلغ ${formatNumber(statement.debt)} تومان است. لطفاً نسبت به تسویه اقدام فرمایید. با تشکر`;
    Modal.open({
      title: 'یادآوری پیامک بدهی',
      body: `
        <div class="soft-box mb-12">${icon('info')} در این فاز، ارسال واقعی پیامک انجام نمی‌شود؛ متن آماده را می‌توانید کپی کرده و از سامانه پیامکی خود ارسال کنید.</div>
        <div class="form-group mb-10">
          <label class="form-label">شماره گیرنده</label>
          <input class="form-input" value="${toFa(s.phone)}" readonly>
        </div>
        <div class="form-group">
          <label class="form-label">متن پیام</label>
          <textarea class="form-textarea" rows="5" id="smsText">${escapeHTML(text)}</textarea>
        </div>`,
      footer: `<button class="btn btn-outline" type="button" data-modal-close>بستن</button>
               <button class="btn btn-gold" type="button" id="smsCopy">${icon('copy')} کپی متن</button>`,
      onMount: (node) => {
        node.querySelector('#smsCopy').addEventListener('click', async () => {
          const txt = node.querySelector('#smsText').value;
          try {
            await navigator.clipboard.writeText(txt);
            Toast.success('متن پیام کپی شد');
          } catch (_) {
            node.querySelector('#smsText').select();
            Toast.warning('مرورگر اجازه کپی خودکار نداد؛ متن انتخاب شد، با Ctrl+C کپی کنید');
          }
        });
      }
    });
}

/* =====================================================================
 * پرداخت‌ها (رانندگان و مشترکین)
 * ===================================================================== */

export const accPayments = {
    id: 'acc-payments',
    title: 'پرداخت‌ها',

    render(view) {
        let tab = 'all';

        view.innerHTML = `
        <section class="page-section active">
          ${pageHeader({
            title: 'پرداخت‌ها و تسویه‌ها', iconName: 'wallet',
            subtitle: 'تمام پرداخت‌های ثبت‌شده برای رانندگان (خروجی) و دریافتی‌های مشترکین (ورودی) در یک نگاه.',
            actions: `
              <button class="btn btn-outline btn-sm" type="button" data-add-driver-pay>${icon('car')} پرداخت به راننده</button>
              <button class="btn btn-gold btn-sm" type="button" data-add-sub-pay>${icon('users')} دریافت از مشترک</button>`
          })}
          <div class="tab-lite" id="payTabs">
            <button type="button" data-tab="all" class="active">همه تراکنش‌ها</button>
            <button type="button" data-tab="driver">پرداخت رانندگان</button>
            <button type="button" data-tab="subscriber">دریافتی مشترکین</button>
          </div>
          <div class="kpi-tiles mb-16" id="payKpis"></div>
          <div class="card"><div id="payTable"></div></div>
        </section>`;

        const root = view.querySelector('.page-section');
        const host = root.querySelector('#payTable');

        const buildRows = () => {
            const driverPays = DB.list('driverPayments').map((p) => ({
                id: p.id, kind: 'driver', date: p.date, amount: p.amount,
                person: p.driverName || DB.get('drivers', p.driverId)?.fullName || '—',
                method: p.method, type: (p.kind || 'payout') === 'settle' ? 'تسویه نقدی از راننده' : 'پرداخت به راننده',
                notes: p.notes, raw: p
            }));
            const subPays = DB.list('subscriberPayments').map((p) => ({
                id: p.id, kind: 'subscriber', date: p.date, amount: p.amount,
                person: p.subscriberName || DB.get('subscribers', p.subscriberId)?.fullName || '—',
                method: p.method, type: 'دریافت از مشترک', notes: p.notes, raw: p
            }));
            const all = [...driverPays, ...subPays].sort((a, b) => String(b.date).localeCompare(String(a.date)));
            return tab === 'all' ? all : all.filter((x) => x.kind === tab);
        };

        const renderKpis = () => {
            const all = buildRows();
            const outflow = sum(all.filter((x) => x.kind === 'driver' && (x.raw.kind || 'payout') === 'payout'), (x) => x.amount);
            const inflow = sum(all.filter((x) => x.kind === 'subscriber'), (x) => x.amount);
            const settle = sum(all.filter((x) => x.kind === 'driver' && x.raw.kind === 'settle'), (x) => x.amount);
            root.querySelector('#payKpis').innerHTML = `
              ${kpi('تعداد تراکنش‌ها', toFa(all.length), 'list')}
              ${kpi('پرداخت به رانندگان', formatMoney(outflow, false), 'car', 'var(--red)')}
              ${kpi('دریافتی از مشترکین', formatMoney(inflow, false), 'users', 'var(--green)')}
              ${kpi('تسویه نقدی از رانندگان', formatMoney(settle, false), 'coins')}`;
        };

        const cfg = () => ({
            key: 'payments-table',
            columns: [
                { key: 'date', label: 'تاریخ', sortable: true, render: (r) => formatJalali(r.date) },
                { key: 'kind', label: 'نوع', sortable: true, align: 'center', render: (r) => r.kind === 'driver' ? `<span class="status-badge status-subscription">${escapeHTML(r.type)}</span>` : `<span class="status-badge status-active">${escapeHTML(r.type)}</span>` },
                { key: 'person', label: 'طرف حساب', sortable: true, render: (r) => escapeHTML(r.person) },
                { key: 'amount', label: 'مبلغ', sortable: true, align: 'center', render: (r) => `<span class="${r.kind === 'driver' && (r.raw.kind || 'payout') === 'payout' ? 'text-red' : 'text-green'} text-bold">${formatNumber(r.amount)}</span>` },
                { key: 'method', label: 'روش', sortable: true, align: 'center', render: (r) => r.method === 'cash' ? 'نقدی' : r.method === 'card' ? 'کارتی' : r.method === 'online' ? 'آنلاین' : r.method === 'cheque' ? 'چک' : '—' },
                { key: 'notes', label: 'توضیحات', sortable: false, render: (r) => `<span class="text-sm op-60">${escapeHTML(r.notes || '')}</span>` },
                { key: 'actions', label: 'عملیات', sortable: false, align: 'center', render: (r) => `<button class="btn-icon danger" data-del-pay="${r.id}" data-kind="${r.kind}" title="حذف">${icon('trash')}</button>` }
            ],
            rows: buildRows(),
            search: { keys: ['person', 'type', 'notes'] },
            pageSize: 10,
            initialSort: { key: 'date', dir: 'desc' },
            selectable: true,
            csv: { filename: `payments-${todayJalali()}` },
            emptyText: 'تراکنشی ثبت نشده است',
            emptyIcon: 'wallet',
            bulkActions: [{
                label: 'حذف تراکنش‌ها', icon: 'trash', danger: true,
                confirm: 'تراکنش‌های انتخاب‌شده حذف شوند؟ مبالغ به بدهی/مانده برمی‌گردد.',
                onClick: (ids) => {
                    ids.forEach((id) => {
                        const isDriver = DB.get('driverPayments', id);
                        if (isDriver) { Payments.deleteDriverPayment(id); return; }
                        if (DB.get('subscriberPayments', id)) {
                            Payments.deleteSubscriberPayment(id);
                            return;
                        }
                        /* تراکنش‌های تسویه مشترک در جدول درایور نیستند */
                    });
                    Toast.success('تراکنش‌ها حذف و مانده‌ها بازمحاسبه شد');
                }
            }]
        });

        const refresh = () => {
            renderKpis();
            renderTable(host, cfg());
        };

        root.querySelector('#payTabs').addEventListener('click', (e) => {
            const b = e.target.closest('[data-tab]');
            if (!b) return;
            tab = b.dataset.tab;
            root.querySelectorAll('#payTabs button').forEach((x) => x.classList.toggle('active', x === b));
            refresh();
        });

        host.addEventListener('click', async (e) => {
            const del = e.target.closest('[data-del-pay]');
            if (!del) return;
            const ok = await Modal.confirm({ title: 'حذف تراکنش', message: 'این تراکنش حذف شود؟', hint: 'مانده‌های مرتبط بازمحاسبه می‌شود.', danger: true, okText: 'حذف' });
            if (!ok) return;
            try {
                if (del.dataset.kind === 'driver') Payments.deleteDriverPayment(del.dataset.delPay);
                else Payments.deleteSubscriberPayment(del.dataset.delPay);
                Toast.success('تراکنش حذف شد');
                refresh();
            } catch (err) { toastError(err); }
        });

        root.querySelector('[data-add-driver-pay]').addEventListener('click', () => {
            const drivers = Drivers.all();
            if (!drivers.length) { Toast.warning('ابتدا راننده ثبت کنید'); return; }
            openForm({
                title: 'پرداخت به راننده',
                values: { date: todayJalali(), method: 'cash', kind: 'payout' },
                fields: [
                    { name: 'driverId', label: 'راننده', type: 'select', required: true, options: drivers.map((d) => ({ value: d.id, label: d.fullName })) },
                    { name: 'kind', label: 'نوع', type: 'select', placeholder: false, options: [{ value: 'payout', label: 'پرداخت به راننده' }, { value: 'settle', label: 'دریافت نقدی از راننده' }] },
                    { name: 'amount', label: 'مبلغ (تومان)', type: 'money', required: true, min: 1 },
                    { name: 'date', label: 'تاریخ', type: 'date', required: true },
                    { name: 'method', label: 'روش', type: 'select', placeholder: false, options: [['cash', 'نقدی'], ['card', 'کارتی'], ['cheque', 'چک']].map(([value, label]) => ({ value, label })) },
                    { name: 'notes', label: 'توضیحات', type: 'text', col: 3 }
                ],
                onMount: (node) => JalaliDatepicker.init(node),
                submitText: 'ثبت',
                onSubmit: (v) => {
                    Payments.driver({ ...v, operatorId: Auth.current()?.userId || '' });
                    Toast.success('تراکنش ثبت شد');
                    refresh();
                }
            });
        });

        root.querySelector('[data-add-sub-pay]').addEventListener('click', () => {
            const subs = Subscribers.all().filter((s) => Subscribers.computeDebt(s.id) > 0);
            if (!subs.length) { Toast.info('مشترک بدهکاری وجود ندارد'); return; }
            openForm({
                title: 'دریافت از مشترک',
                values: { date: todayJalali(), method: 'cash' },
                fields: [
                    { name: 'subscriberId', label: 'مشترک', type: 'select', required: true, options: subs.map((s) => ({ value: s.id, label: `${s.fullName} — بدهی ${formatNumber(Subscribers.computeDebt(s.id))}` })) },
                    { name: 'amount', label: 'مبلغ (تومان)', type: 'money', required: true, min: 1 },
                    { name: 'date', label: 'تاریخ', type: 'date', required: true },
                    { name: 'method', label: 'روش', type: 'select', placeholder: false, options: [['cash', 'نقدی'], ['card', 'کارتی'], ['online', 'آنلاین'], ['cheque', 'چک']].map(([value, label]) => ({ value, label })) },
                    { name: 'receiptNo', label: 'شماره رسید', type: 'text' },
                    { name: 'notes', label: 'توضیحات', type: 'text' }
                ],
                onMount: (node) => JalaliDatepicker.init(node),
                submitText: 'ثبت دریافت',
                onSubmit: (v) => {
                    Subscribers.addPayment({ ...v, operatorId: Auth.current()?.userId || '' });
                    Toast.success('دریافت ثبت شد');
                    refresh();
                }
            });
        });

        refresh();
    }
};

/* =====================================================================
 * هزینه‌های جانبی
 * ===================================================================== */

export const accExpenses = {
    id: 'acc-expenses',
    title: 'هزینه‌های جانبی',

    render(view) {
        view.innerHTML = `
        <section class="page-section active">
          ${pageHeader({
            title: 'هزینه‌های جانبی', iconName: 'receipt',
            subtitle: 'هزینه‌های عملیاتی آژانس (قبوض، ملزومات، تبلیغات و ...). این مبالغ در گزارش مالی از درآمد کسر می‌شود.',
            actions: `<button class="btn btn-gold btn-sm" type="button" data-add>${icon('plus')} ثبت هزینه</button>`
          })}
          <div class="kpi-tiles mb-16" id="expKpis"></div>
          <div class="card"><div id="expTable"></div></div>
          <div class="charts-grid mt-16">
            <div class="card"><div class="card-header"><div class="card-title">${icon('bar-chart')} هزینه ۶ ماه اخیر</div></div><div class="chart-container" id="expChart" style="height:220px"></div></div>
            <div class="card"><div class="card-header"><div class="card-title">${icon('percent')} سهم دسته‌بندی‌ها</div></div><div class="chart-container" id="expPie" style="height:220px"></div></div>
          </div>
        </section>`;

        const root = view.querySelector('.page-section');
        const host = root.querySelector('#expTable');
        let category = '';

        const refresh = () => {
            const expenses = DB.list('expenses');
            const filtered = category ? expenses.filter((e) => e.category === category) : expenses;
            const total = sum(filtered, (e) => e.amount);
            root.querySelector('#expKpis').innerHTML = `
              ${kpi('تعداد اقلام', toFa(filtered.length), 'list')}
              ${kpi('جمع هزینه‌ها', formatMoney(total, false), 'receipt', 'var(--red)')}
              ${kpi('میانگین هر قلم', formatMoney(filtered.length ? total / filtered.length : 0, false), 'calculator')}`;

            renderTable(host, {
                key: 'expenses-table',
                columns: [
                    { key: 'date', label: 'تاریخ', sortable: true, render: (e) => formatJalali(e.date) },
                    { key: 'category', label: 'دسته‌بندی', sortable: true, render: (e) => `<span class="chip">${escapeHTML(e.category)}</span>` },
                    { key: 'description', label: 'شرح', sortable: true, render: (e) => escapeHTML(e.description) },
                    { key: 'amount', label: 'مبلغ', sortable: true, align: 'center', render: (e) => `<span class="text-red">${formatNumber(e.amount)}</span>` },
                    { key: 'actions', label: 'عملیات', sortable: false, align: 'center', render: (e) => `
                        <button class="btn-icon edit" data-edit="${e.id}" title="ویرایش">${icon('pencil')}</button>
                        <button class="btn-icon danger" data-del="${e.id}" title="حذف">${icon('trash')}</button>` }
                ],
                rows: expenses,
                filter: (e) => !category || e.category === category,
                search: { keys: ['description', 'category'] },
                pageSize: 10,
                initialSort: { key: 'date', dir: 'desc' },
                selectable: true,
                csv: { filename: `expenses-${todayJalali()}` },
                emptyText: 'هزینه‌ای ثبت نشده است',
                emptyIcon: 'receipt',
                toolbar: () => `<select class="form-select" data-flt-cat style="max-width:170px; font-size:0.72rem">
                    <option value="">همه دسته‌ها</option>
                    ${EXPENSE_CATEGORIES.map((c) => `<option value="${c}" ${category === c ? 'selected' : ''}>${c}</option>`).join('')}
                  </select>`,
                bulkActions: [{ label: 'حذف', icon: 'trash', danger: true, confirm: 'هزینه‌های انتخاب‌شده حذف شوند؟', onClick: (ids) => { DB.removeMany('expenses', ids); Toast.success('هزینه‌ها حذف شدند'); } }],
                footer: (rows, allRows) => `<div class="kpi-tiles"><div class="kpi"><div class="k-label">جمع هزینه‌های فیلترشده</div><div class="k-value text-red">${formatMoney(sum(allRows, (e) => e.amount))}</div></div></div>`
            });

            /* نمودارها */
            const months = lastJalaliMonths(6);
            const monthTotals = months.map((m) => sum(expenses.filter((e) => (e.date || '').slice(0, 7) === m), (e) => e.amount));
            Charts.bar(root.querySelector('#expChart'), {
                labels: months.map((m) => jalaliMonthLabel(m)),
                data: monthTotals,
                emptyText: 'هزینه‌ای ثبت نشده است'
            });
            const byCat = {};
            expenses.forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + e.amount; });
            Charts.pie(root.querySelector('#expPie'), {
                labels: Object.keys(byCat),
                data: Object.values(byCat),
                emptyText: 'داده‌ای وجود ندارد'
            });
        };

        host.addEventListener('change', (e) => {
            if (e.target.matches('[data-flt-cat]')) { category = e.target.value; refresh(); }
        });

        host.addEventListener('click', async (e) => {
            const ed = e.target.closest('[data-edit]');
            if (ed) { openExpenseForm(ed.dataset.edit, refresh); return; }
            const del = e.target.closest('[data-del]');
            if (del) {
                const ok = await Modal.confirm({ title: 'حذف هزینه', message: 'این هزینه حذف شود؟', danger: true, okText: 'حذف' });
                if (!ok) return;
                DB.remove('expenses', del.dataset.del);
                Toast.success('هزینه حذف شد');
                refresh();
            }
        });

        root.querySelector('[data-add]').addEventListener('click', () => openExpenseForm(null, refresh));
        refresh();
    }
};

export function openExpenseForm(id, onDone) {
    const e = id ? DB.get('expenses', id) : null;
    openForm({
        title: e ? 'ویرایش هزینه' : 'ثبت هزینه جدید',
        values: {
            date: e?.date || todayJalali(),
            category: e?.category || 'سایر',
            description: e?.description || '',
            amount: e?.amount || ''
        },
        fields: [
            { name: 'date', label: 'تاریخ', type: 'date', required: true },
            { name: 'category', label: 'دسته‌بندی', type: 'select', placeholder: false, required: true, options: EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c })) },
            { name: 'description', label: 'شرح', type: 'text', required: true },
            { name: 'amount', label: 'مبلغ (تومان)', type: 'money', required: true, min: 1 }
        ],
        submitText: e ? 'ذخیره' : 'ثبت هزینه',
        onMount: (node) => JalaliDatepicker.init(node),
        onSubmit: (v) => {
            if (e) DB.update('expenses', id, v);
            else DB.insert('expenses', v);
            Toast.success(e ? 'هزینه ویرایش شد' : 'هزینه ثبت شد');
            if (onDone) onDone(); else window.App.reload();
        }
    });
}

export { openSubscriberPayment };
