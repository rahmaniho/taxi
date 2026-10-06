/* ==========================================================================
 * js/pages/ledger.js — صفحه‌های حسابداری دوطرفه
 *   • journal        : دفتر روزنامه (ثبت سند دستی، مشاهده، حذف، تولید از دادهٔ موجود)
 *   • chart          : کدینگ حساب‌ها
 *   • trial          : تراز آزمایشی
 *   • pl             : صورت سود و زیان
 *   • account-ledger : دفتر معین یک حساب
 * --------------------------------------------------------------------------
 * همهٔ نوشتن‌ها از DB/mutate و از طریق Journals انجام می‌شود تا سند نامتوازن
 * هرگز ثبت نشود و Audit Log به‌طور خودکار پر شود.
 * ========================================================================== */

import { DB } from '../db.js';
import { Toast, toastError } from '../components/toast.js';
import { Modal } from '../components/modal.js';
import { openForm } from '../components/form.js';
import { renderTable } from '../components/table.js';
import { Charts } from '../components/chart.js';
import { icon } from '../components/icons.js';
import { pageHeader, kpi, previewPrint } from '../components/ui.js';
import { analysisReportHTML } from '../prints.js';
import { Accounts, Journals, ACCOUNT_TYPE_LABELS } from '../ledger.js';
import {
    todayJalali, addJalaliDays, jalaliMonthStart, formatJalali, formatNumber, formatMoney,
    escapeHTML, toFa, sum, downloadCSV, formatPercent
} from '../utils.js';

const GREEN = '#16a34a';
const RED = '#dc2626';

const REF_LABELS = {
    manual: 'دستی', trip: 'سفر', subscriberPayment: 'دریافت از مشترک',
    driverPayment: 'تسویهٔ راننده', expense: 'هزینه', opening: 'افتتاحیه'
};

const REF_CLASS = {
    manual: 'status-subscription', trip: 'status-completed', subscriberPayment: 'status-paid',
    driverPayment: 'status-inprogress', expense: 'status-cancelled', opening: 'status-pending'
};

function typeBadge(type) {
    const tone = { asset: 'avail-busy', liability: 'status-cancelled', equity: 'status-subscription', income: 'status-paid', expense: 'status-inactive' }[type] || '';
    return `<span class="status-badge ${tone}">${ACCOUNT_TYPE_LABELS[type] || type}</span>`;
}

function balancedBadge(ok) {
    return ok
        ? `<span class="status-badge status-active">${icon('check')} متوازن</span>`
        : `<span class="status-badge status-cancelled">${icon('alert-triangle')} نامتوازن</span>`;
}

/* ============================== دفتر روزنامه ============================== */

