/* ==========================================================================
 * js/components/form.js — فرم‌ساز عمومی: openForm(config)
 * --------------------------------------------------------------------------
 * همهٔ فرم‌های برنامه (راننده، خودرو، مشترک، سفر، هزینه، کاربر، پرداخت، …) از
 * این یک تابع ساخته می‌شوند تا کد تکراری حذف شود (فاز ۵.۴).
 * اعتبارسنجی: required + نوع فیلد (موبایل/ثابت/کد ملی/پلاک/تاریخ شمسی/عدد)
 * + تابع validate دلخواه، با پیام‌های فارسی زیر هر فیلد.
 * ========================================================================== */

import { Modal } from './modal.js';
import { Toast } from './toast.js';
import { icon } from './icons.js';
import {
    escapeHTML, validateValue, parseNumber, toFa, normalizePlate, normalizeJalaliKey
} from '../utils.js';
import { read as readJalali, write as writeJalali } from '../jalali.js';

/* --------------------------- فیلد و مقادیر --------------------------- */

export function readFieldValue(el) {
    if (!el) return '';
    if (el.classList.contains('jalali-date')) return readJalali(el);
    if (el.type === 'checkbox') return !!el.checked;
    const v = el.value;
    if (el.dataset.numeric === '1') return v === '' ? '' : parseNumber(v);
    return typeof v === 'string' ? v.trim() : v;
}

export function collectForm(container) {
    const out = {};
    container.querySelectorAll('[name]').forEach((el) => {
        out[el.name] = readFieldValue(el);
    });
    return out;
}

export function setFormValues(container, values = {}) {
    Object.entries(values).forEach(([name, val]) => {
        const el = container.querySelector(`[name="${name}"]`);
        if (!el) return;
        if (el.classList.contains('jalali-date')) {
            writeJalali(el, val || '', { silent: true });
        } else if (el.type === 'checkbox') {
            el.checked = !!val;
        } else {
            el.value = val === null || val === undefined ? '' : val;
        }
    });
}

/* ------------------------------ ساخت HTML ------------------------------ */

function optionsHTML(options, current) {
    const list = Array.isArray(options) ? options : [];
    return list.map((o) => {
        const value = typeof o === 'object' ? o.value : o;
        const label = typeof o === 'object' ? o.label : o;
        const sel = String(value) === String(current ?? '') ? 'selected' : '';
        return `<option value="${escapeHTML(value)}" ${sel}>${escapeHTML(label)}</option>`;
    }).join('');
}

function colClass(col) {
    if (col === 2) return 'form-row-3';   // دو ستون از سه
    if (col === 3) return 'form-row-3';
    return 'form-row';
}

export function fieldHTML(f, values = {}) {
    const value = values[f.name] !== undefined ? values[f.name] : (f.value ?? '');
    const label = f.label ? `<label class="form-label">${escapeHTML(f.label)}${f.required ? ' *' : ''}</label>` : '';
    const hint = f.hint ? `<div class="hint">${escapeHTML(f.hint)}</div>` : '';
    const err = `<div class="field-error" data-error-for="${escapeHTML(f.name)}"></div>`;
    const common = `name="${escapeHTML(f.name)}" id="${escapeHTML(f.id || 'fld-' + f.name)}"
        ${f.required ? 'required' : ''} ${f.disabled ? 'disabled' : ''} ${f.readonly ? 'readonly' : ''}
        placeholder="${escapeHTML(f.placeholder || '')}"`;

    let control = '';
    switch (f.type) {
        case 'select':
            control = `<select class="form-select" ${common}>${f.placeholder !== false ? `<option value="">${escapeHTML(f.emptyLabel || 'انتخاب کنید...')}</option>` : ''}${optionsHTML(typeof f.options === 'function' ? f.options(values) : f.options, value)}</select>`;
            break;
        case 'textarea':
            control = `<textarea class="form-textarea" rows="${f.rows || 3}" ${common}>${escapeHTML(value)}</textarea>`;
            break;
        case 'checkbox':
            control = `<label class="check-wrap"><input type="checkbox" class="chk" name="${escapeHTML(f.name)}" ${value ? 'checked' : ''} ${f.disabled ? 'disabled' : ''}> ${escapeHTML(f.checkboxLabel || f.label || '')}</label>`;
            return `<div class="form-group" data-field="${escapeHTML(f.name)}">${control}${hint}${err}</div>`;
        case 'static':
            return `<div class="form-group" data-field="${escapeHTML(f.name)}" style="grid-column:1/-1">${f.html || ''}</div>`;
        case 'hidden':
            return `<input type="hidden" name="${escapeHTML(f.name)}" value="${escapeHTML(value)}">`;
        case 'date':
            control = `<input type="text" class="form-input jalali-date" value="${escapeHTML(value)}" data-key="${escapeHTML(normalizeJalaliKey(value))}" ${common} autocomplete="off">`;
            break;
        case 'number':
        case 'money':
            control = `<input type="number" class="form-input" data-numeric="1" ${common}
                min="${f.min ?? 0}" ${f.max !== undefined ? `max="${f.max}"` : ''} step="${f.step || 1}"
                value="${value === '' || value === null || value === undefined ? '' : value}">`;
            break;
        case 'password':
            control = `<input type="password" class="form-input" ${common} value="" autocomplete="new-password">`;
            break;
        case 'tel':
        case 'phone':
            control = `<input type="tel" class="form-input" inputmode="tel" ${common} value="${escapeHTML(value)}">`;
            break;
        default:
            control = `<input type="text" class="form-input" ${common} value="${escapeHTML(value)}">`;
    }
    return `<div class="form-group" data-field="${escapeHTML(f.name)}">${label}${control}${hint}${err}</div>`;
}

