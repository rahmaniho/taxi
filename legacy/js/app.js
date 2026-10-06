/* ==========================================================================
 * js/app.js — هستهٔ برنامه: پوسته، مسیریابی، ورود، شیفت، PWA
 *
 * قواعد این ماژول:
 *   • تنها متغیر سراسری مجاز: window.App
 *   • رندر صفحه‌ها idempotent است (هر بار view خالی و از نو ساخته می‌شود)
 *   • همهٔ خطاها با Toast فارسی نمایش داده می‌شوند و console.error فقط برای دیباگ است
 * ========================================================================== */

import { DB } from './db.js';
import { Auth, ROLE_LABELS, PAGES_BY_ROLE } from './auth.js';
import { Toast, toastError } from './components/toast.js';
import { Modal } from './components/modal.js';
import { icon, installSprite, brandSVG } from './components/icons.js';
import { JalaliDatepicker } from './jalali.js';
import { formatJalali, todayJalali, toFa, escapeHTML, formatNumber, formatMoney, readFileAsText } from './utils.js';

/* صفحه‌ها */
import dashboard from './pages/dashboard.js';
import queue from './pages/queue.js';
import { tripsNew, tripsList } from './pages/trips.js';
import drivers from './pages/drivers.js';
import addresses from './pages/addresses.js';
import subscribers from './pages/subscribers.js';
import { accDriver, accReport, accCommissions, accSubscribers, accPayments, accExpenses } from './pages/accounting.js';
import { reportsOperator, reportsCancel, reportsDebtors, reportsDrivers } from './pages/reports.js';
import audit from './pages/audit.js';
import settings from './pages/settings.js';
import operators from './pages/operators.js';
import backup from './pages/backup.js';
import training from './pages/training.js';
import about, { APP_VERSION } from './pages/about.js';

const PAGES = {
    dashboard, queue,
    'trips-new': tripsNew, 'trips-list': tripsList,
    drivers, addresses, subscribers,
    'acc-driver': accDriver, 'acc-report': accReport, 'acc-commissions': accCommissions,
    'acc-subscribers': accSubscribers, 'acc-payments': accPayments, 'acc-expenses': accExpenses,
    'reports-operator': reportsOperator, 'reports-cancel': reportsCancel,
    'reports-debtors': reportsDebtors, 'reports-drivers': reportsDrivers,
    audit, settings, operators, backup, training, about
};

/* فهرست منو (بر اساس نقش فیلتر می‌شود) */
const NAV = [
    { id: 'dashboard', label: 'داشبورد', icon: 'dashboard' },
    { id: 'queue', label: 'صف انتظار', icon: 'clock', badge: 'queue' },
    {
        label: 'سفرها', icon: 'route', children: [
            { id: 'trips-new', label: 'ثبت سفر جدید', icon: 'plus-circle' },
            { id: 'trips-list', label: 'لیست سفرها', icon: 'list' }
        ]
    },
    { id: 'drivers', label: 'رانندگان و خودروها', icon: 'car' },
    { id: 'addresses', label: 'آدرس‌های پرتکرار', icon: 'map-pin' },
    { id: 'subscribers', label: 'مشترکین', icon: 'users' },
    {
        label: 'حسابداری', icon: 'calculator', children: [
            { id: 'acc-driver', label: 'صورت‌حساب رانندگان', icon: 'file-text' },
            { id: 'acc-report', label: 'گزارش درآمد/هزینه', icon: 'bar-chart' },
            { id: 'acc-commissions', label: 'کمیسیون‌ها', icon: 'percent' },
            { id: 'acc-subscribers', label: 'حسابداری مشترکین', icon: 'user-check' },
            { id: 'acc-payments', label: 'پرداخت‌ها', icon: 'credit-card' },
            { id: 'acc-expenses', label: 'هزینه‌های جانبی', icon: 'receipt' }
        ]
    },
    {
        label: 'گزارش‌ها', icon: 'bar-chart', children: [
            { id: 'reports-operator', label: 'گزارش اپراتور', icon: 'headset' },
            { id: 'reports-cancel', label: 'گزارش لغو سفرها', icon: 'x-circle' },
            { id: 'reports-debtors', label: 'مشتریان بدهکار', icon: 'wallet' },
            { id: 'reports-drivers', label: 'عملکرد رانندگان', icon: 'activity' }
        ]
    },
    { id: 'audit', label: 'گزارش تغییرات', icon: 'clipboard' },
    { id: 'operators', label: 'کاربران و شیفت‌ها', icon: 'shield' },
    { id: 'backup', label: 'پشتیبان‌گیری', icon: 'database' },
    { id: 'settings', label: 'تنظیمات', icon: 'settings' },
    { id: 'training', label: 'آموزش', icon: 'book' },
    { id: 'about', label: 'درباره', icon: 'info' }
];