const journal = {
    id: 'journal',
    title: 'دفتر روزنامه',

    render(view) {
        let from = jalaliMonthStart(todayJalali());
        let to = todayJalali();

        view.innerHTML = `
        <section class="page-section active">
          ${pageHeader({
            title: 'دفتر روزنامه', iconName: 'book',
            subtitle: 'هر سند با جمع بدهکار = جمع بستانکار ثبت می‌شود. اسناد سفرها، دریافت‌ها، تسویه‌ها و هزینه‌ها خودکار ساخته می‌شوند و سند دستی هم می‌توانید ثبت کنید.',
            actions: `
              <button class="btn btn-outline btn-sm" type="button" data-backfill>${icon('refresh')} تولید اسناد از دادهٔ موجود</button>
              <button class="btn btn-outline btn-sm" type="button" data-print>${icon('printer')} چاپ فهرست</button>
              <button class="btn btn-gold btn-sm" type="button" data-new>${icon('plus')} سند دستی جدید</button>`
        })}

          <div class="card mb-16">
            <div class="form-row-3">
              <div class="form-group">
                <label class="form-label">از تاریخ</label>
                <input class="form-input jalali-date" id="jvFrom" data-key="${from}" value="${formatJalali(from)}">
              </div>
              <div class="form-group">
                <label class="form-label">تا تاریخ</label>
                <input class="form-input jalali-date" id="jvTo" data-key="${to}" value="${formatJalali(to)}">
              </div>
              <div class="form-group">
                <label class="form-label">نوع سند</label>
                <select class="form-select" id="jvRef">
                  <option value="">همه اسناد</option>
                  ${Object.entries(REF_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="flex gap-8 flex-wrap">
              <button class="btn btn-outline btn-sm" type="button" data-quick="month">ماه جاری</button>
              <button class="btn btn-outline btn-sm" type="button" data-quick="prev">ماه گذشته</button>
              <button class="btn btn-outline btn-sm" type="button" data-quick="year">سال جاری</button>
              <button class="btn btn-outline btn-sm" type="button" data-quick="all">کل دوره</button>
            </div>
          </div>

          <div class="kpi-tiles mb-16" id="jvKpis"></div>
          <div class="card"><div id="journalTable"></div></div>
        </section>`;

        const root = view.querySelector('.page-section');
        const host = root.querySelector('#journalTable');

        const rowsFor = () => {
            const ref = root.querySelector('#jvRef').value;
            return Journals.all().filter((j) =>
                (!from || j.date >= from) && (!to || j.date <= to) && (!ref || j.refType === ref));
        };

        const renderKpis = () => {
            const rows = rowsFor();
            const debit = sum(rows, (j) => Journals.totals(j.lines).debit);
            const credit = sum(rows, (j) => Journals.totals(j.lines).credit);
            const auto = rows.filter((j) => j.auto).length;
            root.querySelector('#jvKpis').innerHTML = `
              ${kpi({ label: 'تعداد اسناد', value: formatNumber(rows.length), iconName: 'book' })}
              ${kpi({ label: 'جمع بدهکار', value: formatMoney(debit), iconName: 'arrow-up' })}
              ${kpi({ label: 'جمع بستانکار', value: formatMoney(credit), iconName: 'arrow-down' })}
              ${kpi({ label: 'وضعیت تراز', value: debit === credit ? 'متوازن' : 'نامتوازن', iconName: 'check', color: debit === credit ? GREEN : RED })}
              ${kpi({ label: 'اسناد خودکار', value: formatNumber(auto), iconName: 'refresh' })}`;
        };

        const tableCfg = () => ({
            key: 'journal-table',
            columns: [
                { key: 'number', label: 'شماره', sortable: true, render: (j) => `<b dir="ltr">${escapeHTML(j.number)}</b>` },
                { key: 'date', label: 'تاریخ', sortable: true, render: (j) => formatJalali(j.date) },
                { key: 'description', label: 'شرح', sortable: true, render: (j) => escapeHTML(j.description) },
                {
                    key: 'refType', label: 'منبع', sortable: true,
                    render: (j) => `<span class="status-badge ${REF_CLASS[j.refType] || ''}">${REF_LABELS[j.refType] || j.refType}</span>`
                },
                {
                    key: 'debit', label: 'بدهکار', sortable: false, align: 'center',
                    render: (j) => formatNumber(Journals.totals(j.lines).debit)
                },
                {
                    key: 'credit', label: 'بستانکار', sortable: false, align: 'center',
                    render: (j) => formatNumber(Journals.totals(j.lines).credit)
                },
                {
                    key: 'actions', label: 'عملیات', sortable: false, align: 'center',
                    render: (j) => `
                      <button class="btn-icon" data-view="${j.id}" title="مشاهدهٔ سند">${icon('eye')}</button>
                      <button class="btn-icon danger" data-del="${j.id}" title="حذف سند">${icon('trash')}</button>`
                }
            ],
            rows: rowsFor(),
            search: { keys: ['number', 'description', 'refType'] },
            pageSize: 10,
            initialSort: { key: 'date', dir: 'desc' },
            csv: { filename: `journal-${todayJalali()}` },
            emptyText: 'در این بازه سندی ثبت نشده است. با دکمهٔ «تولید اسناد از دادهٔ موجود» اسناد سفرها و پرداخت‌ها ساخته می‌شود.',
            emptyIcon: 'book'
        });

        const refresh = () => {
            renderKpis();
            renderTable(host, tableCfg());
        };

        const readRange = () => {
            from = root.querySelector('#jvFrom').dataset.key || '';
            to = root.querySelector('#jvTo').dataset.key || '';
            refresh();
        };

        root.querySelector('#jvFrom').addEventListener('change', readRange);
        root.querySelector('#jvTo').addEventListener('change', readRange);
        root.querySelector('#jvRef').addEventListener('change', refresh);

        root.querySelectorAll('[data-quick]').forEach((b) => b.addEventListener('click', () => {
            const q = b.dataset.quick;
            const today = todayJalali();
            if (q === 'month') { from = jalaliMonthStart(today); to = today; }
            else if (q === 'prev') {
                const firstPrev = jalaliMonthStart(addJalaliDays(jalaliMonthStart(today), -1));
                from = firstPrev; to = addJalaliDays(jalaliMonthStart(today), -1);
            } else if (q === 'year') { from = today.slice(0, 4) + '-01-01'; to = today; }
            else { from = ''; to = ''; }
            root.querySelector('#jvFrom').dataset.key = from;
            root.querySelector('#jvFrom').value = from ? formatJalali(from) : '';
            root.querySelector('#jvTo').dataset.key = to;
            root.querySelector('#jvTo').value = to ? formatJalali(to) : '';
            refresh();
        }));

        root.querySelector('[data-new]').addEventListener('click', () => openVoucherModal(refresh));

        root.querySelector('[data-backfill]').addEventListener('click', async () => {
            const cov = Journals.coverage();
            const pending = (cov.trips.total - cov.trips.posted) + (cov.subscriberPayments.total - cov.subscriberPayments.posted)
                + (cov.driverPayments.total - cov.driverPayments.posted) + (cov.expenses.total - cov.expenses.posted);
            if (!pending) { Toast.info('همهٔ رکوردها سند حسابداری دارند'); return; }
            const ok = await Modal.confirm({
                title: 'تولید اسناد حسابداری',
                message: `${toFa(pending)} رکورد بدون سند وجود دارد (سفرهای تکمیل‌شده، دریافت‌ها، تسویه‌ها و هزینه‌ها). اسناد متوازن برای آن‌ها ساخته شود؟`,
                okText: 'تولید اسناد'
            });
            if (!ok) return;
            try {
                const created = Journals.backfill();
                const n = sum(Object.values(created), (v) => v);
                Toast.success(`${toFa(n)} سند حسابداری ساخته شد`);
                refresh();
            } catch (err) { toastError(err); }
        });

        root.querySelector('[data-print]').addEventListener('click', () => {
            const rows = rowsFor();
            previewPrint(analysisReportHTML({
                title: 'دفتر روزنامه',
                subtitle: `بازه: ${from ? formatJalali(from) : 'ابتدا'} تا ${to ? formatJalali(to) : 'اکنون'}`,
                kpis: [
                    { label: 'تعداد اسناد', value: formatNumber(rows.length) },
                    { label: 'جمع بدهکار', value: formatMoney(sum(rows, (j) => Journals.totals(j.lines).debit)) },
                    { label: 'جمع بستانکار', value: formatMoney(sum(rows, (j) => Journals.totals(j.lines).credit)) }
                ],
                tables: [{
                    title: 'اسناد حسابداری',
                    headers: ['شماره', 'تاریخ', 'شرح', 'منبع', 'بدهکار', 'بستانکار'],
                    rows: rows.map((j) => [
                        escapeHTML(j.number), formatJalali(j.date), escapeHTML(j.description),
                        REF_LABELS[j.refType] || j.refType,
                        formatNumber(Journals.totals(j.lines).debit), formatNumber(Journals.totals(j.lines).credit)
                    ])
                }]
            }), { title: 'دفتر روزنامه', filename: `journal-${todayJalali()}` });
        });

        host.addEventListener('click', async (e) => {
            const v = e.target.closest('[data-view]');
            if (v) { showVoucher(v.dataset.view); return; }
            const d = e.target.closest('[data-del]');
            if (!d) return;
            const j = Journals.get(d.dataset.del);
            if (!j) return;
            const ok = await Modal.confirm({
                title: 'حذف سند',
                message: `${j.auto ? 'این سند به‌صورت خودکار از دادهٔ عملیاتی ساخته شده است. ' : ''}سند «${escapeHTML(j.number)}» حذف شود؟ سند حذف‌شده در گزارش تغییرات باقی می‌ماند.`,
                danger: true, okText: 'حذف'
            });
            if (!ok) return;
            try {
                Journals.remove(j.id);
                Toast.success('سند حذف شد');
                refresh();
            } catch (err) { toastError(err); }
        });

        refresh();
    }
};

