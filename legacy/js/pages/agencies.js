/* ==========================================================================
 * js/pages/agencies.js — مدیریت آژانس‌ها (اشتراک‌ها) و لوگوی آژانس
 * --------------------------------------------------------------------------
 * این صفحه فقط برای «مدیر سامانه» (حساب admin) است و سه کار انجام می‌دهد:
 *   ۱) ساخت آژانس جدید همراه با کاربر مدیر آن آژانس (ورود مستقل با نام کاربری
 *      و رمز خودش؛ دادهٔ هر آژانس جدا از دیگری است).
 *   ۲) بارگذاری لوگو و هویت آژانس تا روی صورت‌حساب مشترکین چاپ شود.
 *   ۳) مدیریت اشتراک نرم‌افزار (تمدید/فعال‌سازی/غیرفعال‌سازی) و مشاهدهٔ آمار.
 * ========================================================================== */

import { DB } from '../db.js';
import { Auth, ROLE_LABELS, randomSalt, hashPassword } from '../auth.js';
import { Agency, LOGO_MAX_BYTES, AGENCY_STATUS_LABELS, AGENCY_PLAN_LABELS } from '../agency.js';
import { Toast, toastError } from '../components/toast.js';
import { Modal } from '../components/modal.js';
import { openForm } from '../components/form.js';
import { icon } from '../components/icons.js';
import { pageHeader, kpi, previewPrint, agencyLogoHTML } from '../components/ui.js';
import { invoiceHTML } from '../prints.js';
import {
    escapeHTML, formatJalali, formatNumber, formatMoney, toFa, todayJalali,
    imageFileToDataURL, formatFileSize, addJalaliDays, jalaliMonthStart
} from '../utils.js';

const TONE = { ok: 'status-active', warn: 'status-pending', danger: 'status-cancelled' };

