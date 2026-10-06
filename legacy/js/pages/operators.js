/* ==========================================================================
 * js/pages/operators.js — مدیریت کاربران (اپراتور/حسابدار/مدیر) و شیفت‌ها
 * ========================================================================== */

import { DB } from '../db.js';
import { Auth, ROLES, ROLE_LABELS, hashPassword, randomSalt } from '../auth.js';
import { Toast, toastError } from '../components/toast.js';
import { Modal } from '../components/modal.js';
import { renderTable } from '../components/table.js';
import { icon } from '../components/icons.js';
import { pageHeader, statusBadge } from '../components/ui.js';
import { formatDateTime, formatJalali, formatNumber, escapeHTML, toFa, humanizeMinutes } from '../utils.js';

export default {
    id: 'operators',
    title: 'کاربران و شیفت‌ها',

    render(view) {
        view.innerHTML = `
        <section class="page-section active">
          ${pageHeader({
            title: 'کاربران و شیفت‌ها', iconName: 'users',
            subtitle: 'هر کاربر رمز عبور هش‌شده (SHA-256 + نمک) دارد. دسترسی صفحات و عملیات بر اساس نقش تعیین می‌شود.',
            actions: `<button class="btn btn-gold btn-sm" type="button" id="opNew">${icon('plus')} کاربر جدید</button>`
          })}
          <div class="card mb-16"><div id="opTable"></div></div>
          <div class="card">
            <div class="card-header"><div class="card-title">${icon('play')} آخرین شیفت‌ها</div>
              <span class="chip">${icon('clock')} شیفت باز: ${Auth.currentShift() ? escapeHTML(Auth.currentShift().code) : 'ندارد'}</span></div>
            <div id="shTable"></div>
          </div>
        </section>`;

        const root = view.querySelector('.page-section');
        const refresh = () => {
            renderTable(root.querySelector('#opTable'), {
                key: 'operators',
                columns: [
                    {
                        key: 'fullName', label: 'نام و نام خانوادگی', sortable: true,
                        render: (u) => `<b>${escapeHTML(u.fullName)}</b>
                          ${u.id === Auth.current()?.id ? '<span class="chip chip-gold">شما</span>' : ''}
                          <span class="cell-sub" dir="ltr">${escapeHTML(u.username)}</span>`
                    },
                    { key: 'role', label: 'نقش', sortable: true, align: 'center', render: (u) => `<span class="role-badge role-${u.role}">${ROLE_LABELS[u.role] || u.role}</span>` },
                    { key: 'phone', label: 'تلفن همراه', sortable: true, align: 'center', render: (u) => toFa(u.phone || '—') },
                    { key: 'status', label: 'وضعیت', sortable: true, align: 'center', render: (u) => statusBadge(u.status || 'active') },
                    {
                        key: 'lastLoginAt', label: 'آخرین ورود', sortable: true, align: 'center',
                        render: (u) => u.lastLoginAt ? formatDateTime(u.lastLoginAt) : '<span class="text-muted">هرگز</span>'
                    },
                    {
                        key: 'shiftCount', label: 'تعداد شیفت', sortable: true, align: 'center',
                        sortValue: (u) => DB.list('shifts').filter((s) => s.operatorId === u.id).length,
                        render: (u) => formatNumber(DB.list('shifts').filter((s) => s.operatorId === u.id).length)
                    },
                    {
                        key: 'actions', label: 'عملیات', sortable: false, align: 'center',
                        render: (u) => `
                          <button class="btn-icon edit" data-edit="${u.id}" title="ویرایش">${icon('edit')}</button>
                          <button class="btn-icon" data-pass="${u.id}" title="تغییر رمز">${icon('lock')}</button>
                          ${u.id === Auth.current()?.id ? '' : `<button class="btn-icon danger" data-del="${u.id}" title="حذف">${icon('trash')}</button>`}`
                    }
                ],
                rows: DB.list('operators'),
                search: { keys: ['fullName', 'username', 'phone'] },
                pageSize: 10,
                initialSort: { key: 'role', dir: 'asc' },
                emptyText: 'کاربری ثبت نشده است',
                emptyIcon: 'users'
            });

            const shifts = [...DB.list('shifts')].sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
            renderTable(root.querySelector('#shTable'), {
                key: 'shifts',
                columns: [
                    { key: 'code', label: 'کد شیفت', sortable: true },
                    { key: 'operatorName', label: 'کاربر', sortable: true, render: (s) => escapeHTML(s.operatorName || DB.get('operators', s.operatorId)?.fullName || '—') },
                    { key: 'date', label: 'تاریخ', sortable: true, render: (s) => formatJalali(s.date) },
                    { key: 'startTime', label: 'شروع', sortable: true, render: (s) => formatTimeOnly(s.startTime) },
                    { key: 'endTime', label: 'پایان', sortable: true, render: (s) => s.endTime ? formatTimeOnly(s.endTime) : '<span class="text-green">در جریان</span>' },
                    {
                        key: 'duration', label: 'مدت', sortable: true, align: 'center',
                        sortValue: (s) => Math.round((new Date(s.endTime || Date.now()) - new Date(s.startTime)) / 60000),
                        render: (s) => humanizeMinutes(Math.round((new Date(s.endTime || Date.now()) - new Date(s.startTime)) / 60000))
                    },
                    { key: 'tripsCount', label: 'سفر', sortable: true, align: 'center', sortValue: (s) => s.stats?.tripsCount || 0, render: (s) => formatNumber(s.stats?.tripsCount || 0) },
                    { key: 'cancelledCount', label: 'لغو', sortable: true, align: 'center', sortValue: (s) => s.stats?.cancelledCount || 0, render: (s) => formatNumber(s.stats?.cancelledCount || 0) },
                    { key: 'commission', label: 'کمیسیون', sortable: true, align: 'center', sortValue: (s) => s.stats?.commission || 0, render: (s) => formatNumber(s.stats?.commission || 0) },
                    { key: 'status', label: 'وضعیت', sortable: true, align: 'center', render: (s) => statusBadge(s.status) }
                ],
                rows: shifts,
                search: { keys: ['code', 'operatorName'] },
                pageSize: 10,
                initialSort: { key: 'startTime', dir: 'desc' },
                emptyText: 'شیفتی ثبت نشده است',
                emptyIcon: 'play'
            });
        };

        root.addEventListener('click', async (e) => {
            const edit = e.target.closest('[data-edit]');
            if (edit) { openUserForm(DB.get('operators', edit.dataset.edit), refresh); return; }
            const pass = e.target.closest('[data-pass]');
            if (pass) { openPasswordForm(DB.get('operators', pass.dataset.pass), refresh); return; }
            const del = e.target.closest('[data-del]');
            if (del) {
                const u = DB.get('operators', del.dataset.del);
                const ok = await Modal.confirm({
                    title: 'حذف کاربر',
                    message: `کاربر «${u.fullName}» حذف شود؟`,
                    hint: 'رکورد به‌صورت نرم حذف می‌شود و از گزارش تغییرات قابل بازیابی است.',
                    danger: true, okText: 'حذف'
                });
                if (!ok) return;
                try {
                    DB.remove('operators', u.id, 'کاربر حذف شد');
                    Toast.success('کاربر حذف شد');
                    refresh();
                } catch (err) { toastError(err); }
            }
        });

        root.querySelector('#opNew').addEventListener('click', () => openUserForm(null, refresh));
        refresh();
    }
};

