/* ==========================================================================
 * js/pages/settings.js — تنظیمات: اطلاعات آژانس، تعرفه پلکانی، تعطیلات رسمی،
 *                       ظاهر/PWA و مدیریت داده‌ها
 * ========================================================================== */

import { DB } from '../db.js';
import { Toast, toastError } from '../components/toast.js';
import { Modal } from '../components/modal.js';
import { icon } from '../components/icons.js';
import { pageHeader } from '../components/ui.js';
import { JalaliDatepicker } from '../jalali.js';
import { calculateFare, isHolidayKey, todayJalali, formatJalali, formatNumber, formatMoney, escapeHTML, toFa, parseNumber } from '../utils.js';

export default {
    id: 'settings',
    title: 'تنظیمات',

    render(view) {
        let tab = 'general';
        const s = DB.settings();
        const jy = todayJalali().slice(0, 4);

        view.innerHTML = `
        <section class="page-section active">
          ${pageHeader({
            title: 'تنظیمات سامانه', iconName: 'settings',
            subtitle: 'تعرفه‌ها، اطلاعات آژانس، تعطیلات رسمی و مدیریت داده‌ها. تغییرات فوراً روی محاسبه کرایه اثر می‌گذارد.',
            actions: `<button class="btn btn-gold btn-sm" type="button" id="setSave">${icon('save')} ذخیره تنظیمات</button>`
          })}

          <div class="tab-lite" id="setTabs">
            <button type="button" data-tab="general" class="active">${icon('building')} آژانس و کمیسیون</button>
            <button type="button" data-tab="fare">${icon('calculator')} تعرفه پلکانی</button>
            <button type="button" data-tab="holidays">${icon('calendar')} تعطیلات رسمی</button>
            <button type="button" data-tab="ops">${icon('clock')} قواعد عملیاتی</button>
            <button type="button" data-tab="app">${icon('sun')} ظاهر و PWA</button>
            <button type="button" data-tab="data">${icon('database')} داده‌ها</button>
          </div>

          <div id="setBody"></div>
        </section>`;

        const root = view.querySelector('.page-section');
        const body = root.querySelector('#setBody');

        const form = () => body.querySelector('form') || body;

        const renderTab = () => {
            if (tab === 'general') {
                body.innerHTML = `<div class="card"><form>
                  ${section('اطلاعات آژانس', 'building')}
                  <div class="form-row mb-10">
                    ${field('نام آژانس', 'companyName', s.companyName)}
                    ${field('تلفن آژانس', 'companyPhone', s.companyPhone)}
                  </div>
                  <div class="form-row mb-10">
                    ${field('نشانی آژانس', 'companyAddress', s.companyAddress)}
                    ${fieldNum('درصد مالیات (اختیاری)', 'taxRate', s.taxRate, 0, 100, '0.1', '%')}
                  </div>
                  ${section('کمیسیون', 'percent')}
                  <div class="form-row mb-10">
                    ${fieldNum('درصد کمیسیون پیش‌فرض', 'commissionDefault', s.commissionDefault, 0, 100, '0.5', '٪')}
                    ${fieldNum('ارقام واحد پول', 'currencyRate', 1, 1, 1, '1', '')}
                  </div>
                  <div class="soft-box">${icon('info')} درصد کمیسیون هر راننده در پروندهٔ خودش قابل تغییر است؛ این مقدار فقط پیش‌فرض رانندگان جدید است.</div>
                </form></div>`;
            } else if (tab === 'fare') {
                body.innerHTML = `<div class="card"><form>
                  ${section('کرایه پایه و مسافت', 'route')}
                  <div class="form-row mb-10">
                    ${fieldNum('کرایه پایه (تومان)', 'baseFare', s.baseFare, 0, 10000000, '1000', 'تومان')}
                    ${fieldNum('نرخ هر کیلومتر (تومان)', 'farePerKm', s.farePerKm, 0, 1000000, '500', 'تومان')}
                  </div>
                  ${section('تعرفه شب (ساعات کم‌تردد)', 'moon')}
                  <div class="form-row-3 mb-10">
                    <div class="form-group"><label class="form-label">وضعیت تعرفه شب</label>
                      <select class="form-select" name="nightEnabled">
                        <option value="true" ${s.nightEnabled !== false ? 'selected' : ''}>فعال</option>
                        <option value="false" ${s.nightEnabled === false ? 'selected' : ''}>غیرفعال</option>
                      </select></div>
                    <div class="form-group"><label class="form-label">روش اعمال</label>
                      <select class="form-select" name="nightMode">
                        <option value="multiplier" ${s.nightMode === 'multiplier' ? 'selected' : ''}>ضریب (٪ افزایش)</option>
                        <option value="fixed" ${s.nightMode === 'fixed' ? 'selected' : ''}>مبلغ ثابت اضافه</option>
                      </select></div>
                    <div class="form-group"><label class="form-label">ساعات شب</label>
                      <div class="flex gap-6 items-center">
                        <input class="form-input" name="nightStartHour" type="number" min="0" max="23" value="${s.nightStartHour}" style="max-width:80px">
                        <span>تا</span>
                        <input class="form-input" name="nightEndHour" type="number" min="0" max="23" value="${s.nightEndHour}" style="max-width:80px">
                      </div></div>
                  </div>
                  <div class="form-row mb-10">
                    ${fieldNum('ضریب شب', 'nightMultiplier', s.nightMultiplier, 1, 3, '0.05', 'برابر')}
                    ${fieldNum('مبلغ ثابت شب (تومان)', 'nightFixedSurcharge', s.nightFixedSurcharge, 0, 1000000, '1000', 'تومان')}
                  </div>
                  ${section('تعطیلات رسمی', 'calendar')}
                  <div class="form-row mb-10">
                    ${fieldNum('ضریب تعطیلات', 'holidayMultiplier', s.holidayMultiplier, 1, 3, '0.05', 'برابر')}
                    <div class="form-group"><label class="form-label">جمعه‌ها تعطیل رسمی محسوب شود؟</label>
                      <select class="form-select" name="fridayIsHoliday">
                        <option value="true" ${s.fridayIsHoliday !== false ? 'selected' : ''}>بله</option>
                        <option value="false" ${s.fridayIsHoliday === false ? 'selected' : ''}>خیر</option>
                      </select></div>
                  </div>
                  ${section('پیش‌نمایش محاسبه کرایه', 'calculator')}
                  <div class="form-row-3 mb-10">
                    <div class="form-group"><label class="form-label">مسافت (کیلومتر)</label>
                      <input class="form-input" type="number" id="prevDist" value="10" min="0" step="0.1"></div>
                    <div class="form-group"><label class="form-label">ساعت</label>
                      <input class="form-input" type="number" id="prevHour" value="23" min="0" max="23"></div>
                    <div class="form-group"><label class="form-label">&nbsp;</label>
                      <button class="btn btn-outline btn-sm" type="button" id="prevRun">${icon('refresh')} محاسبه</button></div>
                  </div>
                  <div id="prevOut"></div>
                </form></div>`;
                root.querySelector('#prevRun').addEventListener('click', () => {
                    const dist = parseNumber(root.querySelector('#prevDist').value);
                    const hour = Number(root.querySelector('#prevHour').value);
                    const d = new Date();
                    d.setHours(hour, 0, 0, 0);
                    const settings = collect();
                    const b = calculateFare(dist, d, isHolidayKey(todayJalali(), settings), settings);
                    root.querySelector('#prevOut').innerHTML = `
                      <div class="kpi-tiles">
                        ${kpiBox('کرایه پایه', formatMoney(b.base, false))}
                        ${kpiBox('هزینه مسافت', formatMoney(b.distancePart, false))}
                        ${kpiBox(b.isNight ? 'ضریب شب' : 'بدون ضریب شب', toFa(b.nightMultiplier) + ' برابر')}
                        ${kpiBox(b.isHoliday ? 'ضریب تعطیلات' : 'روز عادی', toFa(b.holidayMultiplier) + ' برابر')}
                        ${kpiBox('کرایه نهایی', formatMoney(b.fare, false), 'var(--gold)')}
                      </div>`;
                });
            } else if (tab === 'holidays') {
                body.innerHTML = `<div class="card">
                  <div class="card-header">
                    <div class="card-title">${icon('calendar')} تعطیلات رسمی (تعرفه ویژه)</div>
                    <div class="card-actions">
                      <input class="form-input jalali-date" id="holDate" placeholder="انتخاب تاریخ" style="max-width:150px">
                      <input class="form-input" id="holTitle" placeholder="عنوان (مثلاً عید نوروز)" style="max-width:190px">
                      <button class="btn btn-gold btn-sm" type="button" id="holAdd">${icon('plus')} افزودن</button>
                      <button class="btn btn-outline btn-sm" type="button" id="holAuto">${icon('refresh')} افزودن تعطیلات ثابت سال</button>
                    </div>
                  </div>
                  <p class="hint mb-10">تعطیلات رسمی و جمعه‌ها (در صورت فعال بودن) با ضریب تعطیلات محاسبه می‌شوند. تعداد ثبت‌شده: <b id="holCount"></b></p>
                  <div id="holList"></div>
                </div>`;
                JalaliDatepicker.init(root);
                const renderHolidays = () => {
                    const settings = DB.settings();
                    const list = [...(settings.holidays || [])].sort();
                    root.querySelector('#holCount').textContent = toFa(list.length);
                    root.querySelector('#holList').innerHTML = list.length
                        ? `<div class="chips">${list.map((h) => `<span class="chip ${h >= todayJalali() ? 'chip-gold' : ''}" style="display:inline-flex; gap:6px; align-items:center">
                            ${formatJalali(h)}
                            <button class="btn-icon danger" type="button" data-del-holiday="${h}" style="font-size:0.7rem">${icon('x')}</button>
                          </span>`).join('')}</div>`
                        : `<div class="empty-state">${icon('calendar', 'icon-xl')}<p>تعطیلات رسمی ثبت نشده است</p></div>`;
                };
                renderHolidays();
                root.querySelector('#holAdd').addEventListener('click', () => {
                    const val = root.querySelector('#holDate').dataset.key || '';
                    if (!val) { Toast.warning('تاریخ را انتخاب کنید'); return; }
                    const settings = DB.settings();
                    if ((settings.holidays || []).includes(val)) { Toast.info('این تاریخ قبلاً ثبت شده است'); return; }
                    updateSettings({ holidays: [...(settings.holidays || []), val] });
                    Toast.success('تعطیلی افزوده شد');
                    renderHolidays();
                });
                root.querySelector('#holAuto').addEventListener('click', () => {
                    const y = Number(todayJalali().slice(0, 4));
                    const fixed = [[1, 1], [1, 2], [1, 3], [1, 4], [1, 12], [1, 13], [11, 22], [12, 29]]
                        .map(([m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
                    const settings = DB.settings();
                    const merged = Array.from(new Set([...(settings.holidays || []), ...fixed])).sort();
                    updateSettings({ holidays: merged });
                    Toast.success('تعطیلات ثابت سال ' + toFa(y) + ' افزوده شد');
                    renderHolidays();
                });
                body.addEventListener('click', (e) => {
                    const del = e.target.closest('[data-del-holiday]');
                    if (!del) return;
                    const settings = DB.settings();
                    updateSettings({ holidays: (settings.holidays || []).filter((h) => h !== del.dataset.delHoliday) });
                    Toast.success('تعطیلی حذف شد');
                    renderHolidays();
                });
            } else if (tab === 'ops') {
                body.innerHTML = `<div class="card"><form>
                  ${section('صف انتظار و هشدارها', 'bell')}
                  <div class="form-row mb-10">
                    ${fieldNum('آستانه هشدار انتظار عادی (دقیقه)', 'queueAlertMinutes', s.queueAlertMinutes, 1, 240, '1', 'دقیقه')}
                    ${fieldNum('آستانه هشدار سفر فوری (دقیقه)', 'urgentAlertMinutes', s.urgentAlertMinutes, 1, 120, '1', 'دقیقه')}
                  </div>
                  ${section('رفتار خودکار سامانه', 'settings')}
                  <div class="form-row mb-10">
                    <div class="form-group"><label class="form-label">با تخصیص سفر، وضعیت راننده «در سفر» شود</label>
                      <select class="form-select" name="autoBusyOnAssign"><option value="true" ${s.autoBusyOnAssign !== false ? 'selected' : ''}>بله</option><option value="false" ${s.autoBusyOnAssign === false ? 'selected' : ''}>خیر</option></select></div>
                    <div class="form-group"><label class="form-label">ثبت خودکار بدهی مشترک در سفرهای حقوقی</label>
                      <select class="form-select" name="debtOnCompanyTrip"><option value="true" ${s.debtOnCompanyTrip !== false ? 'selected' : ''}>بله</option><option value="false" ${s.debtOnCompanyTrip === false ? 'selected' : ''}>خیر</option></select></div>
                  </div>
                  <div class="form-row mb-10">
                    <div class="form-group"><label class="form-label">فرم سفر به‌صورت پیشرفته باز شود</label>
                      <select class="form-select" name="simpleTripForm"><option value="true" ${s.simpleTripForm === true ? 'selected' : ''}>بله</option><option value="false" ${s.simpleTripForm !== true ? 'selected' : ''}>خیر (ساده)</option></select></div>
                    <div class="form-group"><label class="form-label">پر شدن خودکار زمان پایان سفر</label>
                      <select class="form-select" name="dropoffAutoFill"><option value="true" ${s.dropoffAutoFill !== false ? 'selected' : ''}>بله</option><option value="false" ${s.dropoffAutoFill === false ? 'selected' : ''}>خیر</option></select></div>
                  </div>
                </form></div>`;
            } else if (tab === 'app') {
                const theme = document.documentElement.getAttribute('data-theme');
                body.innerHTML = `<div class="card mb-16">
                  <div class="card-header"><div class="card-title">${icon('sun')} ظاهر برنامه</div></div>
                  <div class="form-row mb-10">
                    <div class="form-group"><label class="form-label">تم</label>
                      <div class="segmented" id="themeSeg">
                        <button type="button" data-theme="dark" class="${theme === 'dark' ? 'active' : ''}">${icon('moon')} تاریک</button>
                        <button type="button" data-theme="light" class="${theme === 'light' ? 'active' : ''}">${icon('sun')} روشن</button>
                      </div></div>
                    <div class="form-group"><label class="form-label">فونت برنامه</label>
                      <div class="hint">BNazanin (متن) · BTitr (عناوین) · BLotus (متن ادبی) · BCompset (پشتیبان) — از jsDelivr بارگذاری می‌شوند.</div></div>
                  </div>
                </div>
                <div class="card">
                  <div class="card-header"><div class="card-title">${icon('download')} نصب به‌عنوان برنامه (PWA)</div></div>
                  <p class="hint mb-10">با نصب برنامه، تاکسی تلفنی روی دستگاه (موبایل/تبلت/دسکتاپ) نصب می‌شود و بدون اینترنت هم باز می‌شود.</p>
                  <div class="flex gap-8" style="flex-wrap:wrap">
                    <button class="btn btn-gold btn-sm" type="button" id="pwaInstall">${icon('download')} نصب برنامه</button>
                    <button class="btn btn-outline btn-sm" type="button" id="pwaCheck">${icon('refresh')} وضعیت Service Worker</button>
                  </div>
                  <div class="soft-box mt-16" id="swStatus"></div>
                </div>`;
                root.querySelector('#themeSeg').addEventListener('click', (e) => {
                    const b = e.target.closest('[data-theme]');
                    if (!b) return;
                    window.App.setTheme(b.dataset.theme === 'dark');
                    root.querySelectorAll('#themeSeg button').forEach((x) => x.classList.toggle('active', x === b));
                    Toast.success('تم تغییر کرد');
                });
                root.querySelector('#pwaInstall').addEventListener('click', () => window.App.installPWA());
                root.querySelector('#pwaCheck').addEventListener('click', () => window.App.showSWStatus());
            } else {
                const stats = DB.stats();
                body.innerHTML = `<div class="card mb-16">
                  <div class="card-header"><div class="card-title">${icon('database')} وضعیت پایگاه داده محلی</div>
                    <span class="chip">${DB.adapterName() === 'rest' ? 'اتصال سروری (REST)' : 'ذخیره‌سازی محلی مرورگر'}</span></div>
                  <div class="table-wrapper"><table class="mini-table">
                    <thead><tr><th>موجودیت</th><th>فعال</th><th>حذف‌شده</th></tr></thead>
                    <tbody>
                      ${Object.entries(stats).map(([k, v]) => `<tr><td>${escapeHTML(labelOfCollection(k))}</td><td class="num">${formatNumber(v.active)}</td><td class="num">${formatNumber(v.deleted)}</td></tr>`).join('')}
                    </tbody>
                  </table></div>
                  <div class="hint mt-10">حجم تقریبی داده: ${formatNumber(Math.round(JSON.stringify(DB.exportObject()).length / 1024))} کیلوبایت</div>
                </div>
                <div class="card">
                  <div class="card-header"><div class="card-title">${icon('upload')} عملیات داده</div></div>
                  <div class="flex gap-8" style="flex-wrap:wrap">
                    <button class="btn btn-outline btn-sm" type="button" data-go-backup>${icon('download')} پشتیبان‌گیری و بازیابی</button>
                    <button class="btn btn-outline btn-sm" type="button" id="purgeSample">${icon('trash')} حذف داده‌های نمونه</button>
                  </div>
                  <div class="soft-box mt-16">${icon('info')} لایه داده به‌صورت Adapter نوشته شده است؛ برای اتصال به PocketBase یا Supabase کافی است آدرس سرویس را در تنظیمات API وارد کنید (بدون تغییر در رابط کاربری).</div>
                </div>`;
                root.querySelector('#purgeSample').addEventListener('click', async () => {
                    const ok = await Modal.confirm({
                        title: 'حذف داده‌های نمونه',
                        message: 'تمام رکوردهایی که با برچسب «نمونه» ثبت شده‌اند حذف شوند؟',
                        hint: 'داده‌های واقعی شما دست‌نخورده می‌مانند.',
                        danger: true, okText: 'حذف داده‌های نمونه'
                    });
                    if (!ok) return;
                    const counts = DB.purgeSampleData();
                    const total = Object.values(counts).reduce((a, b) => a + b, 0);
                    Toast.success(`${toFa(total)} رکورد نمونه حذف شد`);
                    renderTab();
                });
                root.querySelector('[data-go-backup]').addEventListener('click', () => window.App.navigate('backup'));
            }
        };

        /* --- جمع‌آوری و ذخیره --- */
        function collect() {
            const out = { ...DB.settings() };
            form()?.querySelectorAll('[name]').forEach((el) => {
                const name = el.name;
                if (!name) return;
                if (el.type === 'number') out[name] = parseNumber(el.value);
                else if (el.value === 'true' || el.value === 'false') out[name] = el.value === 'true';
                else out[name] = el.value.trim();
            });
            return out;
        }

        const save = () => {
            try {
                const before = DB.settings();
                const patch = collect();
                validate(patch);
                updateSettings(patch);
                Toast.success('تنظیمات ذخیره شد');
                return true;
            } catch (err) {
                toastError(err);
                return false;
            }
        };

        root.querySelector('#setSave').addEventListener('click', save);
        root.querySelector('#setTabs').addEventListener('click', (e) => {
            const b = e.target.closest('[data-tab]');
            if (!b) return;
            tab = b.dataset.tab;
            root.querySelectorAll('#setTabs button').forEach((x) => x.classList.toggle('active', x === b));
            renderTab();
        });

        renderTab();
    }
};

/* ------------------------------ کمکی‌ها ------------------------------ */

function section(title, ic) {
    return `<div class="section-label mt-10" style="font-size:0.85rem; color:var(--gold)">${icon(ic)} ${title}</div><div class="divider"></div>`;
}

function field(label, name, value, placeholder = '') {
    return `<div class="form-group"><label class="form-label">${label}</label>
      <input class="form-input" name="${name}" value="${escapeHTML(value ?? '')}" placeholder="${escapeHTML(placeholder)}"></div>`;
}

function fieldNum(label, name, value, min, max, step, unit) {
    return `<div class="form-group"><label class="form-label">${label}</label>
      <input class="form-input" type="number" name="${name}" value="${value ?? 0}" min="${min}" max="${max}" step="${step}">
      ${unit ? `<div class="hint">واحد: ${unit}</div>` : ''}</div>`;
}

function kpiBox(label, value, color) {
    return `<div class="kpi"><div class="k-label">${label}</div><div class="k-value" style="${color ? `color:${color}` : ''}">${value}</div></div>`;
}

function validate(patch) {
    if (patch.baseFare < 0 || patch.farePerKm < 0) throw new Error('کرایه پایه و نرخ کیلومتر نمی‌توانند منفی باشند');
    if (patch.commissionDefault < 0 || patch.commissionDefault > 100) throw new Error('درصد کمیسیون باید بین ۰ تا ۱۰۰ باشد');
    if (patch.nightMultiplier !== undefined && patch.nightMultiplier < 1) throw new Error('ضریب شب نمی‌تواند کمتر از ۱ باشد');
    if (patch.holidayMultiplier !== undefined && patch.holidayMultiplier < 1) throw new Error('ضریب تعطیلات نمی‌تواند کمتر از ۱ باشد');
    if (patch.nightStartHour < 0 || patch.nightStartHour > 23 || patch.nightEndHour < 0 || patch.nightEndHour > 23) {
        throw new Error('ساعات شب باید بین ۰ تا ۲۳ باشد');
    }
    if (!patch.companyName) throw new Error('نام آژانس الزامی است');
    return true;
}

export function updateSettings(patch) {
    DB.mutate((db) => {
        const oldValue = { ...db.settings };
        db.settings = { ...db.settings, ...patch };
        return { action: 'update', entity: 'settings', entityId: 'settings', oldValue, newValue: { ...db.settings } };
    });
    return DB.settings();
}

function labelOfCollection(key) {
    const labels = {
        drivers: 'رانندگان', vehicles: 'خودروها', addresses: 'آدرس‌ها', subscribers: 'مشترکین',
        trips: 'سفرها', subscriberPayments: 'پرداخت مشترکین', driverPayments: 'پرداخت رانندگان',
        transactions: 'تراکنش‌ها', expenses: 'هزینه‌ها', operators: 'کاربران', shifts: 'شیفت‌ها', auditLog: 'گزارش تغییرات'
    };
    return labels[key] || key;
}