/** مودال ثبت سند دستی با سطرهای پویا */
function openVoucherModal(onDone) {
    const accounts = Accounts.active();
    if (!accounts.length) { Toast.error('ابتدا کدینگ حساب‌ها را تعریف کنید'); return; }

    const accountOptions = (selected = '') => accounts.map((a) =>
        `<option value="${a.code}" ${a.code === selected ? 'selected' : ''}>${escapeHTML(a.code)} — ${escapeHTML(a.name)}</option>`).join('');

    const lineRow = (l = {}) => `
      <div class="line-row" data-line>
        <div class="form-group">
          <label class="form-label">حساب</label>
          <select class="form-select" data-field="accountCode">${accountOptions(l.accountCode || accounts[0].code)}</select>
        </div>
        <div class="form-group">
          <label class="form-label">بدهکار (تومان)</label>
          <input class="form-input" type="number" min="0" step="1" data-field="debit" value="${l.debit || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">بستانکار (تومان)</label>
          <input class="form-input" type="number" min="0" step="1" data-field="credit" value="${l.credit || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">شرح سطر</label>
          <input class="form-input" type="text" data-field="description" value="${escapeHTML(l.description || '')}">
        </div>
        <button class="btn-icon danger" type="button" data-remove-line title="حذف سطر">${icon('trash')}</button>
      </div>`;

    const body = `
      <div class="form-row-3">
        <div class="form-group">
          <label class="form-label">تاریخ سند</label>
          <input class="form-input jalali-date" id="vDate" data-key="${todayJalali()}" value="${formatJalali(todayJalali())}">
        </div>
        <div class="form-group">
          <label class="form-label">شرح سند</label>
          <input class="form-input" id="vDesc" placeholder="مثلاً: پرداخت اجارهٔ دفتر">
        </div>
        <div class="form-group">
          <label class="form-label">مرجع</label>
          <input class="form-input" id="vRef" placeholder="شمارهٔ فاکتور/قرارداد (اختیاری)">
        </div>
      </div>
      <div class="soft-box mb-10">${icon('info')} قاعدهٔ حسابداری دوطرفه: جمع ستون بدهکار باید برابر جمع ستون بستانکار باشد. برای هر سطر فقط یکی از دو ستون را پر کنید.</div>
      <div class="journal-lines" id="vLines">${lineRow({})}${lineRow({})}</div>
      <div class="flex gap-8 items-center justify-between mt-10">
        <button class="btn btn-outline btn-sm" type="button" id="vAddLine">${icon('plus')} افزودن سطر</button>
        <div class="text-bold" id="vTotals"></div>
      </div>`;

    Modal.open({
        title: 'ثبت سند حسابداری دستی',
        iconName: 'book',
        size: 'lg',
        body,
        footer: `<button class="btn btn-outline" type="button" data-modal-close>انصراف</button>
                 <button class="btn btn-gold" type="button" id="vSave">${icon('save')} ثبت سند</button>`,
        onMount: (node) => {
            const linesBox = node.querySelector('#vLines');
            const totalsBox = node.querySelector('#vTotals');

            const readLines = () => Array.from(linesBox.querySelectorAll('[data-line]')).map((row) => ({
                accountCode: row.querySelector('[data-field="accountCode"]').value,
                debit: Number(row.querySelector('[data-field="debit"]').value) || 0,
                credit: Number(row.querySelector('[data-field="credit"]').value) || 0,
                description: row.querySelector('[data-field="description"]').value.trim()
            }));

            const refreshTotals = () => {
                const t = Journals.totals(readLines());
                const diff = t.debit - t.credit;
                totalsBox.innerHTML = `جمع بدهکار: ${formatNumber(t.debit)} · جمع بستانکار: ${formatNumber(t.credit)}
                  ${diff === 0 ? balancedBadge(true) : `<span class="status-badge status-pending">اختلاف: ${formatNumber(Math.abs(diff))}</span>`}`;
            };

            linesBox.addEventListener('input', refreshTotals);
            linesBox.addEventListener('click', (e) => {
                const rm = e.target.closest('[data-remove-line]');
                if (!rm) return;
                if (linesBox.querySelectorAll('[data-line]').length <= 2) { Toast.warning('سند باید حداقل دو سطر داشته باشد'); return; }
                rm.closest('[data-line]').remove();
                refreshTotals();
            });
            node.querySelector('#vAddLine').addEventListener('click', () => {
                linesBox.insertAdjacentHTML('beforeend', lineRow({}));
                refreshTotals();
            });
            node.querySelector('#vSave').addEventListener('click', () => {
                try {
                    const date = node.querySelector('#vDate').dataset.key || todayJalali();
                    const desc = node.querySelector('#vDesc').value.trim();
                    if (!desc) throw new Error('شرح سند الزامی است');
                    const extraRef = node.querySelector('#vRef').value.trim();
                    const j = Journals.create({
                        date,
                        description: extraRef ? `${desc} — مرجع: ${extraRef}` : desc,
                        lines: readLines(),
                        refType: 'manual'
                    });
                    Toast.success(`سند ${j.number} ثبت شد`);
                    Modal.close();
                    onDone?.();
                } catch (err) { toastError(err); }
            });
            refreshTotals();
        }
    });
}