const SIDEBAR_KEY = 'taxi_sidebar_open';
const THEME_KEY = 'taxi_theme';

/* --------------------------- وضعیت درونی برنامه --------------------------- */

let _currentPage = '';
let _currentParams = {};
let _sidebarRole = '';
let _deferredInstall = null;
let _renderCount = 0;

/* ================================ شروع کار ================================ */

async function boot() {
    installSprite();
    applyTheme(localStorage.getItem(THEME_KEY) !== 'light');
    updateHeaderClock();
    setInterval(updateHeaderClock, 20000);

    try {
        await DB.init();
    } catch (err) {
        console.error('DB init', err);
        Toast.error('راه‌اندازی پایگاه داده با خطا مواجه شد؛ برنامه با دادهٔ پیش‌فرض ادامه می‌دهد');
    }

    try {
        await Auth.init();
    } catch (err) {
        console.error('Auth init', err);
    }

    window.addEventListener('hashchange', () => routeFromHash());
    window.addEventListener('online', () => setOnlineState(true));
    window.addEventListener('offline', () => setOnlineState(false));
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        _deferredInstall = e;
    });
    window.addEventListener('appinstalled', () => {
        _deferredInstall = null;
        Toast.success('برنامه با موفقیت نصب شد');
    });
    registerServiceWorker();

    if (Auth.isLoggedIn()) {
        startApp();
    } else {
        showLogin();
    }
}

/* =============================== صفحهٔ ورود =============================== */

function showLogin() {
    const screen = document.getElementById('auth-screen');
    const shell = document.getElementById('app-shell');
    shell?.setAttribute('hidden', '');
    screen.hidden = false;
    screen.innerHTML = `
      <div class="auth-card">
        <div class="auth-brand">
          ${brandSVG(64)}
          <h1>تاکسی تلفنی کارن‌سافت</h1>
          <p>سامانهٔ مدیریت آژانس تلفنی — نسخهٔ ${toFa(APP_VERSION)}</p>
        </div>
        <form id="loginForm" autocomplete="off">
          <div class="form-group">
            <label class="form-label">نام کاربری</label>
            <input class="form-input" id="loginUser" dir="ltr" required autocomplete="username" placeholder="admin">
          </div>
          <div class="form-group">
            <label class="form-label">رمز عبور</label>
            <input class="form-input" id="loginPass" type="password" dir="ltr" required autocomplete="current-password">
          </div>
          <div class="field-error" id="loginError" style="display:none"></div>
          <button class="btn btn-gold w-100 mt-10" type="submit" id="loginBtn">${icon('lock')} ورود به سامانه</button>
        </form>
        <div class="auth-hint">
          ${icon('info')} کاربران پیش‌فرض نسخهٔ نمایشی: <b dir="ltr">admin / admin123</b> — اپراتور: <b dir="ltr">operator / operator123</b> — حسابدار: <b dir="ltr">accountant / account123</b><br>
          پس از اولین ورود، رمزها را از «کاربران و شیفت‌ها» تغییر دهید.
        </div>
        <div class="auth-footer">
          داده‌ها به‌صورت محلی روی همین مرورگر ذخیره می‌شوند · ${formatJalali(todayJalali())}
        </div>
      </div>`;

    const form = screen.querySelector('#loginForm');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = screen.querySelector('#loginBtn');
        const errBox = screen.querySelector('#loginError');
        const user = screen.querySelector('#loginUser').value.trim();
        const pass = screen.querySelector('#loginPass').value;
        btn.disabled = true;
        btn.textContent = 'در حال بررسی…';
        errBox.style.display = 'none';
        try {
            await Auth.login(user, pass);
            Toast.success(`خوش آمدید${Auth.current()?.fullName ? '، ' + Auth.current().fullName : ''}`);
            startApp();
        } catch (err) {
            errBox.textContent = err.message || 'ورود ناموفق بود';
            errBox.style.display = 'block';
            screen.querySelector('#loginPass').value = '';
            screen.querySelector('#loginPass').focus();
        } finally {
            btn.disabled = false;
            btn.innerHTML = `${icon('lock')} ورود به سامانه`;
        }
    });
    setTimeout(() => screen.querySelector('#loginUser')?.focus(), 200);
}