/* ------------------------------ فرم کاربر ------------------------------ */

function openUserForm(user, onDone) {
    const isNew = !user;
    Modal.open({
        title: isNew ? 'کاربر جدید' : `ویرایش ${user.fullName}`,
        iconName: 'users',
        body: `
          <div class="form-row">
            <div class="form-group"><label class="form-label">نام و نام خانوادگی <span class="req">*</span></label>
              <input class="form-input" id="ufName" value="${escapeHTML(user?.fullName || '')}"></div>
            <div class="form-group"><label class="form-label">نام کاربری <span class="req">*</span></label>
              <input class="form-input" id="ufUser" dir="ltr" value="${escapeHTML(user?.username || '')}" ${isNew ? '' : 'readonly'}></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">نقش <span class="req">*</span></label>
              <select class="form-select" id="ufRole">
                ${ROLES.map((r) => `<option value="${r}" ${user?.role === r ? 'selected' : ''}>${ROLE_LABELS[r]}</option>`).join('')}
              </select></div>
            <div class="form-group"><label class="form-label">تلفن همراه</label>
              <input class="form-input" id="ufPhone" dir="ltr" placeholder="09xxxxxxxxx" value="${escapeHTML(user?.phone || '')}"></div>
          </div>
          ${isNew ? `<div class="form-row">
            <div class="form-group"><label class="form-label">رمز عبور <span class="req">*</span></label>
              <input class="form-input" id="ufPass" type="password" dir="ltr" placeholder="حداقل ۸ کاراکتر"></div>
            <div class="form-group"><label class="form-label">تکرار رمز عبور <span class="req">*</span></label>
              <input class="form-input" id="ufPass2" type="password" dir="ltr"></div>
          </div>` : ''}
          <div class="form-group"><label class="form-label">وضعیت</label>
            <select class="form-select" id="ufStatus">
              <option value="active" ${user?.status !== 'inactive' ? 'selected' : ''}>فعال</option>
              <option value="inactive" ${user?.status === 'inactive' ? 'selected' : ''}>غیرفعال</option>
            </select></div>
          <div class="form-group"><label class="form-label">یادداشت</label>
            <textarea class="form-input" id="ufNotes" rows="2">${escapeHTML(user?.notes || '')}</textarea></div>
          <div class="soft-box">${icon('lock')} رمزها با الگوریتم SHA-256 و نمک تصادفی ذخیره می‌شوند و هرگز به‌صورت متن ساده نگهداری نمی‌شوند.</div>`,
        footer: `<button class="btn btn-outline" type="button" data-modal-close>انصراف</button>
                 <button class="btn btn-gold" type="button" id="ufSave">${icon('save')} ذخیره</button>`,
        onMount(node, api) {
            node.querySelector('#ufSave')?.addEventListener('click', async () => {
                const fullName = node.querySelector('#ufName').value.trim();
                const username = node.querySelector('#ufUser').value.trim().toLowerCase();
                const role = node.querySelector('#ufRole').value;
                const phone = node.querySelector('#ufPhone').value.trim();
                const status = node.querySelector('#ufStatus').value;
                const notes = node.querySelector('#ufNotes').value.trim();
                try {
                    if (!fullName) throw new Error('نام و نام خانوادگی الزامی است');
                    if (!/^[a-z0-9._-]{3,}$/.test(username)) throw new Error('نام کاربری باید حداقل ۳ کاراکتر لاتین/عدد باشد');
                    if (phone && !/^09\d{9}$/.test(phone)) throw new Error('شماره همراه معتبر نیست (نمونه: ۰۹۱۲۳۴۵۶۷۸۹)');
                    if (DB.list('operators').some((u) => u.username === username && u.id !== user?.id)) throw new Error('این نام کاربری قبلاً ثبت شده است');

                    if (isNew) {
                        const pass = node.querySelector('#ufPass').value;
                        const pass2 = node.querySelector('#ufPass2').value;
                        if (pass.length < 8) throw new Error('رمز عبور باید حداقل ۸ کاراکتر باشد');
                        if (pass !== pass2) throw new Error('تکرار رمز عبور مطابقت ندارد');
                        const salt = randomSalt();
                        const passwordHash = await hashPassword(pass, salt);
                        DB.insert('operators', { fullName, username, role, phone, status, notes, salt, passwordHash, mustChangePassword: false },
                            { desc: `کاربر «${fullName}» با نقش ${ROLE_LABELS[role]} افزوده شد` });
                        Toast.success('کاربر جدید افزوده شد');
                    } else {
                        DB.update('operators', user.id, { fullName, role, phone, status, notes },
                            { desc: `کاربر «${fullName}» ویرایش شد` });
                        Toast.success('تغییرات ذخیره شد');
                    }
                    api.close();
                    onDone?.();
                } catch (err) { toastError(err, 'ذخیره کاربر ناموفق بود'); }
            });
        }
    });
}

