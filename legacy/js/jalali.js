/* ==========================================================================
 * js/jalali.js — تقویم شمسی سبک (Datepicker) بدون وابستگی خارجی
 * --------------------------------------------------------------------------
 * کارکرد:
 *   • به هر <input class="jalali-date"> می‌چسبد (حتی اگر بعداً به DOM اضافه شود).
 *   • مقدار نمایش‌داده‌شده: «۱۴۰۴/۰۷/۱۵» (ارقام فارسی — قاعده ۱۰ پروژه)
 *   • مقدار ذخیره‌شده (input.dataset.key و خواندن با read()): «1404-07-15»
 *   • پشتیبانی data-min / data-max برای محدود کردن بازه
 *   • بستن خودکار با Esc، ناوبری با کلیدهای جهت‌دار، انتخاب سریع «امروز»
 * ========================================================================== */

import {
    toFa, toEn, jalaliKey, todayJalali, isValidJalali, jalaliMonthLength, isLeapJalaliYear,
    normalizeJalaliKey, formatJalali, jalaliToDate, jalaliDayOfWeek, JALALI_MONTHS,
    WEEKDAYS_SHORT
} from './utils.js';
import { icon } from './components/icons.js';
import { DB } from './db.js';

const WEEK_LABELS = WEEKDAYS_SHORT;
let _openInput = null;
let _observer = null;

/* ------------------------------- کمکی‌ها ------------------------------- */

function holidaysSet() {
    const s = DB.settings();
    return {
        list: s.holidays || [],
        friday: s.fridayIsHoliday !== false
    };
}

function isHolidayKey(key) {
    const h = holidaysSet();
    if (h.list.includes(key)) return true;
    return h.friday && jalaliDayOfWeek(key) === 6;
}

function parseViewKey(input) {
    const key = read(input) || todayJalali();
    const [jy, jm] = key.split('-').map(Number);
    return { jy, jm };
}

function compareKeys(a, b) {
    return String(a).localeCompare(String(b));
}

/* ------------------------------ چسباندن ------------------------------ */

function ensureWrapper(input) {
    if (input.parentElement?.classList.contains('jp-wrap')) return input.parentElement;
    /* اگر داخل گروه ورودی است (jp-input-group) از آن استفاده می‌کنیم */
    const parent = input.parentElement;
    if (parent && parent.classList.contains('jp-input-group')) {
        const wrap = document.createElement('span');
        wrap.className = 'jp-wrap';
        parent.insertBefore(wrap, input);
        wrap.appendChild(input);
        return wrap;
    }
    const wrap = document.createElement('span');
    wrap.className = 'jp-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    return wrap;
}