/* =============================== پوستهٔ برنامه =============================== */

function startApp() {
    const screen = document.getElementById('auth-screen');
    const shell = document.getElementById('app-shell');
    if (screen) { screen.hidden = true; screen.innerHTML = ''; }
    shell.removeAttribute('hidden');

    buildSidebar();
    buildHeader();
    if (!window.location.hash) {
        window.location.hash = '#dashboard';
    } else {
        routeFromHash();
    }
    updateSidebarBadges();
    setInterval(updateSidebarBadges, 60000);
    if (document.body.classList.contains('sidebar-open')) document.body.classList.remove('sidebar-open');
}

function buildSidebar() {
    const sidebar = document.getElementById('sidebar');
    const allowed = PAGES_BY_ROLE[Auth.role()] || [];
    sidebar.innerHTML = `
      <div class="sidebar-header">
        <div class="sidebar-logo">${brandSVG(40)}</div>
        <div class="sidebar-brand">
          <div class="brand-name">کارن‌سافت</div>
          <div class="brand-sub">مدیریت تاکسی تلفنی</div>
        </div>
        <button class="theme-toggle-header" id="themeToggleHeader" type="button" aria-label="تغییر تم" title="تغییر تم روشن/تاریک">
          ${icon(document.documentElement.getAttribute('data-theme') === 'dark' ? 'sun' : 'moon')}
        </button>
      </div>
      <nav class="sidebar-nav" id="sidebarNav">
        ${NAV.map((item) => navItemHTML(item, allowed)).join('')}
      </nav>
      <div class="sidebar-footer">
        <span>کارن‌سافت</span> •
        <a href="mailto:info@karen-soft.ir">info@karen-soft.ir</a><br>
        نسخهٔ ${toFa(APP_VERSION)} · ${formatJalali(todayJalali())}
      </div>`;

    _sidebarRole = Auth.role();

    /* وضعیت باز/بستهٔ سایدبار روی موبایل */
    if (localStorage.getItem(SIDEBAR_KEY) === 'open') sidebar.classList.add('open');
    else sidebar.classList.add('closed');

    sidebar.querySelector('#themeToggleHeader').addEventListener('click', () => App.setTheme(document.documentElement.getAttribute('data-theme') !== 'dark'));

    sidebar.querySelector('#sidebarNav').addEventListener('click', (e) => {
        const toggle = e.target.closest('[data-toggle="submenu"]');
        if (toggle) {
            const box = toggle.nextElementSibling;
            toggle.classList.toggle('open');
            box?.classList.toggle('open');
            return;
        }
        const page = e.target.closest('[data-page]');
        if (!page) return;
        const id = page.dataset.page;
        if (!_pagesVisible().includes(id)) { Toast.warning('این بخش برای نقش شما در دسترس نیست'); return; }
        App.navigate(id);
        if (window.innerWidth <= 768) toggleSidebar(false);
    });

    /* پشتیبانی از ناوبری با URL هش‌دار مثل #acc-subscribers */
    if (window.innerWidth <= 768) {
        document.getElementById('sidebarBackdrop')?.remove();
        const backdrop = document.createElement('div');
        backdrop.className = 'sidebar-backdrop';
        backdrop.id = 'sidebarBackdrop';
        backdrop.addEventListener('click', () => toggleSidebar(false));
        document.body.appendChild(backdrop);
    }
}

