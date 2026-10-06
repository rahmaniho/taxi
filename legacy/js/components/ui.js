/* ==========================================================================
 * js/components/ui.js — اجزای رابط مشترک: نشان‌ها، استپر، سربرگ، کارت، چاپ
 * ========================================================================== */

import { icon, brandSVG } from './icons.js';
import {
    escapeHTML, formatJalali, formatDateTime, toFa, formatNumber, todayJalali,
    formatTime, minutesBetween, humanizeMinutes
} from '../utils.js';
import { S } from '../strings.js';
import { DB } from '../db.js';
import { Agency } from '../agency.js';

/* ------------------------------- نشان‌ها ------------------------------- */

const STATUS_CLASS = {
    active: 'status-active', inactive: 'status-inactive', suspended: 'status-suspended',
    pending: 'status-pending', inProgress: 'status-inprogress', completed: 'status-completed',
    cancelled: 'status-cancelled', inRepair: 'status-inrepair',
    monthly: 'status-subscription', weekly: 'status-subscription', custom: 'status-subscription',
    none: 'status-inactive', individual: 'status-active', corporate: 'status-subscription',
    debt: 'status-debt', paid: 'status-paid', urgent: 'status-urgent', reserved: 'status-reserved',
    open: 'status-open', closed: 'status-closed'
};

const STATUS_LABEL = {
    active: 'فعال', inactive: 'غیرفعال', suspended: 'تعلیق',
    pending: 'در انتظار', inProgress: 'در حال انجام', completed: 'تکمیل شده', cancelled: 'لغو شده',
    inRepair: 'در تعمیر', monthly: 'ماهانه', weekly: 'هفتگی', custom: 'سفارشی', none: 'بدون اشتراک',
    individual: 'حقیقی', corporate: 'حقوقی', debt: 'بدهکار', paid: 'تسویه شده',
    urgent: 'فوری', reserved: 'رزرو', open: 'باز', closed: 'بسته',
    cash: 'نقدی', card: 'کارتی', subscription: 'اشتراک', online: 'آنلاین',
    driver: 'نقدی به راننده', company: 'آژانس (حقوقی)',
    payout: 'تسویه', settle: 'تسویه‌حساب', advance: 'علی‌الحساب'
};

export function statusBadge(status, labelOverride) {
    const cls = STATUS_CLASS[status] || 'status-inactive';
    const label = labelOverride || STATUS_LABEL[status] || status || '—';
    return `<span class="status-badge ${cls}">${escapeHTML(label)}</span>`;
}

export function labelOf(status) {
    return STATUS_LABEL[status] || status || '—';
}

const AVAIL_CLASS = { available: 'avail-available', busy: 'avail-busy', offline: 'avail-offline', rest: 'avail-rest' };
const AVAIL_LABEL = { available: 'آزاد', busy: 'در سفر', offline: 'آفلاین', rest: 'استراحت' };

/** نشان وضعیت آنی راننده (کلیک‌پذیر برای تغییر) */
export function availabilityBadge(driver, { clickable = true } = {}) {
    const a = driver?.availability || 'offline';
    const cls = AVAIL_CLASS[a] || 'avail-offline';
    const label = AVAIL_LABEL[a] || 'آفلاین';
    const attrs = clickable ? `class="avail-badge ${cls}" data-avail-toggle="${escapeHTML(driver.id)}" title="تغییر وضعیت"` : `class="avail-badge ${cls}"`;
    return `<span ${clickable ? 'role="button" tabindex="0"' : ''} ${attrs}><i class="avail-dot"></i>${label}</span>`;
}

/**
 * بازهٔ زمانی سفر به‌صورت «۱۴:۳۰ تا ۱۵:۱۵ (۴۵ دقیقه)» — باگ ۱٫۴
 * اگر زمان پایان هنوز ثبت نشده باشد: «۱۴:۳۰ تا — (در حال انجام)».
 * @param {{pickupTime?:string, dropoffTime?:string, status?:string}} trip
 */
export function tripTimeRange(trip, { withDuration = true } = {}) {
    if (!trip?.pickupTime) return '—';
    const start = formatTime(trip.pickupTime);
    if (!trip.dropoffTime) {
        const note = trip.status === 'cancelled' ? 'لغو شده' : trip.status === 'completed' ? 'بدون زمان پایان' : 'در حال انجام';
        return `${start} تا —${withDuration ? ` (${note})` : ''}`;
    }
    const end = formatTime(trip.dropoffTime);
    if (!withDuration) return `${start} تا ${end}`;
    const mins = minutesBetween(trip.pickupTime, trip.dropoffTime);
    return `${start} تا ${end} (${mins > 0 ? humanizeMinutes(mins) : '۰ دقیقه'})`;
}

/** مدت سفر برحسب دقیقه (۰ اگر زمان پایان ثبت نشده باشد) */
export function tripDurationMinutes(trip) {
    if (!trip?.pickupTime || !trip?.dropoffTime) return 0;
    return Math.max(0, minutesBetween(trip.pickupTime, trip.dropoffTime));
}