export default {
    id: 'agencies',
    title: 'آژانس‌ها',

    render(view) {
        if (!Auth.isSuperAdmin()) {
            view.innerHTML = `<section class="page-section active">
              <div class="card"><div class="empty-state">${icon('lock', 'icon-xl')}
                <h3>دسترسی محدود</h3><p class="text-sm op-60">مدیریت آژانس‌ها تنها برای مدیر سامانه فعال است.</p>
              </div></div></section>`;
            return;
        }

        const activeId = Agency.currentId();

        view.innerHTML = `
        <section class="page-section active">
          ${pageHeader({
            title: 'آژانس‌ها و اشتراک‌ها', iconName: 'building',
            subtitle: 'هر آژانس داده، کاربران و لوگوی مستقل خود را دارد. کاربران هر آژانس فقط با نام کاربری و رمز خودشان وارد می‌شوند و داده‌های آژانس‌های دیگر را نمی‌بینند.',
            actions: `
              <button class="btn btn-outline btn-sm" type="button" data-shared>${icon('database')} حالت اشتراکی آنلاین</button>
              <button class="btn btn-gold btn-sm" type="button" data-new>${icon('plus')} آژانس جدید</button>`
        })}

          <div class="kpi-tiles mb-16" id="agKpis"></div>
          <div class="agency-cards" id="agCards"></div>
        </section>`;

        const root = view.querySelector('.page-section');
        const cards = root.querySelector('#agCards');

        const renderAll = () => {
            const list = Agency.all();
            const totalRevenue = list.reduce((s, a) => s + Agency.stats(a.id).revenue, 0);
            root.querySelector('#agKpis').innerHTML = `
              ${kpi({ label: 'آژانس‌های فعال', value: formatNumber(list.filter((a) => a.status === 'active').length), iconName: 'building' })}
              ${kpi({ label: 'کاربران کل', value: formatNumber(list.reduce((s, a) => s + Agency.userCount(a.id), 0)), iconName: 'users' })}
              ${kpi({ label: 'سفرهای ثبت‌شده', value: formatNumber(list.reduce((s, a) => s + Agency.stats(a.id).trips, 0)), iconName: 'route' })}
              ${kpi({ label: 'درآمد کمیسیون کل', value: formatMoney(totalRevenue), iconName: 'wallet' })}`;

            cards.innerHTML = list.map((a) => {
                const sub = Agency.subscription(a);
                const st = Agency.stats(a.id);
                return `
                <div class="agency-card ${a.id === activeId ? 'active-agency' : ''}">
                  <div class="flex gap-10 items-center mb-10">
                    ${a.logo
                        ? `<img src="${escapeHTML(a.logo)}" alt="${escapeHTML(a.name)}" style="max-height:48px;max-width:110px;object-fit:contain;background:#fff;border-radius:8px;padding:4px">`
                        : `<div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center">${agencyLogoHTML(40)}</div>`}
                    <div style="flex:1">
                      <div class="text-bold">${escapeHTML(a.name)}</div>
                      <div class="hint" dir="ltr">${escapeHTML(a.code)}</div>
                    </div>
                    ${a.id === activeId ? '<span class="status-badge status-active">آژانس فعال</span>' : ''}
                  </div>

                  <div class="flex gap-6 flex-wrap mb-10">
                    <span class="status-badge ${a.status === 'active' ? 'status-active' : 'status-inactive'}">${AGENCY_STATUS_LABELS[a.status] || a.status}</span>
                    <span class="status-badge status-subscription">${AGENCY_PLAN_LABELS[a.plan] || a.plan}</span>
                    <span class="status-badge ${TONE[sub.tone]}">${icon('clock')} ${escapeHTML(sub.label)}</span>
                  </div>

                  <div class="grid-2 mb-10">
                    <div><div class="hint">کاربران</div><div class="text-bold">${formatNumber(st.users)} از ${formatNumber(a.maxUsers || 0)}</div></div>
                    <div><div class="hint">رانندگان</div><div class="text-bold">${formatNumber(st.drivers)}</div></div>
                    <div><div class="hint">سفرها</div><div class="text-bold">${formatNumber(st.trips)} <span class="hint">(${formatNumber(st.completed)} تکمیل)</span></div></div>
                    <div><div class="hint">مشترکین</div><div class="text-bold">${formatNumber(st.subscribers)}</div></div>
                    <div><div class="hint">درآمد کمیسیون</div><div class="text-bold">${formatMoney(st.revenue)}</div></div>
                    <div><div class="hint">اسناد حسابداری</div><div class="text-bold">${formatNumber(st.journals)}</div></div>
                  </div>

                  <div class="hint mb-10">اعتبار اشتراک تا ${a.softwareEnd ? formatJalali(a.softwareEnd) : 'نامحدود'}
                    · تماس: ${toFa(a.phone || '—')}</div>

                  <div class="flex gap-6 flex-wrap">
                    ${a.id === activeId ? '' : `<button class="btn btn-gold btn-sm" data-use="${a.id}">${icon('login')} ورود به این آژانس</button>`}
                    <button class="btn btn-outline btn-sm" data-logo="${a.id}">${icon('image')} لوگو</button>
                    <button class="btn btn-outline btn-sm" data-edit="${a.id}">${icon('pencil')} هویت آژانس</button>
                    <button class="btn btn-outline btn-sm" data-extend="${a.id}">${icon('refresh')} تمدید اشتراک</button>
                    <button class="btn btn-outline btn-sm" data-users="${a.id}">${icon('users')} کاربران</button>
                    <button class="btn btn-outline btn-sm" data-invoice="${a.id}">${icon('printer')} نمونهٔ صورتحساب</button>
                    <button class="btn btn-outline btn-sm" data-status="${a.id}">${icon(a.status === 'active' ? 'x-circle' : 'check')} ${a.status === 'active' ? 'غیرفعال‌سازی' : 'فعال‌سازی'}</button>
                    <button class="btn-icon danger" data-del="${a.id}" title="حذف آژانس">${icon('trash')}</button>
                  </div>
                </div>`;
            }).join('');
        };

        renderAll();

        root.querySelector('[data-new]').addEventListener('click', () => openAgencyForm(null, renderAll));
        root.querySelector('[data-shared]').addEventListener('click', () => openSharedModeModal());

        cards.addEventListener('click', async (e) => {
            const use = e.target.closest('[data-use]');
            if (use) {
                try {
                    Auth.switchAgency(use.dataset.use);
                    Toast.success('آژانس فعال تغییر کرد؛ داده‌ها و لوگوی این آژانس نمایش داده می‌شود');
                    window.App.reload();
                } catch (err) { toastError(err); }
                return;
            }
            const logo = e.target.closest('[data-logo]');
            if (logo) { openLogoModal(logo.dataset.logo, renderAll); return; }
            const edit = e.target.closest('[data-edit]');
            if (edit) { openAgencyForm(edit.dataset.edit, renderAll); return; }
            const users = e.target.closest('[data-users]');
            if (users) { openAgencyUsers(users.dataset.users, renderAll); return; }
            const invoice = e.target.closest('[data-invoice]');
            if (invoice) { previewAgencyInvoice(invoice.dataset.invoice); return; }
            const ext = e.target.closest('[data-extend]');
            if (ext) {
                const a = Agency.get(ext.dataset.extend);
                const val = await Modal.prompt({
                    title: 'تمدید اشتراک', message: `چند ماه به اشتراک «${escapeHTML(a.name)}» اضافه شود؟`,
                    inputType: 'number', defaultValue: '12', okText: 'تمدید'
                });
                if (val === null) return;
                try {
                    const end = Agency.extend(a.id, Number(val) || 12);
                    Toast.success(`اشتراک تا ${formatJalali(end)} تمدید شد`);
                    renderAll();
                } catch (err) { toastError(err); }
                return;
            }
            const st = e.target.closest('[data-status]');
            if (st) {
                const a = Agency.get(st.dataset.status);
                const next = a.status === 'active' ? 'suspended' : 'active';
                const ok = await Modal.confirm({
                    title: `${AGENCY_STATUS_LABELS[next]}‌سازی آژانس`,
                    message: `آژانس «${escapeHTML(a.name)}» ${AGENCY_STATUS_LABELS[next]} شود؟${next === 'suspended' ? ' کاربران این آژانس دیگر نمی‌توانند وارد شوند.' : ''}`,
                    danger: next === 'suspended', okText: AGENCY_STATUS_LABELS[next]
                });
                if (!ok) return;
                try {
                    Agency.setStatus(a.id, next);
                    Toast.success('وضعیت آژانس تغییر کرد');
                    renderAll();
                } catch (err) { toastError(err); }
                return;
            }
            const del = e.target.closest('[data-del]');
            if (del) {
                const a = Agency.get(del.dataset.del);
                const ok = await Modal.confirm({
                    title: 'حذف آژانس', danger: true, okText: 'حذف',
                    message: `آژانس «${escapeHTML(a.name)}» حذف شود؟ این عمل در گزارش تغییرات ثبت می‌شود.`
                });
                if (!ok) return;
                try {
                    Agency.remove(a.id);
                    Toast.success('آژانس حذف شد');
                    renderAll();
                } catch (err) { toastError(err); }
            }
        });
    }
};

/* --------------------------- فرم ساخت/ویرایش آژانس --------------------------- */

function openAgencyForm(id, onDone) {
    const a = id ? Agency.get(id) : null;
    const isNew = !a;

    openForm({
        title: isNew ? 'ساخت آژانس جدید (اشتراک جدید)' : `ویرایش هویت «${a.name}»`,
        description: isNew
            ? 'با ساخت آژانس، یک کاربر مدیر برای آن ساخته می‌شود که با نام کاربری و رمز خودش وارد می‌شود. داده‌های هر آژانس کاملاً جدا ذخیره می‌شود.'
            : 'نام و مشخصات آژانس روی سربرگ صورت‌حساب‌ها و اسناد چاپی درج می‌شود.',
        size: 'lg',
        values: {
            name: a?.name || '', code: a?.code || '', ownerName: a?.ownerName || '',
            phone: a?.phone || '', address: a?.address || '',
            economicCode: a?.economicCode || '', nationalId: a?.nationalId || '',
            footerNote: a?.footerNote || '',
            plan: a?.plan || 'basic', months: 12, maxUsers: a?.maxUsers || 5,
            adminName: '', adminUsername: '', adminPassword: ''
        },
        fields: [
            { name: 'name', label: 'نام آژانس', type: 'text', required: true },
            { name: 'code', label: 'شناسه انگلیسی (برای دامنه/گزارش)', type: 'text', hint: 'مثال: taxi-tehran', disabled: !!a },
            { name: 'ownerName', label: 'نام مدیر آژانس', type: 'text' },
            { name: 'phone', label: 'تلفن آژانس', type: 'phone' },
            { name: 'address', label: 'نشانی آژانس', type: 'text', col: 3 },
            { name: 'economicCode', label: 'کد اقتصادی', type: 'text' },
            { name: 'nationalId', label: 'شناسهٔ ملی', type: 'text' },
            {
                name: 'plan', label: 'نوع اشتراک', type: 'select', placeholder: false,
                options: Object.entries(AGENCY_PLAN_LABELS).map(([k, v]) => ({ value: k, label: v }))
            },
            { name: 'months', label: 'مدت اشتراک (ماه)', type: 'number', min: 1, max: 60, hint: 'در صورت ساخت آژانس جدید' },
            { name: 'maxUsers', label: 'سقف کاربران', type: 'number', min: 1, max: 200 },
            { name: 'footerNote', label: 'متن پاصفحهٔ اسناد (اختیاری)', type: 'text', col: 3 },
            ...(isNew ? [
                { name: 'adminName', label: 'نام کاربر مدیر آژانس', type: 'text', required: true },
                { name: 'adminUsername', label: 'نام کاربری مدیر (انگلیسی)', type: 'text', required: true, hint: 'مثال: taxi-tehran-admin' },
                { name: 'adminPassword', label: 'رمز عبور مدیر', type: 'password', required: true, hint: 'حداقل ۶ کاراکتر' }
            ] : [])
        ],
        submitText: isNew ? 'ساخت آژانس' : 'ذخیره',
        onSubmit: async (v) => {
            if (isNew) {
                const agency = Agency.create({
                    name: v.name, code: v.code, ownerName: v.ownerName, phone: v.phone, address: v.address,
                    economicCode: v.economicCode, nationalId: v.nationalId, footerNote: v.footerNote,
                    plan: v.plan, months: v.months, maxUsers: v.maxUsers
                });
                try {
                    await Auth.createUser({
                        fullName: v.adminName, username: v.adminUsername, password: v.adminPassword,
                        role: 'admin', agencyId: agency.id, phone: v.phone, minPassword: 6
                    });
                    Toast.success(`آژانس «${agency.name}» و کاربر مدیر آن ساخته شد`);
                } catch (err) {
                    Toast.warning(`آژانس ساخته شد ولی کاربر مدیر ثبت نشد: ${err.message}`);
                }
            } else {
                Agency.update(id, {
                    name: v.name, ownerName: v.ownerName, phone: v.phone, address: v.address,
                    economicCode: v.economicCode, nationalId: v.nationalId, footerNote: v.footerNote,
                    plan: v.plan, maxUsers: v.maxUsers
                });
                Toast.success('هویت آژانس ذخیره شد');
            }
            onDone?.();
        }
    });
}

/* ------------------------------ بارگذاری لوگو ------------------------------ */

function openLogoModal(id, onDone) {
    const a = Agency.get(id);
    if (!a) { toastError(new Error('آژانس یافت نشد')); return; }

    const body = `
      <div class="soft-box mb-12">${icon('info')} لوگو روی سربرگ «صورت‌حساب مشترکین»، رسید راننده و گزارش‌های مالی چاپ می‌شود.
        تصویر PNG با پس‌زمینهٔ شفاف یا سفید بهترین نتیجه را دارد (حداکثر ${toFa(Math.round(LOGO_MAX_BYTES / 1024))} کیلوبایت).</div>
      <div class="agency-logo-preview mb-12" id="logoPreview">
        ${a.logo ? `<img src="${escapeHTML(a.logo)}" alt="لوگو">` : agencyLogoHTML(56)}
        <div>
          <div class="text-bold">${escapeHTML(a.name)}</div>
          <div class="hint" id="logoMeta">${a.logo ? 'لوگوی فعلی این آژانس' : 'هنوز لوگویی بارگذاری نشده است'}</div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">انتخاب فایل لوگو</label>
        <input type="file" class="form-input" id="logoFile" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml">
      </div>
      <div class="flex gap-8 items-center">
        <button class="btn btn-outline btn-sm" type="button" id="logoRemove">${icon('trash')} حذف لوگو</button>
      </div>`;

    Modal.open({
        title: `لوگوی آژانس «${a.name}»`,
        iconName: 'image',
        body,
        footer: `<button class="btn btn-outline" type="button" data-modal-close>بستن</button>
                 <button class="btn btn-gold" type="button" id="logoSave">${icon('save')} ذخیرهٔ لوگو</button>`,
        onMount: (node) => {
            let dataUrl = a.logo || '';
            const fileInput = node.querySelector('#logoFile');
            const meta = node.querySelector('#logoMeta');
            const preview = node.querySelector('#logoPreview');

            const paint = () => {
                preview.innerHTML = `
                  ${dataUrl ? `<img src="${escapeHTML(dataUrl)}" alt="لوگو">` : agencyLogoHTML(56)}
                  <div><div class="text-bold">${escapeHTML(a.name)}</div>
                  <div class="hint" id="logoMeta">${dataUrl ? 'پیش‌نمایش لوگوی انتخابی' : 'هنوز لوگویی انتخاب نشده است'}</div></div>`;
            };

            fileInput.addEventListener('change', async () => {
                const file = fileInput.files?.[0];
                if (!file) return;
                try {
                    dataUrl = await imageFileToDataURL(file, { maxBytes: LOGO_MAX_BYTES });
                    meta.textContent = `فایل: ${file.name} — ${formatFileSize(file.size)}`;
                    paint();
                    Toast.success('تصویر آمادهٔ ذخیره است');
                } catch (err) { toastError(err); }
            });

            node.querySelector('#logoRemove').addEventListener('click', () => {
                dataUrl = '';
                paint();
                Toast.info('برای اعمال، دکمهٔ ذخیره را بزنید');
            });

            node.querySelector('#logoSave').addEventListener('click', async () => {
                try {
                    if (!dataUrl) {
                        const ok = await Modal.confirm({ title: 'حذف لوگو', message: 'لوگوی این آژانس حذف شود؟', danger: true, okText: 'حذف' });
                        if (!ok) return;
                    }
                    Agency.setLogo(a.id, dataUrl);
                    Toast.success(dataUrl ? 'لوگو ذخیره شد و روی صورت‌حساب‌ها چاپ می‌شود' : 'لوگو حذف شد');
                    Modal.close();
                    onDone?.();
                } catch (err) { toastError(err); }
            });
        }
    });
}

/* ------------------------------ کاربران آژانس ------------------------------ */

function openAgencyUsers(agencyId, onDone) {
    const a = Agency.get(agencyId);
    const users = Auth.users(agencyId);
    const body = `
      <div class="flex items-center justify-between mb-12">
        <div><div class="text-bold">${escapeHTML(a.name)}</div>
          <div class="hint">${toFa(users.length)} کاربر از سقف ${toFa(a.maxUsers || 0)} کاربر</div></div>
        <button class="btn btn-gold btn-sm" type="button" id="agUserAdd">${icon('plus')} کاربر جدید</button>
      </div>
      <div class="table-wrap"><table class="mini-table">
        <thead><tr><th>نام</th><th>نام کاربری</th><th>نقش</th><th>وضعیت</th><th>آخرین ورود</th><th></th></tr></thead>
        <tbody>
          ${users.length ? users.map((u) => `<tr>
            <td>${escapeHTML(u.fullName)}</td>
            <td dir="ltr">${escapeHTML(u.username)}</td>
            <td><span class="role-badge role-${u.role}">${ROLE_LABELS[u.role] || u.role}</span></td>
            <td>${u.status === 'active' ? '<span class="status-badge status-active">فعال</span>' : '<span class="status-badge status-inactive">غیرفعال</span>'}</td>
            <td>${u.lastLoginAt ? formatJalali(u.lastLoginAt.slice(0, 10)) : '—'}</td>
            <td><button class="btn-icon danger" data-reset="${u.id}" title="بازنشانی رمز">${icon('lock')}</button></td>
          </tr>`).join('') : '<tr><td colspan="6" style="text-align:center">کاربری ثبت نشده است</td></tr>'}
        </tbody>
      </table></div>`;

    Modal.open({
        title: 'کاربران آژانس',
        iconName: 'users',
        size: 'lg',
        body,
        footer: `<button class="btn btn-outline" type="button" data-modal-close>بستن</button>`,
        onMount: (node) => {
            node.querySelector('#agUserAdd').addEventListener('click', () => {
                Modal.close();
                openForm({
                    title: `کاربر جدید برای «${a.name}»`,
                    values: { role: 'operator' },
                    fields: [
                        { name: 'fullName', label: 'نام و نام خانوادگی', type: 'text', required: true },
                        {
                            name: 'username', label: 'نام کاربری (انگلیسی)', type: 'text', required: true,
                            hint: 'در کل سامانه یکتا باشد؛ مثال: tehran-operator'
                        },
                        { name: 'password', label: 'رمز عبور', type: 'password', required: true },
                        {
                            name: 'role', label: 'نقش', type: 'select', placeholder: false,
                            options: [{ value: 'admin', label: 'مدیر آژانس' }, { value: 'operator', label: 'اپراتور' }, { value: 'accountant', label: 'حسابدار' }]
                        },
                        { name: 'phone', label: 'تلفن همراه', type: 'phone' }
                    ],
                    submitText: 'ثبت کاربر',
                    onSubmit: async (v) => {
                        await Auth.createUser({ ...v, agencyId });
                        Toast.success('کاربر ساخته شد؛ می‌تواند با نام کاربری خود وارد شود');
                        onDone?.();
                    }
                });
            });

            node.addEventListener('click', async (e) => {
                const btn = e.target.closest('[data-reset]');
                if (!btn) return;
                const u = DB.get('operators', btn.dataset.reset);
                const pass = await Modal.prompt({
                    title: 'بازنشانی رمز عبور',
                    message: `رمز جدید برای «${escapeHTML(u.fullName)}» (حداقل ۶ کاراکتر):`,
                    inputType: 'password', okText: 'ثبت'
                });
                if (pass === null) return;
                try {
                    const salt = randomSalt();
                    DB.update('operators', u.id, { salt, passwordHash: await hashPassword(pass, salt), mustChangePassword: true }, `بازنشانی رمز کاربر «${u.username}»`);
                    Toast.success('رمز عبور بازنشانی شد');
                } catch (err) { toastError(err); }
            });
        }
    });
}

/* --------------------------- پیش‌نمایش صورتحساب --------------------------- */

/** پیش‌نمایش صورتحساب نمونه با لوگوی همان آژانس (نمایش چاپی) */
function previewAgencyInvoice(agencyId) {
    const a = Agency.get(agencyId);
    const trips = DB.listGlobal('trips')
        .filter((t) => !t.deletedAt && (t.agencyId || 'ag1') === a.id && t.status === 'completed')
        .slice(0, 4);
    const sample = trips.length ? trips : [{
        pickupTime: new Date().toISOString(), pickupAddress: 'میدان ونک', dropoffAddress: 'فرودگاه امام',
        distance: 32, fare: 480000, status: 'completed', driverId: ''
    }];
    const total = sample.reduce((s, t) => s + (Number(t.fare) || 0), 0);
    const html = invoiceHTML({
        subscriber: { fullName: 'مشترک نمونه (پیش‌نمایش)', subscriptionNumber: 'PREVIEW-0001', type: 'corporate' },
        trips: sample.map((t, i) => ({ ...t, id: t.id || 'demo' + i, billedTo: 'company' })),
        payments: [],
        totalFare: total,
        companyFare: total,
        debt: total,
        debtAge: 12,
        from: jalaliMonthStart(todayJalali()),
        to: todayJalali()
    }, { title: `صورت‌حساب خدمات — ${a.name}` });
    previewPrint(html, { title: `نمونهٔ صورتحساب — ${a.name}`, filename: `invoice-sample-${a.code}` });
}

/* --------------------------- حالت اشتراکی آنلاین --------------------------- */

function openSharedModeModal() {
    const cfg = (() => {
        try { return JSON.parse(localStorage.getItem('taxi_api_config') || '{}') || {}; } catch (_) { return {}; }
    })();
    const body = `
      <div class="soft-box mb-12">${icon('info')} در حالت پیش‌فرض، داده‌ها روی همین مرورگر ذخیره می‌شوند (هر دستگاه دادهٔ خودش را دارد).
        اگر می‌خواهید چند کاربر روی چند دستگاه با هم کار کنند، آدرس یک سرور دادهٔ سازگار با قرارداد
        <span dir="ltr">GET/PUT /db</span> (مثل PocketBase یا Supabase با یک رکورد singleton) را وارد کنید.
        برنامه بدون تغییر در رابط کاربری از همان سرور استفاده می‌کند.</div>
      <div class="form-group">
        <label class="form-label">آدرس سرور داده (Base URL)</label>
        <input class="form-input" id="agApiUrl" dir="ltr" placeholder="https://api.example.com" value="${escapeHTML(cfg.baseUrl || '')}">
      </div>
      <div class="form-group">
        <label class="form-label">توکن دسترسی (اختیاری)</label>
        <input class="form-input" id="agApiToken" dir="ltr" value="${escapeHTML(cfg.token || '')}">
      </div>
      <div class="hint">پس از ذخیره، صفحه یک‌بار بازخوانی می‌شود تا آداپتر <span dir="ltr">REST</span> فعال شود. برای بازگشت به حالت محلی، فیلد آدرس را خالی کنید.</div>`;

    Modal.open({
        title: 'حالت اشتراکی آنلاین (چند دستگاه)',
        iconName: 'database',
        body,
        footer: `<button class="btn btn-outline" type="button" data-modal-close>انصراف</button>
                 <button class="btn btn-gold" type="button" id="agApiSave">${icon('save')} ذخیره و اتصال</button>`,
        onMount: (node) => {
            node.querySelector('#agApiSave').addEventListener('click', () => {
                const baseUrl = node.querySelector('#agApiUrl').value.trim();
                const token = node.querySelector('#agApiToken').value.trim();
                localStorage.setItem('taxi_api_config', JSON.stringify({ baseUrl, token, enabled: !!baseUrl }));
                Toast.success(baseUrl ? 'حالت سروری فعال شد؛ صفحه بازخوانی می‌شود' : 'حالت محلی فعال شد؛ صفحه بازخوانی می‌شود');
                setTimeout(() => window.location.reload(), 900);
            });
        }
    });
}
