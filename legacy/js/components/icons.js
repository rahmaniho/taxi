/* ==========================================================================
 * js/components/icons.js — مجموعه آیکون SVG درون‌خطی (بدون CDN)
 * --------------------------------------------------------------------------
 * چرا؟ نسخه دمو از Font Awesome روی cdnjs استفاده می‌کرد؛ در حالت PWA و
 * آفلاین، فونت آیکون لود نمی‌شد و آیکون‌ها به مربع خالی تبدیل می‌شدند.
 * این ماژول یک sprite درون‌خطی می‌سازد: صفر درخواست شبکه، همیشه در دسترس.
 * خطوط آیکون‌ها به سبک Lucide (MIT) طراحی شده‌اند: ۲۴×۲۴، stroke=currentColor.
 * ========================================================================== */

export const ICONS = {
    /* عمومی */
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    'check-check': '<path d="m2 13 4 4 8-9"/><path d="m14 17 8-9"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    filter: '<path d="M4 5h16l-6 7v6l-4 2v-8Z"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'chevron-up': '<path d="m6 15 6-6 6 6"/>',
    'chevron-right': '<path d="m9 6 6 6-6 6"/>',
    'chevron-left': '<path d="m15 6-6 6 6 6"/>',
    'arrow-left': '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    'arrow-right': '<path d="M5 12h14M12 5l7 7-7 7"/>',
    'more-vertical': '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',

    /* اعلان */
    'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
    'x-circle': '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
    'alert-circle': '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5h.01"/>',
    'alert-triangle': '<path d="M10.3 3.8 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8Z"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',

    /* پیمایش */
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    queue: '<path d="M10 6h11M10 12h11M10 18h11"/><path d="M4 4h1v4M4 8h2"/><path d="M4 12h1.5a1 1 0 0 1 0 2H4v2h2.5"/>',
    route: '<circle cx="6" cy="19" r="3"/><circle cx="18" cy="5" r="3"/><path d="M9 19h6a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6"/>',
    'plus-circle': '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    car: '<path d="M3 13l2-5a2 2 0 0 1 1.9-1.3h10.2A2 2 0 0 1 19 8l2 5v5H3v-5Z"/><path d="M3 13h18"/><circle cx="7" cy="16" r="1"/><circle cx="17" cy="16" r="1"/>',
    'map-pin': '<path d="M12 22s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z"/><circle cx="12" cy="11" r="2.5"/>',
    'file-text': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    'bar-chart': '<path d="M3 21h18"/><rect x="5" y="12" width="3.5" height="6" rx="1"/><rect x="10.5" y="8" width="3.5" height="10" rx="1"/><rect x="16" y="4" width="3.5" height="14" rx="1"/>',
    percent: '<path d="M19 5 5 19"/><circle cx="7.5" cy="7.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/>',
    coins: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v9M9.8 10h4.4M9.8 14h4.4"/>',
    receipt: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2Z"/><path d="M9 7h6M9 11h6M9 15h3"/>',
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    settings: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="7" cy="18" r="2"/>',
    'graduation-cap': '<path d="M22 9 12 4 2 9l10 5 10-5Z"/><path d="M6 11.5V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.5 3.5 5.6 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.6-3.5-9S9.5 5.5 12 3Z"/>',
    headset: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M4 14a2 2 0 0 1 2 2v2a2 2 0 0 1-4 0v-2"/><path d="M20 14a2 2 0 0 0-2 2v2a2 2 0 0 0 4 0v-2"/>',

    /* اشخاص */
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    'user-plus': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
    'user-check': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>',
    'user-tag': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8h2.5l1 1-3 3-1.5-1.5V8Z"/>',
    badge: '<rect x="3" y="5" width="18" height="15" rx="2"/><circle cx="9" cy="11" r="2.2"/><path d="M5.5 17c.8-1.6 2-2.4 3.5-2.4s2.7.8 3.5 2.4"/><path d="M15 10h3.5M15 13.5h3.5"/>',
    phone: '<path d="M5 3h3l2 5-2.5 1.5a12 12 0 0 0 6 6L15 13l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2Z"/>',
    building: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3"/>',
    star: '<path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9L12 3Z"/>',
    shield: '<path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Z"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9 3 3-3 3-2-2"/>',

    /* وضعیت و زمان */
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    flag: '<path d="M4 22V4"/><path d="M4 4h13l-1.5 4L17 12H4"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    'trending-up': '<path d="M22 7 13.5 15.5 8.5 10.5 2 17"/><path d="M16 7h6v6"/>',
    moon: '<path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/>',
    'wifi-off': '<path d="M2 2l20 20"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M5 13a10 10 0 0 1 4-2.5"/><path d="M15.5 10.7A10 10 0 0 1 19 13"/><path d="M2 8.8A15 15 0 0 1 7 5.7"/><path d="M12 20h.01"/>',
    play: '<path d="m7 4 13 8-13 8V4Z"/>',
    square: '<rect x="5" y="5" width="14" height="14" rx="2"/>',

    /* عملیات */
    pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M5 6l1 15h12l1-15"/><path d="M10 11v6M14 11v6"/>',
    save: '<path d="M19 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7l-4-4Z"/><path d="M8 3v5h7"/><rect x="8" y="13" width="8" height="6"/>',
    download: '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 21h16"/>',
    upload: '<path d="M12 21V9"/><path d="m7 13 5-5 5 5"/><path d="M4 4h16"/>',
    printer: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
    refresh: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    swap: '<path d="M7 4v13M4 14l3 3 3-3"/><path d="M17 20V7M14 10l3-3 3 3"/>',
    login: '<path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/>',
    logout: '<path d="M15 17l5-5-5-5"/><path d="M20 12H8"/><path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4"/>',
    wallet: '<path d="M3 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/><path d="M16 12h4"/><path d="M3 9h18"/>',
    'credit-card': '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h6"/>',
    'file-csv': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h8M12 13v4"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/>',
    send: '<path d="m22 2-7 20-4-9-9-4 20-7Z"/>',
    tag: '<path d="M20.6 13.4 12 22l-9-9V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
    inbox: '<path d="M4 4h16l1 9v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6Z"/><path d="M4 13h4l1.5 2h5L16 13h4"/>',
    gauge: '<path d="M12 14 16 9"/><circle cx="12" cy="14" r="1"/><path d="M4.5 18a9 9 0 1 1 15 0"/>'
};

