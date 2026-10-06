/* ==========================================================================
 * js/prints.js — سازندهٔ اسناد چاپی (فاکتور مشترک، رسید راننده، گزارش مالی، شیفت)
 * --------------------------------------------------------------------------
 * خروجی همه توابع، HTML آمادهٔ چاپ با استایل css/print.css است و با
 * window.print() به PDF تبدیل می‌شود (بدون کتابخانه خارجی).
 * ========================================================================== */

import {
    formatNumber, formatMoney, formatJalali, formatDateTime, formatTime, toFa, escapeHTML,
    numberToPersianWords, todayJalali, sum, formatJalaliMonth, formatPercent
} from './utils.js';
import { DB } from './db.js';
import { docHeader, docFooter } from './components/ui.js';
import { S } from './strings.js';

function money(n) {
    return formatNumber(n) + ' تومان';
}

/* --------------------------- فاکتور مشترک --------------------------- */

export function invoiceHTML(statement, { title = 'فاکتور خدمات تاکسی تلفنی' } = {}) {
    const { subscriber, trips, payments, totalFare, companyFare, debt, debtAge, from, to } = statement;
    const range = (from || to) ? `${from ? 'از ' + formatJalali(from) : ''} ${to ? 'تا ' + formatJalali(to) : ''}` : 'کل دوره';

    return `
    <div class="print-doc">
      ${docHeader({
        title,
        subtitle: `مشترک: ${escapeHTML(subscriber.fullName)} · شماره اشتراک: ${escapeHTML(subscriber.subscriptionNumber || '—')} · بازه: ${range}`,
        extraMeta: `<div>شمارهٔ سند: INV-${escapeHTML(String(subscriber.subscriptionNumber || '').replace(/\D/g, '') || '0')}-${toFa(todayJalali().replace(/-/g, ''))}</div>
                    <div>نوع مشترک: ${subscriber.type === 'corporate' ? 'حقوقی' : 'حقیقی'}</div>`
      })}

      <div class="doc-summary">
        <div class="box">مجموع کرایه سفرها<b>${money(totalFare)}</b></div>
        <div class="box">از این مبلغ، تسویه با آژانس<b>${money(companyFare)}</b></div>
        <div class="box">پرداخت‌شده (در بازه)<b>${money(sum(payments, (p) => p.amount))}</b></div>
        <div class="box">مانده بدهی<b style="color:#b91c1c">${money(debt)}</b></div>
      </div>

      ${debt > 0 && debtAge > 0 ? `<div class="doc-note">سنّ بدهی: ${toFa(debtAge)} روز${debtAge > 60 ? ' — نیازمند پیگیری فوری' : ''}</div>` : ''}

      <table>
        <thead><tr><th style="width:34px">#</th><th>تاریخ</th><th>راننده</th><th>مبدأ</th><th>مقصد</th><th>مسافت</th><th>کرایه</th><th>وضعیت</th></tr></thead>
        <tbody>
          ${trips.length ? trips.map((t, i) => `<tr>
            <td>${toFa(i + 1)}</td>
            <td>${formatJalali(t.pickupTime)}</td>
            <td>${escapeHTML(DB.get('drivers', t.driverId)?.fullName || '—')}</td>
            <td>${escapeHTML(t.pickupAddress || '—')}</td>
            <td>${escapeHTML(t.dropoffAddress || '—')}</td>
            <td>${t.distance ? formatNumber(t.distance) : '—'}</td>
            <td>${formatNumber(t.fare)}</td>
            <td>${S.tripStatus[t.status] || t.status}</td>
          </tr>`).join('') : `<tr><td colspan="8" style="text-align:center">سفری در این بازه ثبت نشده است</td></tr>`}
        </tbody>
        <tfoot><tr class="total-row"><td colspan="6">جمع کل سفرها (${toFa(trips.length)} سفر)</td><td>${formatNumber(totalFare)}</td><td></td></tr></tfoot>
      </table>

      <div class="doc-note">مبلغ بدهی به حروف: <b>${numberToPersianWords(debt)} تومان</b></div>

      <h3 style="margin-top:16px; font-size:0.9rem">تاریخچه پرداخت‌ها</h3>
      <table>
        <thead><tr><th style="width:34px">#</th><th>تاریخ</th><th>مبلغ</th><th>روش</th><th>شماره رسید</th><th>ملاحظات</th></tr></thead>
        <tbody>
          ${payments.length ? payments.map((p, i) => `<tr>
            <td>${toFa(i + 1)}</td><td>${formatJalali(p.date)}</td><td>${formatNumber(p.amount)}</td>
            <td>${p.method === 'cash' ? 'نقدی' : p.method === 'card' ? 'کارتی' : p.method === 'online' ? 'آنلاین' : 'سایر'}</td>
            <td>${escapeHTML(p.receiptNo || '—')}</td><td>${escapeHTML(p.notes || '')}</td>
          </tr>`).join('') : `<tr><td colspan="6" style="text-align:center">پرداختی ثبت نشده است</td></tr>`}
        </tbody>
      </table>

      ${docFooter()}
    </div>`;
}

