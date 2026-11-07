import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { readApp } from './extract.mjs';
import { createDevServer } from '../scripts/serve.mjs';

const rootDir = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(condition, timeout = 12000, step = 25) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (await condition()) return true;
    } catch (_) { /* تلاش مجدد */ }
    await wait(step);
  }
  throw new Error('waitFor: شرط مورد انتظار در مهلت تعیین‌شده برقرار نشد.');
}

function createStatefulFetch(baseUrl, windowRef) {
  const jar = new Map();
  const syncDocCookie = () => {
    const publicCookies = [];
    for (const [k, v] of jar.entries()) {
      if (k !== 'taxi_session') publicCookies.push(`${k}=${encodeURIComponent(v)}`);
    }
    Object.defineProperty(windowRef.document, 'cookie', {
      configurable: true,
      get: () => publicCookies.join('; '),
      set: () => {},
    });
  };
  syncDocCookie();
  return async (input, init = {}) => {
    const rawUrl = typeof input === 'string' ? input : input.url;
    const fullUrl = new URL(rawUrl, baseUrl).href;
    const headers = new Headers(init.headers || {});
    const cookieHeader = [...jar.entries()].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ');
    if (cookieHeader) headers.set('cookie', cookieHeader);
    const res = await globalThis.fetch(fullUrl, { ...init, headers });
    const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const line of setCookies) {
      const [pair, ...attrs] = line.split(';').map(s => s.trim());
      const eq = pair.indexOf('=');
      if (eq <= 0) continue;
      const name = pair.slice(0, eq);
      const val = decodeURIComponent(pair.slice(eq + 1));
      const maxAgeZero = attrs.some(a => /^max-age=0$/i.test(a));
      if (maxAgeZero || val === '') jar.delete(name);
      else jar.set(name, val);
    }
    syncDocCookie();
    return res;
  };
}

async function bootRawDom({ url = 'https://localhost/', beforeParse } = {}) {
  const html = readApp({ authenticated: false });
  const dom = new JSDOM(html, {
    url,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      try {
        Object.defineProperty(window, 'crypto', {
          value: { getRandomValues: a => webcrypto.getRandomValues(a), subtle: webcrypto.subtle },
          configurable: true,
        });
      } catch (_) {}
      window.HTMLCanvasElement.prototype.getContext = () => null;
      window.URL.createObjectURL = () => 'blob:mock';
      window.URL.revokeObjectURL = () => {};
      window.HTMLAnchorElement.prototype.click = () => {};
      window.matchMedia = query => ({
        matches: query.includes('dark'),
        media: query,
        addEventListener() {},
        removeEventListener() {},
      });
      window.fetch = async () => { throw new Error('Network disabled'); };
      if (beforeParse) beforeParse(window);
    },
  });
  const { window } = dom;
  if (window.document.readyState !== 'complete') {
    await Promise.race([new Promise(r => window.addEventListener('load', r, { once: true })), wait(8000)]);
  }
  return { dom, window, document: window.document, App: window.App };
}

function go(session, route) {
  session.window.location.hash = `#${route}`;
  session.App.render();
}

