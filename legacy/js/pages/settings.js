/* ==========================================================================
 * js/pages/settings.js — تنظیمات: اطلاعات آژانس، تعرفه پلکانی، تعطیلات رسمی،
 *                       ظاهر/PWA و مدیریت داده‌ها
 * ========================================================================== */

import { DB } from '../db.js';
import { Auth } from '../auth.js';
import { Agency, LOGO_MAX_BYTES } from '../agency.js';
import { Toast, toastError } from '../components/toast.js';
import { Modal } from '../components/modal.js';
import { icon } from '../components/icons.js';
import { pageHeader } from '../components/ui.js';
import { JalaliDatepicker } from '../jalali.js';
import {
    calculateFare, isHolidayKey, todayJalali, formatJalali, formatNumber, formatMoney, escapeHTML, toFa,
    parseNumber, imageFileToDataURL, formatFileSize, isoToJalaliKey
} from '../utils.js';

export default {
    id: 'settings',
    title: 'تنظیمات',

    render(view) {
        let tab = 'agency';
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
            <button type="button" data-tab="agency" class="active">${icon('building')} هویت آژانس و لوگو</button>
            <button type="button" data-tab="general">${icon('percent')} کمیسیون و مالیات</button>
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
            if (tab === 'agency') {
                const a = Agency.current() || {};
                const sub = Agency.subscription(a);
                body.innerHTML = `
                <div class="card mb-16">
                  <div class="card-header"><div class="card-title">${icon('image')} لوگوی آژانس روی اسناد چاپی</div>
                    <div class="card-actions"><span class="chip ${sub.tone === 'danger' ? 'chip-red' : sub.tone === 'warn' ? 'chip-gold' : 'chip-green'}">اشتراک: ${escapeHTML(sub.label)}</span></div></div>
                  <div class="agency-logo-preview mb-12">
                    <div id="logoBox">${a.logo
                        ? `<img src="${escapeHTML(a.logo)}" alt="لوگو">`
                        : `<div style="opacity:.7">${icon('image', 'icon-xl')}</div>`}</div>
                    <div>
                      <div class="text-bold">${escapeHTML(a.name || 'آژانس')}</div>
                      <div class="hint">این لوگو بالای صورت‌حساب مشترکین، رسید راننده و گزارش‌های مالی چاپ می‌شود.</div>
                    </div>
                  </div>
                  <div class="flex gap-8 flex-wrap items-center">
                    <input type="file" id="agencyLogoFile" class="form-input" style="max-width:320px" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml">
                    <button class="btn btn-outline btn-sm" type="button" id="agencyLogoRemove">${icon('trash')} حذف لوگو</button>
                    <button class="btn btn-outline btn-sm" type="button" id="agencyPreview">${icon('printer')} پیش‌نمایش سربرگ</button>
                  </div>
                  <div class="hint mt-10">حجم مجاز تا ${toFa(Math.round(LOGO_MAX_BYTES / 1024))} کیلوبایت؛ PNG با پس‌زمینهٔ شفاف بهترین نتیجه را می‌دهد.</div>
                </div>
                <div class="card"><form>
                  ${section('هویت آژانس', 'building')}
                  <div class="form-row mb-10">
                    ${field('نام آژانس', 'agencyName', a.name || s.companyName)}
                    ${field('تلفن آژانس', 'agencyPhone', a.phone || s.companyPhone)}
                  </div>
                  <div class="form-row mb-10">
                    ${field('نشانی آژانس', 'agencyAddress', a.address || s.companyAddress)}
                    ${field('شناسهٔ ملی / کد اقتصادی', 'agencyEconomicCode', a.economicCode || '')}
                  </div>
                  <div class="form-row mb-10">
                    ${field('متن پاصفحهٔ اسناد (اختیاری)', 'agencyFooterNote', a.footerNote || '')}
                    <div class="form-group"><label class="form-label">آژانس فعال</label>
                      <input class="form-input" value="${escapeHTML(a.name || '')}" readonly>
                      <div class="hint">جابه‌جایی آژانس از منوی «آژانس‌ها و اشتراک‌ها» انجام می‌شود (فقط مدیر سامانه).</div></div>
                  </div>
                  ${section('کمیسیون و مالیات', 'percent')}
                  <div class="form-row mb-10">
                    ${fieldNum('درصد کمیسیون پیش‌فرض', 'commissionDefault', s.commissionDefault, 0, 100, '0.5', '٪')}
                    ${fieldNum('درصد مالیات (اختیاری)', 'taxRate', s.taxRate, 0, 100, '0.1', '%')}
                  </div>
                  <div class="soft-box">${icon('info')} درصد کمیسیون هر راننده در پروندهٔ خودش قابل تغییر است؛ این مقدار فقط پیش‌فرض رانندگان جدید است.</div>
                </form></div>`;

                const logoBox = root.querySelector('#logoBox');
                const paintLogo = (dataUrl) => {
                    logoBox.innerHTML = dataUrl
                        ? `<img src="${escapeHTML(dataUrl)}" alt="لوگو">`
                        : `<div style="opacity:.7">${icon('image', 'icon-xl')}</div>`;
                };
                root.querySelector('#agencyLogoFile').addEventListener('change', async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                        const dataUrl = await imageFileToDataURL(file, { maxBytes: LOGO_MAX_BYTES });
                        Agency.setLogo(a.id, dataUrl);
                        paintLogo(dataUrl);
                        window.App.updateAgencyChip?.();
                        window.App.reload();
                        Toast.success(`لوگو ذخیره شد (${formatFileSize(file.size)}) و روی اسناد چاپی چاپ می‌شود`);
                    } catch (err) { toastError(err); }
                });
                root.querySelector('#agencyLogoRemove').addEventListener('click', async () => {
                    const ok = await Modal.confirm({ title: 'حذف لوگو', message: 'لوگوی این آژانس حذف شود؟', danger: true, okText: 'حذف' });
                    if (!ok) return;
                    try {
                        Agency.setLogo(a.id, '');
                        paintLogo('');
                        window.App.updateAgencyChip?.();
                        window.App.reload();
                        Toast.success('لوگو حذف شد');
                    } catch (err) { toastError(err); }
                });
                root.querySelector('#agencyPreview').addEventListener('click', () => {
                    const identity = Agency.identity();
                    Modal.open({
                        title: 'سربرگ اسناد چاپی', iconName: 'printer',
                        body: `<div class="agency-logo-preview mb-12" id="hdrPrev">
                          ${identity.hasLogo ? `<img src="${escapeHTML(identity.logo)}" alt="لوگو">` : icon('image', 'icon-xl')}
                          <div><div class="text-bold">${escapeHTML(identity.name)}</div>
                            <div class="hint">${escapeHTML(identity.address || '')}</div>
                            <div class="hint">تلفن: ${toFa(identity.phone || '—')}</div></div>
                        </div>
                        <div class="soft-box">${icon('info')} لوگو و این مشخصات، بالای همهٔ اسناد چاپی (صورت‌حساب مشترک، رسید راننده، گزارش‌های مالی) درج می‌شود. برای دیدن خروجی واقعی، از «آژانس‌ها ← نمونهٔ صورتحساب» استفاده کنید.</div>`,
                        footer: `<button class="btn btn-outline" type="button" data-modal-close>بستن</button>`
                    });
                });
            } else if (tab === 'general') {
                body.innerHTML = `<div class="card"><form>
                  ${section('کمیسیون و مالیات', 'percent')}
                  <div class="form-row mb-10">
                    ${fieldNum('درصد کمیسیون پیش‌فرض', 'commissionDefault', s.commissionDefault, 0, 100, '0.5', '٪')}
                    ${fieldNum('درصد مالیات (اختیاری)', 'taxRate', s.taxRate, 0, 100, '0.1', '%')}
                  </div>
                  ${section('کمیسیون', 'percent')}
                  <div class="form-row mb-10">
                    ${fieldNum('درصد کمیسیون پیش‌فرض', 'commissionDefault', s.commissionDefault, 0, 100, '0.5', '٪')}
                    ${fieldNum('ارقام واحد پول', 'currencyRate', 1, 1, 1, '1', '')}
                  </div>
                  <div class="soft-box">${icon('info')} نام و لوگوی آژانس در تب «هویت آژانس و لوگو» تنظیم می‌شود.</div>
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
                    <button class="btn btn-outline btn-sm" type="button" id="openArchive">${icon('archive')} مشاهده آرشیو (رکوردهای حذف‌شده)</button>
                  </div>
                  <div class="soft-box mt-16">${icon('info')} لایه داده به‌صورت Adapter نوشته شده است؛ برای اتصال به PocketBase یا Supabase کافی است آدرس سرویس را در تنظیمات API وارد کنید (بدون تغییر در رابط کاربری).</div>
                </div>`;
                /* باگ ۱٫۸: آرشیو رکوردهای حذف‌شدهٔ نرم با امکان بازگردانی */
                root.querySelector('#openArchive').addEventListener('click', () => openArchiveModal());

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
                const patch = collect();
                if (!patch.companyName && !patch.agencyName) throw new Error('نام آژانس الزامی است');
                if (!patch.companyName) patch.companyName = patch.agencyName;
                validate(patch);

                /* هویت آژانس در رکورد آژانس ذخیره می‌شود (سربرگ اسناد از آن می‌آید) */
                if (patch.agencyName || patch.agencyPhone || patch.agencyAddress || patch.agencyEconomicCode || patch.agencyFooterNote !== undefined) {
                    const a = Agency.current();
                    if (a) {
                        Agency.update(a.id, {
                            name: patch.agencyName || a.name,
                            phone: patch.agencyPhone ?? a.phone,
                            address: patch.agencyAddress ?? a.address,
                            economicCode: patch.agencyEconomicCode ?? a.economicCode,
                            footerNote: patch.agencyFooterNote ?? a.footerNote
                        });
                        patch.companyName = patch.agencyName || a.name;
                        patch.companyPhone = patch.agencyPhone ?? a.phone;
                        patch.companyAddress = patch.agencyAddress ?? a.address;
                    }
                }
                delete patch.agencyName; delete patch.agencyPhone; delete patch.agencyAddress;
                delete patch.agencyEconomicCode; delete patch.agencyFooterNote;

                updateSettings(patch);
                window.App.updateAgencyChip?.();
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
        agencies: 'آژانس‌ها', accounts: 'کدینگ حساب‌ها', journals: 'اسناد حسابداری',
        drivers: 'رانندگان', vehicles: 'خودروها', addresses: 'آدرس‌ها', subscribers: 'مشترکین',
        trips: 'سفرها', subscriberPayments: 'پرداخت مشترکین', driverPayments: 'پرداخت رانندگان',
        transactions: 'تراکنش‌ها', expenses: 'هزینه‌ها', operators: 'کاربران', shifts: 'شیفت‌ها', auditLog: 'گزارش تغییرات'
    };
    return labels[key] || key;
}


