import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * سرور محلی توسعهٔ تاکسی کارن (سرو استاتیک PWA آفلاین + شبیه‌ساز سازگار با API لاراول KarenYar).
 * در محیط عملیاتی (Production)، سرور لاراول داخل `laravel-backend/` همین قراردادهای `/api/*` را اجرا می‌کند.
 *
 * حساب‌های پیش‌فرض محیط توسعه:
 *   - مدیر کل سامانه:     admin@karensoft.ir  /  admin12345
 *   - آژانس اشتراک فعال:  agency@taxi.ir      /  taxi12345
 *   - آژانس اشتراک منقضی: expired@taxi.ir     /  taxi12345
 */
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
};

function createSeedState() {
  const now = Date.now();
  const isoInDays = days => new Date(now + days * 86400000).toISOString();
  const plans = [
    { id: 1, code: 'basic', name: 'آژانس پایه', description: 'مناسب آژانس‌های تک‌اپراتوره', monthly_price_rial: 1900000, default_max_users: 1, is_active: true, sort_order: 1 },
    { id: 2, code: 'pro', name: 'آژانس حرفه‌ای', description: 'چند اپراتور، صندوق شیفت و گزارش کامل', monthly_price_rial: 2900000, default_max_users: 3, is_active: true, sort_order: 2 },
    { id: 3, code: 'proplus', name: 'سازمانی (ویژه)', description: 'بدون محدودیت تعداد اپراتور', monthly_price_rial: 4900000, default_max_users: null, is_active: true, sort_order: 3 },
  ];
  const stores = [
    {
      id: 1,
      name: 'آژانس تاکسی کارن',
      owner_name: 'رضا محمدی',
      phone: '02188776655',
      address: 'تهران، میدان ونک، خیابان ملاصدرا',
      admin_note: 'حساب نمایشی با اشتراک فعال سالانه',
      is_active: true,
      is_archived: false,
      created_at: new Date(now - 30 * 86400000).toISOString(),
    },
    {
      id: 2,
      name: 'آژانس نمونه منقضی',
      owner_name: 'سعید رضایی',
      phone: '02144332211',
      address: 'تهران، سعادت‌آباد',
      admin_note: 'حساب نمایشی برای تست حالت فقط‌خواندنی و پشتیبان‌گیری پس از انقضا',
      is_active: true,
      is_archived: false,
      created_at: new Date(now - 400 * 86400000).toISOString(),
    },
  ];
  const licenses = [
    {
      id: 1,
      store_id: 1,
      plan_id: 2,
      plan_code: 'pro',
      plan_name: 'آژانس حرفه‌ای',
      status: 'active',
      is_active: true,
      is_lifetime: false,
      is_trial: false,
      starts_at: new Date(now - 30 * 86400000).toISOString(),
      expires_at: isoInDays(335),
      max_users: 3,
      notes: '',
    },
    {
      id: 2,
      store_id: 2,
      plan_id: 1,
      plan_code: 'basic',
      plan_name: 'آژانس پایه',
      status: 'expired',
      is_active: true,
      is_lifetime: false,
      is_trial: false,
      starts_at: new Date(now - 395 * 86400000).toISOString(),
      expires_at: isoInDays(-10),
      max_users: 1,
      notes: 'اشتراک منقضی‌شده',
    },
  ];
  const users = [
    { id: 1, store_id: null, name: 'مدیر کل کارن‌سافت', email: 'admin@karensoft.ir', password: 'admin12345', role: 'manager', is_active: true, created_at: new Date(now - 60 * 86400000).toISOString() },
    { id: 2, store_id: 1, name: 'اپراتور آژانس کارن', email: 'agency@taxi.ir', password: 'taxi12345', role: 'store', is_active: true, created_at: new Date(now - 30 * 86400000).toISOString() },
    { id: 3, store_id: 2, name: 'اپراتور آژانس منقضی', email: 'expired@taxi.ir', password: 'taxi12345', role: 'store', is_active: true, created_at: new Date(now - 400 * 86400000).toISOString() },
  ];
  return {
    nextIds: { store: 3, license: 3, user: 4, plan: 4, order: 1, coupon: 1, history: 1, invoice: 1, audit: 1 },
    plans,
    stores,
    licenses,
    users,
    orders: [],
    coupons: [],
    history: [],
    invoices: [],
    audit: [],
    sessions: new Map(),
    csrfTokens: new Set(),
    syncStates: new Map(),
  };
}

