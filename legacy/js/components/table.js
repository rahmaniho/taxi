/* ==========================================================================
 * js/components/table.js — جدول پیشرفته مشترک: renderTable(config)
 * --------------------------------------------------------------------------
 * امکانات: صفحه‌بندی (۱۰/۲۵/۵۰/۱۰۰)، مرتب‌سازی با کلیک روی ستون، جست‌وجوی
 * درون‌جدولی، انتخاب چندتایی و عملیات گروهی، خروجی CSV، حالت خالی، و حفظ
 * وضعیت جدول بین رندرهای مجدد (idempotent بودن render صفحات).
 * ========================================================================== */

import { icon } from './icons.js';
import { escapeHTML, toEn, toFa, formatNumber, downloadCSV } from '../utils.js';

/** وضعیت هر جدول بر اساس کلید، تا رندر مجدد صفحه، صفحه‌بندی/مرتب‌سازی را از دست ندهد */
const STATES = new Map();

export function emptyState(text = 'داده‌ای یافت نشد', iconName = 'inbox') {
    return `<div class="empty-state">${icon(iconName, 'icon-xl')}<p>${escapeHTML(text)}</p></div>`;
}

function getState(key, config) {
    if (!STATES.has(key)) {
        STATES.set(key, {
            page: 1,
            pageSize: config.pageSize || 10,
            sortKey: config.initialSort?.key || '',
            sortDir: config.initialSort?.dir || 'desc',
            query: '',
            selected: new Set()
        });
    }
    const st = STATES.get(key);
    if (config.initialSort && !st.sortKey && config.initialSort.key) st.sortKey = config.initialSort.key;
    return st;
}

export function resetTableState(key) {
    STATES.delete(key);
}

function rowId(row, config) {
    return typeof config.rowId === 'function' ? config.rowId(row) : row[config.rowId || 'id'];
}

function cellValue(row, col) {
    if (typeof col.sortValue === 'function') return col.sortValue(row);
    if (typeof col.value === 'function') return col.value(row);
    return row[col.key];
}

function matchesQuery(row, keys, query) {
    if (!query) return true;
    const q = String(query).trim().toLowerCase();
    const qDigits = toEn(q);
    const values = keys && keys.length
        ? keys.map((k) => row[k])
        : Object.values(row);
    return values.some((v) => {
        if (v === null || v === undefined) return false;
        const s = String(v).toLowerCase();
        return s.includes(q) || toEn(s).includes(qDigits);
    });
}

/**
 * رندر جدول
 * @param {HTMLElement|string} hostOrId
 * @param {object} config
 * @returns {{rows:Array, allRows:Array, state:object, total:number}}
 */