export function availabilityLabel(a) {
    return AVAIL_LABEL[a] || 'آفلاین';
}

export function availabilityColor(a) {
    return { available: '#10b981', busy: '#3b82f6', offline: '#94a3b8', rest: '#f59e0b' }[a] || '#94a3b8';
}

export function priorityBadge(priority) {
    if (priority === 'urgent') return `<span class="status-badge status-urgent">${icon('alert-circle')} فوری</span>`;
    return `<span class="status-badge status-reserved">رزرو</span>`;
}

export function paymentBadge(trip) {
    if (trip.isPaid) return `<span class="status-badge status-paid">پرداخت شده</span>`;
    return `<span class="status-badge status-debt">پرداخت نشده</span>`;
}

export function debtBadge(amount) {
    const n = Number(amount) || 0;
    if (n <= 0) return `<span class="status-badge status-paid">تسویه</span>`;
    return `<span class="status-badge status-debt">${formatNumber(n)}</span>`;
}

/** نشان سنّ بدهی (رده‌بندی ۰-۳۰، ۳۰-۶۰، +۶۰ روز) */
export function agingBadge(days) {
    if (days <= 30) return `<span class="chip chip-green">۰ تا ۳۰ روز</span>`;
    if (days <= 60) return `<span class="chip">۳۱ تا ۶۰ روز</span>`;
    return `<span class="chip chip-red">بیش از ۶۰ روز</span>`;
}

/** رتبهٔ امتیاز راننده */
export function ratingStars(rating) {
    const r = Math.max(0, Math.min(5, Number(rating) || 0));
    return `<span class="nowrap" title="${toFa(r.toFixed(1))} از ۵">${icon('star', 'icon')} ${toFa(r.toFixed(1))}</span>`;
}

/* ------------------------------ استپر سفر ------------------------------ */

/** نمایش بصری مسیر سفر: در انتظار → در حال انجام → تکمیل شده */
export function tripStepper(status) {
    const steps = ['pending', 'inProgress', 'completed'];
    if (status === 'cancelled') {
        return `<div class="stepper">
            <div class="step done"><span class="bubble">${icon('check')}</span>ثبت شد</div>
            <span class="bar done"></span>
            <div class="step cancelled"><span class="bubble">${icon('x')}</span>لغو شده</div>
        </div>`;
    }
    const idx = Math.max(0, steps.indexOf(status));
    return `<div class="stepper">${steps.map((s, i) => {
        const state = i < idx ? 'done' : i === idx ? 'current' : '';
        const bubble = i < idx ? icon('check') : toFa(i + 1);
        const bar = i < steps.length - 1 ? `<span class="bar ${i < idx ? 'done' : ''}"></span>` : '';
        return `<div class="step ${state}"><span class="bubble">${bubble}</span>${S.tripStatus[s]}</div>${bar}`;
    }).join('')}</div>`;
}

/* --------------------------------- کارت --------------------------------- */

export function pageHeader({ title, iconName = 'dashboard', actions = '', subtitle = '' }) {
    return `<div class="page-header">
        <div>
          <div class="page-title">${icon(iconName)} ${escapeHTML(title)}</div>
          ${subtitle ? `<div class="hint" style="margin-top:4px">${escapeHTML(subtitle)}</div>` : ''}
        </div>
        <div class="card-actions">${actions}</div>
    </div>`;
}

export function card({ title, iconName = '', actions = '', body = '', cls = '', id = '' }) {
    return `<div class="card ${cls}" ${id ? `id="${id}"` : ''}>
        ${title ? `<div class="card-header"><div class="card-title">${iconName ? icon(iconName) : ''} ${escapeHTML(title)}</div><div class="card-actions">${actions}</div></div>` : ''}
        ${body}
    </div>`;
}

export function kpi({ label, value, iconName = 'activity', color = '', hint = '' }) {
    return `<div class="kpi">
        <div class="k-label">${iconName ? icon(iconName) : ''} ${escapeHTML(label)}</div>
        <div class="k-value" style="${color ? `color:${color}` : ''}">${value}</div>
        ${hint ? `<div class="hint">${hint}</div>` : ''}
    </div>`;
}

export function statCard({ label, value, iconName = 'activity', id = '' }) {
    return `<div class="stat-card" ${id ? `id="${id}"` : ''}>
        <div class="stat-icon">${icon(iconName)}</div>
        <div class="stat-value">${value}</div>
        <div class="stat-label">${escapeHTML(label)}</div>
    </div>`;
}

export function alertRow({ type = 'info', text, icon: iconName = 'alert-circle' }) {
    return `<div class="alert-row ${type}"><span class="a-icon">${icon(iconName)}</span><div>${text}</div></div>`;
}

/* --------------------------------- چاپ --------------------------------- */

let _printTitle = '';

/**
 * چاپ سند درون صفحه‌ای (بدون window.open تا مسدودکننده پنجره مشکل نسازد)
 * @param {string} html محتوای کامل سند (شامل .print-doc)
 * @param {string} title عنوان سند (برای نام فایل در «ذخیره به‌عنوان PDF»)
 */