/* ------------------------------ تغییر رمز ------------------------------ */

function openPasswordForm(user, onDone) {
    if (!user) return;
    const isSelf = user.id === Auth.current()?.id;
    Modal.open({
        title: `تغییر رمز عبور — ${user.fullName}`,
        iconName: 'lock',
        body: `
          ${isSelf ? `<div class="form-group"><label class="form-label">رمز فعلی <span class="req">*</span></label>
            <input class="form-input" id="pfOld" type="password" dir="ltr"></div>` : `
          <div class="soft-box mb-12">${icon('info')} به‌عنوان مدیر می‌توانید رمز این کاربر را بدون دانستن رمز قبلی بازنشانی کنید.</div>`}
          <div class="form-row">
            <div class="form-group"><label class="form-label">رمز جدید <span class="req">*</span></label>
              <input class="form-input" id="pfNew" type="password" dir="ltr" placeholder="حداقل ۸ کاراکتر"></div>
            <div class="form-group"><label class="form-label">تکرار رمز جدید <span class="req">*</span></label>
              <input class="form-input" id="pfNew2" type="password" dir="ltr"></div>
          </div>
          <div class="progress"><i id="pfStrength" style="width:0%"></i></div>
          <div class="hint" id="pfHint">قدرت رمز: ضعیف</div>`,
        footer: `<button class="btn btn-outline" type="button" data-modal-close>انصراف</button>
                 <button class="btn btn-gold" type="button" id="pfSave">${icon('save')} ذخیره رمز</button>`,
        onMount(node, api) {
            const input = node.querySelector('#pfNew');
            input.addEventListener('input', () => {
                const v = input.value;
                let score = 0;
                if (v.length >= 8) score++;
                if (/[a-z]/.test(v) && /[A-Z]/.test(v)) score++;
                if (/\d/.test(v)) score++;
                if (/[^A-Za-z0-9]/.test(v)) score++;
                const bars = node.querySelector('#pfStrength');
                const labels = ['ضعیف', 'متوسط', 'خوب', 'قوی', 'بسیار قوی'];
                bars.style.width = (score * 25) + '%';
                bars.style.background = score <= 1 ? 'var(--red)' : score === 2 ? 'var(--yellow)' : 'var(--green)';
                node.querySelector('#pfHint').textContent = 'قدرت رمز: ' + labels[score];
            });
            node.querySelector('#pfSave').addEventListener('click', async () => {
                try {
                    const oldPass = node.querySelector('#pfOld')?.value || '';
                    const n1 = node.querySelector('#pfNew').value;
                    const n2 = node.querySelector('#pfNew2').value;
                    if (n1.length < 8) throw new Error('رمز جدید باید حداقل ۸ کاراکتر باشد');
                    if (n1 !== n2) throw new Error('تکرار رمز جدید مطابقت ندارد');
                    await Auth.changePassword(user.id, oldPass, n1);
                    Toast.success('رمز عبور تغییر کرد');
                    api.close();
                    onDone?.();
                } catch (err) { toastError(err); }
            });
        }
    });
}

function formatTimeOnly(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
}