function navItemHTML(item, allowed) {
    if (item.children) {
        const kids = item.children.filter((c) => allowed.includes(c.id));
        if (!kids.length) return '';
        const active = kids.some((c) => c.id === _currentPage) ? ' active' : '';
        return `<button class="nav-item${active}" data-toggle="submenu" type="button">
                  ${icon(item.icon)}<span class="nav-label">${item.label}</span>${icon('chevron-down', 'chevron')}
                </button>
                <div class="submenu${active ? ' open' : ''}">
                  ${kids.map((c) => `<button class="nav-item${c.id === _currentPage ? ' active' : ''}" type="button" data-page="${c.id}">
                      ${icon(c.icon)} ${c.label}</button>`).join('')}
                </div>`;
    }
    if (!allowed.includes(item.id)) return '';
    return `<button class="nav-item${item.id === _currentPage ? ' active' : ''}" type="button" data-page="${item.id}">
              ${icon(item.icon)}<span class="nav-label">${item.label}</span>
              <span class="nav-badge" id="navBadge-${item.id}"></span>
            </button>`;
}

function buildHeader() {
    const header = document.querySelector('.header');
    if (!header) return;
    const user = Auth.current() || {};
    header.innerHTML = `
      <button class="hamburger" id="hamburgerBtn" type="button" aria-label="منو">${icon('menu')}</button>
      <div class="header-date" id="headerDate"></div>
      <div class="header-status" id="headerStatus">
        <span class="dot"></span><span>${navigator.onLine ? 'آماده' : 'آفلاین — داده محلی'}</span>
      </div>
      <div class="header-user">
        <button class="top-chip" id="shiftChip" type="button" title="شیفت کاری"></button>
        <button class="top-chip" id="alertChip" type="button" title="هشدارها">${icon('bell')} <span class="txt">هشدارها</span> <span class="chip-count" id="alertCount">۰</span></button>
        <div class="dropdown">
          <button class="top-chip" id="userChip" type="button">
            ${icon('user')} <span class="txt">${escapeHTML(user.fullName || 'کاربر')}</span> ${icon('chevron-down')}
          </button>
          <div class="dropdown-menu" id="userMenu">
            <div class="dropdown-item" style="cursor:default">
              <span class="role-badge role-${user.role}">${ROLE_LABELS[user.role] || ''}</span>
            </div>
            <div class="dropdown-sep"></div>
            <button class="dropdown-item" type="button" data-action="profile">${icon('user')} پروفایل من</button>
            <button class="dropdown-item" type="button" data-action="password">${icon('lock')} تغییر رمز عبور</button>
            <button class="dropdown-item" type="button" data-action="theme">${icon('sun')} تغییر تم</button>
            <button class="dropdown-item" type="button" data-action="install">${icon('download')} نصب برنامه (PWA)</button>
            <div class="dropdown-sep"></div>
            <button class="dropdown-item danger" type="button" data-action="logout">${icon('logout')} خروج از سامانه</button>
          </div>
        </div>
      </div>`;

    header.querySelector('#hamburgerBtn').addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar');
        toggleSidebar(!sidebar.classList.contains('open'));
    });
    header.querySelector('#userChip').addEventListener('click', (e) => {
        e.stopPropagation();
        header.querySelector('#userMenu').classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.dropdown')) header.querySelector('#userMenu')?.classList.remove('open');
    });
    header.querySelector('#userMenu').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        header.querySelector('#userMenu').classList.remove('open');
        const action = btn.dataset.action;
        if (action === 'logout') return doLogout();
        if (action === 'theme') return App.setTheme(document.documentElement.getAttribute('data-theme') !== 'dark');
        if (action === 'install') return App.installPWA();
        if (action === 'password') return App.changeMyPassword();
        if (action === 'profile') return App.showProfile();
    });
    header.querySelector('#shiftChip').addEventListener('click', openShiftPanel);
    header.querySelector('#alertChip').addEventListener('click', () => App.navigate('dashboard', { focus: 'alerts' }));

    updateShiftChip();
    setInterval(updateShiftChip, 60000);
}

function toggleSidebar(open) {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('open', open);
    sidebar.classList.toggle('closed', !open);
    localStorage.setItem(SIDEBAR_KEY, open ? 'open' : 'closed');
    document.getElementById('sidebarBackdrop')?.classList.toggle('show', open);
    document.getElementById('mainContent')?.classList.toggle('expanded', !open && window.innerWidth > 768);
}

function setOnlineState(online) {
    const el = document.getElementById('headerStatus');
    if (el) el.innerHTML = `<span class="dot"></span><span>${online ? 'آماده' : 'آفلاین — داده محلی'}</span>`;
}