export function printDocument(html, title = 'سند') {
    const root = document.getElementById('print-root');
    if (!root) {
        console.error('print-root یافت نشد');
        return;
    }
    _printTitle = document.title;
    root.innerHTML = html;
    document.title = title;
    /* رندر کامل چیدمان قبل از چاپ */
    requestAnimationFrame(() => {
        setTimeout(() => {
            window.print();
            setTimeout(() => {
                document.title = _printTitle;
                root.innerHTML = '';
            }, 800);
        }, 60);
    });
}

/** پیش‌نمایش سند قبل از چاپ در مودال */
export function previewPrint(html, { title = 'پیش‌نمایش چاپ', filename = 'document' } = {}) {
    return import('./modal.js').then(({ Modal }) => {
        Modal.open({
            title,
            size: 'modal-lg',
            body: `<div class="print-preview-frame">${html}</div>`,
            footer: `<button class="btn btn-outline" type="button" data-modal-close>بستن</button>
                     <button class="btn btn-gold" type="button" data-do-print>${icon('printer')} چاپ / ذخیره PDF</button>`,
            onMount: (node) => {
                node.querySelector('[data-do-print]').addEventListener('click', () => {
                    Modal.close();
                    setTimeout(() => printDocument(html, filename), 240);
                });
            }
        });
    });
}

/** سربرگ استاندارد اسناد چاپی (فاکتور، رسید، گزارش مالی) */
/**
 * نشان آژانس برای سربرگ اسناد چاپی:
 * اگر آژانس لوگو بارگذاری کرده باشد، همان تصویر چاپ می‌شود؛ در غیر این صورت
 * نشان پیش‌فرض برنامه (SVG) استفاده می‌شود. طبق درخواست کارفرما، لوگو باید روی
 * «صورت‌حساب‌هایی که برای مشترکین پرینت می‌شود» دیده شود.
 */
export function agencyLogoHTML(height = 54) {
    const id = Agency.identity();
    if (id.hasLogo) {
        return `<img class="doc-logo" src="${escapeHTML(id.logo)}" alt="${escapeHTML(id.name)}" style="max-height:${Number(height) || 54}px">`;
    }
    return brandSVG(height);
}

export function docHeader({ title, subtitle = '', extraMeta = '', agencyId = null }) {
    const s = DB.settings();
    const id = Agency.identity(agencyId);
    const extra = [id.economicCode ? `کد اقتصادی: ${escapeHTML(id.economicCode)}` : '', id.nationalId ? `شناسهٔ ملی: ${escapeHTML(id.nationalId)}` : ''].filter(Boolean);
    return `<div class="doc-head">
        <div class="doc-brand">
          ${agencyLogoHTML(54)}
          <div>
            <h2 style="font-size:1.05rem">${escapeHTML(id.name || s.companyName || 'کارن‌سافت')}</h2>
            <div style="font-size:0.78rem;color:#555">${escapeHTML(id.address || s.companyAddress || '')}</div>
            <div style="font-size:0.78rem;color:#555">تلفن: ${toFa(id.phone || s.companyPhone || '—')}</div>
            ${extra.map((x) => `<div style="font-size:0.72rem;color:#666">${x}</div>`).join('')}
          </div>
        </div>
        <div class="doc-meta">
          <div>تاریخ چاپ: ${formatJalali(todayJalali())}</div>
          ${extraMeta}
        </div>
      </div>
      <div class="doc-title"><span>${escapeHTML(title)}</span></div>
      ${subtitle ? `<div style="text-align:center;font-size:0.8rem;color:#555;margin-bottom:10px">${subtitle}</div>` : ''}`;
}

export function docFooter(text = '') {
    const s = DB.settings();
    const id = Agency.identity();
    const watermark = text || id.footerNote || `${id.name || s.companyName || 'کارن‌سافت'} · سامانه مدیریت تاکسی تلفنی — این سند به‌صورت خودکار تولید شده است`;
    return `<div class="doc-foot">
        <div class="sign-box">مهر و امضای آژانس</div>
        <div class="sign-box">امضای راننده / مشترک</div>
      </div>
      <div class="doc-watermark">${escapeHTML(watermark)}</div>`;
}

/* ----------------------------- سایر کمکی‌ها ----------------------------- */

export function infoPair(label, value) {
    return `<div><div class="hint">${escapeHTML(label)}</div><div class="text-bold">${value}</div></div>`;
}

export function timeAgo(iso) {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'همین حالا';
    if (min < 60) return `${toFa(min)} دقیقه پیش`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${toFa(h)} ساعت پیش`;
    return formatDateTime(iso);
}

export default {
    statusBadge, availabilityBadge, priorityBadge, paymentBadge, debtBadge, agingBadge,
    tripStepper, pageHeader, card, kpi, statCard, alertRow, printDocument, previewPrint,
    docHeader, docFooter, agencyLogoHTML, ratingStars, labelOf, timeAgo
};