/** نمایش سند در مودال */
function showVoucher(id) {
    const j = Journals.get(id);
    if (!j) { toastError(new Error('سند یافت نشد')); return; }
    const t = Journals.totals(j.lines);
    const body = `
      <div class="grid-2 mb-14">
        <div><div class="hint">شمارهٔ سند</div><div class="text-bold" dir="ltr">${escapeHTML(j.number)}</div></div>
        <div><div class="hint">تاریخ</div><div class="text-bold">${formatJalali(j.date)}</div></div>
        <div><div class="hint">منبع</div><div>${REF_LABELS[j.refType] || j.refType}${j.auto ? ' (خودکار)' : ''}</div></div>
        <div><div class="hint">وضعیت</div><div>${balancedBadge(t.debit === t.credit)}</div></div>
      </div>
      <div class="soft-box mb-10">${escapeHTML(j.description)}</div>
      <div class="table-wrap"><table class="mini-table">
        <thead><tr><th>حساب</th><th>شرح سطر</th><th>بدهکار</th><th>بستانکار</th></tr></thead>
        <tbody>
          ${j.lines.map((l) => `<tr>
            <td><span dir="ltr">${escapeHTML(l.accountCode)}</span> — ${escapeHTML(l.accountName || '')}</td>
            <td>${escapeHTML(l.description || '')}</td>
            <td>${l.debit ? formatNumber(l.debit) : '—'}</td>
            <td>${l.credit ? formatNumber(l.credit) : '—'}</td>
          </tr>`).join('')}
          <tr class="total-row"><td colspan="2">جمع</td><td>${formatNumber(t.debit)}</td><td>${formatNumber(t.credit)}</td></tr>
        </tbody>
      </table></div>`;

    Modal.open({
        title: 'سند حسابداری',
        iconName: 'book',
        size: 'lg',
        body,
        footer: `<button class="btn btn-outline" type="button" data-modal-close>بستن</button>
                 <button class="btn btn-gold" type="button" id="vPrint">${icon('printer')} چاپ سند</button>`,
        onMount: (node) => {
            node.querySelector('#vPrint').addEventListener('click', () => {
                previewPrint(analysisReportHTML({
                    title: `سند حسابداری ${j.number}`,
                    subtitle: `${formatJalali(j.date)} — ${escapeHTML(j.description)}`,
                    kpis: [
                        { label: 'جمع بدهکار', value: formatMoney(t.debit) },
                        { label: 'جمع بستانکار', value: formatMoney(t.credit) }
                    ],
                    tables: [{
                        title: 'سطرهای سند',
                        headers: ['کد حساب', 'نام حساب', 'شرح', 'بدهکار', 'بستانکار'],
                        rows: j.lines.map((l) => [l.accountCode, escapeHTML(l.accountName || ''), escapeHTML(l.description || ''),
                            l.debit ? formatNumber(l.debit) : '—', l.credit ? formatNumber(l.credit) : '—'])
                    }]
                }), { title: j.number, filename: j.number });
            });
        }
    });
}

/* ============================== کدینگ حساب‌ها ============================== */

const chart = {
    id: 'chart',
    title: 'کدینگ حساب‌ها',

    render(view) {
        view.innerHTML = `
        <section class="page-section active">
          ${pageHeader({
            title: 'کدینگ حساب‌ها', iconName: 'list',
            subtitle: 'ساختار حساب‌های آژانس بر پایهٔ استاندارد حسابداری: دارایی، بدهی، سرمایه، درآمد و هزینه. اسناد خودکار به این کدها متصل‌اند.',
            actions: `<button class="btn btn-gold btn-sm" type="button" data-new>${icon('plus')} حساب جدید</button>`
        })}
          <div class="kpi-tiles mb-16" id="chKpis"></div>
          <div class="card"><div id="chartTable"></div></div>
        </section>`;

        const root = view.querySelector('.page-section');
        const host = root.querySelector('#chartTable');

        const renderKpis = () => {
            const rows = Accounts.all();
            root.querySelector('#chKpis').innerHTML = ['asset', 'liability', 'equity', 'income', 'expense'].map((t) =>
                kpi({ label: `حساب‌های ${ACCOUNT_TYPE_LABELS[t]}`, value: formatNumber(rows.filter((a) => a.type === t).length), iconName: 'list' })).join('');
        };

        const cfg = () => ({
            key: 'chart-table',
            columns: [
                { key: 'code', label: 'کد', sortable: true, render: (a) => `<b dir="ltr">${escapeHTML(a.code)}</b>` },
                { key: 'name', label: 'نام حساب', sortable: true, render: (a) => escapeHTML(a.name) },
                { key: 'type', label: 'نوع', sortable: true, render: (a) => typeBadge(a.type) },
                { key: 'group', label: 'گروه', sortable: true, render: (a) => escapeHTML(a.group || '—') },
                {
                    key: 'balance', label: 'مانده', sortable: false, align: 'center',
                    render: (a) => {
                        const b = Accounts.balance(a.code);
                        const sign = b.balance === 0 ? '' : (b.balance > 0 ? 'بدهکار' : 'بستانکار');
                        return `${formatNumber(Math.abs(b.balance))} ${sign ? `<span class="balance-tag">${sign}</span>` : ''}`;
                    }
                },
                {
                    key: 'usage', label: 'تعداد کاربرد', sortable: false, align: 'center',
                    render: (a) => toFa(Accounts.usage(a.code))
                },
                {
                    key: 'status', label: 'وضعیت', sortable: true,
                    render: (a) => a.isActive === false
                        ? '<span class="status-badge status-inactive">غیرفعال</span>'
                        : '<span class="status-badge status-active">فعال</span>'
                },
                {
                    key: 'actions', label: 'عملیات', sortable: false, align: 'center',
                    render: (a) => `
                      <button class="btn-icon edit" data-edit="${a.id}" title="ویرایش">${icon('pencil')}</button>
                      <button class="btn-icon" data-toggle="${a.id}" title="${a.isActive === false ? 'فعال‌سازی' : 'غیرفعال‌سازی'}">${icon(a.isActive === false ? 'check' : 'x-circle')}</button>
                      <button class="btn-icon danger" data-del="${a.id}" title="حذف">${icon('trash')}</button>`
                }
            ],
            rows: Accounts.all(),
            search: { keys: ['code', 'name', 'group'] },
            pageSize: 25,
            initialSort: { key: 'code', dir: 'asc' },
            csv: { filename: `chart-of-accounts-${todayJalali()}` },
            emptyText: 'حسابی ثبت نشده است',
            emptyIcon: 'list'
        });

        const refresh = () => { renderKpis(); renderTable(host, cfg()); };

        root.querySelector('[data-new]').addEventListener('click', () => openAccountForm(null, refresh));

        host.addEventListener('click', async (e) => {
            const ed = e.target.closest('[data-edit]');
            if (ed) { openAccountForm(ed.dataset.edit, refresh); return; }
            const tg = e.target.closest('[data-toggle]');
            if (tg) {
                const a = DB.get('accounts', tg.dataset.toggle);
                try {
                    Accounts.update(a.id, { isActive: a.isActive === false });
                    Toast.success('وضعیت حساب تغییر کرد');
                    refresh();
                } catch (err) { toastError(err); }
                return;
            }
            const del = e.target.closest('[data-del]');
            if (!del) return;
            const a = DB.get('accounts', del.dataset.del);
            const ok = await Modal.confirm({ title: 'حذف حساب', message: `حساب «${escapeHTML(a.code)} — ${escapeHTML(a.name)}» حذف شود؟`, danger: true, okText: 'حذف' });
            if (!ok) return;
            try {
                Accounts.remove(a.id);
                Toast.success('حساب حذف شد');
                refresh();
            } catch (err) { toastError(err); }
        });

        refresh();
    }
};