function updateHeaderClock() {
    const el = document.getElementById('headerDate');
    if (!el) return;
    const d = new Date();
    const time = d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
    el.textContent = `${formatJalali(todayJalali())} — ساعت ${time}`;
}

function updateShiftChip() {
    const chip = document.getElementById('shiftChip');
    if (!chip) return;
    const shift = Auth.currentShift();
    if (shift) {
        chip.className = 'top-chip open';
        chip.innerHTML = `${icon('play')} <span class="txt">شیفت ${escapeHTML(shift.code)}</span>`;
    } else {
        chip.className = 'top-chip';
        chip.innerHTML = `${icon('clock')} <span class="txt">شروع شیفت</span>`;
    }
}

function updateSidebarBadges() {
    const badge = document.getElementById('navBadge-queue');
    if (!badge) return;
    try {
        const pending = DB.list('trips').filter((t) => t.status === 'pending').length;
        badge.textContent = pending ? toFa(pending) : '';
        badge.style.display = pending ? 'inline-block' : 'none';
    } catch { badge.textContent = ''; }
    const alertCount = document.getElementById('alertCount');
    if (alertCount) {
        try {
            const { Alerts } = window.App;
            const n = Alerts ? Alerts.all().length : 0;
            alertCount.textContent = toFa(n);
            alertCount.style.display = n ? 'inline-block' : 'none';
        } catch { alertCount.textContent = ''; }
    }
}

/* ================================ مسیریابی ================================ */

