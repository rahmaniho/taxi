/* ==========================================================================
 * js/pages/addresses.js — آدرس‌های پرکاربرد (مبدأ/مقصد)
 * ========================================================================== */

import { DB } from '../db.js';
import { Toast, toastError } from '../components/toast.js';
import { Modal } from '../components/modal.js';
import { openForm } from '../components/form.js';
import { renderTable } from '../components/table.js';
import { icon } from '../components/icons.js';
import { pageHeader } from '../components/ui.js';
import { escapeHTML, todayJalali, toFa } from '../utils.js';

export default {
    id: 'addresses',
    title: 'آدرس‌ها',

    render(view) {
        view.innerHTML = `
        <section class="page-section active">
          ${pageHeader({
            title: 'آدرس‌های پرکاربرد', iconName: 'map-pin',
            subtitle: 'این آدرس‌ها در فرم ثبت سفر به‌صورت لیست انتخاب سریع نمایش داده می‌شوند.',
            actions: `<button class="btn btn-gold btn-sm" type="button" data-add>${icon('plus')} آدرس جدید</button>`
        })}
          <div class="card"><div id="addressesTable"></div></div>
        </section>`;

        const root = view.querySelector('.page-section');
        const host = root.querySelector('#addressesTable');

        const cfg = () => ({
            key: 'addresses-table',
            columns: [
                { key: 'title', label: 'عنوان', sortable: true, render: (a) => `<b>${escapeHTML(a.title)}</b>` },
                { key: 'address', label: 'نشانی', sortable: true, render: (a) => escapeHTML(a.address) },
                { key: 'neighborhood', label: 'محله', sortable: true, render: (a) => escapeHTML(a.neighborhood || '—') },
                { key: 'city', label: 'شهر', sortable: true, render: (a) => escapeHTML(a.city || '—') },
                { key: 'notes', label: 'یادداشت', sortable: false, render: (a) => `<span class="text-sm op-60">${escapeHTML(a.notes || '')}</span>` },
                {
                    key: 'actions', label: 'عملیات', sortable: false, align: 'center',
                    render: (a) => `
                      <button class="btn-icon edit" data-edit="${a.id}" title="ویرایش">${icon('pencil')}</button>
                      <button class="btn-icon danger" data-del="${a.id}" title="حذف">${icon('trash')}</button>`
                }
            ],
            rows: DB.list('addresses'),
            search: { keys: ['title', 'address', 'neighborhood', 'city'] },
            pageSize: 10,
            initialSort: { key: 'title', dir: 'asc' },
            csv: { filename: `addresses-${todayJalali()}` },
            emptyText: 'آدرسی ثبت نشده است',
            emptyIcon: 'map-pin'
        });

        renderTable(host, cfg());

        host.addEventListener('click', async (e) => {
            const ed = e.target.closest('[data-edit]');
            if (ed) { openAddressForm(ed.dataset.edit); return; }
            const del = e.target.closest('[data-del]');
            if (del) {
                const ok = await Modal.confirm({ title: 'حذف آدرس', message: 'این آدرس حذف شود؟', danger: true, okText: 'حذف' });
                if (!ok) return;
                try {
                    DB.remove('addresses', del.dataset.del);
                    Toast.success('آدرس حذف شد');
                    window.App.reload();
                } catch (err) { toastError(err); }
            }
        });

        root.querySelector('[data-add]').addEventListener('click', () => openAddressForm());
    }
};

export function openAddressForm(id) {
    const a = id ? DB.get('addresses', id) : null;
    openForm({
        title: a ? 'ویرایش آدرس' : 'ثبت آدرس جدید',
        values: {
            title: a?.title || '', address: a?.address || '', neighborhood: a?.neighborhood || '',
            city: a?.city || 'تهران', notes: a?.notes || ''
        },
        fields: [
            { name: 'title', label: 'عنوان (مثلاً فرودگاه)', type: 'text', required: true },
            { name: 'city', label: 'شهر', type: 'text' },
            { name: 'address', label: 'نشانی کامل', type: 'text', required: true, col: 3 },
            { name: 'neighborhood', label: 'محله', type: 'text' },
            { name: 'notes', label: 'یادداشت', type: 'text' }
        ],
        submitText: a ? 'ذخیره' : 'ثبت آدرس',
        onSubmit: (v) => {
            if (a) DB.update('addresses', id, v);
            else DB.insert('addresses', v);
            Toast.success(a ? 'آدرس ویرایش شد' : 'آدرس ثبت شد');
            window.App.reload();
        }
    });
}