/* --------------------------- رسید راننده --------------------------- */

export function driverReceiptHTML(statement, { title = 'صورت‌حساب و رسید تسویه راننده' } = {}) {
    const st = statement;
    const range = (st.from || st.to)
        ? `${st.from ? 'از ' + formatJalali(st.from) : ''} ${st.to ? 'تا ' + formatJalali(st.to) : ''}`
        : 'کل دوره';

    return `
    <div class="print-doc">
      ${docHeader({
        title,
        subtitle: `راننده: ${escapeHTML(st.driver.fullName)} · ${range}`,
        extraMeta: `<div>تلفن راننده: ${toFa(st.driver.phone || '—')}</div>
                    <div>درصد کمیسیون: ${toFa(st.driver.commissionRate || 0)}٪</div>
                    <div>شمارهٔ سند: DRV-${toFa(todayJalali().replace(/-/g, ''))}</div>`
      })}

      <div class="doc-summary">
        <div class="box">تعداد سفر<b>${toFa(st.trips.length)}</b></div>
        <div class="box">مجموع کرایه<b>${money(st.totalFare)}</b></div>
        <div class="box">کمیسیون آژانس<b>${money(st.totalCommission)}</b></div>
        <div class="box">سهم راننده<b>${money(st.totalShare)}</b></div>
      </div>

      <table>
        <thead><tr><th>شرح</th><th>مبلغ (تومان)</th></tr></thead>
        <tbody>
          <tr><td>سهم راننده از سفرهای نقدی (دریافت‌شده توسط راننده)</td><td>${formatNumber(st.totalShare - st.corporateShare)}</td></tr>
          <tr><td>سهم راننده از سفرهای حقوقی (وصول توسط آژانس)</td><td>${formatNumber(st.corporateShare)}</td></tr>
          <tr><td>کمیسیون آژانس از سفرهای نقدی (بدهی راننده به آژانس)</td><td>${formatNumber(st.commissionFromCash)}</td></tr>
          <tr><td>پرداخت‌های انجام‌شده به راننده (${toFa(st.payments.filter((p) => (p.kind || 'payout') === 'payout').length)} فقره)</td><td>${formatNumber(st.payouts)}</td></tr>
          <tr><td>تسویه‌های نقدی راننده به آژانس (${toFa(st.payments.filter((p) => p.kind === 'settle').length)} فقره)</td><td>${formatNumber(st.settlements)}</td></tr>
          <tr class="total-row"><td>طلب راننده از آژانس (پس از کسر پرداخت‌ها)</td><td>${formatNumber(st.driverClaim)}</td></tr>
          <tr class="total-row"><td>طلب آژانس از راننده (پس از کسر تسویه‌ها)</td><td>${formatNumber(st.agencyClaim)}</td></tr>
          <tr class="total-row"><td><b>مانده قابل پرداخت به راننده</b></td><td><b>${formatNumber(st.payable)}</b></td></tr>
        </tbody>
      </table>

      <div class="doc-note">
        مانده قابل پرداخت به حروف: <b>${numberToPersianWords(st.payable)} تومان</b>
        ${st.net < 0 ? `<br>مانده بدهی راننده به آژانس: <b>${money(-st.net)}</b>` : ''}
      </div>

      ${st.companyGroups.length ? `
        <h3 style="margin-top:16px; font-size:0.9rem">تفکیک سفرهای حقوقی بر اساس شرکت</h3>
        <table>
          <thead><tr><th>شرکت</th><th>تعداد سفر</th><th>مجموع کرایه</th><th>کمیسیون آژانس</th><th>سهم راننده</th></tr></thead>
          <tbody>${st.companyGroups.map((g) => `<tr>
            <td>${escapeHTML(g.name)}</td><td>${toFa(g.count)}</td><td>${formatNumber(g.fare)}</td>
            <td>${formatNumber(g.commission)}</td><td>${formatNumber(g.share)}</td></tr>`).join('')}</tbody>
          <tfoot><tr class="total-row"><td>جمع</td><td>${toFa(st.corporateTrips.length)}</td>
            <td>${formatNumber(st.corporateFare)}</td><td>${formatNumber(st.corporateFare - st.corporateShare)}</td>
            <td>${formatNumber(st.corporateShare)}</td></tr></tfoot>
        </table>` : ''}

      <h3 style="margin-top:16px; font-size:0.9rem">ریز سفرها (${toFa(st.trips.length)} سفر)</h3>
      <table>
        <thead><tr><th style="width:30px">#</th><th>تاریخ</th><th>مسافر</th><th>مسیر</th><th>کرایه</th><th>کمیسیون</th><th>سهم راننده</th><th>تسویه</th></tr></thead>
        <tbody>
          ${st.trips.length ? st.trips.map((t, i) => `<tr>
            <td>${toFa(i + 1)}</td>
            <td>${formatJalali(t.pickupTime)} ${formatTime(t.pickupTime)}</td>
            <td>${escapeHTML(t.subscriberName)}</td>
            <td>${escapeHTML(t.pickupAddress || '—')} ← ${escapeHTML(t.dropoffAddress || '—')}</td>
            <td>${formatNumber(t.fare)}</td><td>${formatNumber(t.commission)}</td><td>${formatNumber(t.driverShare)}</td>
            <td>${t.billedTo === 'company' ? 'آژانس' : 'راننده'}</td>
          </tr>`).join('') : '<tr><td colspan="8" style="text-align:center">سفری در این بازه نیست</td></tr>'}
        </tbody>
      </table>

      <h3 style="margin-top:16px; font-size:0.9rem">پرداخت‌های ثبت‌شده</h3>
      <table>
        <thead><tr><th style="width:30px">#</th><th>تاریخ</th><th>نوع</th><th>مبلغ</th><th>روش</th><th>ملاحظات</th></tr></thead>
        <tbody>${st.payments.length ? st.payments.map((p, i) => `<tr>
            <td>${toFa(i + 1)}</td><td>${formatJalali(p.date)}</td>
            <td>${(p.kind || 'payout') === 'settle' ? 'تسویه نقدی راننده' : 'پرداخت به راننده'}</td>
            <td>${formatNumber(p.amount)}</td>
            <td>${p.method === 'cash' ? 'نقدی' : p.method === 'card' ? 'کارتی' : 'سایر'}</td>
            <td>${escapeHTML(p.notes || '')}</td></tr>`).join('')
            : '<tr><td colspan="6" style="text-align:center">پرداختی ثبت نشده است</td></tr>'}</tbody>
      </table>

      ${docFooter()}
    </div>`;
}