const SYNC_SERVER_COLLECTIONS = [
  'drivers', 'vehicles', 'addresses', 'subscribers', 'subscriberPayments',
  'driverPayments', 'trips', 'expenses', 'closes', 'invoices', 'archives', 'shifts',
];

function recordSyncTs(rec) {
  for (const f of ['updatedAt', 'createdAt', 'at']) {
    if (rec && typeof rec[f] === 'string') {
      const t = Date.parse(rec[f]);
      if (Number.isFinite(t)) return t;
    }
  }
  return 0;
}

function mergeAgencySyncPayload(serverData, clientData) {
  const server = serverData && typeof serverData === 'object' ? serverData : {};
  const client = clientData && typeof clientData === 'object' ? clientData : {};
  const merged = {};
  const mergedTombstones = {};
  const sTombs = server.meta?.tombstones || {};
  const cTombs = client.meta?.tombstones || {};

  for (const col of SYNC_SERVER_COLLECTIONS) {
    const tMap = {};
    for (const src of [sTombs[col] || {}, cTombs[col] || {}]) {
      for (const [id, iso] of Object.entries(src || {})) {
        const ts = Date.parse(iso) || 0;
        if (!tMap[id] || ts >= (Date.parse(tMap[id]) || 0)) tMap[id] = iso;
      }
    }
    const byId = new Map();
    for (const item of Array.isArray(server[col]) ? server[col] : []) {
      if (item && item.id) byId.set(String(item.id), item);
    }
    for (const item of Array.isArray(client[col]) ? client[col] : []) {
      if (!item || !item.id) continue;
      const id = String(item.id);
      const prev = byId.get(id);
      if (!prev) { byId.set(id, item); continue; }
      const pTs = recordSyncTs(prev), cTs = recordSyncTs(item);
      if (cTs > pTs || (cTs === pTs && (Number(item.rev) || 0) >= (Number(prev.rev) || 0))) byId.set(id, item);
    }
    const list = [];
    for (const [id, rec] of byId.entries()) {
      if (tMap[id]) {
        const dTs = Date.parse(tMap[id]) || 0;
        if (dTs >= recordSyncTs(rec)) continue;
        delete tMap[id];
      }
      list.push(rec);
    }
    merged[col] = list;
    if (Object.keys(tMap).length) mergedTombstones[col] = tMap;
  }

  const sSet = { ...(server.settings || {}) };
  const cSet = { ...(client.settings || {}) };
  delete sSet.security;
  delete cSet.security;
  const sStamp = Date.parse(server.settingsUpdatedAt || '') || 0;
  const cStamp = Date.parse(client.settingsUpdatedAt || '') || 0;
  if (!Object.keys(sSet).length) {
    merged.settings = cSet;
    merged.settingsUpdatedAt = client.settingsUpdatedAt || new Date().toISOString();
  } else if (!Object.keys(cSet).length) {
    merged.settings = sSet;
    merged.settingsUpdatedAt = server.settingsUpdatedAt || new Date().toISOString();
  } else if (cStamp >= sStamp) {
    merged.settings = { ...sSet, ...cSet };
    if (Object.prototype.hasOwnProperty.call(cSet, 'logo')) merged.settings.logo = cSet.logo;
    merged.settingsUpdatedAt = client.settingsUpdatedAt || new Date().toISOString();
  } else {
    merged.settings = { ...cSet, ...sSet };
    merged.settingsUpdatedAt = server.settingsUpdatedAt || new Date().toISOString();
  }

  const counters = {};
  for (const k of ['trip', 'subscriber', 'driver', 'vehicle', 'expense']) {
    counters[k] = Math.max(Number(server.meta?.counters?.[k]) || 0, Number(client.meta?.counters?.[k]) || 0);
  }
  const invoiceSeq = {};
  for (const k of new Set([...Object.keys(server.meta?.invoiceSeq || {}), ...Object.keys(client.meta?.invoiceSeq || {})])) {
    invoiceSeq[k] = Math.max(Number(server.meta?.invoiceSeq?.[k]) || 0, Number(client.meta?.invoiceSeq?.[k]) || 0);
  }
  merged.meta = { counters, invoiceSeq, tombstones: mergedTombstones };
  const recordsCount = SYNC_SERVER_COLLECTIONS.reduce((s, col) => s + merged[col].length, 0);
  return { merged, recordsCount };
}