export function renderTable(hostOrId, config) {
    const host = typeof hostOrId === 'string' ? document.getElementById(hostOrId) : hostOrId;
    if (!host) {
        console.error('renderTable: میزبان جدول یافت نشد', hostOrId);
        return { rows: [], allRows: [], state: null, total: 0 };
    }
    const key = config.key || host.id || 'tbl';
    const st = getState(key, config);
    const cols = config.columns || [];

    /* --- فیلتر --- */
    const searchKeys = config.search?.keys || cols.map((c) => c.key).filter(Boolean);
    let rows = (config.rows || []).filter((r) => matchesQuery(r, searchKeys, st.query));

    /* --- فیلتر خارجی اختیاری --- */
    if (typeof config.filter === 'function') rows = rows.filter(config.filter);

    /* --- مرتب‌سازی --- */
    if (st.sortKey) {
        const col = cols.find((c) => c.key === st.sortKey);
        if (col) {
            const dir = st.sortDir === 'asc' ? 1 : -1;
            rows = [...rows].sort((a, b) => {
                const va = cellValue(a, col);
                const vb = cellValue(b, col);
                if (va === vb) return 0;
                if (va === null || va === undefined || va === '') return 1;
                if (vb === null || vb === undefined || vb === '') return -1;
                if (typeof va === 'string' || typeof vb === 'string') {
                    return String(va).localeCompare(String(vb), 'fa') * dir;
                }
                return (Number(va) - Number(vb)) * dir;
            });
        }
    }

    const total = rows.length;
    const pageSize = st.pageSize || 10;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if (st.page > pages) st.page = pages;
    if (st.page < 1) st.page = 1;
    const startIdx = (st.page - 1) * pageSize;
    const pageRows = rows.slice(startIdx, startIdx + pageSize);

    /* پاک‌سازی انتخاب‌های ناموجود */
    const existingIds = new Set(rows.map((r) => rowId(r, config)));
    [...st.selected].forEach((id) => { if (!existingIds.has(id)) st.selected.delete(id); });

    /* --- سرستون‌ها --- */
    const headCells = [];
    if (config.selectable) {
        const allSelected = pageRows.length > 0 && pageRows.every((r) => st.selected.has(rowId(r, config)));
        headCells.push(`<th style="width:38px"><input type="checkbox" class="chk" data-tbl-all ${allSelected ? 'checked' : ''} aria-label="انتخاب همه"></th>`);
    }
    cols.forEach((c) => {
        const sorted = st.sortKey === c.key;
        const cls = [c.sortable === false ? '' : 'sortable', sorted ? 'sorted' : '', c.align === 'center' ? 'text-center' : '', c.cls || ''].filter(Boolean).join(' ');
        headCells.push(`<th class="${cls}" style="${c.width ? `width:${c.width}` : ''}" ${c.sortable === false ? '' : `data-sort="${c.key}"`}>
            ${c.label || ''}${sorted ? `<span class="sort-ind">${st.sortDir === 'asc' ? '▲' : '▼'}</span>` : ''}
        </th>`);
    });

    /* --- ردیف‌ها --- */
    const bodyRows = pageRows.map((row) => {
        const id = rowId(row, config);
        const selected = st.selected.has(id);
        const tds = cols.map((c) => {
            const content = typeof c.render === 'function' ? c.render(row, { index: startIdx + pageRows.indexOf(row), state: st }) : escapeHTML(row[c.key] ?? '—');
            return `<td class="${c.align === 'center' ? 'text-center' : ''} ${c.cellCls || ''}">${content ?? ''}</td>`;
        }).join('');
        const cls = [selected ? 'row-selected' : '', typeof config.rowClass === 'function' ? config.rowClass(row) : ''].filter(Boolean).join(' ');
        return `<tr data-tbl-row="${escapeHTML(String(id))}" class="${cls}">
            ${config.selectable ? `<td><input type="checkbox" class="chk" data-tbl-select="${escapeHTML(String(id))}" ${selected ? 'checked' : ''}></td>` : ''}
            ${tds}
        </tr>`;
    }).join('');

    /* --- نوار ابزار --- */
    const showSearch = config.search !== false;
    const toolbar = `
      <div class="tbl-toolbar">
        <div style="display:flex; gap:8px; flex:1 1 200px; align-items:center; flex-wrap:wrap">
          ${showSearch ? `<input class="form-input grow" type="search" data-tbl-search value="${escapeHTML(st.query)}"
                 placeholder="${escapeHTML(config.search?.placeholder || 'جستجو...')}" style="max-width:260px">` : ''}
          ${typeof config.toolbar === 'function' ? config.toolbar(st, rows) : (config.toolbar || '')}
        </div>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap">
          ${config.csv ? `<button class="btn btn-outline btn-sm" type="button" data-tbl-csv>${icon('file-csv')} خروجی CSV</button>` : ''}
          <span class="tbl-info">${formatNumber(total)} رکورد</span>
        </div>
      </div>`;

    /* --- نوار عملیات گروهی --- */
    let bulkBar = '';
    if (config.selectable && st.selected.size > 0) {
        bulkBar = `<div class="bulk-bar">
            <span>${icon('check-check')} ${formatNumber(st.selected.size)} مورد انتخاب شده</span>
            ${(config.bulkActions || []).map((a, i) => `<button class="btn ${a.danger ? 'btn-danger' : 'btn-outline'} btn-sm" type="button" data-bulk="${i}">${a.icon ? icon(a.icon) : ''} ${escapeHTML(a.label)}</button>`).join('')}
            <button class="btn btn-sm btn-outline" type="button" data-bulk-clear>لغو انتخاب</button>
          </div>`;
    }

    /* --- صفحه‌بندی --- */
    const pageButtons = [];
    const windowSize = 5;
    let from = Math.max(1, st.page - Math.floor(windowSize / 2));
    const to = Math.min(pages, from + windowSize - 1);
    from = Math.max(1, to - windowSize + 1);
    for (let p = from; p <= to; p++) {
        pageButtons.push(`<button class="pg ${p === st.page ? 'active' : ''}" type="button" data-pg="${p}">${toFa(p)}</button>`);
    }
    const pager = pages > 1 || total > 10 ? `
      <div class="tbl-pager">
        <button class="pg" type="button" data-pg="1" ${st.page === 1 ? 'disabled' : ''} aria-label="اولین">«</button>
        <button class="pg" type="button" data-pg="${st.page - 1}" ${st.page === 1 ? 'disabled' : ''} aria-label="قبلی">${icon('chevron-right')}</button>
        ${pageButtons.join('')}
        <button class="pg" type="button" data-pg="${st.page + 1}" ${st.page === pages ? 'disabled' : ''} aria-label="بعدی">${icon('chevron-left')}</button>
        <button class="pg" type="button" data-pg="${pages}" ${st.page === pages ? 'disabled' : ''} aria-label="آخرین">»</button>
        <select class="form-select pg-size" data-pg-size aria-label="تعداد در صفحه">
          ${(config.pageSizes || [10, 25, 50, 100]).map((s) => `<option value="${s}" ${s === pageSize ? 'selected' : ''}>${toFa(s)} در صفحه</option>`).join('')}
        </select>
      </div>` : '';

    const footer = typeof config.footer === 'function' ? `<div class="divider"></div>${config.footer(pageRows, rows, st)}` : '';

    host.innerHTML = toolbar + bulkBar + (total === 0
        ? emptyState(config.emptyText || 'رکوردی یافت نشد', config.emptyIcon || 'inbox')
        : `<div class="table-wrapper">
             <table>
               <thead><tr>${headCells.join('')}</tr></thead>
               <tbody>${bodyRows}</tbody>
             </table>
           </div>${pager}${footer}`);

    /* --- اتصال رویدادها (یک‌بار برای هر میزبان) --- */
    host._tblConfig = config;
    if (!host.dataset.tblBound) {
        host.dataset.tblBound = '1';
        bindEvents(host);
    }

    return { rows: pageRows, allRows: rows, state: st, total };
}