/* --------------------------- گزارش مالی --------------------------- */

export function financialReportHTML(financial, { from, to, chartData = null } = {}) {
    const f = financial;
    return `
    <div class="print-doc">
      ${docHeader({
        title: 'گزارش مالی دوره',
        subtitle: `بازه: ${from ? formatJalali(from) : 'ابتدا'} تا ${to ? formatJalali(to) : 'اکنون'}`,
        extraMeta: `<div>تاریخ تهیه: ${formatJalali(todayJalali())}</div>`
      })}

      <div class="doc-summary">
        <div class="box">تعداد سفر تکمیل‌شده<b>${toFa(f.tripCount)}</b></div>
        <div class="box">مجموع کرایه‌ها<b>${money(f.fareSum)}</b></div>
        <div class="box">درآمد آژانس (کمیسیون + تسویه)<b>${money(f.netIncome)}</b></div>
        <div class="box">سود خالص دوره<b style="color:${f.profit >= 0 ? '#15803d' : '#b91c1c'}">${money(f.profit)}</b></div>
      </div>

      <table>
        <thead><tr><th>شرح درآمد</th><th>مبلغ (تومان)</th></tr></thead>
        <tbody>
          <tr><td>کمیسیون از سفرهای نقدی و حقوقی</td><td>${formatNumber(f.commission)}</td></tr>
          <tr><td>تسویه‌های نقدی رانندگان</td><td>${formatNumber(f.settleIncome)}</td></tr>
          <tr><td>دریافتی از مشترکین</td><td>${formatNumber(f.subscriptionIncome)}</td></tr>
          <tr class="total-row"><td>جمع درآمد</td><td>${formatNumber(f.netIncome)}</td></tr>
        </tbody>
      </table>

      <table>
        <thead><tr><th>شرح هزینه</th><th>مبلغ (تومان)</th></tr></thead>
        <tbody>
          <tr><td>پرداخت به رانندگان</td><td>${formatNumber(f.driverPaymentSum)}</td></tr>
          <tr><td>هزینه‌های جانبی و عملیاتی</td><td>${formatNumber(f.expenseSum)}</td></tr>
          <tr class="total-row"><td>جمع هزینه‌ها</td><td>${formatNumber(f.driverPaymentSum + f.expenseSum)}</td></tr>
          <tr class="total-row"><td><b>سود خالص</b></td><td><b>${formatNumber(f.profit)}</b></td></tr>
        </tbody>
      </table>

      ${chartData ? `
        <h3 style="margin-top:16px; font-size:0.9rem">آمار روزانه دوره</h3>
        <table>
          <thead><tr><th>تاریخ</th><th>تعداد سفر</th><th>کرایه</th><th>کمیسیون</th></tr></thead>
          <tbody>${chartData.labels.map((l, i) => `<tr>
            <td>${l}</td><td>${toFa(chartData.trips[i])}</td>
            <td>${formatNumber(chartData.revenue[i])}</td><td>${formatNumber(chartData.commission[i])}</td></tr>`).join('')}</tbody>
        </table>` : ''}

      <div class="doc-note">مبلغ سود خالص به حروف: <b>${numberToPersianWords(f.profit)} تومان</b></div>
      ${docFooter()}
    </div>`;
}

