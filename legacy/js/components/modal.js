/* ==========================================================================
 * js/components/modal.js — مودال، تأیید و دیالوگ سفارشی (بدون confirm/prompt بومی)
 * ========================================================================== */

import { icon } from './icons.js';
import { escapeHTML } from '../utils.js';
import { S } from '../strings.js';

let _overlay = null;
let _current = null;
let _escHandler = null;

function overlay() {
    if (_overlay && document.body.contains(_overlay)) return _overlay;
    _overlay = document.getElementById('modalOverlay');
    if (!_overlay) {
        _overlay = document.createElement('div');
        _overlay.className = 'modal-overlay';
        _overlay.id = 'modalOverlay';
        _overlay.innerHTML = '<div class="modal" id="modalContent"></div>';
        document.body.appendChild(_overlay);
    }
    if (!_overlay.dataset.bound) {
        _overlay.dataset.bound = '1';
        _overlay.addEventListener('mousedown', (e) => {
            if (e.target === _overlay && _current?.closeOnBackdrop !== false) Modal.close();
        });
    }
    return _overlay;
}

function contentNode() {
    const ov = overlay();
    return ov.querySelector('.modal') || ov.firstElementChild;
}

export const Modal = {
    /**
     * باز کردن مودال
     * @param {object} config
     *   title, body (HTML), footer (HTML), size ('', 'modal-lg', 'modal-xl'),
     *   onMount(node), closeOnBackdrop, onClose()
     */
    open(config = {}) {
        const ov = overlay();
        const box = contentNode();
        box.className = 'modal ' + (config.size || '');
        const body = typeof config.body === 'string' ? config.body : '';
        box.innerHTML = `
            <div class="modal-header">
              <div class="modal-title">${config.title || ''}</div>
              <button class="modal-close" type="button" aria-label="${S.close}" data-modal-close>${icon('x', 'icon-lg')}</button>
            </div>
            <div class="modal-body">${body}</div>
            ${config.footer ? `<div class="modal-footer">${config.footer}</div>` : ''}`;
        ov.classList.add('active');
        document.body.style.overflow = 'hidden';

        box.querySelectorAll('[data-modal-close]').forEach((b) => b.addEventListener('click', () => Modal.close()));

        _current = {
            closeOnBackdrop: config.closeOnBackdrop !== false,
            onClose: config.onClose
        };

        if (_escHandler) document.removeEventListener('keydown', _escHandler);
        _escHandler = (e) => {
            if (e.key === 'Escape') Modal.close();
        };
        document.addEventListener('keydown', _escHandler);

        /* بازگرداندن فوکوس به اولین ورودی */
        setTimeout(() => {
            const first = box.querySelector('input:not([type=hidden]):not([disabled]), select, textarea');
            if (first && !('ontouchstart' in window)) first.focus();
        }, 60);

        try {
            config.onMount?.(box, Modal);
        } catch (e) {
            console.error('modal onMount error', e);
        }
        return { node: box, close: () => Modal.close() };
    },

    /** مودال با فرم دلخواه (id برای دسترسی) */
    isOpen() {
        return overlay().classList.contains('active');
    },

    close() {
        const ov = overlay();
        if (!ov.classList.contains('active')) return;
        ov.classList.remove('active');
        document.body.style.overflow = '';
        if (_escHandler) {
            document.removeEventListener('keydown', _escHandler);
            _escHandler = null;
        }
        const cb = _current?.onClose;
        _current = null;
        setTimeout(() => {
            const box = contentNode();
            if (!Modal.isOpen()) box.innerHTML = '';
        }, 220);
        try { cb?.(); } catch (e) { console.error(e); }
    },

    /** تأییدیه با ظاهر سفارشی → Promise<boolean> */
    confirm({
        title = S.confirm,
        message = '',
        hint = '',
        okText = S.confirm,
        cancelText = S.cancel,
        danger = false,
        iconName = ''
    } = {}) {
        return new Promise((resolve) => {
            let settled = false;
            const done = (val) => {
                if (settled) return;
                settled = true;
                Modal.close();
                resolve(val);
            };
            Modal.open({
                title,
                size: '',
                body: `
                    <div class="text-center" style="padding:6px 0 2px">
                      <div class="${danger ? 'text-red' : 'text-gold'}" style="font-size:2rem">${icon(iconName || (danger ? 'alert-triangle' : 'info'), 'icon-xl')}</div>
                      <p style="margin:10px 0 6px; line-height:2">${escapeHTML(message)}</p>
                      ${hint ? `<p class="hint">${escapeHTML(hint)}</p>` : ''}
                    </div>`,
                footer: `
                    <button class="btn btn-outline" type="button" data-cancel>${escapeHTML(cancelText)}</button>
                    <button class="btn ${danger ? 'btn-danger' : 'btn-gold'}" type="button" data-ok>${escapeHTML(okText)}</button>`,
                onMount: (node) => {
                    node.querySelector('[data-cancel]').addEventListener('click', () => done(false));
                    node.querySelector('[data-ok]').addEventListener('click', () => done(true));
                    setTimeout(() => node.querySelector('[data-ok]')?.focus(), 60);
                },
                onClose: () => done(false)
            });
        });
    },

    /**
     * پیام اطلاع‌رسانی ساده
     * @param {object} cfg title, message (متن ساده)، body (HTML خام برای راهنمای چندخطی)، okText, type
     */
    alert({ title = 'اطلاع', message = '', body = '', okText = S.ok, type = 'info' } = {}) {
        return new Promise((resolve) => {
            const inner = body
                ? `<div style="line-height:2; font-size:0.8rem">${body}</div>`
                : `<div class="text-center" style="padding:6px 0 2px">
                    <div class="${type === 'error' ? 'text-red' : type === 'success' ? 'text-green' : 'text-gold'}" style="font-size:2rem">${icon(type === 'error' ? 'alert-circle' : type === 'success' ? 'check-circle' : 'info', 'icon-xl')}</div>
                    <p style="margin:10px 0 6px; line-height:2">${escapeHTML(message)}</p></div>`;
            Modal.open({
                title,
                body: inner,
                footer: `<button class="btn btn-gold" type="button" data-ok>${escapeHTML(okText)}</button>`,
                onMount: (node) => node.querySelector('[data-ok]').addEventListener('click', () => { Modal.close(); resolve(true); }),
                onClose: () => resolve(true)
            });
        });
    },

    /**
     * دریافت یک مقدار متنی از کاربر → Promise<string|null>
     * جایگزین window.prompt بومی (طبق قواعد پروژه هیچ alert/prompt/confirm بومی استفاده نمی‌شود)
     * @param {object} cfg title, message, inputType ('text'|'password'|'number'|'tel'), defaultValue,
     *                     placeholder, okText, cancelText, validate(value) → پیام خطا یا ''
     */
    prompt({
        title = 'ورود مقدار',
        message = '',
        inputType = 'text',
        defaultValue = '',
        placeholder = '',
        okText = S.ok,
        cancelText = S.cancel,
        iconName = 'edit',
        validate = null
    } = {}) {
        return new Promise((resolve) => {
            let settled = false;
            const done = (val) => {
                if (settled) return;
                settled = true;
                Modal.close();
                resolve(val);
            };
            Modal.open({
                title,
                body: `
                  <div class="text-center mb-12">
                    <div class="text-gold" style="font-size:1.7rem">${icon(iconName, 'icon-xl')}</div>
                    ${message ? `<p style="margin:8px 0 0; line-height:2">${escapeHTML(message)}</p>` : ''}
                  </div>
                  <div class="form-group">
                    <input class="form-input" id="promptInput" type="${inputType}" dir="${inputType === 'password' || inputType === 'tel' || inputType === 'number' ? 'ltr' : 'rtl'}"
                      value="${escapeHTML(String(defaultValue))}" placeholder="${escapeHTML(placeholder)}" autocomplete="off">
                    <div class="field-error" id="promptError" style="display:none"></div>
                  </div>`,
                footer: `
                  <button class="btn btn-outline" type="button" data-cancel>${escapeHTML(cancelText)}</button>
                  <button class="btn btn-gold" type="button" data-ok>${escapeHTML(okText)}</button>`,
                onMount: (node) => {
                    const input = node.querySelector('#promptInput');
                    const errBox = node.querySelector('#promptError');
                    const submit = () => {
                        const val = input.value.trim();
                        if (validate) {
                            const msg = validate(val);
                            if (msg) {
                                errBox.textContent = msg;
                                errBox.style.display = 'block';
                                input.focus();
                                return;
                            }
                        }
                        done(val);
                    };
                    node.querySelector('[data-ok]').addEventListener('click', submit);
                    node.querySelector('[data-cancel]').addEventListener('click', () => done(null));
                    input.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') { e.preventDefault(); submit(); }
                    });
                    setTimeout(() => { input.focus(); if (defaultValue) input.select(); }, 80);
                },
                onClose: () => done(null)
            });
        });
    }
};

export default Modal;