function formatLicense(state, lic) {
  if (!lic) return null;
  const now = Date.now();
  const expMs = lic.expires_at ? Date.parse(lic.expires_at) : NaN;
  const isExpired = !lic.is_lifetime && (!Number.isFinite(expMs) || now >= expMs);
  const effectiveStatus = !lic.is_active ? 'suspended' : (lic.status === 'suspended' || lic.status === 'canceled' ? lic.status : (isExpired ? 'expired' : 'active'));
  const isValid = lic.is_active && effectiveStatus === 'active' && (lic.is_lifetime || !isExpired);
  const daysRemaining = lic.is_lifetime ? null : (Number.isFinite(expMs) ? Math.max(0, Math.ceil((expMs - now) / 86400000)) : 0);
  const activeUsers = state.users.filter(u => u.store_id === lic.store_id && u.is_active).length;
  const store = state.stores.find(s => s.id === lic.store_id) || null;
  return {
    ...lic,
    status: effectiveStatus,
    is_valid: isValid,
    days_remaining: daysRemaining,
    active_users: activeUsers,
    store: store ? { id: store.id, name: store.name, phone: store.phone } : undefined,
  };
}

function formatStore(state, store) {
  if (!store) return null;
  const lic = state.licenses.find(l => l.store_id === store.id) || null;
  const users = state.users.filter(u => u.store_id === store.id).map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, is_active: u.is_active }));
  return {
    ...store,
    license: formatLicense(state, lic),
    users,
  };
}

function formatUser(state, user) {
  if (!user) return null;
  const store = user.store_id ? state.stores.find(s => s.id === user.store_id) || null : null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    is_active: user.is_active,
    store_id: user.store_id,
    created_at: user.created_at,
    store: formatStore(state, store),
  };
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function readJsonBody(req) {
  return new Promise(resolve => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; if (raw.length > 10 * 1024 * 1024) req.destroy(); });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (_) { resolve({}); }
    });
  });
}