function fieldsHTML(fields, values) {
    /* گروه‌بندی فیلدهای «نیم‌عرض» در ردیف‌های دوستونه و کنار هم */
    const html = [];
    let buffer = [];
    const flush = () => {
        if (!buffer.length) return;
        html.push(`<div class="form-row">${buffer.join('')}</div>`);
        buffer = [];
    };
    fields.forEach((f) => {
        if (f.type === 'static' || f.type === 'hidden' || f.col === 3 || f.col === 1 || f.full) {
            flush();
            html.push(fieldHTML(f, values));
            return;
        }
        buffer.push(fieldHTML(f, values));
        if (buffer.length === 2) flush();
    });
    flush();
    return html.join('');
}

/* --------------------------------- openForm --------------------------------- */

/**
 * باز کردن فرم در مودال
 * @param {object} cfg
 *  title, fields, values, size, submitText, cancelText, description,
 *  onSubmit(values, api) — اگر خطا پرتاب کند فرم باز می‌ماند و پیام خطا نشان داده می‌شود.
 *  footerExtra (HTML), onMount(node, api), onChange(values, node)
 */
export function openForm(cfg = {}) {
    const fields = (cfg.fields || []).filter(Boolean);
    const values = { ...(cfg.values || {}) };

    const body = `
      ${cfg.description ? `<p class="hint" style="margin-bottom:12px; line-height:1.9">${escapeHTML(cfg.description)}</p>` : ''}
      <form class="app-form" novalidate>
        ${fieldsHTML(fields, values)}
      </form>`;

    const footer = `
      ${cfg.footerExtra || ''}
      <button class="btn btn-outline" type="button" data-form-cancel>${escapeHTML(cfg.cancelText || 'انصراف')}</button>
      ${cfg.readOnly ? '' : `<button class="btn btn-gold" type="submit" form="" data-form-submit>${icon('save')} ${escapeHTML(cfg.submitText || 'ذخیره')}</button>`}`;

    const api = {
        node: null,
        values: () => collectForm(api.node.querySelector('form')),
        setValues: (v) => setFormValues(api.node.querySelector('form'), v),
        close: () => Modal.close(),
        setError: (name, msg) => {
            const el = api.node.querySelector(`[data-error-for="${name}"]`);
            if (el) el.textContent = msg;
            api.node.querySelector(`[name="${name}"]`)?.classList.add('invalid');
        },
        clearErrors: () => {
            api.node.querySelectorAll('.field-error').forEach((e) => { e.textContent = ''; });
            api.node.querySelectorAll('.invalid').forEach((e) => e.classList.remove('invalid'));
        }
    };

    Modal.open({
        title: cfg.title || '',
        size: cfg.size || '',
        body,
        footer,
        onMount: (node) => {
            api.node = node;
            const form = node.querySelector('form');

            node.querySelector('[data-form-cancel]')?.addEventListener('click', () => Modal.close());
            node.querySelector('[data-form-submit]')?.addEventListener('click', () => {
                form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }));
            });

            node.querySelectorAll('[data-field]').forEach((wrap) => {
                const f = fields.find((x) => x.name === wrap.dataset.field);
                if (f?.visible) wrap.hidden = !f.visible(values);
            });

            form.addEventListener('input', (e) => {
                const wrap = e.target.closest('.form-group');
                wrap?.querySelector('.field-error')?.replaceChildren('');
                e.target.classList.remove('invalid');
                if (cfg.onChange) {
                    try { cfg.onChange(collectForm(form), node, api); } catch (err) { console.error(err); }
                }
            });
            form.addEventListener('change', (e) => {
                const name = e.target.name;
                const f = fields.find((x) => x.name === name);
                node.querySelectorAll('[data-field]').forEach((wrap) => {
                    const ff = fields.find((x) => x.name === wrap.dataset.field);
                    if (ff?.visible) {
                        const vals = collectForm(form);
                        wrap.hidden = !ff.visible(vals);
                    }
                });
                if (f?.onChange) {
                    try { f.onChange(readFieldValue(e.target), collectForm(form), node, api); } catch (err) { console.error(err); }
                }
            });

            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const vals = collectForm(form);
                const errors = validateForm(fields, vals, node);
                if (Object.keys(errors).length) {
                    const first = Object.keys(errors)[0];
                    const el = node.querySelector(`[data-error-for="${first}"]`);
                    if (el) el.textContent = errors[first];
                    node.querySelector(`[name="${first}"]`)?.classList.add('invalid');
                    node.querySelector(`[name="${first}"]`)?.focus();
                    Toast.warning(errors[first]);
                    return;
                }
                const btn = node.querySelector('[data-form-submit]');
                btn?.setAttribute('disabled', 'disabled');
                try {
                    const res = await cfg.onSubmit?.(vals, api);
                    if (res === false) return;
                    if (res?.keepOpen) return;
                    Modal.close();
                } catch (err) {
                    console.error(err);
                    Toast.error(err?.message || 'ذخیره‌سازی ناموفق بود');
                } finally {
                    btn?.removeAttribute('disabled');
                }
            });

            /* اعتبارسنجی زندهٔ فیلدهای حساس */
            ['mobile', 'phone', 'landline', 'nationalCode', 'plate', 'jalaliDate', 'email'].forEach((type) => {
                fields.filter((f) => f.type === type).forEach((f) => {
                    const el = node.querySelector(`[name="${f.name}"]`);
                    el?.addEventListener('blur', () => {
                        if (!el.value) return;
                        const msg = validateValue(el.value, f.type, { required: false });
                        if (msg) {
                            node.querySelector(`[data-error-for="${f.name}"]`).textContent = msg;
                            el.classList.add('invalid');
                        }
                    });
                });
            });

            /* نرمال‌سازی خودکار پلاک */
            const plateField = fields.find((f) => f.type === 'plate');
            if (plateField) {
                const el = node.querySelector(`[name="${plateField.name}"]`);
                el?.addEventListener('blur', () => {
                    if (el.value) el.value = normalizePlate(el.value);
                });
            }

            if (cfg.onMount) cfg.onMount(node, api);
        },
        onClose: cfg.onClose
    });

    return api;
}

/* ------------------------------ اعتبارسنجی ------------------------------ */

export function validateForm(fields, values, node) {
    const errors = {};
    fields.forEach((f) => {
        if (f.type === 'static' || f.type === 'hidden' || f.disabled) return;
        if (f.visible && !f.visible(values)) return;
        const wrap = node?.querySelector(`[data-field="${f.name}"]`);
        if (wrap?.hidden) return;
        const v = values[f.name];
        const msg = validateValue(v, f.type, { required: f.required });
        if (msg) { errors[f.name] = msg; return; }
        if (f.validate) {
            const custom = f.validate(v, values);
            if (custom) errors[f.name] = custom;
        }
    });
    return errors;
}

export default openForm;