export const JalaliDatepicker = {
    /** فعال‌سازی روی همهٔ input های jalali-date در یک محدوده */
    init(scope = document) {
        scope.querySelectorAll('input.jalali-date:not([data-jp-bound])').forEach((inp) => JalaliDatepicker.attach(inp));
        if (!_observer && scope === document) {
            _observer = new MutationObserver((mutations) => {
                mutations.forEach((m) => {
                    m.addedNodes.forEach((node) => {
                        if (node.nodeType !== 1) return;
                        if (node.matches?.('input.jalali-date')) JalaliDatepicker.attach(node);
                        node.querySelectorAll?.('input.jalali-date:not([data-jp-bound])')
                            .forEach((inp) => JalaliDatepicker.attach(inp));
                    });
                });
            });
            _observer.observe(document.body, { childList: true, subtree: true });
        }
    },

    attach(input) {
        if (!input || input.dataset.jpBound) return;
        input.dataset.jpBound = '1';
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('inputmode', 'numeric');
        input.setAttribute('placeholder', input.getAttribute('placeholder') || '۱۴۰۴/۰۷/۱۵');

        const wrap = ensureWrapper(input);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'jp-btn';
        btn.setAttribute('aria-label', 'انتخاب تاریخ');
        btn.innerHTML = icon('calendar');
        wrap.appendChild(btn);

        const pop = document.createElement('div');
        pop.className = 'jp-pop';
        pop.hidden = true;
        wrap.appendChild(pop);

        input._jp = { pop, state: parseViewKey(input), mode: 'day' };

        /* مقدار اولیه */
        if (input.dataset.key) write(input, input.dataset.key, { silent: true });
        else if (input.value) {
            const k = normalizeJalaliKey(input.value);
            if (k) write(input, k, { silent: true });
            else input.value = '';
        }

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (pop.hidden) JalaliDatepicker.open(input);
            else JalaliDatepicker.close();
        });

        input.addEventListener('focus', () => {
            input.dataset.prevValue = read(input);
        });

        /* کلیک/لمس روی خود فیلد هم تقویم را باز می‌کند (تجربهٔ کاربری متعارف) */
        input.addEventListener('click', () => {
            if (pop.hidden) JalaliDatepicker.open(input);
        });

        input.addEventListener('input', () => {
            /* اجازهٔ تایپ دستی؛ فقط ارقام و جداکننده */
            input.value = toFa(toEn(input.value).replace(/[^\d/\-.]/g, ''));
        });

        input.addEventListener('blur', () => {
            const k = normalizeJalaliKey(input.value);
            if (input.value && !k) {
                /* تاریخ نامعتبر: بازگرداندن مقدار قبلی */
                const prev = input.dataset.prevValue;
                input.classList.add('invalid');
                if (prev) write(input, prev, { silent: true });
                else input.value = '';
                setTimeout(() => input.classList.remove('invalid'), 1500);
            } else if (k) {
                write(input, k, { silent: true });
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown' && !pop.hidden) { e.preventDefault(); focusDay(pop, 0); }
            if (e.key === 'Escape') JalaliDatepicker.close();
            if (e.key === 'Enter' && !pop.hidden) {
                e.preventDefault();
                pop.querySelector('.jp-day.sel, .jp-day.today')?.click();
            }
        });
    },

    open(input) {
        if (_openInput && _openInput !== input) JalaliDatepicker.close();
        const { pop, state } = input._jp || {};
        if (!pop) return;
        const v = parseViewKey(input);
        input._jp.state = { jy: v.jy, jm: v.jm, mode: 'day' };
        pop.hidden = false;
        _openInput = input;
        render(input);

        /* اگر فضا کم بود، بالا باز می‌شود */
        setTimeout(() => {
            const rect = pop.getBoundingClientRect();
            if (rect.bottom > window.innerHeight - 8) pop.classList.add('jp-up');
        }, 0);

        document.addEventListener('mousedown', outsideHandler, true);
    },

    close() {
        if (!_openInput) return;
        const pop = _openInput._jp?.pop;
        if (pop) {
            pop.hidden = true;
            pop.classList.remove('jp-up');
            pop.innerHTML = '';
        }
        _openInput = null;
        document.removeEventListener('mousedown', outsideHandler, true);
    },

    /** خواندن مقدار استاندارد (1404-07-15) */
    read(input) {
        return read(input);
    },

    /** نوشتن مقدار در input */
    set(input, key, opts) {
        return write(input, key, opts);
    },

    /** اتصال دستی با تنظیمات */
    attachAll(scope) {
        JalaliDatepicker.init(scope);
    }
};

function outsideHandler(e) {
    if (!_openInput) return;
    const wrap = _openInput.closest('.jp-wrap');
    if (wrap && !wrap.contains(e.target)) JalaliDatepicker.close();
}

export function read(input) {
    if (!input) return '';
    const fromAttr = normalizeJalaliKey(input.dataset.key || '');
    if (fromAttr) return fromAttr;
    return normalizeJalaliKey(input.value || '');
}

export function write(input, key, { silent = false } = {}) {
    if (!input) return '';
    const k = normalizeJalaliKey(key);
    input.dataset.key = k || '';
    input.value = k ? formatJalali(k) : '';
    if (!silent) input.dispatchEvent(new Event('change', { bubbles: true }));
    return k;
}

/* ------------------------------ رندر تقویم ------------------------------ */

