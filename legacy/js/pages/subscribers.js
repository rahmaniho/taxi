/* ==========================================================================
 * js/pages/subscribers.js — مشترکین، بدهی و پرداخت‌ها (رفع باگ بدهی مشترکین)
 * --------------------------------------------------------------------------
 * منبع حقیقت بدهی: Subscribers.computeDebt() = مجموع سفرهای حقوقی غیرلغوشده
 * منهای مجموع پرداخت‌های ثبت‌شده. پس از هر پرداخت/سفر، مقدار cached هم
 * به‌روزرسانی می‌شود تا نمایش و گزارش‌ها یکسان بمانند.
 * ========================================================================== */

import { DB } from '../db.js';
import { Auth } from '../auth.js';
import { Subscribers, Payments, Trips } from '../domain.js';
import { Toast, toastError } from '../components/toast.js';
import { Modal } from '../components/modal.js';
import { openForm } from '../components/form.js';
import { renderTable } from '../components/table.js';
import { icon } from '../components/icons.js';
import { statusBadge, pageHeader, agingBadge } from '../components/ui.js';
import { invoiceHTML } from '../prints.js';
import { JalaliDatepicker } from '../jalali.js';
import {
    todayJalali, formatJalali, formatNumber, formatMoney, escapeHTML, toFa, sum, isValidNationalCode,
    diffJalaliDays, currentJalaliMonthRange
} from '../utils.js';

