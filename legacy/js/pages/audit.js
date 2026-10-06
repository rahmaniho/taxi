/* ==========================================================================
 * js/pages/audit.js — گزارش تغییرات (Audit Log) و مرکز بازیابی حذف‌شده‌ها
 * ========================================================================== */

import { DB, COLLECTIONS, COLLECTION_LABELS } from '../db.js';
import { Toast, toastError } from '../components/toast.js';
import { Modal } from '../components/modal.js';
import { renderTable } from '../components/table.js';
import { icon } from '../components/icons.js';
import { pageHeader } from '../components/ui.js';
import { JalaliDatepicker } from '../jalali.js';
import {
    formatDateTime, formatJalali, formatNumber, escapeHTML, toFa, todayJalali, isoToJalaliKey,
    downloadCSV, addJalaliDays, lastJalaliMonths
} from '../utils.js';

const ACTION_LABELS = {
    create: 'افزودن', update: 'ویرایش', delete: 'حذف', restore: 'بازیابی',
    login: 'ورود', logout: 'خروج', assign: 'تخصیص سفر', 'recalc-debt': 'بازمحاسبه بدهی',
    'purge-sample': 'حذف داده نمونه', import: 'بازیابی پشتیبان', reset: 'بازنشانی'
};

const ACTION_CLASS = {
    create: 'status-active', update: 'status-subscription', delete: 'status-cancelled',
    restore: 'status-completed', login: 'status-paid', logout: 'status-inactive',
    assign: 'status-inprogress', 'recalc-debt': 'status-pending'
};