function bindEvents(host) {
    const getCfg = () => host._tblConfig;
    const getSt = () => STATES.get(getCfg().key || host.id || 'tbl');

    host.addEventListener('click', async (e) => {
        const cfg = getCfg();
        const st = getSt();
        if (!cfg || !st) return;

        const sortTh = e.target.closest('th[data-sort]');
        if (sortTh && host.contains(sortTh)) {
            const k = sortTh.dataset.sort;
            if (st.sortKey === k) st.sortDir = st.sortDir === 'asc' ? 'desc' : 'asc';
            else { st.sortKey = k; st.sortDir = 'desc'; }
            rerender(host, cfg);
            return;
        }

        const pgBtn = e.target.closest('[data-pg]');
        if (pgBtn && !pgBtn.disabled) {
            st.page = Number(pgBtn.dataset.pg) || 1;
            rerender(host, cfg);
            return;
        }

        if (e.target.closest('[data-bulk-clear]')) {
            st.selected.clear();
            rerender(host, cfg);
            return;
        }

        const bulkBtn = e.target.closest('[data-bulk]');
        if (bulkBtn) {
            const action = (cfg.bulkActions || [])[Number(bulkBtn.dataset.bulk)];
            if (!action) return;
            const ids = [...st.selected];
            if (action.confirm) {
                const { Modal } = await import('./modal.js');
                const ok = await Modal.confirm({ title: action.label, message: action.confirm, danger: action.danger });
                if (!ok) return;
            }
            try {
                await action.onClick(ids, cfg.rows.filter((r) => ids.includes(typeof cfg.rowId === 'function' ? cfg.rowId(r) : r[cfg.rowId || 'id'])));
                st.selected.clear();
            } catch (err) {
                const { Toast } = await import('./toast.js');
                Toast.error(err?.message || 'عملیات گروهی ناموفق بود');
            }
            rerender(host, cfg);
            return;
        }

        if (e.target.closest('[data-tbl-csv]')) {
            exportCSV(cfg, st);
            return;
        }

        const rowEl = e.target.closest('tr[data-tbl-row]');
        if (rowEl && cfg.onRowClick && !e.target.closest('input,button,a,select')) {
            const id = rowEl.dataset.tblRow;
            const row = (cfg.rows || []).find((r) => String(typeof cfg.rowId === 'function' ? cfg.rowId(r) : r[cfg.rowId || 'id']) === id);
            if (row) cfg.onRowClick(row);
        }
    });

    host.addEventListener('change', (e) => {
        const cfg = getCfg();
        const st = getSt();
        if (!cfg || !st) return;

        if (e.target.matches('[data-tbl-all]')) {
            const pageIds = currentPageIds(host, cfg, st);
            if (e.target.checked) pageIds.forEach((id) => st.selected.add(id));
            else pageIds.forEach((id) => st.selected.delete(id));
            rerender(host, cfg);
            return;
        }
        if (e.target.matches('[data-tbl-select]')) {
            const id = e.target.dataset.tblSelect;
            if (e.target.checked) st.selected.add(id);
            else st.selected.delete(id);
            /* به‌روزرسانی بدون رندر کامل (حفظ فوکوس) */
            e.target.closest('tr')?.classList.toggle('row-selected', e.target.checked);
            const bar = host.querySelector('.bulk-bar');
            if (bar) rerender(host, cfg); else rerender(host, cfg);
            return;
        }
        if (e.target.matches('[data-pg-size]')) {
            st.pageSize = Number(e.target.value) || 10;
            st.page = 1;
            rerender(host, cfg);
        }
    });

    let searchTimer = null;
    host.addEventListener('input', (e) => {
        const cfg = getCfg();
        const st = getSt();
        if (!cfg || !st) return;
        if (e.target.matches('[data-tbl-search]')) {
            clearTimeout(searchTimer);
            const val = e.target.value;
            searchTimer = setTimeout(() => {
                st.query = val;
                st.page = 1;
                rerender(host, cfg, { keepFocus: 'search' });
            }, 220);
        }
    });
}