export default {
    id: 'subscribers',
    title: 'مشترکین',

    render(view) {
        const mode = { type: '', debtOnly: false };

        view.innerHTML = `
        <section class="page-section active">
          ${pageHeader({
            title: 'مشترکین', iconName: 'users',
            subtitle: 'بدهی هر مشترک از سفرهای حقوقی منهای پرداخت‌های ثبت‌شده محاسبه می‌شود؛ با ثبت پرداخت، بدهی به‌صورت خودکار کاهش می‌یابد.',
            actions: `
              <button class="btn btn-outline btn-sm" type="button" data-go="reports-debtors">${icon('wallet')} گزارش بدهکاران</button>
              <button class="btn btn-gold btn-sm" type="button" data-add>${icon('user-plus')} مشترک جدید</button>`
          })}

          <div class="kpi-tiles mb-16" id="subKpis"></div>

          <div class="card"><div id="subsTable"></div></div>
        </section>`;

        const root = view.querySelector('.page-section');
        const host = root.querySelector('#subsTable');

        const renderKpis = () => {
            const subs = Subscribers.all();
            const list = subs.map((s) => ({ s, debt: Subscribers.computeDebt(s.id) }));
            const totalDebt = sum(list, (x) => x.debt);
            const corporate = subs.filter((s) => s.type === 'corporate').length;
            const paymentsThisMonth = sum(
                DB.list('subscriberPayments').filter((p) => p.date >= currentJalaliMonthRange().from),
                (p) => p.amount
            );
            root.querySelector('#subKpis').innerHTML = `
              ${kpi('کل مشترکین', toFa(subs.length), 'users')}
              ${kpi('مشترکین حقوقی', toFa(corporate), 'building')}
              ${kpi('بدهکاران', toFa(list.filter((x) => x.debt > 0).length), 'alert-circle', 'var(--red)')}
              ${kpi('مجموع بدهی', formatMoney(totalDebt, false), 'wallet', totalDebt ? 'var(--red)' : 'var(--green)')}
              ${kpi('دریافتی ماه جاری', formatMoney(paymentsThisMonth, false), 'coins', 'var(--green)')}`;
        };

        const cfg = () => ({
            key: 'subscribers-table',
            columns: [
                {
                    key: 'fullName', label: 'مشترک', sortable: true,
                    render: (s) => `<span class="driver-name-link" data-view="${s.id}">${escapeHTML(s.fullName)}</span>
                        <span class="cell-sub">${escapeHTML(s.subscriptionNumber || '')} · ${toFa(s.phone)}</span>`
                },
                { key: 'type', label: 'نوع', sortable: true, align: 'center', render: (s) => statusBadge(s.type) },
                {
                    key: 'subscription', label: 'اشتراک', sortable: true, align: 'center',
                    sortValue: (s) => s.subscriptionType || 'none',
                    render: (s) => s.subscriptionType && s.subscriptionType !== 'none'
                        ? `${statusBadge(s.subscriptionType)}<span class="cell-sub">تا ${formatJalali(s.subscriptionEnd)}</span>`
                        : '<span class="text-muted">—</span>'
                },
                {
                    key: 'tripsCount', label: 'سفرها', sortable: true, align: 'center',
                    sortValue: (s) => Trips.all().filter((t) => t.subscriberId === s.id).length,
                    render: (s) => {
                        const list = Trips.all().filter((t) => t.subscriberId === s.id);
                        return `${formatNumber(list.length)}<span class="cell-sub">تکمیل: ${toFa(list.filter((t) => t.status === 'completed').length)}</span>`;
                    }
                },
                {
                    key: 'fareSum', label: 'مجموع کرایه', sortable: true, align: 'center',
                    sortValue: (s) => sum(Trips.all().filter((t) => t.subscriberId === s.id && t.status === 'completed'), (t) => t.fare),
                    render: (s) => formatNumber(sum(Trips.all().filter((t) => t.subscriberId === s.id && t.status === 'completed'), (t) => t.fare))
                },
                {
                    key: 'paid', label: 'پرداخت‌ها', sortable: true, align: 'center',
                    sortValue: (s) => sum(DB.list('subscriberPayments').filter((p) => p.subscriberId === s.id), (p) => p.amount),
                    render: (s) => formatNumber(sum(DB.list('subscriberPayments').filter((p) => p.subscriberId === s.id), (p) => p.amount))
                },
                {
                    key: 'debt', label: 'بدهی', sortable: true, align: 'center',
                    sortValue: (s) => Subscribers.computeDebt(s.id),
                    render: (s) => {
                        const debt = Subscribers.computeDebt(s.id);
                        if (debt <= 0) return `<span class="status-badge status-paid">تسویه</span>`;
                        const age = Subscribers.debtAge(s.id);
                        return `<span class="status-badge status-debt">${formatNumber(debt)}</span><span class="cell-sub">${toFa(age)} روز</span>`;
                    }
                },
                {
                    key: 'actions', label: 'عملیات', sortable: false, align: 'center',
                    render: (s) => `
                      <button class="btn-icon" data-pay="${s.id}" title="ثبت پرداخت">${icon('wallet')}</button>
                      <button class="btn-icon" data-statement="${s.id}" title="صورت‌حساب">${icon('file-text')}</button>
                      <button class="btn-icon edit" data-edit="${s.id}" title="ویرایش">${icon('pencil')}</button>
                      <button class="btn-icon danger" data-del="${s.id}" title="حذف">${icon('trash')}</button>`
                }
            ],
            rows: Subscribers.all(),
            filter: (s) => (!mode.type || s.type === mode.type) && (!mode.debtOnly || Subscribers.computeDebt(s.id) > 0),
            search: { keys: ['fullName', 'phone', 'subscriptionNumber', 'companyName', 'nationalId'] },
            pageSize: 10,
            initialSort: { key: 'debt', dir: 'desc' },
            csv: { filename: `subscribers-${todayJalali()}` },
            emptyText: 'مشترکی با این فیلترها یافت نشد',
            emptyIcon: 'users',
            toolbar: () => `
              <select class="form-select" data-flt-type style="max-width:130px; font-size:0.72rem">
                <option value="">همه انواع</option>
                <option value="individual" ${mode.type === 'individual' ? 'selected' : ''}>حقیقی</option>
                <option value="corporate" ${mode.type === 'corporate' ? 'selected' : ''}>حقوقی</option>
              </select>
              <label class="check-wrap text-sm"><input type="checkbox" class="chk" data-flt-debt ${mode.debtOnly ? 'checked' : ''}> فقط بدهکاران</label>`
        });

        renderKpis();
        renderTable(host, cfg());

        host.addEventListener('change', (e) => {
            if (e.target.matches('[data-flt-type]')) { mode.type = e.target.value; renderTable(host, cfg()); }
            if (e.target.matches('[data-flt-debt]')) { mode.debtOnly = e.target.checked; renderTable(host, cfg()); }
        });

        host.addEventListener('click', async (e) => {
            if (e.target.closest('[data-tbl-select],[data-tbl-all]')) return;
            const pay = e.target.closest('[data-pay]');
            if (pay) { openSubscriberPayment(pay.dataset.pay); return; }
            const st = e.target.closest('[data-statement]');
            if (st) { window.App.navigate('acc-subscribers', { subscriberId: st.dataset.statement }); return; }
            const vw = e.target.closest('[data-view]');
            if (vw) { showSubscriberDetails(vw.dataset.view); return; }
            const ed = e.target.closest('[data-edit]');
            if (ed) { openSubscriberForm(ed.dataset.edit); return; }
            const del = e.target.closest('[data-del]');
            if (del) {
                const s = DB.get('subscribers', del.dataset.del);
                if (DB.list('trips').some((t) => t.subscriberId === s.id)) {
                    Toast.warning('این مشترک سفر ثبت‌شده دارد؛ برای حفظ گزارش‌ها فقط می‌توانید آن را ویرایش کنید');
                    return;
                }
                const ok = await Modal.confirm({ title: 'حذف مشترک', message: `مشترک «${s.fullName}» حذف شود؟`, danger: true, okText: 'حذف' });
                if (!ok) return;
                try {
                    DB.remove('subscribers', s.id);
                    Toast.success('مشترک حذف شد');
                    window.App.reload();
                } catch (err) { toastError(err); }
            }
        });

        root.querySelector('[data-add]').addEventListener('click', () => openSubscriberForm());
        root.querySelector('[data-go]')?.addEventListener('click', () => window.App.navigate('reports-debtors'));
    }
};