/** مارک برند کارن‌سافت (تاکسی) — به‌جای تصویر خارجی، SVG درون‌خطی */
export function brandSVG(size = 44) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" role="img" aria-label="کارن‌سافت">
  <defs>
    <linearGradient id="kgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#E4C56A"/><stop offset="100%" stop-color="#B8942A"/>
    </linearGradient>
  </defs>
  <rect x="2" y="2" width="60" height="60" rx="16" fill="#080A19" stroke="url(#kgGrad)" stroke-width="2.5"/>
  <path d="M14 40h36" stroke="url(#kgGrad)" stroke-width="2" stroke-linecap="round"/>
  <path d="M18 36l3.5-9a5 5 0 0 1 4.6-3h11.8a5 5 0 0 1 4.6 3L46 36v6H18z"
        fill="none" stroke="url(#kgGrad)" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M18 36h28" stroke="url(#kgGrad)" stroke-width="2" />
  <circle cx="24" cy="42" r="2.6" fill="url(#kgGrad)"/>
  <circle cx="40" cy="42" r="2.6" fill="url(#kgGrad)"/>
  <path d="M26 24h12" stroke="url(#kgGrad)" stroke-width="2" stroke-linecap="round"/>
  <path d="M14 14h8M14 18h5" stroke="url(#kgGrad)" stroke-width="2" stroke-linecap="round"/>
</svg>`;
}

let _installed = false;

/** نصب sprite در ابتدای سند (یک‌بار) */
export function installSprite() {
    if (_installed || document.getElementById('icon-sprite')) { _installed = true; return; }
    const symbols = Object.entries(ICONS)
        .map(([name, body]) => `<symbol id="i-${name}" viewBox="0 0 24 24">${body}</symbol>`)
        .join('');
    const wrap = document.createElement('div');
    wrap.innerHTML = `<svg id="icon-sprite" aria-hidden="true" focusable="false"
        style="position:absolute;width:0;height:0;overflow:hidden">${symbols}</svg>`;
    document.body.insertBefore(wrap.firstElementChild, document.body.firstChild);
    _installed = true;
}

/** ساخت آیکون: icon('car', 'icon-lg') */
export function icon(name, cls = '') {
    const key = ICONS[name] ? name : 'info';
    return `<svg class="icon ${cls}" aria-hidden="true" focusable="false"><use href="#i-${key}"/></svg>`;
}

export default { ICONS, icon, installSprite, brandSVG };