async function startTestBackend() {
  const { server, state } = createDevServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    state,
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

test('صفحهٔ اشتراک v1.6.0: اسلوگان، ۵ پلن رسمی به تومان، جدول مقایسه، ۷ پرسش پرتکرار و هاب کارن‌سافت', async () => {
  const backend = await startTestBackend();
  const session = await bootRawDom({
    url: `${backend.baseUrl}/`,
    beforeParse(window) {
      window.fetch = createStatefulFetch(backend.baseUrl, window);
    },
  });
  try {
    await session.App.subscription.login('agency@taxi.ir', 'taxi12345', true);
    go(session, 'subscription');
    await waitFor(() => session.App.subscription.subStore().loaded === true);

    const page = session.document.querySelector('#subscription-page');
    assert.ok(page, 'صفحهٔ اشتراک رندر شد');
    assert.match(session.document.querySelector('#tx-hero .tx-hero-title')?.textContent || '', /تاکسینو؛ همه‌چیز تحت کنترل شما/, 'اسلوگان رسمی در هیرو نمایش داده شد');

    const cards = [...session.document.querySelectorAll('.tx-plan-card')];
    assert.equal(cards.length, 5, '۵ پلن رسمی نمایش داده می‌شود');
    const byCode = Object.fromEntries(cards.map(c => [c.dataset.planCode, c]));
    assert.deepEqual(Object.keys(byCode).sort(), ['lifetime', 'monthly', 'quarterly', 'semiannual', 'yearly'], 'کدهای ۵ پلن رسمی درست است');
    assert.match(byCode.monthly.textContent, /۱۵۰٬۰۰۰/, 'قیمت پلن یک‌ماهه به تومان');
    assert.match(byCode.quarterly.textContent, /۴۲۰٬۰۰۰/, 'قیمت پلن سه‌ماهه به تومان');
    assert.match(byCode.semiannual.textContent, /۷۸۰٬۰۰۰/, 'قیمت پلن شش‌ماهه به تومان');
    assert.match(byCode.yearly.textContent, /۱٬۲۰۰٬۰۰۰/, 'قیمت پلن یک‌ساله به تومان');
    assert.match(byCode.lifetime.textContent, /۷٬۰۰۰٬۰۰۰/, 'قیمت پلن مادام‌العمر به تومان');
    assert.ok(byCode.yearly.classList.contains('is-featured'), 'پلن یک‌ساله ویژه است');
    assert.match(byCode.yearly.textContent, /پیشنهاد ویژه · بهترین انتخاب/, 'برچسب پیشنهاد ویژهٔ پلن یک‌ساله');
    assert.match(byCode.lifetime.textContent, /پرداخت یک‌باره \| بدون تمدید دوره‌ای/, 'برچسب پرداخت یک‌بارهٔ مادام‌العمر');
    assert.match(byCode.lifetime.textContent, /بدون تمدید دوره‌ای/, 'بدون وعدهٔ تمدید برای مادام‌العمر');

    const compare = session.document.querySelector('.tx-compare-table');
    assert.ok(compare, 'جدول مقایسهٔ پلن‌ها وجود دارد');
    assert.equal(compare.querySelectorAll('thead th').length, 6, 'جدول مقایسه ۵ پلن + ستون ویژگی دارد');

    assert.equal(session.document.querySelectorAll('.tx-faq-item').length, 7, '۷ پرسش پرتکرار نمایش داده می‌شود');

    const support = page.textContent;
    assert.match(support, /۰۹۱۵۲۵۲۱۱۶۶/, 'تلفن پشتیبانی کارن‌سافت');
    assert.match(support, /KarenSoftOfficial/, 'تلگرام رسمی کارن‌سافت');
    assert.match(support, /info@karen-soft\.ir/, 'ایمیل پشتیبانی');
    assert.equal(session.App.subscription.support().crisp_website_id, 'ffafdfcf-e510-45d0-a026-4e964ad420ee', 'شناسهٔ Crisp رسمی');
    assert.ok(session.document.querySelector('[data-action="support-live-chat"]'), 'چت زندهٔ Crisp روی درخواست فعال است');
  } finally {
    session.dom.window.close();
    await backend.close();
  }
});

test('استعلام قیمت آنی از سرور، کد تخفیف و ثبت سفارش دستی (کارت به کارت) با مبلغ صحیح', async () => {
  const backend = await startTestBackend();
  backend.state.coupons.unshift({ id: 901, code: 'TAXI20', type: 'percent', value: 20, max_uses: null, used_count: 0, is_active: true, ends_at: null });
  const session = await bootRawDom({
    url: `${backend.baseUrl}/`,
    beforeParse(window) {
      window.fetch = createStatefulFetch(backend.baseUrl, window);
    },
  });
  try {
    await session.App.subscription.login('agency@taxi.ir', 'taxi12345', true);
    go(session, 'subscription');
    await waitFor(() => session.App.subscription.subStore().loaded === true);

    await session.App.subscription.checkout('quarterly');
    await waitFor(() => session.document.querySelector('#sub-checkout-form .tx-order-total'));
    assert.match(session.document.querySelector('#sub-checkout-root').textContent, /۴۲۰٬۰۰۰/, 'مبلغ قابل پرداخت بدون مالیات = قیمت پلن');
    assert.doesNotMatch(session.document.querySelector('#sub-checkout-root').textContent, /مالیات/, 'وقتی مالیات صفر است ردیف نمایش داده نمی‌شود');

    const couponInput = session.document.querySelector('#sub-coupon-input');
    couponInput.value = 'TAXI20';
    session.document.querySelector('[data-action="sub-apply-coupon"]').click();
    await waitFor(() => (session.App.subscription.subStore().quote?.discount || 0) > 0);
    const rootText = session.document.querySelector('#sub-checkout-root').textContent;
    assert.match(rootText, /۸۴٬۰۰۰/, 'تخفیف ۲۰٪ محاسبه شد');
    assert.match(rootText, /۳۳۶٬۰۰۰/, 'مبلغ نهایی پس از تخفیف');

    session.document.querySelector('#sub-checkout-form').dispatchEvent(new session.window.Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => backend.state.orders.some(o => o.store_id === 1));
    await waitFor(() => /سفارش شما ثبت شد ✓/.test(session.document.querySelector('#modal-root')?.textContent || ''));
    const order = backend.state.orders.find(o => o.store_id === 1);
    assert.ok(order, 'سفارش در سرور ثبت شد');
    assert.equal(order.status, 'pending', 'سفارش دستی در انتظار تأیید است');
    assert.equal(order.amount, 336000, 'مبلغ سفارش پس از تخفیف ۲۰٪ (تومان)');
    assert.equal(order.coupon_code, 'TAXI20', 'کد تخفیف روی سفارش ثبت شد');
    assert.match(order.instructions, /336,000/, 'دستورالعمل پرداخت شامل مبلغ و شناسهٔ سفارش است');

    await session.App.subscription.hydrate();
    assert.ok(session.App.subscription.subStore().orders.some(o => o.id === order.id && o.status === 'pending'), 'سفارش در «سوابق خرید» دیده می‌شود');
    assert.match(session.document.querySelector('#subscription-page').textContent, /در انتظار تأیید پرداخت/, 'وضعیت سفارش در تاریخچه نمایش داده شد');
  } finally {
    session.dom.window.close();
    await backend.close();
  }
});

test('کال‌بک سرور-محور درگاه پرداخت (?billing=paid&order=N): فعال‌سازی آنی، پاک‌سازی URL و صدور فاکتور KS', async () => {
  const backend = await startTestBackend();
  backend.state.zarinpalEnabled = true;
  const session = await bootRawDom({
    url: `${backend.baseUrl}/`,
    beforeParse(window) {
      window.fetch = createStatefulFetch(backend.baseUrl, window);
    },
  });
  try {
    await session.App.subscription.login('agency@taxi.ir', 'taxi12345', true);
    const daysBefore = session.App.subscription.info().daysRemaining;
    assert.ok(daysBefore > 300, 'اشتراک فعال سالانه پیش از خرید');

    const res = await session.App.subscription.apiFetch('/api/subscription/checkout', {
      method: 'POST',
      body: { plan_code: 'quarterly', gateway: 'zarinpal' },
    });
    assert.ok(res.order && res.order.id, 'سفارش درگاهی ثبت شد');
    assert.match(res.redirect_url, /\/api\/billing\/callback\?order=/, 'آدرس بازگشت درگاه برگردانده شد');

    // شبیه‌سازی بازگشت موفق کاربر از درگاه (تأیید سمت سرور)
    const callbackRes = await globalThis.fetch(new URL(res.redirect_url, backend.baseUrl).href, { redirect: 'follow' });
    assert.ok(callbackRes.ok, 'کال‌بک درگاه پردازش شد');
    assert.equal(backend.state.orders.find(o => o.id === res.order.id).status, 'paid', 'سفارش در سرور پرداخت‌شده است');

    session.window.history.replaceState(null, '', `/?billing=paid&order=${res.order.id}#subscription`);
    await session.App.subscription.handleBillingCallback();
    await waitFor(() => session.document.querySelector('#sub-callback-banner'));

    assert.match(session.document.querySelector('#sub-callback-banner').textContent, /تأیید شد/, 'بنر موفقیت کال‌بک نمایش داده شد');
    assert.equal(session.window.location.search, '', 'پارامترهای درگاه از URL پاک شد');
    assert.equal(session.window.location.hash, '#subscription', 'کاربر در صفحهٔ اشتراک مانده است');

    const daysAfter = session.App.subscription.info().daysRemaining;
    assert.ok(daysAfter >= daysBefore + 85, `تمدد سه‌ماهه به ماندهٔ فعلی افزوده شد (${daysBefore} → ${daysAfter})`);

    const invoices = session.App.subscription.subStore().invoices;
    assert.equal(invoices.length, 1, 'فاکتور رسمی صادر شد');
    assert.match(invoices[0].number, /^KS-\d{4}-\d{5}$/, 'شمارهٔ فاکتور KS-… است');
    assert.equal(invoices[0].total, 420000, 'مبلغ فاکتور به تومان');

    session.document.querySelector('[data-action="sub-view-invoice"]').click();
    await waitFor(() => /فاکتور رسمی اشتراک/.test(session.document.querySelector('#modal-root')?.textContent || ''));
    const frame = session.document.querySelector('#print-preview-frame');
    assert.ok(frame, 'پیش‌نمایش چاپ فاکتور باز شد');
    assert.match(frame.getAttribute('srcdoc'), /KS-/, 'فاکتور چاپی شامل شمارهٔ KS است');
    assert.match(frame.getAttribute('srcdoc'), /کارن سافت \| KarenSoft/, 'سربرگ کارن‌سافت در فاکتور');
  } finally {
    session.dom.window.close();
    await backend.close();
  }
});

test('آژانس منقضی (فقط‌خواندنی) می‌تواند پلن بخرد و تمدید کند؛ ثبت دادهٔ عملیاتی همچنان قفل است', async () => {
  const backend = await startTestBackend();
  const session = await bootRawDom({
    url: `${backend.baseUrl}/`,
    beforeParse(window) {
      window.fetch = createStatefulFetch(backend.baseUrl, window);
    },
  });
  try {
    await session.App.subscription.login('expired@taxi.ir', 'taxi12345', true);
    assert.equal(session.App.subscription.writable(), false, 'آژانس در حالت فقط‌خواندنی است');

    go(session, 'subscription');
    await waitFor(() => session.App.subscription.subStore().loaded === true);
    assert.ok(session.document.querySelector('#subscription-banner'), 'بنر حالت فقط‌خواندنی نمایش داده شد');
    assert.ok(session.document.querySelector('#subscription-page'), 'صفحهٔ اشتراک برای آژانس منقضی باز است');
    assert.equal(session.document.querySelectorAll('.tx-plan-card').length, 5, 'هر ۵ پلن قابل مشاهده و خرید است');

    await session.App.subscription.checkout('monthly');
    await waitFor(() => session.document.querySelector('#sub-checkout-form .tx-order-total'));
    assert.match(session.document.querySelector('#sub-checkout-root').textContent, /۱۵۰٬۰۰۰/, 'قیمت پلن یک‌ماهه از سرور استعلام شد');
    session.document.querySelector('#sub-checkout-form').dispatchEvent(new session.window.Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => backend.state.orders.some(o => o.store_id === 2));
    await waitFor(() => /سفارش شما ثبت شد ✓/.test(session.document.querySelector('#modal-root')?.textContent || ''));
    assert.ok(backend.state.orders.some(o => o.store_id === 2 && o.status === 'pending' && o.amount === 150000), 'سفارش خرید در سرور ثبت شد');

    // ثبت دادهٔ عملیاتی همچنان قفل است
    go(session, 'trips/new');
    const tripForm = session.document.querySelector('form[data-form="trip"]');
    tripForm.querySelector('[name="passengerName"]').value = 'سفر غیرمجاز';
    tripForm.querySelector('[name="origin"]').value = 'الف';
    tripForm.querySelector('[name="destination"]').value = 'ب';
    tripForm.querySelector('[name="fare"]').dataset.manual = 'true';
    tripForm.querySelector('[name="fare"]').value = '120000';
    tripForm.dispatchEvent(new session.window.Event('submit', { bubbles: true, cancelable: true }));
    assert.equal(session.App.data.trips.length, 0, 'ثبت سفر در حالت منقضی مسدود ماند');
  } finally {
    session.dom.window.close();
    await backend.close();
  }
});

test('پنل مدیریت: تعرفهٔ تومانی ۵ پلن، دلیل الزامی تمدید و تأیید سفارش با شماره پیگیری (reference/note)', async () => {
  const backend = await startTestBackend();

  // ۱) آژانس یک سفارش دستی ثبت می‌کند
  const agencySession = await bootRawDom({
    url: `${backend.baseUrl}/`,
    beforeParse(window) {
      window.fetch = createStatefulFetch(backend.baseUrl, window);
    },
  });
  try {
    await agencySession.App.subscription.login('agency@taxi.ir', 'taxi12345', true);
    const expiryBeforeMs = Date.parse(backend.state.licenses.find(l => l.store_id === 1).expires_at);
    await agencySession.App.subscription.checkout('monthly');
    await waitFor(() => agencySession.document.querySelector('#sub-checkout-form .tx-order-total'));
    agencySession.document.querySelector('#sub-checkout-form').dispatchEvent(new agencySession.window.Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => backend.state.orders.some(o => o.store_id === 1));
    const order = backend.state.orders.find(o => o.store_id === 1);
    assert.equal(order.amount, 150000, 'سفارش یک‌ماهه ۱۵۰٬۰۰۰ تومانی ثبت شد');

    // ۲) مدیر کل وارد می‌شود؛ تعرفه‌ها و داشبورد به تومان است
    const managerSession = await bootRawDom({
      url: `${backend.baseUrl}/`,
      beforeParse(window) {
        window.fetch = createStatefulFetch(backend.baseUrl, window);
      },
    });
    try {
      await managerSession.App.subscription.login('admin@karensoft.ir', 'admin12345', true);
      await managerSession.App.subscription.loadManagerTab('plans');
      const plansBody = managerSession.document.querySelector('#manager-body').textContent;
      assert.match(plansBody, /۱۵۰٬۰۰۰/, 'قیمت پلن یک‌ماهه در پنل مدیریت به تومان');
      assert.match(plansBody, /۷٬۰۰۰٬۰۰۰/, 'قیمت پلن مادام‌العمر در پنل مدیریت به تومان');
      assert.equal(managerSession.App.subscription.managerState().plans.length, 5, 'هر ۵ پلن رسمی در پنل فهرست شده است');

      await managerSession.App.subscription.loadManagerTab('dashboard');
      assert.match(managerSession.document.querySelector('#manager-body').textContent, /اشتراک‌های فعال/, 'داشبورد مدیریت با شاخص‌های جدید بارگذاری شد');

      // ۳) تمدید بدون دلیل رد می‌شود؛ با دلیل و پلن رسمی، دقیقاً اعمال می‌شود
      await managerSession.App.subscription.loadManagerTab('subscribers');
      const extendButton = managerSession.document.querySelector('[data-action="mgr-sub-extend"]');
      extendButton.click();
      const extendForm = managerSession.document.querySelector('form[data-form="mgr-sub-extend"]');
      assert.ok(extendForm, 'فرم تمدید باز شد');
      extendForm.dispatchEvent(new managerSession.window.Event('submit', { bubbles: true, cancelable: true }));
      await wait(80);
      assert.equal(Date.parse(backend.state.licenses.find(l => l.store_id === 1).expires_at), expiryBeforeMs, 'بدون دلیل، تمدید در سرور ثبت نشد');

      managerSession.document.querySelector('[data-action="mgr-sub-extend"]').click();
      const extendForm2 = managerSession.document.querySelector('form[data-form="mgr-sub-extend"]');
      extendForm2.querySelector('[name="plan_code"]').value = 'quarterly';
      extendForm2.querySelector('[name="months"]').value = '3';
      extendForm2.querySelector('[name="reason"]').value = 'تمدید سه‌ماهه — کارت به کارت';
      extendForm2.dispatchEvent(new managerSession.window.Event('submit', { bubbles: true, cancelable: true }));
      await waitFor(() => backend.state.history.some(h => h.action === 'subscription_manual_extended'));
      const extendedMs = Date.parse(backend.state.licenses.find(l => l.store_id === 1).expires_at);
      assert.ok(Math.abs(extendedMs - (expiryBeforeMs + 90 * 86400000)) < 3 * 86400000, 'تمدید سه‌ماهه دقیقاً ۹۰ روز به ماندهٔ فعلی افزود');

      // ۴) تأیید سفارش با reference/note و صدور فاکتور و فعال‌سازی اشتراک
      await managerSession.App.subscription.loadManagerTab('orders');
      const approveButton = managerSession.document.querySelector('[data-action="mgr-order-approve"]');
      assert.ok(approveButton, 'دکمهٔ تأیید سفارش نمایش داده شد');
      approveButton.click();
      const approveForm = managerSession.document.querySelector('form[data-form="mgr-order-approve"]');
      assert.ok(approveForm.querySelector('[name="reference"]'), 'فیلد reference در فرم تأیید');
      approveForm.querySelector('[name="reference"]').value = 'ZP-TEST-1405';
      approveForm.querySelector('[name="note"]').value = 'واریز کارت به کارت تأیید شد';
      approveForm.dispatchEvent(new managerSession.window.Event('submit', { bubbles: true, cancelable: true }));
      await waitFor(() => backend.state.orders.find(o => o.store_id === 1).status === 'paid');

      const paidOrder = backend.state.orders.find(o => o.store_id === 1);
      assert.equal(paidOrder.reference_id, 'ZP-TEST-1405', 'شماره پیگیری روی سفارش ثبت شد');
      assert.equal(backend.state.invoices.length, 1, 'فاکتور KS برای سفارش صادر شد');
      assert.match(backend.state.invoices[0].number, /^KS-/, 'شمارهٔ فاکتور با KS شروع می‌شود');
      const afterApproveMs = Date.parse(backend.state.licenses.find(l => l.store_id === 1).expires_at);
      assert.ok(afterApproveMs > expiryBeforeMs + 115 * 86400000, 'لایسنس آژانس پس از تأیید سفارش یک‌ماهه، در مجموع تمدید شد');

      // ۵) آژانس نتیجه را می‌بیند: سفارش پرداخت‌شده + فاکتور قابل چاپ
      await agencySession.App.subscription.refresh({ manual: false });
      await agencySession.App.subscription.hydrate();
      assert.ok(agencySession.App.subscription.subStore().orders.some(o => o.id === paidOrder.id && o.status === 'paid'), 'سفارش پرداخت‌شده در سوابق آژانس');
      assert.equal(agencySession.App.subscription.subStore().invoices.length, 1, 'فاکتور در سوابق آژانس');
    } finally {
      managerSession.dom.window.close();
    }
  } finally {
    agencySession.dom.window.close();
    await backend.close();
  }
});
