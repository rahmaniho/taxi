/* ==========================================================================
 * js/pages/backup.js — پشتیبان‌گیری، بازیابی، پاک‌سازی و اتصال به سرور
 *   • خروجی JSON کامل از پایگاه داده محلی
 *   • بازیابی از فایل پشتیبان (ادغام یا جایگزینی کامل)
 *   • بازنشانی کارخانه‌ای
 *   • تنظیمات اتصال به سرویس ابری (PocketBase / Supabase) برای فازهای بعدی
 * ========================================================================== */

import { DB, getApiConfig, setApiConfig, validateDBStructure } from '../db.js';
import { Toast, toastError } from '../components/toast.js';
import { Modal } from '../components/modal.js';
import { icon } from '../components/icons.js';
import { pageHeader } from '../components/ui.js';
import { renderTable } from '../components/table.js';
import { todayJalali, formatJalali, formatNumber, escapeHTML, toFa, readFileAsText, isoToJalaliKey } from '../utils.js';

export default {
    id: 'backup',
    title: 'پشتیبان‌گیری',

    render(view) {
        const cfg = getApiConfig();
        const stats = DB.stats();
        const totalRecords = Object.values(stats).reduce((a, s) => a + s.active + s.deleted, 0);
        const sizeKB = Math.round(JSON.stringify(DB.exportObject()).length / 1024);

        view.innerHTML = `
        <section class="page-section active">
          ${pageHeader({
            title: 'پشتیبان‌گیری و بازیابی', iconName: 'download',
            subtitle: 'پشتیبان کامل، سبک و قابل انتقال به هر دستگاه یا مرورگر دیگر. توصیه: هر هفته یک نسخه بگیرید.'
          })}

          <div class="kpi-tiles mb-16">
            <div class="kpi"><div class="k-label">${icon('database')} محل فعلی داده</div>
              <div class="k-value" style="font-size:1.05rem">${DB.adapterName() === 'rest' ? 'سرور ابری (REST)' : 'حافظه محلی مرورگر'}</div></div>
            <div class="kpi"><div class="k-label">${icon('list')} کل رکوردها</div><div class="k-value">${formatNumber(totalRecords)}</div></div>
            <div class="kpi"><div class="k-label">${icon('save')} حجم داده</div><div class="k-value">${formatNumber(sizeKB)} کیلوبایت</div></div>
            <div class="kpi"><div class="k-label">${icon('calendar')} تاریخ امروز</div><div class="k-value" style="font-size:1.05rem">${formatJalali(todayJalali())}</div></div>
          </div>

          <div class="grid-2 mb-16">
            <div class="card">
              <div class="card-header"><div class="card-title">${icon('download')} ایجاد پشتیبان</div></div>
              <p class="hint mb-10">فایل JSON شامل رانندگان، خودروها، مشترکین، سفرها، پرداخت‌ها، هزینه‌ها، کاربران و گزارش تغییرات است.</p>
              <button class="btn btn-gold" type="button" id="bkExport">${icon('download')} دریافت فایل پشتیبان (.json)</button>
            </div>
            <div class="card">
              <div class="card-header"><div class="card-title">${icon('upload')} بازیابی از فایل</div></div>
              <p class="hint mb-10">فایل پشتیبان را انتخاب کنید. در حالت «ادغام» رکوردهای موجود به‌روزرسانی و رکوردهای جدید افزوده می‌شوند.</p>
              <input type="file" id="bkFile" accept=".json,application/json" hidden>
              <div class="flex gap-8" style="flex-wrap:wrap">
                <button class="btn btn-outline" type="button" id="bkMerge">${icon('refresh')} بازیابی و ادغام</button>
                <button class="btn btn-outline" type="button" id="bkReplace" style="border-color:var(--red); color:var(--red)">${icon('alert-triangle')} جایگزینی کامل داده</button>
              </div>
            </div>
          </div>

          <div class="card mb-16">
            <div class="card-header"><div class="card-title">${icon('cloud')} اتصال به سرویس ابری (فاز بعدی)</div>
              <span class="chip ${cfg.enabled ? 'chip-green' : ''}">${cfg.enabled ? 'فعال' : 'غیرفعال'}</span></div>
            <p class="hint mb-10">لایهٔ داده به‌صورت Adapter نوشته شده است. با وارد کردن آدرس سرویس و کلید، برنامه بدون هیچ تغییری در رابط کاربری روی <b>PocketBase</b> یا <b>Supabase</b> کار می‌کند.</p>
            <div class="form-row-3">
              <div class="form-group"><label class="form-label">نوع سرویس</label>
                <select class="form-select" id="apiKind">
                  <option value="pocketbase" ${cfg.kind !== 'supabase' ? 'selected' : ''}>PocketBase</option>
                  <option value="supabase" ${cfg.kind === 'supabase' ? 'selected' : ''}>Supabase</option>
                </select></div>
              <div class="form-group"><label class="form-label">آدرس سرویس</label>
                <input class="form-input" id="apiBaseUrl" dir="ltr" placeholder="https://example.com" value="${escapeHTML(cfg.baseUrl || '')}"></div>
              <div class="form-group"><label class="form-label">کلید/توکن دسترسی</label>
                <input class="form-input" id="apiToken" dir="ltr" type="password" value="${escapeHTML(cfg.token || '')}"></div>
            </div>
            <div class="flex gap-8">
              <button class="btn btn-gold btn-sm" type="button" id="apiSave">${icon('save')} ذخیره تنظیمات اتصال</button>
              <button class="btn btn-outline btn-sm" type="button" id="apiTest">${icon('activity')} آزمایش اتصال</button>
              <span class="hint" id="apiState"></span>
            </div>
          </div>

          <div class="card mb-16">
            <div class="card-header"><div class="card-title">${icon('database')} جزئیات رکوردها</div></div>
            <div id="bkTable"></div>
          </div>

          <div class="card">
            <div class="card-header"><div class="card-title" style="color:var(--red)">${icon('alert-triangle')} منطقهٔ خطر</div></div>
            <div class="flex gap-8" style="flex-wrap:wrap">
              <button class="btn btn-outline" type="button" id="bkSample" style="border-color:var(--blue); color:var(--blue)">${icon('database')} بارگذاری داده نمونه</button>
              <button class="btn btn-outline" type="button" id="bkPurge" style="border-color:var(--yellow); color:var(--yellow)">${icon('trash')} حذف داده‌های نمونه</button>
              <button class="btn btn-outline" type="button" id="bkReset" style="border-color:var(--red); color:var(--red)">${icon('refresh')} بازنشانی کامل و شروع از صفر</button>
              ${DB.hasPreImportSnapshot() ? `<button class="btn btn-outline" type="button" id="bkUndo">${icon('arrow-right')} بازگرداندن داده‌های پیش از آخرین بازیابی</button>` : ''}
            </div>
            <div class="soft-box mt-12">${icon('info')} پیش از بازنشانی حتماً پشتیبان بگیرید؛ این عملیات قابل بازگشت نیست.</div>
          </div>
        </section>`;

        const root = view.querySelector('.page-section');

        renderTable(root.querySelector('#bkTable'), {
            key: 'backup-stats',
            columns: [
                { key: 'label', label: 'موجودیت', sortable: true },
                { key: 'active', label: 'رکورد فعال', sortable: true, align: 'center', render: (r) => formatNumber(r.active) },
                { key: 'deleted', label: 'حذف‌شده (نرم)', sortable: true, align: 'center', render: (r) => formatNumber(r.deleted) },
                { key: 'total', label: 'مجموع', sortable: true, align: 'center', render: (r) => formatNumber(r.active + r.deleted) }
            ],
            rows: Object.entries(stats).map(([k, v]) => ({ id: k, label: labelOf(k), active: v.active, deleted: v.deleted })),
            search: { keys: ['label'] },
            pageSize: 25,
            selectable: false,
            emptyText: 'رکوردی وجود ندارد',
            emptyIcon: 'database'
        });

        /* --- پشتیبان‌گیری --- */
        root.querySelector('#bkExport').addEventListener('click', () => {
            try {
                const obj = DB.exportObject();
                const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `taxi-backup-${todayJalali()}.json`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 3000);
                Toast.success('فایل پشتیبان آماده دانلود شد');
            } catch (err) { toastError(err, 'خطا در ساخت فایل پشتیبان'); }
        });

        /* --- بازیابی --- */
        const pickFile = (mode) => {
            const input = root.querySelector('#bkFile');
            input.value = '';
            input.onchange = async () => {
                const file = input.files?.[0];
                if (!file) return;
                try {
                    const text = await readFileAsText(file);
                    let obj;
                    try { obj = JSON.parse(text); } catch (_) { throw new Error('فایل انتخاب‌شده JSON معتبر نیست.'); }
                    /* باگ ۲٫۵: اعتبارسنجی ساختار پیش از هر تغییری در داده */
                    const check = validateDBStructure(obj);
                    if (!check.ok) {
                        await Modal.alert({
                            title: 'فایل پشتیبان معتبر نیست',
                            type: 'error',
                            body: `<p class="mb-8">این فایل بازیابی نشد. مشکلات یافت‌شده:</p>
                                   <ul style="padding-inline-start:18px">${check.errors.map((x) => `<li class="text-red">${escapeHTML(x)}</li>`).join('')}</ul>`
                        });
                        return;
                    }
                    const ok = await Modal.confirm({
                        title: mode === 'merge' ? 'بازیابی و ادغام' : 'جایگزینی کامل داده',
                        message: mode === 'merge'
                            ? 'رکوردهای فایل پشتیبان با داده‌های فعلی ادغام شوند؟'
                            : 'کل داده‌های فعلی حذف و با فایل پشتیبان جایگزین شوند.',
                        hint: `فایل: ${file.name}${check.warnings.length ? ` — ${toFa(check.warnings.length)} هشدار جزئی` : ''} — پیش از بازیابی یک نسخه از دادهٔ فعلی نگه داشته می‌شود و با دکمهٔ «بازگرداندن داده‌های پیش از آخرین بازیابی» قابل برگشت است.`,
                        danger: mode !== 'merge',
                        okText: mode === 'merge' ? 'ادغام کن' : 'جایگزین کن'
                    });
                    if (!ok) return;
                    await DB.importObject(obj, { merge: mode === 'merge' });
                    Toast.success('بازیابی با موفقیت انجام شد — در حال بازخوانی…');
                    setTimeout(() => window.location.reload(), 900);
                } catch (err) { toastError(err, 'فایل پشتیبان قابل خواندن نیست'); }
            };
            input.click();
        };
        root.querySelector('#bkMerge').addEventListener('click', () => pickFile('merge'));
        root.querySelector('#bkReplace').addEventListener('click', () => pickFile('replace'));

        /* --- حذف داده نمونه --- */
        root.querySelector('#bkPurge').addEventListener('click', async () => {
            const ok = await Modal.confirm({
                title: 'حذف داده‌های نمونه',
                message: 'رکوردهای نمونه (ساخته‌شده هنگام راه‌اندازی) حذف شوند؟',
                hint: 'داده‌های واقعی شما باقی می‌مانند.',
                danger: true, okText: 'حذف کن'
            });
            if (!ok) return;
            const counts = DB.purgeSampleData();
            const total = Object.values(counts).reduce((a, b) => a + b, 0);
            if (!total) { Toast.info('داده نمونه‌ای یافت نشد'); return; }
            Toast.success(`${toFa(total)} رکورد نمونه حذف شد`);
            setTimeout(() => window.location.reload(), 800);
        });

        /* --- بازنشانی --- */
        root.querySelector('#bkReset').addEventListener('click', async () => {
            const ok = await Modal.confirm({
                title: 'بازنشانی کامل سامانه',
                message: 'همهٔ داده‌ها پاک می‌شوند و سامانه با یک پایگاه دادهٔ کاملاً خالی (بدون دادهٔ نمونه) شروع می‌کند. مطمئن هستید؟',
                hint: 'این عملیات قابل بازگشت نیست. ابتدا پشتیبان بگیرید.',
                danger: true, okText: 'بله، همه چیز را پاک کن'
            });
            if (!ok) return;
            const ok2 = await Modal.confirm({
                title: 'تأیید نهایی',
                message: 'آخرین فرصت: فایل پشتیبان گرفته‌اید؟',
                danger: true, okText: 'بازنشانی کن'
            });
            if (!ok2) return;
            try {
                await DB.factoryReset();
                Toast.success('سامانه بازنشانی شد');
                setTimeout(() => window.location.reload(), 800);
            } catch (err) { toastError(err); }
        });

        /* --- بارگذاری دادهٔ نمونه (باگ ۲٫۶: نمونه فقط به‌درخواست کاربر) --- */
        root.querySelector('#bkSample').addEventListener('click', async () => {
            const ok = await Modal.confirm({
                title: 'بارگذاری داده نمونه',
                message: 'داده‌های فعلی با یک مجموعهٔ نمونه (راننده، مشترک، سفر، هزینه) جایگزین شوند؟',
                hint: 'مناسب برای دمو و آموزش. پیش از این کار پشتیبان بگیرید.',
                danger: true, okText: 'بارگذاری کن'
            });
            if (!ok) return;
            try {
                await DB.loadSampleData();
                Toast.success('داده نمونه بارگذاری شد — در حال بازخوانی…');
                setTimeout(() => window.location.reload(), 800);
            } catch (err) { toastError(err); }
        });

        /* --- بازگرداندن داده‌های پیش از آخرین بازیابی (Undo — باگ ۲٫۵) --- */
        root.querySelector('#bkUndo')?.addEventListener('click', async () => {
            const info = DB.preImportInfo();
            const ok = await Modal.confirm({
                title: 'بازگرداندن داده‌های پیش از بازیابی',
                message: 'داده‌ها به وضعیت پیش از آخرین بازیابی فایل پشتیبان برگردانده شوند؟',
                hint: info?.savedAt ? `نسخهٔ نگهداری‌شده: ${formatJalali(isoToJalaliKey(info.savedAt))}` : '',
                okText: 'برگردان'
            });
            if (!ok) return;
            try {
                await DB.undoImport();
                Toast.success('داده‌ها برگردانده شدند — در حال بازخوانی…');
                setTimeout(() => window.location.reload(), 800);
            } catch (err) { toastError(err); }
        });

        /* --- تنظیمات اتصال --- */
        root.querySelector('#apiSave').addEventListener('click', () => {
            try {
                const baseUrl = root.querySelector('#apiBaseUrl').value.trim();
                const token = root.querySelector('#apiToken').value.trim();
                if (baseUrl && !/^https?:\/\//i.test(baseUrl)) throw new Error('آدرس سرویس باید با http:// یا https:// شروع شود');
                setApiConfig({ kind: root.querySelector('#apiKind').value, baseUrl, token, enabled: !!baseUrl });
                Toast.success('تنظیمات اتصال ذخیره شد — برای اعمال، برنامه دوباره بازخوانی شود');
            } catch (err) { toastError(err); }
        });

        root.querySelector('#apiTest').addEventListener('click', async () => {
            const state = root.querySelector('#apiState');
            const baseUrl = root.querySelector('#apiBaseUrl').value.trim().replace(/\/$/, '');
            if (!baseUrl) { Toast.warning('ابتدا آدرس سرویس را وارد کنید'); return; }
            state.textContent = 'در حال بررسی…';
            const t0 = performance.now();
            try {
                const res = await fetch(`${baseUrl}/api/health`, { method: 'GET', headers: { Accept: 'application/json' } });
                state.textContent = `پاسخ سرور: ${toFa(res.status)} — ${toFa(Math.round(performance.now() - t0))} میلی‌ثانیه`;
                Toast.info('سرور پاسخ داد. برای فعال‌سازی کامل، ساختار REST را در دیتابیس ابری بسازید.');
            } catch (e) {
                state.textContent = 'اتصال برقرار نشد (ممکن است CORS یا دسترسی مسدود باشد)';
                Toast.warning('اتصال به سرور برقرار نشد');
            }
        });
    }
};

function labelOf(key) {
    const labels = {
        drivers: 'رانندگان', vehicles: 'خودروها', addresses: 'آدرس‌های پرتکرار', subscribers: 'مشترکین',
        trips: 'سفرها', subscriberPayments: 'پرداخت مشترکین', driverPayments: 'پرداخت رانندگان',
        transactions: 'تراکنش‌های مالی', expenses: 'هزینه‌ها', operators: 'کاربران', shifts: 'شیفت‌ها',
        auditLog: 'گزارش تغییرات'
    };
    return labels[key] || key;
}