function kpi(label, value, ic, color) {
    return `<div class="kpi"><div class="k-label">${icon(ic)} ${label}</div><div class="k-value" style="${color ? `color:${color}` : ''}">${value}</div></div>`;
}

/* ------------------------------- فرم مشترک ------------------------------- */

export function openSubscriberForm(id) {
    const s = id ? DB.get('subscribers', id) : null;
    openForm({
        title: s ? `ویرایش ${s.fullName}` : 'ثبت مشترک جدید',
        size: 'modal-lg',
        description: 'کد اشتراک به‌صورت خودکار تولید می‌شود. تعداد سفرهای مشترکین حقوقی به‌صورت خودکار به بدهی اضافه می‌شود.',
        values: {
            type: s?.type || 'individual',
            fullName: s?.fullName || '',
            phone: s?.phone || '',
            address: s?.address || '',
            nationalId: s?.nationalId || '',
            companyPhone: s?.companyPhone || '',
            companyAddress: s?.companyAddress || '',
            subscriptionType: s?.subscriptionType || 'none',
            subscriptionStart: s?.subscriptionStart || '',
            subscriptionEnd: s?.subscriptionEnd || '',
            subscriptionPrice: s?.subscriptionPrice || '',
            notes: s?.notes || ''
        },
        fields: [
            { name: 'type', label: 'نوع مشترک', type: 'select', placeholder: false, options: [{ value: 'individual', label: 'حقیقی' }, { value: 'corporate', label: 'حقوقی (شرکت)' }] },
            { name: 'fullName', label: 'نام / نام شرکت', type: 'text', required: true },
            { name: 'phone', label: 'تلفن', type: 'phone', required: true },
            { name: 'address', label: 'آدرس (حقیقی)', type: 'text', visible: (v) => v.type === 'individual', col: 3 },
            { name: 'nationalId', label: 'شناسه ملی شرکت', type: 'text', visible: (v) => v.type === 'corporate', validate: (v) => (v && !/^\d{10,12}$/.test(v.replace(/\D/g, '')) ? 'شناسه ملی باید ۱۰ تا ۱۲ رقم باشد' : '') },
            { name: 'companyPhone', label: 'تلفن شرکت', type: 'phone', visible: (v) => v.type === 'corporate' },
            { name: 'companyAddress', label: 'آدرس شرکت', type: 'text', visible: (v) => v.type === 'corporate', col: 3 },
            { name: 'subscriptionType', label: 'نوع اشتراک', type: 'select', placeholder: false, options: [{ value: 'none', label: 'بدون اشتراک' }, { value: 'monthly', label: 'ماهانه' }, { value: 'weekly', label: 'هفتگی' }, { value: 'custom', label: 'سفارشی' }] },
            { name: 'subscriptionPrice', label: 'مبلغ اشتراک (تومان)', type: 'money', visible: (v) => v.subscriptionType !== 'none' },
            { name: 'subscriptionStart', label: 'شروع اشتراک', type: 'date', visible: (v) => v.subscriptionType !== 'none' },
            { name: 'subscriptionEnd', label: 'پایان اشتراک', type: 'date', visible: (v) => v.subscriptionType !== 'none' },
            { name: 'notes', label: 'یادداشت', type: 'textarea', rows: 2, col: 3 }
        ],
        submitText: s ? 'ذخیره تغییرات' : 'ثبت مشترک',
        onMount: (node) => JalaliDatepicker.init(node),
        onSubmit: (v) => {
            const dup = DB.list('subscribers').find((x) => x.phone === v.phone && x.id !== id);
            if (dup) throw new Error('این شماره تماس برای مشترک دیگری ثبت شده است');
            if (v.subscriptionType !== 'none' && v.subscriptionStart && v.subscriptionEnd && v.subscriptionEnd < v.subscriptionStart) {
                throw new Error('تاریخ پایان اشتراک نمی‌تواند قبل از شروع باشد');
            }
            const data = {
                type: v.type,
                fullName: v.fullName,
                phone: v.phone,
                address: v.type === 'individual' ? v.address : '',
                companyName: v.type === 'corporate' ? v.fullName : '',
                nationalId: v.type === 'corporate' ? v.nationalId : '',
                companyPhone: v.type === 'corporate' ? v.companyPhone : '',
                companyAddress: v.type === 'corporate' ? v.companyAddress : '',
                subscriptionType: v.subscriptionType,
                subscriptionStart: v.subscriptionType !== 'none' ? v.subscriptionStart : '',
                subscriptionEnd: v.subscriptionType !== 'none' ? v.subscriptionEnd : '',
                subscriptionPrice: v.subscriptionType !== 'none' ? Number(v.subscriptionPrice) || 0 : 0,
                notes: v.notes
            };
            if (s) {
                DB.update('subscribers', id, data);
                Subscribers.recalcDebt(id);
            } else {
                const seq = DB.nextSequence('subscriber');
                DB.insert('subscribers', { ...data, subscriptionNumber: 'SUB-' + String(seq).padStart(4, '0'), debt: 0 });
            }
            Toast.success(s ? 'مشترک ویرایش شد' : 'مشترک ثبت شد');
            window.App.reload();
        }
    });
}