function openAccountForm(id, onDone) {
    const a = id ? DB.get('accounts', id) : null;
    openForm({
        title: a ? `ویرایش حساب ${a.code}` : 'حساب جدید',
        values: { code: a?.code || '', name: a?.name || '', type: a?.type || 'expense', group: a?.group || '', notes: a?.notes || '' },
        fields: [
            { name: 'code', label: 'کد حساب (۳ تا ۶ رقم)', type: 'text', required: true, disabled: !!a },
            { name: 'name', label: 'نام حساب', type: 'text', required: true },
            {
                name: 'type', label: 'نوع حساب', type: 'select', required: true,
                options: Object.entries(ACCOUNT_TYPE_LABELS).map(([k, v]) => ({ value: k, label: v })),
                placeholder: false
            },
            { name: 'group', label: 'گروه (اختیاری)', type: 'text' },
            { name: 'notes', label: 'توضیحات', type: 'textarea', col: 3 }
        ],
        submitText: a ? 'ذخیره' : 'ثبت حساب',
        onSubmit: (v) => {
            if (a) Accounts.update(id, { name: v.name, type: v.type, group: v.group, notes: v.notes });
            else Accounts.create(v);
            Toast.success(a ? 'حساب ویرایش شد' : 'حساب ثبت شد');
            onDone?.();
        }
    });
}

/* ============================== تراز آزمایشی ============================== */