function sendJson(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

export function createDevServer() {
  const state = createSeedState();

  function logAudit(user, action, storeId = null, meta = {}) {
    state.audit.unshift({
      id: state.nextIds.audit++,
      action,
      user_id: user?.id || null,
      user_name: user?.name || null,
      user_email: user?.email || null,
      store_id: storeId,
      ip: '127.0.0.1',
      meta,
      created_at: new Date().toISOString(),
    });
  }

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(url.pathname);
    const method = request.method || 'GET';

    if (pathname === '/up') {
      sendJson(response, 200, { ok: true, service: 'karnsoft-taxi' });
      return;
    }

    if (pathname.startsWith('/api/')) {
      const cookies = parseCookies(request.headers.cookie);
      const sessionId = cookies.taxi_session || '';
      const sessionUserId = state.sessions.get(sessionId) || null;
      const currentUser = sessionUserId ? state.users.find(u => u.id === sessionUserId) || null : null;

      if (pathname === '/api/csrf' && method === 'GET') {
        const token = crypto.randomBytes(24).toString('hex');
        state.csrfTokens.add(token);
        sendJson(response, 200, { csrf_token: token }, {
          'Set-Cookie': [`XSRF-TOKEN=${encodeURIComponent(token)}; Path=/; SameSite=Lax`],
        });
        return;
      }

      if (!['GET', 'HEAD'].includes(method)) {
        const xsrf = String(request.headers['x-xsrf-token'] || request.headers['x-csrf-token'] || '');
        if (!xsrf || !state.csrfTokens.has(xsrf)) {
          sendJson(response, 419, { message: 'نشست امنیتی منقضی شده است؛ دوباره تلاش کنید.' });
          return;
        }
      }

      if (pathname === '/api/register' && method === 'POST') {
        sendJson(response, 422, { message: 'ثبت‌نام عمومی غیرفعال است. ساخت حساب آژانس فقط توسط مدیر سامانه انجام می‌شود.' });
        return;
      }

      if (pathname === '/api/login' && method === 'POST') {
        const body = await readJsonBody(request);
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');
        const user = state.users.find(u => u.email.toLowerCase() === email && u.password === password);
        if (!user) {
          sendJson(response, 422, { message: 'ایمیل یا رمز عبور اشتباه است.', errors: { email: ['ایمیل یا رمز عبور اشتباه است.'] } });
          return;
        }
        if (!user.is_active) {
          sendJson(response, 422, { message: 'این حساب کاربری غیرفعال شده است.' });
          return;
        }
        if (user.role === 'store') {
          const st = state.stores.find(s => s.id === user.store_id);
          if (!st || !st.is_active || st.is_archived) {
            sendJson(response, 422, { message: 'این آژانس غیرفعال یا آرشیو شده است.' });
            return;
          }
        }
        const sid = crypto.randomBytes(24).toString('hex');
        state.sessions.set(sid, user.id);
        logAudit(user, 'auth.login', user.store_id);
        sendJson(response, 200, { user: formatUser(state, user), server_time: new Date().toISOString() }, {
          'Set-Cookie': [`taxi_session=${sid}; Path=/; HttpOnly; SameSite=Lax`],
        });
        return;
      }

      if (pathname === '/api/logout' && method === 'POST') {
        if (sessionId) state.sessions.delete(sessionId);
        if (currentUser) logAudit(currentUser, 'auth.logout', currentUser.store_id);
        sendJson(response, 200, { ok: true }, {
          'Set-Cookie': ['taxi_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax'],
        });
        return;
      }

      if (!currentUser || !currentUser.is_active) {
        sendJson(response, 401, { message: 'Unauthenticated.' });
        return;
      }

      if (pathname === '/api/me' && method === 'GET') {
        sendJson(response, 200, { user: formatUser(state, currentUser), server_time: new Date().toISOString() });
        return;
      }

      if (pathname === '/api/sync' && method === 'GET') {
        if (!currentUser.store_id) {
          sendJson(response, 403, { message: 'این مسیر ویژهٔ حساب آژانس است.' });
          return;
        }
        const entry = state.syncStates.get(currentUser.store_id);
        if (!entry) {
          sendJson(response, 200, { ok: true, empty: true, unchanged: false, revision: 0, synced_at: null, records_count: 0, data: null });
          return;
        }
        const sinceRev = url.searchParams.get('since_revision');
        if (sinceRev !== null && Number(sinceRev) === entry.revision) {
          sendJson(response, 200, { ok: true, empty: false, unchanged: true, revision: entry.revision, synced_at: entry.synced_at, records_count: entry.records_count });
          return;
        }
        sendJson(response, 200, { ok: true, empty: false, unchanged: false, revision: entry.revision, synced_at: entry.synced_at, records_count: entry.records_count, data: entry.data });
        return;
      }

      if (pathname === '/api/sync' && method === 'POST') {
        if (!currentUser.store_id) {
          sendJson(response, 403, { message: 'این مسیر ویژهٔ حساب آژانس است.' });
          return;
        }
        const store = state.stores.find(s => s.id === currentUser.store_id);
        const lic = formatLicense(state, state.licenses.find(l => l.store_id === currentUser.store_id));
        if (!store || !store.is_active || store.is_archived || !lic || !lic.is_valid) {
          sendJson(response, 403, { message: 'اعتبار اشتراک به پایان رسیده است؛ ذخیرهٔ تغییرات جدید روی سرور تا زمان تمدید متوقف است.', code: 'subscription_expired' });
          return;
        }
        const body = await readJsonBody(request);
        if (!body || typeof body.data !== 'object' || Array.isArray(body.data)) {
          sendJson(response, 422, { message: 'ساختار دادهٔ همگام‌سازی معتبر نیست.' });
          return;
        }
        const prev = state.syncStates.get(currentUser.store_id) || null;
        const { merged, recordsCount } = mergeAgencySyncPayload(prev?.data || null, body.data);
        const hash = crypto.createHash('sha256').update(JSON.stringify(merged)).digest('hex');
        const revision = prev ? (prev.hash === hash ? prev.revision : prev.revision + 1) : 1;
        const syncedAt = new Date().toISOString();
        state.syncStates.set(currentUser.store_id, { revision, hash, synced_at: syncedAt, records_count: recordsCount, data: merged });
        sendJson(response, 200, { ok: true, revision, synced_at: syncedAt, records_count: recordsCount, data: merged });
        return;
      }

      if (pathname.startsWith('/api/manager/')) {
        if (currentUser.role !== 'manager') {
          sendJson(response, 403, { message: 'دسترسی فقط برای مدیر کل مجاز است.' });
          return;
        }

        if (pathname === '/api/manager/dashboard' && method === 'GET') {
          const formattedLics = state.licenses.map(l => formatLicense(state, l));
          const active = formattedLics.filter(l => l.is_valid && !l.is_trial).length;
          const trial = formattedLics.filter(l => l.is_valid && l.is_trial).length;
          const exp7 = formattedLics.filter(l => l.is_valid && !l.is_lifetime && l.days_remaining <= 7).length;
          const expired = formattedLics.filter(l => !l.is_valid).length;
          const soon = formattedLics
            .filter(l => l.is_valid && !l.is_lifetime && l.days_remaining <= 14)
            .map(l => ({ store_id: l.store_id, store_name: l.store?.name || '', plan_name: l.plan_name, expires_at: l.expires_at, days_remaining: l.days_remaining }));
          const byPlan = {};
          for (const l of formattedLics.filter(x => x.is_valid)) byPlan[l.plan_name] = (byPlan[l.plan_name] || 0) + 1;
          sendJson(response, 200, {
            total_revenue_month_rial: 58000000,
            total_revenue_year_rial: 348000000,
            mrr_rial: active * 2900000,
            active_subscriptions: active,
            trial_subscriptions: trial,
            expiring_7_days: exp7,
            expired_subscriptions: expired,
            pending_orders: state.orders.filter(o => o.status === 'pending').length,
            expiring_soon: soon,
            recent_orders: state.orders.slice(0, 5),
            plan_breakdown: Object.entries(byPlan).map(([plan_name, total]) => ({ plan_name, total })),
          });
          return;
        }

        if (pathname === '/api/manager/stores' && method === 'GET') {
          const status = url.searchParams.get('status') || 'active';
          const q = (url.searchParams.get('q') || '').trim().toLowerCase();
          const list = state.stores
            .filter(s => status === 'all' ? true : status === 'archived' ? s.is_archived : !s.is_archived)
            .map(s => formatStore(state, s))
            .filter(s => !q || [s.name, s.owner_name, s.phone, s.users?.[0]?.email].some(v => String(v || '').toLowerCase().includes(q)));
          sendJson(response, 200, { data: list });
          return;
        }

        if (pathname === '/api/manager/stores' && method === 'POST') {
          const body = await readJsonBody(request);
          const email = String(body.email || '').trim().toLowerCase();
          if (!body.name || !email || !body.password || String(body.password).length < 8) {
            sendJson(response, 422, { message: 'نام آژانس، ایمیل معتبر و رمز عبور حداقل ۸ کاراکتری الزامی است.' });
            return;
          }
          if (state.users.some(u => u.email.toLowerCase() === email)) {
            sendJson(response, 422, { message: 'این ایمیل قبلاً ثبت شده است.' });
            return;
          }
          const store = {
            id: state.nextIds.store++,
            name: String(body.name).trim(),
            owner_name: String(body.owner_name || '').trim(),
            phone: String(body.phone || '').trim(),
            address: String(body.address || '').trim(),
            admin_note: String(body.admin_note || '').trim(),
            is_active: true,
            is_archived: false,
            created_at: new Date().toISOString(),
          };
          state.stores.unshift(store);
          const isLifetime = !!body.is_lifetime;
          const days = Math.max(1, Number(body.days) || 365);
          state.licenses.push({
            id: state.nextIds.license++,
            store_id: store.id,
            plan_id: 2,
            plan_code: 'pro',
            plan_name: String(body.plan_name || 'آژانس حرفه‌ای'),
            status: 'active',
            is_active: true,
            is_lifetime: isLifetime,
            is_trial: false,
            starts_at: new Date().toISOString(),
            expires_at: isLifetime ? null : new Date(Date.now() + days * 86400000).toISOString(),
            max_users: Math.max(1, Number(body.max_users) || 3),
            notes: '',
          });
          state.users.push({
            id: state.nextIds.user++,
            store_id: store.id,
            name: String(body.user_name || body.owner_name || store.name).trim(),
            email,
            password: String(body.password),
            role: 'store',
            is_active: true,
            created_at: new Date().toISOString(),
          });
          logAudit(currentUser, 'store.create', store.id, { name: store.name });
          sendJson(response, 201, { data: formatStore(state, store) });
          return;
        }

        const storeMatch = pathname.match(/^\/api\/manager\/stores\/(\d+)(?:\/(license|trial|archive|restore))?$/);
        if (storeMatch) {
          const storeId = Number(storeMatch[1]);
          const subAction = storeMatch[2] || '';
          const store = state.stores.find(s => s.id === storeId);
          if (!store) { sendJson(response, 404, { message: 'آژانس پیدا نشد.' }); return; }
          if (!subAction && method === 'PUT') {
            const body = await readJsonBody(request);
            if (body.name) store.name = String(body.name).trim();
            if (body.owner_name !== undefined) store.owner_name = String(body.owner_name).trim();
            if (body.phone !== undefined) store.phone = String(body.phone).trim();
            if (body.address !== undefined) store.address = String(body.address).trim();
            if (body.admin_note !== undefined) store.admin_note = String(body.admin_note).trim();
            if (body.is_active !== undefined) store.is_active = !!body.is_active;
            const u = state.users.find(x => x.store_id === storeId);
            if (u) {
              if (body.email) u.email = String(body.email).trim().toLowerCase();
              if (body.user_name) u.name = String(body.user_name).trim();
              if (body.password && String(body.password).length >= 8) u.password = String(body.password);
            }
            logAudit(currentUser, 'store.update', storeId);
            sendJson(response, 200, { data: formatStore(state, store) });
            return;
          }
          if (!subAction && method === 'DELETE') {
            state.stores = state.stores.filter(s => s.id !== storeId);
            state.licenses = state.licenses.filter(l => l.store_id !== storeId);
            state.users = state.users.filter(u => u.store_id !== storeId);
            logAudit(currentUser, 'store.delete', storeId);
            sendJson(response, 200, { ok: true });
            return;
          }
          if (subAction === 'license' && method === 'PUT') {
            const body = await readJsonBody(request);
            let lic = state.licenses.find(l => l.store_id === storeId);
            if (!lic) { lic = { id: state.nextIds.license++, store_id: storeId, starts_at: new Date().toISOString() }; state.licenses.push(lic); }
            lic.plan_name = String(body.plan_name || lic.plan_name || 'آژانس حرفه‌ای');
            lic.is_active = body.is_active !== false;
            lic.is_lifetime = !!body.is_lifetime;
            lic.is_trial = !!body.is_trial;
            lic.max_users = Math.max(1, Number(body.max_users) || 3);
            lic.notes = String(body.notes || '');
            if (lic.is_lifetime) {
              lic.expires_at = null;
              lic.status = lic.is_active ? 'active' : 'suspended';
            } else if (body.expires_at) {
              lic.expires_at = String(body.expires_at);
              lic.status = Date.parse(lic.expires_at) > Date.now() && lic.is_active ? 'active' : 'expired';
            } else if (body.days !== undefined) {
              lic.expires_at = new Date(Date.now() + Number(body.days) * 86400000).toISOString();
              lic.status = Number(body.days) > 0 && lic.is_active ? 'active' : 'expired';
            }
            logAudit(currentUser, 'license.update', storeId);
            sendJson(response, 200, { data: formatStore(state, store) });
            return;
          }
          if (subAction === 'trial' && method === 'POST') {
            const body = await readJsonBody(request);
            const days = Math.max(1, Number(body.days) || 14);
            let lic = state.licenses.find(l => l.store_id === storeId);
            if (!lic) { lic = { id: state.nextIds.license++, store_id: storeId }; state.licenses.push(lic); }
            Object.assign(lic, { plan_name: 'آزمایشی', status: 'active', is_active: true, is_lifetime: false, is_trial: true, starts_at: new Date().toISOString(), expires_at: new Date(Date.now() + days * 86400000).toISOString(), max_users: 3 });
            logAudit(currentUser, 'license.trial', storeId);
            sendJson(response, 200, { data: formatStore(state, store) });
            return;
          }
          if (subAction === 'archive' && method === 'POST') {
            store.is_archived = true; store.is_active = false;
            logAudit(currentUser, 'store.archive', storeId);
            sendJson(response, 200, { data: formatStore(state, store) });
            return;
          }
          if (subAction === 'restore' && method === 'POST') {
            store.is_archived = false; store.is_active = true;
            logAudit(currentUser, 'store.restore', storeId);
            sendJson(response, 200, { data: formatStore(state, store) });
            return;
          }
        }

        if (pathname === '/api/manager/subscribers' && method === 'GET') {
          const status = url.searchParams.get('status') || '';
          const search = (url.searchParams.get('search') || '').trim().toLowerCase();
          const rows = state.licenses
            .map(l => formatLicense(state, l))
            .filter(l => (!status || l.status === status) && (!search || String(l.store?.name || '').toLowerCase().includes(search)));
          sendJson(response, 200, { data: rows });
          return;
        }

        const subMatch = pathname.match(/^\/api\/manager\/subscribers\/(\d+)(?:\/(extend|status))?$/);
        if (subMatch) {
          const storeId = Number(subMatch[1]);
          const act = subMatch[2] || '';
          const store = state.stores.find(s => s.id === storeId);
          const lic = state.licenses.find(l => l.store_id === storeId);
          if (!store || !lic) { sendJson(response, 404, { message: 'اشتراک پیدا نشد.' }); return; }
          if (!act && method === 'GET') {
            sendJson(response, 200, {
              store: formatStore(state, store),
              license: formatLicense(state, lic),
              history: state.history.filter(h => h.store_id === storeId),
              invoices: state.invoices.filter(i => i.store_id === storeId),
            });
            return;
          }
          if (act === 'extend' && method === 'POST') {
            const body = await readJsonBody(request);
            const months = Math.max(1, Number(body.months) || 12);
            const baseMs = lic.expires_at && Date.parse(lic.expires_at) > Date.now() ? Date.parse(lic.expires_at) : Date.now();
            const prevStatus = formatLicense(state, lic).status;
            lic.expires_at = new Date(baseMs + months * 30 * 86400000).toISOString();
            lic.status = 'active'; lic.is_active = true; lic.is_trial = false; lic.is_lifetime = false;
            if (body.plan_code) {
              const p = state.plans.find(x => x.code === body.plan_code);
              if (p) { lic.plan_code = p.code; lic.plan_name = p.name; }
            }
            if (body.max_users) lic.max_users = Math.max(1, Number(body.max_users));
            state.history.unshift({ id: state.nextIds.history++, store_id: storeId, event_type: 'extend', from_status: prevStatus, to_status: 'active', new_expires_at: lic.expires_at, reason: String(body.reason || ''), created_at: new Date().toISOString() });
            logAudit(currentUser, 'subscription.extend', storeId, { months });
            sendJson(response, 200, { license: formatLicense(state, lic) });
            return;
          }
          if (act === 'status' && method === 'POST') {
            const body = await readJsonBody(request);
            const prevStatus = formatLicense(state, lic).status;
            lic.status = String(body.status || 'active');
            lic.is_active = lic.status === 'active';
            state.history.unshift({ id: state.nextIds.history++, store_id: storeId, event_type: 'status', from_status: prevStatus, to_status: lic.status, new_expires_at: lic.expires_at, reason: String(body.reason || ''), created_at: new Date().toISOString() });
            logAudit(currentUser, 'subscription.status', storeId, { status: lic.status });
            sendJson(response, 200, { license: formatLicense(state, lic) });
            return;
          }
        }

        if (pathname === '/api/manager/plans' && method === 'GET') {
          sendJson(response, 200, { plans: state.plans });
          return;
        }
        if (pathname === '/api/manager/plans' && method === 'POST') {
          const body = await readJsonBody(request);
          const plan = { id: state.nextIds.plan++, code: String(body.code || 'custom').toLowerCase(), name: String(body.name || 'پلن جدید'), description: String(body.description || ''), monthly_price_rial: Number(body.monthly_price_rial) || 0, default_max_users: body.default_max_users ? Number(body.default_max_users) : null, is_active: true };
          state.plans.push(plan);
          sendJson(response, 201, { plan });
          return;
        }
        const planMatch = pathname.match(/^\/api\/manager\/plans\/(\d+)(?:\/(toggle))?$/);
        if (planMatch) {
          const plan = state.plans.find(p => p.id === Number(planMatch[1]));
          if (!plan) { sendJson(response, 404, { message: 'پلن پیدا نشد.' }); return; }
          if (planMatch[2] === 'toggle' && method === 'PATCH') {
            plan.is_active = !plan.is_active;
            sendJson(response, 200, { plan });
            return;
          }
          if (!planMatch[2] && method === 'PUT') {
            const body = await readJsonBody(request);
            Object.assign(plan, { name: String(body.name || plan.name), description: String(body.description ?? plan.description), monthly_price_rial: Number(body.monthly_price_rial ?? plan.monthly_price_rial), default_max_users: body.default_max_users ? Number(body.default_max_users) : null });
            sendJson(response, 200, { plan });
            return;
          }
        }

        if (pathname === '/api/manager/orders' && method === 'GET') {
          const st = url.searchParams.get('status') || '';
          sendJson(response, 200, { data: state.orders.filter(o => !st || o.status === st) });
          return;
        }
        if (pathname === '/api/manager/coupons' && method === 'GET') {
          sendJson(response, 200, { coupons: state.coupons });
          return;
        }
        if (pathname === '/api/manager/coupons' && method === 'POST') {
          const body = await readJsonBody(request);
          const coupon = { id: state.nextIds.coupon++, code: String(body.code || '').toUpperCase(), type: body.type || 'percent', value: Number(body.value) || 10, max_uses: body.max_uses ? Number(body.max_uses) : null, used_count: 0, is_active: true, expires_at: null };
          state.coupons.unshift(coupon);
          sendJson(response, 201, { coupon });
          return;
        }
        const couponDel = pathname.match(/^\/api\/manager\/coupons\/(\d+)$/);
        if (couponDel && method === 'DELETE') {
          state.coupons = state.coupons.filter(c => c.id !== Number(couponDel[1]));
          sendJson(response, 200, { ok: true });
          return;
        }
        if (pathname === '/api/manager/managers' && method === 'GET') {
          sendJson(response, 200, { data: state.users.filter(u => u.role === 'manager').map(u => formatUser(state, u)) });
          return;
        }
        if (pathname === '/api/manager/managers' && method === 'POST') {
          const body = await readJsonBody(request);
          const m = { id: state.nextIds.user++, store_id: null, name: String(body.name || ''), email: String(body.email || '').toLowerCase(), password: String(body.password || 'admin12345'), role: 'manager', is_active: body.is_active !== false, created_at: new Date().toISOString() };
          state.users.push(m);
          sendJson(response, 201, { data: formatUser(state, m) });
          return;
        }
        if (pathname === '/api/manager/audit' && method === 'GET') {
          const act = url.searchParams.get('action') || '';
          const q = (url.searchParams.get('q') || '').toLowerCase();
          sendJson(response, 200, {
            data: state.audit.filter(a => (!act || a.action.includes(act)) && (!q || JSON.stringify(a).toLowerCase().includes(q))),
          });
          return;
        }
      }

      sendJson(response, 404, { message: 'Endpoint not found.' });
      return;
    }

    const target = pathname === '/' ? path.join(root, 'taxi.html') : path.join(root, pathname);
    if (!path.resolve(target).startsWith(root)) {
      response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end('دسترسی مجاز نیست');
      return;
    }
    fs.stat(target, (error, stat) => {
      if (error || !stat.isFile()) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('فایل پیدا نشد');
        return;
      }
      response.writeHead(200, {
        'Content-Type': TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
        'Service-Worker-Allowed': '/',
      });
      fs.createReadStream(target).pipe(response);
    });
  });

  return { server, state };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const port = Number(process.env.PORT) || 8000;
  const host = process.env.HOST || '0.0.0.0';
  const { server } = createDevServer();
  server.listen(port, host, () => {
    console.log(`تاکسینو | Taxino آماده است: http://localhost:${port}/`);
  });
}
