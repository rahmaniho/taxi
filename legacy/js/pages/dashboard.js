/* ==========================================================================
 * js/pages/dashboard.js — داشبورد مدیریتی
 * ========================================================================== */

import { DB } from '../db.js';
import { Auth } from '../auth.js';
import { Trips, Drivers, Subscribers, Reports, Alerts, Payments } from '../domain.js';
import { Charts } from '../components/chart.js';
import { Toast, toastError } from '../components/toast.js';
import { Modal } from '../components/modal.js';
import { icon } from '../components/icons.js';
import { statusBadge, availabilityBadge, kpi, alertRow, availabilityLabel } from '../components/ui.js';
import {
    formatNumber, formatJalali, formatDateTime, formatTime, toFa, todayJalali, addJalaliDays,
    isoToJalaliKey, sum, escapeHTML, formatMoney
} from '../utils.js';

export default {
    id: 'dashboard',
    title: 'داشبورد',

    render(view) {
        const settings = DB.settings();
        const today = todayJalali();
        const trips = Trips.all();
        const todayTrips = trips.filter((t) => isoToJalaliKey(t.pickupTime) === today);
        const completedToday = todayTrips.filter((t) => t.status === 'completed');
        const queue = Trips.pendingQueue();
        const drivers = Drivers.all();
        const available = drivers.filter((d) => d.availability === 'available' && d.status === 'active');
        const activeVehicles = DB.list('vehicles').filter((v) => v.status === 'active');
        const subscribers = Subscribers.all();
        const totalDebt = sum(subscribers, (s) => Subscribers.computeDebt(s.id));
        const revenueToday = sum(completedToday, (t) => t.fare);
        const commissionToday = sum(completedToday, (t) => t.commission);

        const alerts = [
            ...Alerts.overdueQueue(),
            ...Alerts.expiringDocs(30),
            ...Alerts.subscriptionExpiry(7)
        ].slice(0, 8);

        const recent = [...trips]
            .sort((a, b) => new Date(b.createdAt || b.pickupTime) - new Date(a.createdAt || a.pickupTime))
            .slice(0, 8);

        const topDrivers = Drivers.activity(7).filter((d) => d.tripCount > 0).sort((a, b) => b.tripCount - a.tripCount).slice(0, 6);

        view.innerHTML = `
        <section class="page-section active">
          <div class="page-header">
            <div class="page-title">${icon('dashboard')} داشبورد عملیاتی</div>
            <div class="card-actions">
              <span class="chip chip-gold">${icon('calendar')} ${formatJalali(today)}</span>
              ${Auth.hasOpenShift()
                ? `<span class="chip chip-green">${icon('play')} شیفت باز: ${escapeHTML(Auth.current()?.fullName || '')}</span>`
                : `<span class="chip chip-red">${icon('square')} شیفت بسته است</span>`}
              <button class="btn btn-gold" type="button" data-go="trips-new">${icon('plus-circle')} ثبت سفر جدید</button>
              <button class="btn btn-outline" type="button" data-go="queue">${icon('queue')} صف انتظار (${formatNumber(queue.length)})</button>
            </div>
          </div>

          <div class="stats-grid mb-20">
            <div class="stat-card clickable" data-go="queue">
              <div class="stat-icon">${icon('queue')}</div>
              <div class="stat-value" style="color:${queue.length ? 'var(--gold)' : ''}">${formatNumber(queue.length)}</div>
              <div class="stat-label">سفر در صف انتظار</div>
            </div>
            <div class="stat-card clickable" data-go="trips-list">
              <div class="stat-icon">${icon('route')}</div>
              <div class="stat-value">${formatNumber(todayTrips.length)}</div>
              <div class="stat-label">سفرهای امروز (تکمیل: ${formatNumber(completedToday.length)})</div>
            </div>
            <div class="stat-card">
              <div class="stat-icon">${icon('coins')}</div>
              <div class="stat-value">${formatNumber(revenueToday)}</div>
              <div class="stat-label">کرایه امروز (تومان) · کمیسیون ${formatNumber(commissionToday)}</div>
            </div>
            <div class="stat-card">
              <div class="stat-icon">${icon('car')}</div>
              <div class="stat-value">${formatNumber(available.length)}<span style="font-size:0.9rem;color:var(--text-muted)"> / ${formatNumber(drivers.length)}</span></div>
              <div class="stat-label">راننده آزاد / کل رانندگان</div>
            </div>
          </div>

          <div class="kpi-tiles mb-20">
            ${kpi({ label: 'خودروهای فعال', value: formatNumber(activeVehicles.length), iconName: 'car', hint: `در تعمیر: ${formatNumber(DB.list('vehicles').filter((v) => v.status === 'inRepair').length)}` })}
            ${kpi({ label: 'مشترکین', value: formatNumber(subscribers.length), iconName: 'users', hint: `حقوقی: ${formatNumber(subscribers.filter((s) => s.type === 'corporate').length)}` })}
            ${kpi({ label: 'مجموع بدهی مشترکین', value: formatMoney(totalDebt, false), iconName: 'wallet', color: totalDebt > 0 ? 'var(--red)' : 'var(--green)', hint: `${formatNumber(subscribers.filter((s) => Subscribers.computeDebt(s.id) > 0).length)} مشترک بدهکار` })}
            ${kpi({ label: 'کمیسیون امروز', value: formatMoney(commissionToday, false), iconName: 'percent', color: 'var(--gold)' })}
          </div>

          <div class="charts-grid mb-20">
            <div class="card">
              <div class="card-header"><div class="card-title">${icon('trending-up')} روند درآمد و تعداد سفر (۷ روز)</div></div>
              <div class="chart-container" data-chart="revenue7" style="height:230px"></div>
            </div>
            <div class="card">
              <div class="card-header"><div class="card-title">${icon('credit-card')} سهم روش‌های پرداخت (۳۰ روز)</div></div>
              <div class="chart-container" data-chart="payments" style="height:230px"></div>
            </div>
          </div>

          <div class="grid-2 mb-20">
            <div class="card">
              <div class="card-header">
                <div class="card-title">${icon('clock')} آخرین سفرها</div>
                <button class="btn btn-outline btn-sm" type="button" data-go="trips-list">همه سفرها</button>
              </div>
              ${recent.length ? `<div class="table-wrapper"><table class="mini-table">
                  <thead><tr><th>کد</th><th>مسافر</th><th>راننده</th><th>کرایه</th><th>وضعیت</th></tr></thead>
                  <tbody>${recent.map((t) => `<tr>
                    <td>${escapeHTML(t.code || '—')}</td>
                    <td>${escapeHTML(t.subscriberName)}<span class="cell-sub">${formatDateTime(t.pickupTime)}</span></td>
                    <td>${escapeHTML(DB.get('drivers', t.driverId)?.fullName || '—')}</td>
                    <td class="num">${formatNumber(t.fare)}</td>
                    <td>${statusBadge(t.status)}</td>
                  </tr>`).join('')}</tbody>
                </table></div>` : `<div class="empty-state">${icon('route', 'icon-xl')}<p>هنوز سفری ثبت نشده است</p></div>`}
            </div>

            <div class="card">
              <div class="card-header"><div class="card-title">${icon('bell')} هشدارها و یادآوری‌ها</div></div>
              ${alerts.length ? alerts.map((a) => alertRow(a)).join('') : `<div class="empty-state">${icon('check-circle', 'icon-xl')}<p>همه چیز مرتب است؛ هشداری وجود ندارد</p></div>`}
            </div>
          </div>

          <div class="grid-2">
            <div class="card">
              <div class="card-header">
                <div class="card-title">${icon('star')} رانندگان برتر ۷ روز گذشته</div>
                <button class="btn btn-outline btn-sm" type="button" data-go="reports-drivers">گزارش کامل</button>
              </div>
              ${topDrivers.length ? `<div data-chart="topDrivers"></div>` : `<div class="empty-state">${icon('car', 'icon-xl')}<p>داده‌ای برای نمایش نیست</p></div>`}
            </div>

            <div class="card">
              <div class="card-header"><div class="card-title">${icon('car')} وضعیت آنی ناوگان</div></div>
              ${drivers.length ? `<div class="table-wrapper"><table class="mini-table">
                  <thead><tr><th>راننده</th><th>وضعیت</th><th>سفر امروز</th></tr></thead>
                  <tbody>${drivers.map((d) => `<tr>
                    <td>${escapeHTML(d.fullName)}</td>
                    <td>${availabilityBadge(d)}</td>
                    <td class="num">${formatNumber(Drivers.todayTripCount(d.id))}</td>
                  </tr>`).join('')}</tbody>
                </table></div>` : `<div class="empty-state">${icon('user-plus', 'icon-xl')}<p>راننده‌ای ثبت نشده است</p></div>`}
            </div>
          </div>
        </section>`;

        /* --- نمودارها --- */
        try {
          const series = Reports.dailySeries(7);
          const maxRev = Math.max(...series.revenue, 1);
          Charts.groupedBar(view.querySelector('[data-chart="revenue7"]'), {
            labels: series.labels.map((l) => toFa(l)),
            series: [
              { label: 'کرایه (تومان)', data: series.revenue, color: '#D4AF37' },
              { label: 'تعداد سفر (×' + Math.round(maxRev / Math.max(1, Math.max(...series.trips))) + ')', data: series.trips.map((t) => t * Math.round(maxRev / Math.max(1, Math.max(...series.trips)))), color: '#3b82f6' }
            ],
            emptyText: 'در ۷ روز گذشته سفری تکمیل نشده است'
          });
          const pm = Reports.paymentMethods(30);
          Charts.pie(view.querySelector('[data-chart="payments"]'), { labels: pm.labels, data: pm.data, emptyText: 'داده‌ای برای روش پرداخت وجود ندارد' });

          const barsHost = view.querySelector('[data-chart="topDrivers"]');
          if (barsHost) {
            Charts.bars(barsHost, {
              items: topDrivers.map((d) => ({ label: d.driver.fullName, value: d.tripCount, text: `${formatNumber(d.tripCount)} سفر · ${formatNumber(d.share)}` }))
            });
          }
        } catch (e) {
          toastError(e, 'خطا در رسم نمودارها');
        }

        /* --- رویدادها (روی ریشهٔ همان رندر؛ با رندر مجدد، لیسنر قدیمی حذف می‌شود) --- */
        const root = view.querySelector('.page-section');
        root.addEventListener('click', (e) => {
          const go = e.target.closest('[data-go]');
          if (go) {
            e.preventDefault();
            window.App.navigate(go.dataset.go);
            return;
          }
          const avail = e.target.closest('[data-avail-toggle]');
          if (avail) {
            if (!Auth.can('driver.availability')) { Toast.error('شما اجازه تغییر وضعیت راننده را ندارید'); return; }
            try {
              const next = Drivers.cycleAvailability(avail.dataset.availToggle);
              Toast.success('وضعیت راننده: ' + availabilityLabel(next));
              window.App.reload();
            } catch (err) { toastError(err); }
          }
        });
    }
};