const trial = {
    id: 'trial',
    title: 'تراز آزمایشی',

    render(view) {
        let from = jalaliMonthStart(todayJalali());
        let to = todayJalali();

        view.innerHTML = `
        <section class="page-section active">
          ${pageHeader({
            title: 'تراز آزمایشی', iconName: 'bar-chart',
            subtitle: 'ماندهٔ بدهکار و بستانکار همهٔ حساب‌ها در بازهٔ انتخابی. برابری دو ستون، نشانهٔ درستی اسناد است.',
            actions: `
              <button class="btn btn-outline btn-sm" type="button" data-print>${icon('printer')} چاپ تراز</button>
              <button class="btn btn-outline btn-sm" type="button" data-csv>${icon('file-csv')} خروجی CSV</button>`
        })}
          <div class="card mb-16">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">از تاریخ</label>
                <input class="form-input jalali-date" id="tbFrom" data-key="${from}" value="${formatJalali(from)}">
              </div>
              <div class="form-group">
                <label class="form-label">تا تاریخ</label>
                <input class="form-input jalali-date" id="tbTo" data-key="${to}" value="${formatJalali(to)}">
              </div>
            </div>
          </div>
          <div class="kpi-tiles mb-16" id="tbKpis"></div>
          <div class="card"><div id="trialTable"></div></div>
        </section>`;

        const root = view.querySelector('.page-section');
        const host = root.querySelector('#trialTable');

        const data = () => Journals.trialBalance({ from, to });

        const refresh = () => {
            const tb = data();
            root.querySelector('#tbKpis').innerHTML = `
              ${kpi({ label: 'جمع بدهکار', value: formatMoney(tb.totalDebit), iconName: 'arrow-up' })}
              ${kpi({ label: 'جمع بستانکار', value: formatMoney(tb.totalCredit), iconName: 'arrow-down' })}
              ${kpi({ label: 'وضعیت', value: tb.balanced ? 'متوازن' : 'نامتوازن', iconName: 'check', color: tb.balanced ? GREEN : RED })}
              ${kpi({ label: 'تعداد حساب‌های دارای گردش', value: formatNumber(tb.rows.length), iconName: 'list' })}`;
            renderTable(host, {
                key: 'trial-table',
                columns: [
                    { key: 'code', label: 'کد', sortable: true, render: (r) => `<b dir="ltr">${escapeHTML(r.code)}</b>` },
                    { key: 'name', label: 'نام حساب', sortable: true, render: (r) => escapeHTML(r.name) },
                    { key: 'type', label: 'نوع', sortable: true, render: (r) => typeBadge(r.type) },
                    { key: 'debit', label: 'بدهکار', sortable: true, align: 'center', render: (r) => r.debit ? formatNumber(r.debit) : '—' },
                    { key: 'credit', label: 'بستانکار', sortable: true, align: 'center', render: (r) => r.credit ? formatNumber(r.credit) : '—' },
                    {
                        key: 'balance', label: 'مانده', sortable: true, align: 'center',
                        render: (r) => `${formatNumber(Math.abs(r.balance))} <span class="balance-tag">${r.balance === 0 ? 'صفر' : (r.balance > 0 ? 'بدهکار' : 'بستانکار')}</span>`
                    }
                ],
                rows: tb.rows,
                pageSize: 25,
                initialSort: { key: 'code', dir: 'asc' },
                footer: `<tr class="total-row"><td colspan="3">جمع کل</td><td>${formatNumber(tb.totalDebit)}</td><td>${formatNumber(tb.totalCredit)}</td><td>${tb.balanced ? 'متوازن' : 'اختلاف'}</td></tr>`,
                emptyText: 'در این بازه گردشی ثبت نشده است',
                emptyIcon: 'bar-chart'
            });
        };

        const readRange = () => {
            from = root.querySelector('#tbFrom').dataset.key || '';
            to = root.querySelector('#tbTo').dataset.key || '';
            refresh();
        };
        root.querySelector('#tbFrom').addEventListener('change', readRange);
        root.querySelector('#tbTo').addEventListener('change', readRange);

        root.querySelector('[data-print]').addEventListener('click', () => {
            const tb = data();
            previewPrint(analysisReportHTML({
                title: 'تراز آزمایشی',
                subtitle: `بازه: ${from ? formatJalali(from) : 'ابتدا'} تا ${to ? formatJalali(to) : 'اکنون'}`,
                kpis: [
                    { label: 'جمع بدهکار', value: formatMoney(tb.totalDebit) },
                    { label: 'جمع بستانکار', value: formatMoney(tb.totalCredit) },
                    { label: 'وضعیت', value: tb.balanced ? 'متوازن' : 'نامتوازن' }
                ],
                tables: [{
                    title: 'مانده حساب‌ها',
                    headers: ['کد', 'نام حساب', 'نوع', 'بدهکار', 'بستانکار', 'مانده'],
                    rows: tb.rows.map((r) => [r.code, escapeHTML(r.name), ACCOUNT_TYPE_LABELS[r.type] || r.type,
                        r.debit ? formatNumber(r.debit) : '—', r.credit ? formatNumber(r.credit) : '—',
                        `${formatNumber(Math.abs(r.balance))} ${r.balance > 0 ? 'بدهکار' : r.balance < 0 ? 'بستانکار' : ''}`])
                }]
            }), { title: 'تراز آزمایشی', filename: `trial-balance-${todayJalali()}` });
        });

        root.querySelector('[data-csv]').addEventListener('click', () => {
            const tb = data();
            downloadCSV(`trial-balance-${todayJalali()}`, [
                ['کد', 'نام حساب', 'نوع', 'بدهکار', 'بستانکار', 'مانده'],
                ...tb.rows.map((r) => [r.code, r.name, ACCOUNT_TYPE_LABELS[r.type] || r.type, r.debit, r.credit, r.balance])
            ]);
            Toast.success('خروجی CSV آماده شد');
        });

        refresh();
    }
};

/* ============================= صورت سود و زیان ============================= */