/* --------------------------- گزارش شیفت --------------------------- */

export function shiftReportHTML(shift, stats, { operator = null, trips = [] } = {}) {
    return `
    <div class="print-doc">
      ${docHeader({
        title: 'گزارش شیفت اپراتور',
        subtitle: `اپراتور: ${escapeHTML(operator?.fullName || shift.operatorName || '—')} · کد شیفت: ${escapeHTML(shift.code || '—')}`,
        extraMeta: `<div>تاریخ: ${formatJalali(shift.date)}</div>`
      })}
      <div class="doc-summary">
        <div class="box">شروع شیفت<b>${formatDateTime(shift.startTime)}</b></div>
        <div class="box">پایان شیفت<b>${shift.endTime ? formatDateTime(shift.endTime) : 'در جریان'}</b></div>
        <div class="box">صندوق اولیه<b>${money(shift.openingCash)}</b></div>
        <div class="box">صندوق پایانی<b>${shift.closingCash !== null && shift.closingCash !== undefined ? money(shift.closingCash) : '—'}</b></div>
      </div>
      <table>
        <thead><tr><th>شاخص</th><th>مقدار</th></tr></thead>
        <tbody>
          <tr><td>تعداد سفرهای ثبت‌شده</td><td>${toFa(stats.tripsCount)}</td></tr>
          <tr><td>سفرهای تکمیل‌شده</td><td>${toFa(stats.completedCount)}</td></tr>
          <tr><td>سفرهای لغوشده</td><td>${toFa(stats.cancelledCount)}</td></tr>
          <tr><td>سفرهای در انتظار (پایان شیفت)</td><td>${toFa(stats.pendingCount)}</td></tr>
          <tr><td>مجموع کرایه سفرهای تکمیل‌شده</td><td>${formatNumber(stats.fareSum)}</td></tr>
          <tr><td>کمیسیون کسب‌شده در شیفت</td><td>${formatNumber(stats.commission)}</td></tr>
          <tr class="total-row"><td>درآمد نقدی شیفت</td><td>${formatNumber(stats.cashIncome)}</td></tr>
        </tbody>
      </table>
      ${trips.length ? `
        <h3 style="margin-top:16px; font-size:0.9rem">سفرهای شیفت (${toFa(trips.length)})</h3>
        <table>
          <thead><tr><th>کد</th><th>ساعت</th><th>مسافر</th><th>راننده</th><th>کرایه</th><th>وضعیت</th></tr></thead>
          <tbody>${trips.map((t) => `<tr>
            <td>${escapeHTML(t.code || '')}</td><td>${formatTime(t.pickupTime)}</td>
            <td>${escapeHTML(t.subscriberName)}</td>
            <td>${escapeHTML(DB.get('drivers', t.driverId)?.fullName || '—')}</td>
            <td>${formatNumber(t.fare)}</td><td>${S.tripStatus[t.status] || t.status}</td></tr>`).join('')}</tbody>
        </table>` : ''}
      ${docFooter()}
    </div>`;
}

/* --------------------------- گزارش تحلیلی (کارکرد اپراتور/لغو/بدهکاران) --------------------------- */

export function analysisReportHTML({ title, subtitle = '', kpis = [], tables = [] } = {}) {
    return `
    <div class="print-doc">
      ${docHeader({ title, subtitle, extraMeta: `<div>تاریخ تهیه: ${formatJalali(todayJalali())}</div>` })}
      ${kpis.length ? `<div class="doc-summary">${kpis.map((k) => `<div class="box">${escapeHTML(k.label)}<b>${k.value}</b></div>`).join('')}</div>` : ''}
      ${tables.map((tb) => `
        <h3 style="margin-top:14px; font-size:0.9rem">${escapeHTML(tb.title || '')}</h3>
        <table>
          <thead><tr>${(tb.headers || []).map((h) => `<th>${escapeHTML(h)}</th>`).join('')}</tr></thead>
          <tbody>${(tb.rows || []).map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>`).join('')}
      ${docFooter()}
    </div>`;
}

export default { invoiceHTML, driverReceiptHTML, financialReportHTML, shiftReportHTML, analysisReportHTML };