function currentPageIds(host, cfg, st) {
    const pageSize = st.pageSize || 10;
    const rows = sortAndFilter(cfg, st).slice((st.page - 1) * pageSize, (st.page - 1) * pageSize + pageSize);
    return rows.map((r) => String(typeof cfg.rowId === 'function' ? cfg.rowId(r) : r[cfg.rowId || 'id']));
}

function sortAndFilter(cfg, st) {
    let rows = [...(cfg.rows || [])];
    if (typeof cfg.filter === 'function') rows = rows.filter(cfg.filter);
    if (st.query) {
        const keys = cfg.search?.keys;
        rows = rows.filter((r) => matchesQuery(r, keys, st.query));
    }
    return rows;
}

function rerender(host, cfg, { keepFocus } = {}) {
    renderTable(host, cfg);
    if (keepFocus === 'search') {
        const input = host.querySelector('[data-tbl-search]');
        if (input) {
            input.focus();
            const len = input.value.length;
            try { input.setSelectionRange(len, len); } catch (_) { /* type=search */ }
        }
    }
}

function exportCSV(cfg, st) {
    const rows = sortAndFilter(cfg, st);
    const cols = cfg.columns || [];
    const headers = cfg.csv?.headers || cols.map((c) => c.label || c.key);
    const data = rows.map((row) => cols.map((c) => {
        if (typeof c.exportValue === 'function') return c.exportValue(row);
        const v = typeof c.value === 'function' ? c.value(row) : row[c.key];
        return v === null || v === undefined ? '' : v;
    }));
    const filename = (cfg.csv?.filename || 'export') + '.csv';
    downloadCSV(filename, headers, data);
}

export default renderTable;