/* ----------------------------- ثبت پرداخت ----------------------------- */

export function openSubscriberPayment(subscriberId, { onDone } = {}) {
    const sub = DB.get('subscribers', subscriberId);
    if (!sub) return;
    const debt = Subscribers.computeDebt(subscriberId);
    if (debt <= 0) {
        Modal.alert({ title: 'بدهی ندارد', message: `${sub.fullName} بدهی تسویه‌نشده ندارد.`, type: 'success' });
        return;
    }
    openForm({
        title: `ثبت پرداخت — ${sub.fullName}`,
        description: `بدهی جاری: ${formatMoney(debt)} — با ثبت پرداخت، بدهی به‌صورت خودکار کاهش می‌یابد.`,
        values: {
            amount: debt,
            date: todayJalali(),
            method: 'cash',
            receiptNo: 'R-' + String((DB.raw()?.sequences?.payment) || 1).padStart(4, '0'),
            notes: ''
        },
        fields: [
            { name: 'amount', label: 'مبلغ پرداختی (تومان)', type: 'money', required: true, min: 1 },
            { name: 'date', label: 'تاریخ پرداخت', type: 'date', required: true },
            { name: 'method', label: 'روش پرداخت', type: 'select', placeholder: false, options: [['cash', 'نقدی'], ['card', 'کارتی'], ['online', 'آنلاین'], ['cheque', 'چک']].map(([value, label]) => ({ value, label })) },
            { name: 'receiptNo', label: 'شماره رسید', type: 'text' },
            { name: 'notes', label: 'توضیحات', type: 'text', col: 3 }
        ],
        submitText: 'ثبت پرداخت',
        onMount: (node) => JalaliDatepicker.init(node),
        onSubmit: (v) => {
            const payment = Subscribers.addPayment({
                subscriberId,
                amount: v.amount,
                date: v.date,
                method: v.method,
                receiptNo: v.receiptNo,
                notes: v.notes,
                operatorId: Auth.current()?.userId || ''
            });
            Toast.success(`پرداخت ${formatMoney(payment.amount)} ثبت شد · بدهی جدید: ${formatMoney(Subscribers.computeDebt(subscriberId))}`);
            if (onDone) onDone(); else window.App.reload();
        }
    });
}