export default {
    id: 'audit',
    title: 'گزارش تغییرات',

    render(view) {
        let tab = 'log';
        let entity = '';
        let action = '';
        let user = '';

        view.innerHTML = `
        <section class="page-section active">
          ${pageHeader({
            title: 'گزارش تغییرات و بازیابی', iconName: 'clipboard',
            subtitle: 'هر افزودن، ویرایش، حذف و بازیابی با کاربر، زمان و مقدار قبلی/جدید ثبت می‌شود (قانون حسابرسی سامانه).',
            actions: `
              <button class="btn btn-outline btn-sm" type="button" data-csv>${icon('file-csv')} خروجی CSV</button>
              <button class="btn btn-outline btn-sm" type="button" data-clean>${icon('trash')} پاک‌سازی لاگ‌های قدیمی</button>`
          })}

          <div class="tab-lite" id="auditTabs">
            <button type="button" data-tab="log" class="active">${icon('clipboard')} گزارش تغییرات</button>
            <button type="button" data-tab="deleted">${icon('refresh')} رکوردهای حذف‌شده و بازیابی</button>
          </div>

          <div id="auditFilterCard" class="card mb-16">
            <div class="form-row-3">
              <div class="form-group">
                <label class="form-label">موجودیت</label>
                <select class="form-select" id="afEntity">
                  <option value="">همه موجودیت‌ها</option>
                  ${COLLECTIONS.map((c) => `<option value="${c}">${COLLECTION_LABELS[c] || c}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">نوع عملیات</label>
                <select class="form-select" id="afAction">
                  <option value="">همه عملیات</option>
                  ${Object.entries(ACTION_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">کاربر</label>
                <select class="form-select" id="afUser">
                  <option value="">همه کاربران</option>
                  ${DB.list('operators').map((o) => `<option value="${escapeHTML(o.fullName)}">${escapeHTML(o.fullName)}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">از تاریخ</label>
                <input class="form-input jalali-date" id="afFrom" data-key="${addJalaliDays(todayJalali(), -30)}" value="${formatJalali(addJalaliDays(todayJalali(), -30))}">
              </div>
              <div class="form-group">
                <label class="form-label">تا تاریخ</label>
                <input class="form-input jalali-date" id="afTo" data-key="${todayJalali()}" value="${formatJalali(todayJalali())}">
              </div>
            </div>
          </div>

          <div id="auditDeletedCard" class="card mb-16" hidden>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">موجودیت حذف‌شده</label>
                <select class="form-select" id="delEntity">
                  ${COLLECTIONS.map((c) => `<option value="${c}">${COLLECTION_LABELS[c] || c}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">&nbsp;</label>
                <button class="btn btn-outline btn-sm" type="button" id="delRefresh">${icon('refresh')} نمایش حذف‌شده‌ها</button>
              </div>
            </div>
          </div>

          <div class="card"><div id="auditTable"></div></div>
        </section>`;

        const root = view.querySelector('.page-section');
        JalaliDatepicker.init(root);
        const host = root.querySelector('#auditTable');

        const logsFiltered = () => DB.listAll('auditLog')
            .filter((l) => !entity || l.entity === entity)
            .filter((l) => !action || l.action === action)
            .filter((l) => !user || l.userName === user)
            .filter((l) => {
                const key = isoToJalaliKey(l.timestamp);
                const from = root.querySelector('#afFrom')?.dataset.key || '';
                const to = root.querySelector('#afTo')?.dataset.key || '';
                if (from && key < from) return false;
                if (to && key > to) return false;
                return true;
            })
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        const renderLogs = () => {
            const rows = logsFiltered();
            renderTable(host, {
                key: 'audit-log',
                columns: [
                    { key: 'timestamp', label: 'زمان', sortable: true, render: (l) => formatDateTime(l.timestamp) },
                    { key: 'userName', label: 'کاربر', sortable: true, render: (l) => escapeHTML(l.userName || '—') },
                    { key: 'action', label: 'عملیات', sortable: true, align: 'center', render: (l) => `<span class="status-badge ${ACTION_CLASS[l.action] || 'status-inactive'}">${ACTION_LABELS[l.action] || l.action}</span>` },
                    { key: 'entityLabel', label: 'موجودیت', sortable: true, render: (l) => `${escapeHTML(l.entityLabel || l.entity)}<span class="cell-sub">${escapeHTML(String(l.entityId || '').slice(0, 14))}</span>` },
                    {
                        key: 'summary', label: 'خلاصه تغییر', sortable: false,
                        render: (l) => escapeHTML(summarize(l))
                    },
                    {
                        key: 'actions', label: 'عملیات', sortable: false, align: 'center',
                        render: (l) => `<button class="btn-icon" data-detail="${l.id}" title="جزئیات">${icon('eye')}</button>`
                    }
                ],
                rows,
                search: { keys: ['userName', 'entity', 'entityId', 'action'] },
                pageSize: 25,
                initialSort: { key: 'timestamp', dir: 'desc' },
                csv: {
                    filename: `audit-log-${todayJalali()}`,
                    headers: ['زمان', 'کاربر', 'عملیات', 'موجودیت', 'شناسه', 'خلاصه'],
                    columns: [
                        { key: 'timestamp', label: 'زمان', exportValue: (l) => formatDateTime(l.timestamp) },
                        { key: 'userName', label: 'کاربر' },
                        { key: 'action', label: 'عملیات', exportValue: (l) => ACTION_LABELS[l.action] || l.action },
                        { key: 'entityLabel', label: 'موجودیت' },
                        { key: 'entityId', label: 'شناسه' },
                        { key: 'summary', label: 'خلاصه', exportValue: (l) => summarize(l) }
                    ]
                },
                emptyText: 'تغییری با این فیلترها ثبت نشده است',
                emptyIcon: 'clipboard'
            });
        };

        const renderDeleted = () => {
            const coll = root.querySelector('#delEntity').value;
            const rows = DB.listDeleted(coll);
            renderTable(host, {
                key: 'deleted-records',
                columns: [
                    { key: 'id', label: 'شناسه', sortable: true, render: (r) => `<span class="text-xs">${escapeHTML(String(r.id).slice(0, 16))}</span>` },
                    { key: 'title', label: 'عنوان رکورد', sortable: false, render: (r) => escapeHTML(recordTitle(coll, r)) },
                    { key: 'deletedAt', label: 'زمان حذف', sortable: true, render: (r) => formatDateTime(r.deletedAt) },
                    { key: 'deletedBy', label: 'حذف‌کننده', sortable: true, render: (r) => escapeHTML(r.deletedBy || '—') },
                    {
                        key: 'actions', label: 'عملیات', sortable: false, align: 'center',
                        render: (r) => `<button class="btn btn-outline btn-sm" data-restore="${r.id}" data-coll="${coll}">${icon('refresh')} بازیابی</button>`
                    }
                ],
                rows,
                search: { keys: [] },
                pageSize: 10,
                selectable: true,
                initialSort: { key: 'deletedAt', dir: 'desc' },
                emptyText: 'رکورد حذف‌شده‌ای در این موجودیت وجود ندارد',
                emptyIcon: 'refresh',
                bulkActions: [{
                    label: 'بازیابی گروهی', icon: 'refresh',
                    onClick: (ids) => {
                        ids.forEach((id) => DB.restore(coll, id));
                        Toast.success(`${toFa(ids.length)} رکورد بازیابی شد`);
                        renderDeleted();
                    }
                }]
            });
        };

        const renderTab = () => {
            root.querySelector('#auditFilterCard').hidden = tab !== 'log';
            root.querySelector('#auditDeletedCard').hidden = tab !== 'deleted';
            if (tab === 'log') renderLogs(); else renderDeleted();
        };

        root.querySelector('#auditTabs').addEventListener('click', (e) => {
            const b = e.target.closest('[data-tab]');
            if (!b) return;
            tab = b.dataset.tab;
            root.querySelectorAll('#auditTabs button').forEach((x) => x.classList.toggle('active', x === b));
            renderTab();
        });

        ['#afEntity', '#afAction', '#afUser'].forEach((sel) => {
            root.querySelector(sel).addEventListener('change', (e) => {
                entity = root.querySelector('#afEntity').value;
                action = root.querySelector('#afAction').value;
                user = root.querySelector('#afUser').value;
                renderLogs();
            });
        });
        ['#afFrom', '#afTo'].forEach((sel) => root.querySelector(sel).addEventListener('change', renderLogs));
        root.querySelector('#delEntity').addEventListener('change', renderDeleted);
        root.querySelector('#delRefresh').addEventListener('click', renderDeleted);

        host.addEventListener('click', async (e) => {
            const det = e.target.closest('[data-detail]');
            if (det) { showLogDetail(det.dataset.detail); return; }
            const rst = e.target.closest('[data-restore]');
            if (rst) {
                const ok = await Modal.confirm({
                    title: 'بازیابی رکورد',
                    message: 'این رکورد حذف‌شده بازیابی شود؟',
                    iconName: 'refresh', okText: 'بازیابی'
                });
                if (!ok) return;
                try {
                    DB.restore(rst.dataset.coll, rst.dataset.restore);
                    Toast.success('رکورد بازیابی شد');
                    renderDeleted();
                } catch (err) { toastError(err); }
            }
        });

        root.querySelector('[data-csv]').addEventListener('click', () => downloadCSV(`audit-${todayJalali()}.csv`,
            ['زمان', 'کاربر', 'عملیات', 'موجودیت', 'شناسه', 'خلاصه'],
            logsFiltered().map((l) => [formatDateTime(l.timestamp), l.userName, ACTION_LABELS[l.action] || l.action, l.entityLabel || l.entity, l.entityId, summarize(l)])));

        root.querySelector('[data-clean]').addEventListener('click', async () => {
            const total = DB.listAll('auditLog').length;
            const ok = await Modal.confirm({
                title: 'پاک‌سازی لاگ‌های قدیمی',
                message: `لاگ‌های قدیمی‌تر از ۹۰ روز حذف شوند؟ (از مجموع ${toFa(total)} رکورد)`,
                hint: 'این عملیات برای جلوگیری از حجیم شدن پایگاه داده محلی است.',
                danger: true, okText: 'پاک‌سازی'
            });
            if (!ok) return;
            const limit = addJalaliDays(todayJalali(), -90);
            let removed = 0;
            DB.mutate((db) => {
                const before = db.auditLog.length;
                db.auditLog = db.auditLog.filter((l) => isoToJalaliKey(l.timestamp) >= limit);
                removed = before - db.auditLog.length;
                return removed ? [{ action: 'clean', entity: 'auditLog', newValue: { removed } }] : [];
            });
            Toast.success(`${toFa(removed)} لاگ قدیمی پاک شد`);
            renderLogs();
        });

        renderTab();
    }
};

function summarize(log) {
    if (log.note) return log.note;
    const obj = log.newValue || log.oldValue;
    if (!obj || typeof obj !== 'object') return log.entityLabel || '';
    const parts = [];
    const pick = (key, label) => { if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') parts.push(`${label}: ${obj[key]}`); };
    pick('fullName', 'نام');
    pick('subscriberName', 'مسافر');
    pick('code', 'کد');
    pick('plateNumber', 'پلاک');
    pick('amount', 'مبلغ');
    pick('fare', 'کرایه');
    pick('status', 'وضعیت');
    pick('debt', 'بدهی');
    pick('cancelReason', 'دلیل لغو');
    pick('username', 'کاربر');
    pick('removed', 'تعداد');
    if (!parts.length) parts.push(Object.keys(obj).slice(0, 4).join('، '));
    return parts.join(' · ');
}

function recordTitle(coll, rec) {
    switch (coll) {
        case 'trips': return `${rec.code || ''} — ${rec.subscriberName || ''} (${rec.pickupAddress || ''} → ${rec.dropoffAddress || ''})`;
        case 'subscribers': return `${rec.fullName || ''} — ${rec.subscriptionNumber || ''}`;
        case 'drivers': return `${rec.fullName || ''} — ${rec.phone || ''}`;
        case 'vehicles': return `${rec.plateNumber || ''} — ${rec.brand || ''}`;
        case 'expenses': return `${rec.category || ''} — ${rec.description || ''} (${rec.amount || 0})`;
        case 'operators': return `${rec.fullName || ''} — ${rec.username || ''}`;
        case 'shifts': return `${rec.code || ''} — ${rec.operatorName || ''} (${rec.date || ''})`;
        case 'addresses': return `${rec.title || ''} — ${rec.address || ''}`;
        case 'subscriberPayments': return `${rec.subscriberName || ''} — ${rec.amount || 0}`;
        case 'driverPayments': return `${rec.driverName || ''} — ${rec.amount || 0}`;
        case 'transactions': return `${rec.category || ''} — ${rec.description || ''} (${rec.amount || 0})`;
        default: return rec.id || '';
    }
}

function showLogDetail(logId) {
    const log = DB.listAll('auditLog').find((l) => l.id === logId);
    if (!log) return;
    Modal.open({
        title: 'جزئیات تغییر',
        size: 'modal-lg',
        body: `
          <div class="grid-3 mb-14">
            <div><div class="hint">زمان</div><div class="text-bold">${formatDateTime(log.timestamp)}</div></div>
            <div><div class="hint">کاربر</div><div class="text-bold">${escapeHTML(log.userName || '—')}</div></div>
            <div><div class="hint">عملیات</div><div>${icon('clipboard')} ${ACTION_LABELS[log.action] || log.action}</div></div>
            <div><div class="hint">موجودیت</div><div class="text-bold">${escapeHTML(log.entityLabel || log.entity)}</div></div>
            <div><div class="hint">شناسه رکورد</div><div class="text-bold text-xs">${escapeHTML(log.entityId || '—')}</div></div>
            <div><div class="hint">دستگاه</div><div class="text-xs op-60">${escapeHTML(log.device || '—')}</div></div>
            <div><div class="hint">توضیح</div><div>${escapeHTML(log.note || '—')}</div></div>
          </div>
          ${log.oldValue ? `<div class="section-label">${icon('file-text')} مقدار قبلی</div>
            <pre class="soft-box" style="max-height:220px; overflow:auto; direction:ltr; text-align:left; font-size:0.7rem">${escapeHTML(JSON.stringify(log.oldValue, null, 2))}</pre>` : ''}
          ${log.newValue ? `<div class="section-label mt-16">${icon('check-circle')} مقدار جدید</div>
            <pre class="soft-box" style="max-height:220px; overflow:auto; direction:ltr; text-align:left; font-size:0.7rem">${escapeHTML(JSON.stringify(log.newValue, null, 2))}</pre>` : ''}`,
        footer: `<button class="btn btn-outline" type="button" data-modal-close>بستن</button>`
    });
}
