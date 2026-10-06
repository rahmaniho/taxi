/* ==========================================================================
 * js/components/toast.js — اعلان‌های فارسی (بدون alert بومی)
 * ========================================================================== */

import { icon } from './icons.js';

const ICON_BY_TYPE = {
    success: 'check-circle',
    error: 'alert-circle',
    warning: 'alert-triangle',
    info: 'info'
};

let _container = null;

function container() {
    if (_container && document.body.contains(_container)) return _container;
    _container = document.getElementById('toast-container') || document.getElementById('toastContainer');
    if (!_container) {
        _container = document.createElement('div');
        _container.id = 'toast-container';
        _container.className = 'toast-container';
        document.body.appendChild(_container);
    }
    return _container;
}

export const Toast = {
    /**
     * نمایش اعلان
     * @param {string} message متن فارسی
     * @param {'success'|'error'|'warning'|'info'} type
     * @param {number} duration میلی‌ثانیه
     */
    show(message, type = 'success', duration = 3400) {
        try {
            const el = document.createElement('div');
            el.className = `toast toast-${type}`;
            el.setAttribute('role', 'status');
            el.innerHTML = `${icon(ICON_BY_TYPE[type] || 'info')}<span></span>`;
            el.querySelector('span').textContent = String(message ?? '');
            container().appendChild(el);
            const kill = () => {
                if (!el.parentNode) return;
                el.style.opacity = '0';
                el.style.transform = 'translateX(30px)';
                setTimeout(() => el.remove(), 260);
            };
            const timer = setTimeout(kill, Math.max(1200, duration));
            el.addEventListener('click', () => { clearTimeout(timer); kill(); });
            return kill;
        } catch (e) {
            console.error('toast failed', e);
            return () => {};
        }
    },

    success(msg, d) { return Toast.show(msg, 'success', d); },
    error(msg, d) { return Toast.show(msg, 'error', d || 5000); },
    warning(msg, d) { return Toast.show(msg, 'warning', d || 4200); },
    info(msg, d) { return Toast.show(msg, 'info', d); },

    clear() {
        container().innerHTML = '';
    }
};

/** نمایش خطای ناشناخته به‌صورت فارسی */
export function toastError(err, fallback = 'خطای غیرمنتظره رخ داد') {
    console.error(err);
    const msg = err?.message && typeof err.message === 'string' && err.message.length < 120
        ? err.message
        : fallback;
    return Toast.error(msg);
}

export default Toast;