/* --------------------------- جزئیات و صورت‌حساب --------------------------- */

function showSubscriberDetails(id) {
    const s = DB.get('subscribers', id);
    if (!s) return;
    const st = Subscribers.statement(id);
    const payments = DB.list('subscriberPayments').filter((p) => p.subscriberId === id)
        .sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 6);

    Modal.open({
        title: `مشترک ${s.fullName}`,
        size: 'modal-lg',
        body: `
          <div class="flex gap-12 mb-14" style="flex-wrap:wrap">
            <span class="chip chip-gold">${icon('tag')} ${escapeHTML(s.subscriptionNumber || '—')}</span>
            <span class="chip">${statusBadge(s.type)}</span>
            <span class="chip">${icon('phone')} ${toFa(s.phone)}</span>
            ${s.subscriptionType !== 'none' ? `<span class="chip">${icon('calendar')} اشتراک ${escapeHTML(s.subscriptionType)} تا ${formatJalali(s.subscriptionEnd)}</span>` : ''}
          </div>
          <div class="kpi-tiles mb-16">
            ${kpi('سفرهای تکمیل‌شده', toFa(st.trips.filter((t) => t.status === 'completed').length), 'route')}
            ${kpi('مجموع کرایه', formatMoney(st.totalFare, false), 'coins')}
            ${kpi('پرداخت‌شده', formatMoney(st.totalPaid, false), 'wallet', 'var(--green)')}
            ${kpi('بدهی جاری', formatMoney(st.debt, false), 'alert-circle', st.debt ? 'var(--red)' : 'var(--green)')}
          </div>
          ${st.debt > 0 ? `<div class="alert-row warn"><span class="a-icon">${icon('clock')}</span><div>سنّ بدهی: ${toFa(st.debtAge)} روز ${agingBadge(st.debtAge)}</div></div>` : ''}
          <div class="card-title mb-10">${icon('wallet')} آخرین پرداخت‌ها</div>
          ${payments.length ? `<div class="table-wrapper"><table class="mini-table">
              <thead><tr><th>تاریخ</th><th>مبلغ</th><th>روش</th><th>رسید</th></tr></thead>
              <tbody>${payments.map((p) => `<tr><td>${formatJalali(p.date)}</td><td>${formatNumber(p.amount)}</td>
                <td>${p.method === 'cash' ? 'نقدی' : p.method === 'card' ? 'کارتی' : p.method === 'online' ? 'آنلاین' : 'چک'}</td>
                <td>${escapeHTML(p.receiptNo || '—')}</td></tr>`).join('')}</tbody></table></div>`
            : `<div class="empty-state">${icon('wallet', 'icon-xl')}<p>پرداختی ثبت نشده است</p></div>`}`,
        footer: `<button class="btn btn-outline" type="button" data-modal-close>بستن</button>
                 <button class="btn btn-outline" type="button" data-goto-acc>${icon('file-text')} صورت‌حساب کامل</button>
                 <button class="btn btn-gold" type="button" data-pay-now>${icon('wallet')} ثبت پرداخت</button>`,
        onMount: (node) => {
            node.querySelector('[data-goto-acc]').addEventListener('click', () => {
                Modal.close();
                setTimeout(() => window.App.navigate('acc-subscribers', { subscriberId: id }), 240);
            });
            node.querySelector('[data-pay-now]').addEventListener('click', () => {
                Modal.close();
                setTimeout(() => openSubscriberPayment(id), 240);
            });
            node.querySelector('[data-pay-now]').hidden = st.debt <= 0;
        }
    });
}

export { invoiceHTML };