/* ======================= آرشیو رکوردهای حذف‌شده (باگ ۱٫۸) ======================= */

/** برچسب خوانا برای هر رکورد آرشیو، بسته به نوع مجموعه */
function archiveLabel(collection, rec) {
    if (collection === 'trips') return `${rec.code || ''} — ${rec.subscriberName || ''}`;
    if (collection === 'drivers' || collection === 'subscribers' || collection === 'operators') {
        return rec.fullName || rec.username || rec.id;
    }
    if (collection === 'vehicles') return `${rec.plateNumber || ''} ${rec.brand || ''}`;
    return rec.title || rec.name || rec.code || rec.id;
}

/**
 * نمایش رکوردهای حذف‌شدهٔ نرم و بازگرداندن آن‌ها.
 * حذف در این سامانه «نرم» است (فیلد deletedAt)، پس هیچ سفری یتیم نمی‌شود و
 * رکورد اشتباه حذف‌شده قابل بازیابی است.
 */
export function openArchiveModal() {
    const collections = ['drivers', 'vehicles', 'subscribers', 'trips', 'addresses', 'expenses', 'operators'];
    const render = () => {
        const groups = collections
            .map((c) => ({ c, rows: DB.listDeleted(c) }))
            .filter((g) => g.rows.length);
        if (!groups.length) {
            return `<div class="empty-state">${icon('archive', 'icon-xl')}<p>آرشیو خالی است؛ رکورد حذف‌شده‌ای وجود ندارد.</p></div>`;
        }
        return groups.map((g) => `
          <div class="card mb-12">
            <div class="card-header"><div class="card-title">${icon('database')} ${escapeHTML(labelOfCollection(g.c))}</div>
              <span class="chip">${formatNumber(g.rows.length)} رکورد</span></div>
            <div class="table-wrapper"><table class="mini-table">
              <thead><tr><th>عنوان</th><th>تاریخ حذف</th><th>بازگردانی</th></tr></thead>
              <tbody>${g.rows.slice(0, 50).map((r) => `<tr>
                <td>${escapeHTML(archiveLabel(g.c, r))}</td>
                <td>${r.deletedAt ? formatJalali(isoToJalaliKey(r.deletedAt)) : '—'}</td>
                <td><button class="btn btn-outline btn-sm" type="button" data-restore="${escapeHTML(g.c)}" data-id="${escapeHTML(r.id)}">${icon('refresh')} بازگردانی</button></td>
              </tr>`).join('')}</tbody>
            </table></div>
          </div>`).join('');
    };

    Modal.open({
        title: 'آرشیو رکوردهای حذف‌شده',
        size: 'modal-lg',
        body: `<div id="archiveBody">${render()}</div>
               <div class="soft-box mt-8">${icon('info')} حذف در این سامانه نرم است: رکورد از فهرست‌ها پنهان می‌شود ولی سفرها و اسناد مرتبط سالم می‌مانند.</div>`,
        onMount: (node) => {
            node.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-restore]');
                if (!btn) return;
                try {
                    DB.restore(btn.dataset.restore, btn.dataset.id);
                    Toast.success('رکورد از آرشیو بازگردانده شد');
                    node.querySelector('#archiveBody').innerHTML = render();
                    window.App.notifyDataChanged();
                } catch (err) { toastError(err, 'بازگردانی ممکن نشد'); }
            });
        }
    });
}