const pl = {
    id: 'pl',
    title: 'صورت سود و زیان',

    render(view) {
        let from = jalaliMonthStart(todayJalali());
        let to = todayJalali();

        view.innerHTML = `
        <section class="page-section active">
          ${pageHeader({
            title: 'صورت سود و زیان', iconName: 'activity',
            subtitle: 'درآمدها و هزینه‌های دوره بر پایهٔ اسناد حسابداری. مقایسه با دورهٔ قبل به شما می‌گوید سود آژانس بهتر شده یا نه.',
            actions: `
              <button class="btn btn-outline btn-sm" type="button" data-print>${icon('printer')} چاپ صورت مالی</button>`
        })}
          <div class="card mb-16">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">از تاریخ</label>
                <input class="form-input jalali-date" id="plFrom" data-key="${from}" value="${formatJalali(from)}">
              </div>
              <div class="form-group">
                <label class="form-label">تا تاریخ</label>
                <input class="form-input jalali-date" id="plTo" data-key="${to}" value="${formatJalali(to)}">
              </div>
            </div>
          </div>
          <div class="kpi-tiles mb-16" id="plKpis"></div>
          <div class="grid-2 mb-16">
            <div class="card"><h3 class="card-title">${icon('arrow-up')} درآمدها</h3><div id="plIncome"></div></div>
            <div class="card"><h3 class="card-title">${icon('arrow-down')} هزینه‌ها</h3><div id="plExpense"></div></div>
          </div>
          <div class="card mb-16"><h3 class="card-title">${icon('bar-chart')} مقایسهٔ دوره‌ای</h3><div class="chart-box" data-chart="plCompare"></div></div>
          <div class="card"><h3 class="card-title">${icon('info')} یادداشت‌های مدیریتی</h3><div id="plNotes"></div></div>
        </section>`;

        const root = view.querySelector('.page-section');

        const periodDays = () => {
            if (!from || !to) return 30;
            const d = (new Date(to) - new Date(from)) / 86400000;
            return Math.max(1, Math.round(d) + 1);
        };

        const refresh = () => {
            const current = Journals.incomeStatement({ from, to });
            const prevFrom = addJalaliDays(from || jalaliMonthStart(todayJalali()), -periodDays());
            const prevTo = addJalaliDays(from || jalaliMonthStart(todayJalali()), -1);
            const prev = Journals.incomeStatement({ from: prevFrom, to: prevTo });
            const margin = current.totalIncome ? (current.profit / current.totalIncome) * 100 : 0;
            const growth = prev.profit !== 0 ? ((current.profit - prev.profit) / Math.abs(prev.profit)) * 100 : null;

            root.querySelector('#plKpis').innerHTML = `
              ${kpi({ label: 'جمع درآمد', value: formatMoney(current.totalIncome), iconName: 'arrow-up' })}
              ${kpi({ label: 'جمع هزینه', value: formatMoney(current.totalExpense), iconName: 'arrow-down' })}
              ${kpi({ label: current.profit >= 0 ? 'سود دوره' : 'زیان دوره', value: formatMoney(Math.abs(current.profit)), iconName: 'wallet', color: current.profit >= 0 ? GREEN : RED })}
              ${kpi({ label: 'حاشیهٔ سود', value: formatPercent(margin), iconName: 'percent' })}
              ${kpi({ label: 'رشد نسبت به دورهٔ قبل', value: growth === null ? '—' : formatPercent(growth), iconName: 'activity', color: growth >= 0 ? GREEN : RED })}`;

            const tableHTML = (rows, emptyText) => rows.length
                ? `<div class="table-wrap"><table class="mini-table">
                     <thead><tr><th>کد</th><th>عنوان</th><th>مبلغ (تومان)</th></tr></thead>
                     <tbody>${rows.map((r) => `<tr><td dir="ltr">${escapeHTML(r.code)}</td><td>${escapeHTML(r.name)}</td><td class="num">${formatNumber(r.amount)}</td></tr>`).join('')}
                     <tr class="total-row"><td colspan="2">جمع</td><td class="num">${formatNumber(sum(rows, (r) => r.amount))}</td></tr></tbody>
                   </table></div>`
                : `<div class="empty-state">${escapeHTML(emptyText)}</div>`;

            root.querySelector('#plIncome').innerHTML = tableHTML(current.incomes, 'درآمدی در این بازه ثبت نشده است');
            root.querySelector('#plExpense').innerHTML = tableHTML(current.expenses, 'هزینه‌ای در این بازه ثبت نشده است');

            Charts.bar(root.querySelector('[data-chart="plCompare"]'), {
                labels: ['درآمد دورهٔ قبل', 'درآمد این دوره', 'هزینهٔ دورهٔ قبل', 'هزینهٔ این دوره'],
                data: [prev.totalIncome, current.totalIncome, prev.totalExpense, current.totalExpense],
                color: '#D4AF37',
                emptyText: 'داده‌ای برای مقایسه وجود ندارد'
            });

            const topExpense = current.expenses.slice().sort((a, b) => b.amount - a.amount)[0];
            const coverage = Journals.coverage();
            const missing = (coverage.trips.total - coverage.trips.posted) + (coverage.expenses.total - coverage.expenses.posted)
                + (coverage.subscriberPayments.total - coverage.subscriberPayments.posted) + (coverage.driverPayments.total - coverage.driverPayments.posted);
            root.querySelector('#plNotes').innerHTML = `
              <div class="soft-box mb-10">${icon('info')} بیشترین هزینهٔ دوره: <b>${topExpense ? `${escapeHTML(topExpense.name)} (${formatMoney(topExpense.amount)})` : '—'}</b></div>
              <div class="soft-box mb-10">${icon('info')} میانگین سود روزانه دوره: <b>${formatMoney(Math.round(current.profit / periodDays()))}</b></div>
              ${missing ? `<div class="alert-row warn">${icon('alert-triangle')} ${toFa(missing)} رکورد عملیاتی هنوز سند حسابداری ندارد؛ از «دفتر روزنامه ← تولید اسناد از دادهٔ موجود» استفاده کنید.</div>`
                : `<div class="alert-row info">${icon('check')} همهٔ رکوردهای عملیاتی سند حسابداری دارند.</div>`}`;
        };

        const readRange = () => {
            from = root.querySelector('#plFrom').dataset.key || '';
            to = root.querySelector('#plTo').dataset.key || '';
            refresh();
        };
        root.querySelector('#plFrom').addEventListener('change', readRange);
        root.querySelector('#plTo').addEventListener('change', readRange);

        root.querySelector('[data-print]').addEventListener('click', () => {
            const current = Journals.incomeStatement({ from, to });
            const bs = Journals.balanceSheet({ to });
            previewPrint(analysisReportHTML({
                title: 'صورت سود و زیان و ترازنامه',
                subtitle: `بازه: ${from ? formatJalali(from) : 'ابتدا'} تا ${to ? formatJalali(to) : 'اکنون'}`,
                kpis: [
                    { label: 'جمع درآمد', value: formatMoney(current.totalIncome) },
                    { label: 'جمع هزینه', value: formatMoney(current.totalExpense) },
                    { label: current.profit >= 0 ? 'سود' : 'زیان', value: formatMoney(Math.abs(current.profit)) },
                    { label: 'جمع دارایی‌ها', value: formatMoney(bs.totalAssets) }
                ],
                tables: [
                    {
                        title: 'درآمدها',
                        headers: ['کد', 'عنوان', 'مبلغ (تومان)'],
                        rows: current.incomes.map((r) => [r.code, escapeHTML(r.name), formatNumber(r.amount)])
                    },
                    {
                        title: 'هزینه‌ها',
                        headers: ['کد', 'عنوان', 'مبلغ (تومان)'],
                        rows: current.expenses.map((r) => [r.code, escapeHTML(r.name), formatNumber(r.amount)])
                    },
                    {
                        title: 'ترازنامه (خلاصه)',
                        headers: ['شرح', 'مبلغ (تومان)'],
                        rows: [
                            ['جمع دارایی‌ها', formatNumber(bs.totalAssets)],
                            ['جمع بدهی‌ها', formatNumber(bs.totalLiabilities)],
                            ['جمع سرمایه و سود', formatNumber(bs.totalEquity)],
                            [bs.balanced ? 'وضعیت: متوازن' : 'وضعیت: نامتوازن', '']
                        ]
                    }
                ]
            }), { title: 'صورت سود و زیان', filename: `profit-loss-${todayJalali()}` });
        });

        refresh();
    }
};