function render(input) {
    const { pop, state } = input._jp;
    const selected = read(input);
    const today = todayJalali();
    const min = normalizeJalaliKey(input.dataset.min || '');
    const max = normalizeJalaliKey(input.dataset.max || '');

    if (state.mode === 'month') {
        pop.innerHTML = `
          <div class="jp-head">
            <button class="jp-nav" type="button" data-nav="-1" aria-label="سال قبل">${icon('chevron-right')}</button>
            <span class="jp-head-title" data-mode="day">${toFa(state.jy)}</span>
            <button class="jp-nav" type="button" data-nav="1" aria-label="سال بعد">${icon('chevron-left')}</button>
          </div>
          <div class="jp-mons">
            ${JALALI_MONTHS.map((m, i) => `<button type="button" data-mon="${i + 1}" class="${i + 1 === state.jm ? 'active' : ''}">${m}</button>`).join('')}
          </div>
          <div class="jp-foot">
            <button class="btn btn-outline" type="button" data-today>امروز</button>
            <button class="btn btn-outline" type="button" data-clear>پاک کردن</button>
          </div>`;
    } else {
        const firstDow = jalaliDayOfWeek(jalaliKey(state.jy, state.jm, 1));
        const len = jalaliMonthLength(state.jy, state.jm);
        const prevMonth = state.jm === 1 ? 12 : state.jm - 1;
        const prevYear = state.jm === 1 ? state.jy - 1 : state.jy;
        const prevLen = jalaliMonthLength(prevYear, prevMonth);
        const cells = [];

        for (let i = firstDow - 1; i >= 0; i--) {
            const d = prevLen - i;
            cells.push({ jy: prevYear, jm: prevMonth, jd: d, out: true });
        }
        for (let d = 1; d <= len; d++) cells.push({ jy: state.jy, jm: state.jm, jd: d, out: false });
        const nextMonth = state.jm === 12 ? 1 : state.jm + 1;
        const nextYear = state.jm === 12 ? state.jy + 1 : state.jy;
        let d = 1;
        while (cells.length % 7 !== 0 || cells.length < 42) {
            cells.push({ jy: nextYear, jm: nextMonth, jd: d++, out: true });
            if (cells.length >= 42) break;
        }

        pop.innerHTML = `
          <div class="jp-head">
            <button class="jp-nav" type="button" data-nav="prev" aria-label="ماه قبل">${icon('chevron-right')}</button>
            <span class="jp-head-title" data-mode="month">${toFa(`${JALALI_MONTHS[state.jm - 1]} ${state.jy}`)}</span>
            <button class="jp-nav" type="button" data-nav="next" aria-label="ماه بعد">${icon('chevron-left')}</button>
          </div>
          <div class="jp-week">${WEEK_LABELS.map((w) => `<span>${w}</span>`).join('')}</div>
          <div class="jp-grid">
            ${cells.map((c) => {
                const key = jalaliKey(c.jy, c.jm, c.jd);
                const cls = [
                    'jp-day',
                    c.out ? 'out' : '',
                    key === today ? 'today' : '',
                    key === selected ? 'sel' : '',
                    isHolidayKey(key) ? 'holiday' : ''
                ].filter(Boolean).join(' ');
                const disabled = (min && compareKeys(key, min) < 0) || (max && compareKeys(key, max) > 0);
                return `<button type="button" class="${cls}" data-day="${key}" ${disabled ? 'disabled style="opacity:.3;cursor:not-allowed"' : ''}>${toFa(c.jd)}</button>`;
            }).join('')}
          </div>
          <div class="jp-foot">
            <span class="hint">${toFa(`${JALALI_MONTHS[state.jm - 1]} ${state.jy}${isLeapJalaliYear(state.jy) ? ' (کبیسه)' : ''}`)}</span>
            <span style="display:flex;gap:6px">
              <button class="btn btn-outline" type="button" data-today>امروز</button>
              <button class="btn btn-outline" type="button" data-clear>پاک</button>
            </span>
          </div>`;
    }

    pop.querySelectorAll('[data-nav]').forEach((b) => {
        b.addEventListener('click', (e) => {
            e.preventDefault();
            const dir = b.dataset.nav;
            if (state.mode === 'month') {
                state.jy += dir === 'prev' || dir === '-1' ? -1 : 1;
            } else if (dir === 'prev') {
                if (state.jm === 1) { state.jm = 12; state.jy--; } else state.jm--;
            } else {
                if (state.jm === 12) { state.jm = 1; state.jy++; } else state.jm++;
            }
            render(input);
        });
    });

    pop.querySelector('[data-mode]')?.addEventListener('click', (e) => {
        e.preventDefault();
        state.mode = state.mode === 'day' ? 'month' : 'day';
        render(input);
    });

    pop.querySelectorAll('[data-mon]').forEach((b) => {
        b.addEventListener('click', (e) => {
            e.preventDefault();
            state.jm = Number(b.dataset.mon);
            state.mode = 'day';
            render(input);
        });
    });

    pop.querySelectorAll('.jp-day').forEach((b) => {
        b.addEventListener('click', (e) => {
            e.preventDefault();
            if (b.disabled) return;
            write(input, b.dataset.day);
            JalaliDatepicker.close();
        });
    });

    pop.querySelector('[data-today]')?.addEventListener('click', (e) => {
        e.preventDefault();
        const t = todayJalali();
        if ((min && compareKeys(t, min) < 0) || (max && compareKeys(t, max) > 0)) return;
        write(input, t);
        JalaliDatepicker.close();
    });

    pop.querySelector('[data-clear]')?.addEventListener('click', (e) => {
        e.preventDefault();
        write(input, '');
        JalaliDatepicker.close();
    });
}

function focusDay(pop, index) {
    const days = pop.querySelectorAll('.jp-day:not([disabled])');
    if (days[index]) days[index].focus();
}

export default JalaliDatepicker;