function routeFromHash() {
    const raw = window.location.hash.replace(/^#\/?/, '');
    if (!raw) return;
    const pageId = raw.split('?')[0].split('/')[0];
    if (PAGES[pageId]) App.navigate(pageId, {}, { fromHash: true });
}

function _pagesVisible() {
    return PAGES_BY_ROLE[Auth.role()] || [];
}

/**
 * رندر یک صفحه (idempotent)
 * @param {string} pageId شناسهٔ صفحه
 * @param {object} params پارامترهای اختیاری (مثل driverId یا subscriberId)
 */
function renderPage(pageId, params = {}) {
    const page = PAGES[pageId];
    if (!page) { Toast.error('صفحه یافت نشد'); return; }
    if (!_pagesVisible().includes(pageId)) {
        Toast.warning('دسترسی به این بخش برای نقش شما مجاز نیست');
        if (pageId !== 'dashboard') { App.navigate('dashboard'); }
        return;
    }
    /* اگر نقش کاربر عوض شده باشد (ورود کاربر جدید)، منو بازسازی می‌شود */
    if (_sidebarRole !== Auth.role()) buildSidebar();

    const view = document.getElementById('view');
    view.innerHTML = '';
    _currentPage = pageId;
    _currentParams = params || {};
    document.title = `${page.title} | تاکسی تلفنی کارن‌سافت`;
    try {
        page.render(view, _currentParams);
        _renderCount++;
    } catch (err) {
        console.error('render ' + pageId, err);
        view.innerHTML = `<section class="page-section active">
          <div class="card"><div class="empty-state">${icon('alert-triangle', 'icon-xl')}
            <h3>خطا در نمایش این بخش</h3>
            <p class="text-sm op-60">${escapeHTML(err.message || '')}</p>
            <button class="btn btn-gold btn-sm mt-10" type="button" onclick="window.App.reload()">تلاش مجدد</button>
          </div></div></section>`;
        Toast.error('نمایش صفحه با خطا مواجه شد');
    }
    JalaliDatepicker.init(view);
    document.querySelectorAll('#sidebarNav [data-page]').forEach((b) => b.classList.toggle('active', b.dataset.page === pageId));
    document.querySelectorAll('#sidebarNav .submenu').forEach((box) => {
        const has = !!box.querySelector('[data-page].active');
        box.classList.toggle('open', has);
        box.previousElementSibling?.classList.toggle('open', has);
    });
    const main = document.getElementById('mainContent');
    main?.scrollTo?.({ top: 0 });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    updateSidebarBadges();
}

async function doLogout() {
    const ok = await Modal.confirm({
        title: 'خروج از سامانه',
        message: 'از حساب کاربری خارج می‌شوید؟ شیفت باز (در صورت وجود) بسته نمی‌شود.',
        iconName: 'logout', danger: true, okText: 'خروج'
    });
    if (!ok) return;
    Auth.logout();
    window.location.hash = '';
    window.location.reload();
}

/* ================================ شیفت کاری ================================ */

function openShiftPanel() {
    const shift = Auth.currentShift();
    if (shift) {
        const s = Auth.shiftStats(shift);
        Modal.open({
            title: `شیفت ${shift.code}`,
            iconName: 'clock',
            body: `
              <div class="grid-2 mb-14">
                <div class="kpi"><div class="k-label">شروع</div><div class="k-value">${new Date(shift.startTime).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}</div></div>
                <div class="kpi"><div class="k-label">صندوق ابتدای شیفت</div><div class="k-value">${formatNumber(shift.openingCash || 0)}</div></div>
                <div class="kpi"><div class="k-label">سفرهای ثبت‌شده</div><div class="k-value">${formatNumber(s.tripsCount || 0)}</div></div>
                <div class="kpi"><div class="k-label">درآمد نقدی</div><div class="k-value text-green">${formatNumber(s.cash || 0)}</div></div>
              </div>
              <div class="form-group"><label class="form-label">مبلغ صندوق در پایان شیفت (تومان)</label>
                <input class="form-input" id="shiftCloseCash" type="number" value="${formatNumber(s.expectedCash ?? shift.openingCash ?? 0).replace(/[^0-9]/g, '')}"></div>
              <div class="form-group"><label class="form-label">یادداشت تحویل</label>
                <textarea class="form-input" id="shiftCloseNote" rows="2" placeholder="اختلاف صندوق، توضیحات…"></textarea></div>
              <div class="soft-box">${icon('info')} با بستن شیفت، گزارش تحویل صندوق برای چاپ آماده می‌شود.</div>`,
            footer: `<button class="btn btn-outline" type="button" data-modal-close>بستن</button>
                     <button class="btn btn-gold" type="button" id="shiftClose">${icon('check')} پایان شیفت و چاپ گزارش</button>`,
            onMount(node, api) {
                node.querySelector('#shiftClose').addEventListener('click', async () => {
                    try {
                        const cash = Number(node.querySelector('#shiftCloseCash').value) || 0;
                        const note = node.querySelector('#shiftCloseNote').value.trim();
                        const closed = Auth.closeShift({ closingCash: cash, notes: note });
                        api.close();
                        updateShiftChip();
                        App.notifyDataChanged();
                        Toast.success('شیفت با موفقیت بسته شد');
                        printShiftReport(closed);
                    } catch (err) { toastError(err); }
                });
            }
        });
        return;
    }
    Modal.open({
        title: 'شروع شیفت کاری',
        iconName: 'play',
        body: `
          <p class="mb-12">برای نسبت‌دادن سفرها به شما و تهیهٔ گزارش تحویل صندوق، شیفت را آغاز کنید.</p>
          <div class="form-group"><label class="form-label">صندوق ابتدای شیفت (تومان)</label>
            <input class="form-input" id="shiftOpenCash" type="number" value="0"></div>
          <div class="form-group"><label class="form-label">یادداشت</label>
            <input class="form-input" id="shiftOpenNote" placeholder="اختیاری"></div>`,
        footer: `<button class="btn btn-outline" type="button" data-modal-close>انصراف</button>
                 <button class="btn btn-gold" type="button" id="shiftOpen">${icon('play')} شروع شیفت</button>`,
        onMount(node, api) {
            node.querySelector('#shiftOpen').addEventListener('click', () => {
                try {
                    Auth.openShift({
                        openingCash: Number(node.querySelector('#shiftOpenCash').value) || 0,
                        notes: node.querySelector('#shiftOpenNote').value.trim()
                    });
                    api.close();
                    updateShiftChip();
                    Toast.success('شیفت آغاز شد — سفرهای جدید به شما نسبت داده می‌شود');
                } catch (err) { toastError(err); }
            });
        }
    });
}

async function printShiftReport(shift) {
    try {
        const { shiftReportHTML } = await import('./prints.js');
        const { previewPrint } = await import('./components/ui.js');
        const { Trips } = await import('./domain.js');
        const trips = Trips.all().filter((t) => new Date(t.pickupTime || t.createdAt || 0).getTime() >= new Date(shift.startTime).getTime());
        previewPrint(shiftReportHTML(shift, shift.stats || Auth.shiftStats(shift), { operator: shift.operatorName, trips }),
            { title: 'گزارش شیفت', filename: `shift-${shift.code || todayJalali()}` });
    } catch (err) {
        console.error('shift report', err);
        Toast.warning('گزارش شیفت ساخته نشد');
    }
}

/* ============================== Service Worker ============================== */

function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol === 'file:') {
        console.warn('SW روی پروتکل file اجرا نمی‌شود؛ برای نصب PWA از وب‌سرور استفاده کنید');
        return;
    }
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then((reg) => {
            reg.addEventListener?.('updatefound', () => {});
            if (reg.waiting) Toast.info('نسخهٔ جدید برنامه آماده است؛ صفحه را دوباره باز کنید');
        }).catch((err) => {
            console.error('SW register', err);
        });
    });
}