/* ================================ دفتر معین ================================ */

const accountLedger = {
    id: 'account-ledger',
    title: 'دفتر معین',

    render(view) {
        let from = jalaliMonthStart(todayJalali());
        let to = todayJalali();
        const accounts = Accounts.all();
        let code = accounts[0]?.code || '';

        view.innerHTML = `
        <section class="page-section active">
          ${pageHeader({
            title: 'دفتر معین حساب', iconName: 'list',
            subtitle: 'گردش و ماندهٔ یک حساب را سطر به سطر ببینید؛ برای پیگیری بدهی مشترکین یا حساب رانندگان بسیار کاربردی است.',
            actions: `<button class="btn btn-outline btn-sm" type="button" data-print>${icon('printer')} چاپ دفتر معین</button>`
        })}
          <div class="card mb-16">
            <div class="form-row-3">
              <div class="form-group">
                <label class="form-label">حساب</label>
                <select class="form-select" id="alAccount">
                  ${accounts.map((a) => `<option value="${a.code}" ${a.code === code ? 'selected' : ''}>${escapeHTML(a.code)} — ${escapeHTML(a.name)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">از تاریخ</label>
                <input class="form-input jalali-date" id="alFrom" data-key="${from}" value="${formatJalali(from)}">
              </div>
              <div class="form-group">
                <label class="form-label">تا تاریخ</label>
                <input class="form-input jalali-date" id="alTo" data-key="${to}" value="${formatJalali(to)}">
              </div>
            </div>
          </div>
          <div class="kpi-tiles mb-16" id="alKpis"></div>
          <div class="card"><div id="ledgerTable"></div></div>
        </section>`;

        const root = view.querySelector('.page-section');
        const host = root.querySelector('#ledgerTable');

        const data = () => Journals.accountLedger(code, { from, to });

        const refresh = () => {
            const d = data();
            root.querySelector('#alKpis').innerHTML = `
              ${kpi({ label: 'ماندهٔ ابتدای دوره', value: formatMoney(Math.abs(d.opening)), iconName: 'clock' })}
              ${kpi({ label: 'گردش بدهکار', value: formatMoney(d.totalDebit), iconName: 'arrow-up' })}
              ${kpi({ label: 'گردش بستانکار', value: formatMoney(d.totalCredit), iconName: 'arrow-down' })}
              ${kpi({ label: `ماندهٔ پایان دوره (${d.closing >= 0 ? 'بدهکار' : 'بستانکار'})`, value: formatMoney(Math.abs(d.closing)), iconName: 'wallet' })}`;
            renderTable(host, {
                key: 'ledger-table',
                columns: [
                    { key: 'date', label: 'تاریخ', sortable: true, render: (r) => formatJalali(r.date) },
                    { key: 'number', label: 'شماره سند', sortable: true, render: (r) => `<span dir="ltr">${escapeHTML(r.number)}</span>` },
                    { key: 'description', label: 'شرح', sortable: true, render: (r) => escapeHTML(r.description) },
                    { key: 'debit', label: 'بدهکار', sortable: true, align: 'center', render: (r) => r.debit ? formatNumber(r.debit) : '—' },
                    { key: 'credit', label: 'بستانکار', sortable: true, align: 'center', render: (r) => r.credit ? formatNumber(r.credit) : '—' },
                    {
                        key: 'balance', label: 'مانده', sortable: true, align: 'center',
                        render: (r) => `${formatNumber(Math.abs(r.balance))} <span class="balance-tag">${r.balance >= 0 ? 'بدهکار' : 'بستانکار'}</span>`
                    }
                ],
                rows: d.rows,
                pageSize: 25,
                initialSort: { key: 'date', dir: 'asc' },
                emptyText: 'برای این حساب در بازهٔ انتخابی گردشی ثبت نشده است',
                emptyIcon: 'list'
            });
        };

        const read = () => {
            code = root.querySelector('#alAccount').value;
            from = root.querySelector('#alFrom').dataset.key || '';
            to = root.querySelector('#alTo').dataset.key || '';
            refresh();
        };
        root.querySelector('#alAccount').addEventListener('change', read);
        root.querySelector('#alFrom').addEventListener('change', read);
        root.querySelector('#alTo').addEventListener('change', read);

        root.querySelector('[data-print]').addEventListener('click', () => {
            const d = data();
            previewPrint(analysisReportHTML({
                title: `دفتر معین ${d.account.code} — ${d.account.name}`,
                subtitle: `بازه: ${from ? formatJalali(from) : 'ابتدا'} تا ${to ? formatJalali(to) : 'اکنون'}`,
                kpis: [
                    { label: 'ماندهٔ ابتدا', value: formatMoney(Math.abs(d.opening)) },
                    { label: 'گردش بدهکار', value: formatMoney(d.totalDebit) },
                    { label: 'گردش بستانکار', value: formatMoney(d.totalCredit) },
                    { label: 'ماندهٔ پایان', value: formatMoney(Math.abs(d.closing)) }
                ],
                tables: [{
                    title: 'گردش حساب',
                    headers: ['تاریخ', 'شماره', 'شرح', 'بدهکار', 'بستانکار', 'مانده'],
                    rows: d.rows.map((r) => [formatJalali(r.date), escapeHTML(r.number), escapeHTML(r.description),
                        r.debit ? formatNumber(r.debit) : '—', r.credit ? formatNumber(r.credit) : '—', formatNumber(Math.abs(r.balance))])
                }]
            }), { title: 'دفتر معین', filename: `ledger-${d.account.code}-${todayJalali()}` });
        });

        refresh();
    }
};

export { journal, chart, trial, pl, accountLedger };
export default journal;