async function showSWStatus() {
    const box = document.getElementById('swStatus') || null;
    const parts = [];
    parts.push(`پروتکل: ${location.protocol}`);
    if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        parts.push(`Service Worker ثبت‌شده: ${toFa(regs.length)}`);
        const ctrl = navigator.serviceWorker.controller;
        parts.push(ctrl ? 'صفحه در کنترل Service Worker است ✅' : 'صفحه هنوز تحت کنترل نیست (یک‌بار بازخوانی کنید)');
        if (regs[0]) {
            try {
                const cacheKeys = await caches.keys();
                parts.push(`کش‌ها: ${cacheKeys.map((k) => escapeHTML(k)).join(' ، ')}`);
            } catch { /* ignore */ }
        }
    } else {
        parts.push('مرورگر از Service Worker پشتیبانی نمی‌کند');
    }
    parts.push(`وضعیت شبکه: ${navigator.onLine ? 'آنلاین' : 'آفلاین'}`);
    const html = parts.map((p) => `${icon('check')} ${p}`).join('<br>');
    if (box) box.innerHTML = html; else Modal.alert({ title: 'وضعیت Service Worker', body: html });
}

/* =================================== App =================================== */

const App = {
    version: APP_VERSION,

    navigate(pageId, params = {}, { fromHash = false } = {}) {
        if (!PAGES[pageId]) { Toast.error('صفحه یافت نشد'); return; }
        if (!_pagesVisible().includes(pageId)) {
            Toast.warning('دسترسی به این بخش برای نقش شما مجاز نیست');
            pageId = 'dashboard';
        }
        _currentParams = params;
        const hash = `#${pageId}`;
        if (!fromHash && window.location.hash !== hash) window.location.hash = hash;
        renderPage(pageId, params);
    },

    reload() { renderPage(_currentPage || 'dashboard', _currentParams); },

    /** اعلام تغییر داده: بازخوانی صفحهٔ جاری + به‌روزرسانی هشدارها */
    notifyDataChanged() {
        updateSidebarBadges();
        if (_currentPage) renderPage(_currentPage, _currentParams);
    },

    currentPage: () => _currentPage,
    params: () => ({ ..._currentParams }),
    pages: () => ({ ...PAGES }),
    nav: () => PAGES_BY_ROLE[Auth.role()] || [],
    renderCount: () => _renderCount,

    setTheme(dark) {
        applyTheme(dark);
        localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
        const btn = document.getElementById('themeToggleHeader');
        if (btn) btn.innerHTML = icon(dark ? 'sun' : 'moon');
    },

    toggleSidebar,
    updateShiftChip,
    updateSidebarBadges,

    async installPWA() {
        if (_deferredInstall) {
            _deferredInstall.prompt();
            const res = await _deferredInstall.userChoice;
            if (res?.outcome === 'accepted') Toast.success('نصب برنامه آغاز شد');
            else Toast.info('نصب برنامه لغو شد');
            _deferredInstall = null;
            return;
        }
        if (window.matchMedia('(display-mode: standalone)').matches) {
            Toast.info('برنامه از قبل نصب شده است');
            return;
        }
        Modal.alert({
            title: 'نصب برنامه روی دستگاه',
            body: `مرورگر شما پیام نصب خودکار نمایش نمی‌دهد. برای نصب دستی:<br><br>
              ${icon('info')} <b>اندروید (کروم):</b> منوی مرورگر ← «افزودن به صفحهٔ اصلی» یا «نصب برنامه»<br>
              ${icon('info')} <b>آیفون (سافاری):</b> دکمهٔ اشتراک‌گذاری ← «افزودن به صفحهٔ اصلی»<br>
              ${icon('info')} <b>دسکتاپ (کروم/اج):</b> آیکن نصب در نوار آدرس.`
        });
    },

    showSWStatus,

    showProfile() {
        const u = Auth.current() || {};
        const shifts = DB.list('shifts').filter((s) => s.operatorId === u.id);
        const trips = DB.list('trips').filter((t) => t.operatorId === u.id);
        Modal.open({
            title: 'پروفایل من',
            iconName: 'user',
            body: `
              <div class="grid-2 mb-14">
                <div><div class="hint">نام</div><div class="text-bold">${escapeHTML(u.fullName || '—')}</div></div>
                <div><div class="hint">نام کاربری</div><div dir="ltr">${escapeHTML(u.username || '')}</div></div>
                <div><div class="hint">نقش</div><div><span class="role-badge role-${u.role}">${ROLE_LABELS[u.role] || ''}</span></div></div>
                <div><div class="hint">تلفن</div><div>${toFa(u.phone || '—')}</div></div>
                <div><div class="hint">آخرین ورود</div><div>${u.loginAt ? formatJalali(u.loginAt.slice(0, 10)) : '—'}</div></div>
                <div><div class="hint">شیفت فعلی</div><div>${Auth.currentShift()?.code ? escapeHTML(Auth.currentShift().code) : 'ندارد'}</div></div>
              </div>
              <div class="kpi-tiles">
                <div class="kpi"><div class="k-label">شیفت‌های من</div><div class="k-value">${formatNumber(shifts.length)}</div></div>
                <div class="kpi"><div class="k-label">سفرهای ثبت‌شدهٔ من</div><div class="k-value">${formatNumber(trips.length)}</div></div>
                <div class="kpi"><div class="k-label">تکمیل‌شده</div><div class="k-value text-green">${formatNumber(trips.filter((t) => t.status === 'completed').length)}</div></div>
              </div>`,
            footer: `<button class="btn btn-outline" type="button" data-modal-close>بستن</button>
                     <button class="btn btn-outline" type="button" onclick="window.App.changeMyPassword()">${icon('lock')} تغییر رمز</button>`,
        });
    },

    async changeMyPassword() {
        const u = Auth.current();
        if (!u) return;
        const oldPass = await Modal.prompt({
            title: 'تغییر رمز عبور',
            message: 'رمز فعلی خود را وارد کنید:',
            inputType: 'password', okText: 'ادامه'
        });
        if (oldPass === null) return;
        const n1 = await Modal.prompt({ title: 'رمز جدید', message: 'رمز جدید (حداقل ۶ کاراکتر):', inputType: 'password', okText: 'ادامه' });
        if (n1 === null) return;
        const n2 = await Modal.prompt({ title: 'تکرار رمز جدید', message: 'رمز جدید را دوباره وارد کنید:', inputType: 'password', okText: 'ذخیره' });
        if (n2 === null) return;
        try {
            if (n1 !== n2) throw new Error('تکرار رمز جدید مطابقت ندارد');
            await Auth.changePassword(u.id, oldPass, n1);
            Toast.success('رمز عبور با موفقیت تغییر کرد');
        } catch (err) { toastError(err); }
    },

    /* دسترسی مستقیم به لایه‌های داده برای صفحه‌ها (بدون متغیر سراسری اضافه) */
    get DB() { return DB; },
    get Auth() { return Auth; }
};

/* دسترسی به هشدارها برای نشان‌گر نوار (بدون import چرخشی) */
import('./domain.js').then((mod) => { App.Alerts = mod.Alerts; }).catch(() => {});

/* ============================== شروع ============================== */

window.App = App;

function applyTheme(dark) {
    const html = document.documentElement;
    if (dark) html.setAttribute('data-theme', 'dark');
    else html.setAttribute('data-theme', 'light');
    html.style.colorScheme = dark ? 'dark' : 'light';
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}

export default App;
