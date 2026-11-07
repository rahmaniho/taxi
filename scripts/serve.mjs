import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * سرور محلی توسعه و تست تاکسینو | Taxino (سرو استاتیک PWA آفلاین + شبیه‌ساز هم‌قرارداد با Laravel در `laravel-backend/`).
 * تمام قیمت‌ها به تومان ذخیره می‌شوند و قراردادهای `/api/subscription/*` و `/api/manager/*` دقیقاً با کنترلرهای لاراول یکسان است.
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
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
};

const KARENSOFT_SUPPORT = {
  company: 'کارن سافت | Karen Soft',
  website: 'https://karen-soft.ir',
  contact_url: 'https://karen-soft.ir/contact',
  phone: '+989152521166',
  phone_display: '۰۹۱۵۲۵۲۱۱۶۶',
  email: 'info@karen-soft.ir',
  telegram: 'https://t.me/KarenSoftOfficial',
  telegram_handle: '@KarenSoftOfficial',
  instagram: 'https://instagram.com/karen_soft.ir',
  address: 'قزوین، زیباشهر، کارن سافت',
  hours: 'شنبه تا چهارشنبه ۹:۰۰ تا ۱۸:۰۰ · پنج‌شنبه ۹:۰۰ تا ۱۳:۰۰',
  crisp_website_id: 'ffafdfcf-e510-45d0-a026-4e964ad420ee',
};

function createSeedState() {
  const now = Date.now();
  const isoInDays = days => new Date(now + days * 86400000).toISOString();
  const commonFeatures = [
    'ثبت سفر، صف انتظار و نوبت‌دهی هوشمند رانندگان',
    'حسابداری کامل، صورت‌حساب مشترکین و تسویه رانندگان',
    'کارکرد آفلاین روی دستگاه + همگام‌سازی ابری آژانس',
    'چاپ رسید، گزارش‌های مالی و پشتیبان‌گیری رمزنگاری‌شده',
  ];
  const plans = [
    {
      id: 1, code: 'monthly', name: 'یک‌ماهه', tier: 'proplus',
      description: 'مناسب شروع استفاده از تاکسینو و تجربه امکانات نرم‌افزار.',
      duration_days: 30, months_count: 1, total_price: 150000, base_monthly: 150000, extra_user_monthly: 0,
      min_seats: 1, max_seats: 50, is_lifetime: false, badge: null, is_featured: false,
      features: commonFeatures, is_active: true, sort_order: 10,
    },
    {
      id: 2, code: 'quarterly', name: 'سه‌ماهه', tier: 'proplus',
      description: 'انتخابی اقتصادی برای استفاده میان‌مدت.',
      duration_days: 90, months_count: 3, total_price: 420000, base_monthly: 140000, extra_user_monthly: 0,
      min_seats: 1, max_seats: 50, is_lifetime: false, badge: '۳۰٬۰۰۰ تومان صرفه‌جویی', is_featured: false,
      features: commonFeatures, is_active: true, sort_order: 20,
    },
    {
      id: 3, code: 'semiannual', name: 'شش‌ماهه', tier: 'proplus',
      description: 'مناسب دفاتر تاکسی تلفنی که به دنبال مدیریت اقتصادی‌تر اشتراک هستند.',
      duration_days: 180, months_count: 6, total_price: 780000, base_monthly: 130000, extra_user_monthly: 0,
      min_seats: 1, max_seats: 50, is_lifetime: false, badge: '۱۲۰٬۰۰۰ تومان صرفه‌جویی', is_featured: false,
      features: commonFeatures, is_active: true, sort_order: 30,
    },
    {
      id: 4, code: 'yearly', name: 'یک‌ساله', tier: 'proplus',
      description: 'بهترین انتخاب برای استفاده مستمر و بدون دغدغه تمدید ماهانه.',
      duration_days: 365, months_count: 12, total_price: 1200000, base_monthly: 100000, extra_user_monthly: 0,
      min_seats: 1, max_seats: 50, is_lifetime: false, badge: 'پیشنهاد ویژه · بهترین انتخاب', is_featured: true,
      features: commonFeatures, is_active: true, sort_order: 40,
    },
    {
      id: 5, code: 'lifetime', name: 'مادام‌العمر', tier: 'proplus',
      description: 'پرداخت یک‌باره و استفاده دائمی از نسخه خریداری‌شده مطابق شرایط لایسنس.',
      duration_days: null, months_count: 0, total_price: 7000000, base_monthly: 7000000, extra_user_monthly: 0,
      min_seats: 1, max_seats: 50, is_lifetime: true, badge: 'پرداخت یک‌باره | بدون تمدید دوره‌ای', is_featured: false,
      features: [
        'دسترسی دائمی به نسخه خریداری‌شده مطابق شرایط لایسنس',
        'پرداخت یک‌باره بدون نیاز به تمدید ماهانه یا سالانه',
        'کارکرد آفلاین روی دستگاه + همگام‌سازی ابری آژانس',
        'شرایط به‌روزرسانی و پشتیبانی مطابق شرایط محصول',
      ],
      is_active: true, sort_order: 50,
    },
  ];
  const priceHistory = plans.map((p, idx) => ({
    id: idx + 1,
    plan_code: p.code,
    base_monthly: p.total_price,
    extra_user_monthly: 0,
    note: 'ثبت اولیه تعرفه رسمی تاکسینو',
    changed_at: new Date(now - 30 * 86400000).toISOString(),
  }));
  const stores = [
    {
      id: 1,
      name: 'آژانس تاکسی کارن',
      slug: 'agency-karen',
      owner_name: 'رضا محمدی',
      phone: '02188776655',
      address: 'تهران، میدان ونک، خیابان ملاصدرا',
      admin_note: 'حساب نمایشی با اشتراک فعال سالانه',
      is_active: true,
      is_archived: false,
      archived_at: null,
      created_at: new Date(now - 30 * 86400000).toISOString(),
    },
    {
      id: 2,
      name: 'آژانس نمونه منقضی',
      slug: 'agency-expired',
      owner_name: 'سعید رضایی',
      phone: '02144332211',
      address: 'تهران، سعادت‌آباد',
      admin_note: 'حساب نمایشی برای تست حالت فقط‌خواندنی و پشتیبان‌گیری پس از انقضا',
      is_active: true,
      is_archived: false,
      archived_at: null,
      created_at: new Date(now - 400 * 86400000).toISOString(),
    },
  ];
  const licenses = [
    {
      id: 1,
      store_id: 1,
      tier: 'proplus',
      plan_code: 'yearly',
      plan_name: 'یک‌ساله',
      status: 'active',
      is_active: true,
      is_lifetime: false,
      is_trial: false,
      starts_at: new Date(now - 30 * 86400000).toISOString(),
      expires_at: isoInDays(335),
      seats: 3,
      max_users: 3,
      notes: 'اشتراک فعال',
    },
    {
      id: 2,
      store_id: 2,
      tier: 'proplus',
      plan_code: 'monthly',
      plan_name: 'یک‌ماهه',
      status: 'expired',
      is_active: true,
      is_lifetime: false,
      is_trial: false,
      starts_at: new Date(now - 40 * 86400000).toISOString(),
      expires_at: isoInDays(-10),
      seats: 1,
      max_users: 1,
      notes: 'اشتراک منقضی‌شده',
    },
  ];
  const users = [
    { id: 1, store_id: null, name: 'مدیر کل کارن‌سافت', email: 'admin@karensoft.ir', phone: '09152521166', password: 'admin12345', role: 'manager', is_active: true, created_at: new Date(now - 60 * 86400000).toISOString() },
    { id: 2, store_id: 1, name: 'اپراتور آژانس کارن', email: 'agency@taxi.ir', phone: '09121112233', password: 'taxi12345', role: 'store', is_active: true, created_at: new Date(now - 30 * 86400000).toISOString() },
    { id: 3, store_id: 2, name: 'اپراتور آژانس منقضی', email: 'expired@taxi.ir', phone: '09124445566', password: 'taxi12345', role: 'store', is_active: true, created_at: new Date(now - 400 * 86400000).toISOString() },
  ];
  return {
    nextIds: { store: 3, license: 3, user: 4, plan: 6, order: 1, coupon: 1, history: 1, invoice: 1, payment: 1, audit: 1, priceHistory: 6 },
    plans,
    priceHistory,
    stores,
    licenses,
    users,
    orders: [],
    payments: [],
    coupons: [],
    history: [],
    invoices: [],
    audit: [],
    sessions: new Map(),
    csrfTokens: new Set(),
    syncStates: new Map(),
    zarinpalEnabled: Boolean(process.env.ZARINPAL_MERCHANT_ID),
    zarinpalSandbox: process.env.ZARINPAL_SANDBOX !== 'false',
    zarinpalApprove: true,
    taxPercent: Number(process.env.TAXI_TAX_PERCENT) || 0,
    bank: {
      holder: process.env.TAXI_BANK_HOLDER || 'کارن سافت',
      card: process.env.TAXI_BANK_CARD || '',
      sheba: process.env.TAXI_BANK_SHEBA || '',
      account: process.env.TAXI_BANK_ACCOUNT || '',
    },
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

function serializePlan(state, plan) {
  const isLifetime = !!plan.is_lifetime;
  const totalPrice = plan.total_price != null ? Number(plan.total_price) : Number(plan.base_monthly || 0);
  const monthsCount = isLifetime ? 0 : Math.max(1, Number(plan.months_count || 1));
  const durationDays = isLifetime ? null : (plan.duration_days != null ? Number(plan.duration_days) : monthsCount * 30);
  const monthlyEq = isLifetime ? null : Math.round(totalPrice / monthsCount);
  const refMonthly = state.plans.find(p => p.code === 'monthly')?.total_price || 150000;
  const savings = (!isLifetime && monthsCount > 1) ? Math.max(0, refMonthly * monthsCount - totalPrice) : 0;
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    tier: plan.tier || 'proplus',
    description: plan.description || '',
    duration_days: durationDays,
    months_count: monthsCount,
    price: totalPrice,
    total_price: totalPrice,
    monthly_equivalent: monthlyEq,
    savings,
    base_monthly: Number(plan.base_monthly || totalPrice),
    extra_user_monthly: Number(plan.extra_user_monthly || 0),
    min_seats: Number(plan.min_seats || 1),
    max_seats: Number(plan.max_seats || 50),
    is_lifetime: isLifetime,
    badge: plan.badge || null,
    is_featured: !!plan.is_featured,
    payment_type: isLifetime ? 'یک‌باره' : 'دوره‌ای',
    renewal_type: isLifetime ? 'بدون نیاز به تمدید دوره‌ای' : 'قابل تمدید در پایان دوره',
    updates_policy: 'طبق شرایط محصول',
    support_policy: 'طبق شرایط محصول',
    features: Array.isArray(plan.features) ? plan.features : [],
    is_active: plan.is_active !== false,
    sort_order: Number(plan.sort_order || 10),
  };
}

function computeQuote(state, plan, seats = 1, months = null, coupon = null) {
  const isLifetime = !!plan.is_lifetime;
  const effectiveMonths = isLifetime ? 1 : Math.max(1, Number(plan.months_count || months || 1));
  const durationDays = isLifetime ? null : (plan.duration_days != null ? Number(plan.duration_days) : effectiveMonths * 30);
  const baseTotal = plan.total_price != null ? Number(plan.total_price) : Number(plan.base_monthly || 0) * effectiveMonths;
  const extraUsers = Math.max(0, seats - 1);
  const extraMonthly = Number(plan.extra_user_monthly || 0) * extraUsers;
  const extraTotal = isLifetime ? extraMonthly : extraMonthly * effectiveMonths;
  const subtotal = baseTotal + extraTotal;
  let discount = 0;
  if (coupon) {
    discount = coupon.type === 'percent'
      ? Math.round((subtotal * Number(coupon.value || 0)) / 100)
      : Number(coupon.value || 0);
    discount = Math.max(0, Math.min(subtotal, discount));
  }
  const afterDiscount = Math.max(0, subtotal - discount);
  const taxPercent = Math.max(0, Number(state.taxPercent || 0));
  const tax = taxPercent > 0 ? Math.round((afterDiscount * taxPercent) / 100) : 0;
  const total = afterDiscount + tax;
  const monthlyEq = isLifetime ? null : Math.round(subtotal / effectiveMonths);
  return {
    product_name: 'تاکسینو',
    plan_code: plan.code,
    plan_name: plan.name,
    tier: plan.tier || 'proplus',
    seats,
    extra_users: extraUsers,
    months: effectiveMonths,
    duration_days: durationDays,
    is_lifetime: isLifetime,
    base_monthly: Number(plan.base_monthly || baseTotal),
    extra_user_monthly: Number(plan.extra_user_monthly || 0),
    extra_monthly: extraMonthly,
    monthly_total: monthlyEq || subtotal,
    monthly_equivalent: monthlyEq,
    base_total: baseTotal,
    extra_total: extraTotal,
    subtotal,
    discount,
    tax_percent: taxPercent,
    tax,
    total,
    coupon_code: coupon?.code || null,
    currency: 'toman',
  };
}

function formatLicense(state, lic) {
  if (!lic) return null;
  const now = Date.now();
  const isLifetime = !!lic.is_lifetime;
  const expMs = !isLifetime && lic.expires_at ? Date.parse(lic.expires_at) : NaN;
  const isExpired = !isLifetime && (!Number.isFinite(expMs) || now >= expMs);
  const effectiveStatus = !lic.is_active
    ? 'suspended'
    : (lic.status === 'suspended' || lic.status === 'canceled'
      ? lic.status
      : (isLifetime ? 'active' : (isExpired ? 'expired' : 'active')));
  const isValid = !!lic.is_active && effectiveStatus === 'active' && (isLifetime || !isExpired);
  const daysRemaining = isLifetime ? null : (Number.isFinite(expMs) ? Math.max(0, Math.ceil((expMs - now) / 86400000)) : 0);
  const seats = Math.max(1, Number(lic.seats || lic.max_users || 1));
  const activeUsers = state.users.filter(u => u.store_id === lic.store_id && u.is_active).length;
  const totalUsers = state.users.filter(u => u.store_id === lic.store_id).length;
  const store = state.stores.find(s => s.id === lic.store_id) || null;
  const primaryUser = state.users.find(u => u.store_id === lic.store_id) || null;
  const planRow = state.plans.find(p => p.code === lic.plan_code);
  const planName = planRow?.name || lic.plan_name || (isLifetime ? 'مادام‌العمر' : 'اشتراک تاکسینو');
  const lastPaid = state.orders.find(o => o.store_id === lic.store_id && o.status === 'paid');
  return {
    ...lic,
    plan_name: planName,
    seats,
    max_users: seats,
    is_lifetime: isLifetime,
    expires_at: isLifetime ? null : lic.expires_at,
    status: effectiveStatus,
    is_valid: isValid,
    is_expired: isExpired,
    days_remaining: daysRemaining,
    active_users: activeUsers,
    total_users: totalUsers,
    email: primaryUser?.email || null,
    store_name: store?.name || null,
    owner_name: store?.owner_name || null,
    phone: store?.phone || null,
    last_transaction: lastPaid?.reference_id || null,
    store: store ? { id: store.id, name: store.name, owner_name: store.owner_name, phone: store.phone, email: primaryUser?.email || null } : undefined,
  };
}

function formatStore(state, store) {
  if (!store) return null;
  const lic = state.licenses.find(l => l.store_id === store.id) || null;
  const users = state.users
    .filter(u => u.store_id === store.id)
    .map(u => ({ id: u.id, name: u.name, email: u.email, phone: u.phone || null, role: u.role, is_active: u.is_active }));
  return {
    ...store,
    email: users[0]?.email || null,
    users_count: users.length,
    active_users_count: users.filter(u => u.is_active).length,
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
    phone: user.phone || null,
    role: user.role,
    is_active: user.is_active,
    store_id: user.store_id,
    created_at: user.created_at,
    store: formatStore(state, store),
  };
}

function formatOrder(state, order) {
  const store = state.stores.find(s => s.id === order.store_id) || null;
  const inv = state.invoices.find(i => i.order_id === order.id) || null;
  return {
    id: order.id,
    store_id: order.store_id,
    store_name: store?.name || null,
    plan: order.plan,
    plan_label: order.plan_label || order.plan,
    tier: order.tier || 'proplus',
    type: order.type || 'new',
    months: order.months,
    duration_days: order.price_snapshot?.duration_days ?? null,
    seats: order.seats,
    subtotal: order.subtotal,
    discount: order.discount || 0,
    coupon_code: order.coupon_code || null,
    is_lifetime: !!order.is_lifetime,
    amount: order.amount,
    status: order.status,
    gateway: order.gateway,
    reference_id: order.reference_id || null,
    paid_at: order.paid_at || null,
    created_at: order.created_at,
    instructions: order.instructions || null,
    invoice_number: inv?.number || null,
    invoice_voided: !!inv?.voided_at,
    voided_at: order.voided_at || null,
    void_reason: order.void_reason || null,
    is_voided: order.status === 'voided',
    price_snapshot: order.price_snapshot || null,
  };
}

function availableGateways(state) {
  const list = [{ key: 'manual', label: 'کارت به کارت / هماهنگی با پشتیبانی کارن‌سافت', mode: 'manual' }];
  if (state.zarinpalEnabled) {
    list.unshift({
      key: 'zarinpal',
      label: 'درگاه پرداخت آنلاین زرین‌پال',
      mode: state.zarinpalSandbox ? 'sandbox' : 'live',
    });
  }
  return list;
}

function completeOrder(state, order, referenceId) {
  if (order.status === 'paid') return order;
  let lic = state.licenses.find(l => l.store_id === order.store_id);
  const plan = state.plans.find(p => p.code === order.plan);
  const isLifetime = !!(order.is_lifetime || plan?.is_lifetime);
  const durationDays = order.price_snapshot?.duration_days != null
    ? Number(order.price_snapshot.duration_days)
    : (plan?.duration_days != null ? Number(plan.duration_days) : Number(order.months || 1) * 30);

  if (!lic) {
    lic = {
      id: state.nextIds.license++,
      store_id: order.store_id,
      starts_at: new Date().toISOString(),
    };
    state.licenses.push(lic);
  }
  const baseMs = (!lic.is_lifetime && lic.expires_at && Date.parse(lic.expires_at) > Date.now())
    ? Date.parse(lic.expires_at)
    : Date.now();

  Object.assign(lic, {
    tier: order.tier || 'proplus',
    plan_code: order.plan,
    plan_name: order.plan_label || plan?.name || order.plan,
    seats: Math.max(1, Number(order.seats || 1)),
    max_users: Math.max(1, Number(order.seats || 1)),
    status: 'active',
    is_active: true,
    is_trial: false,
    is_lifetime: isLifetime,
    starts_at: lic.starts_at || new Date().toISOString(),
    expires_at: isLifetime ? null : new Date(baseMs + durationDays * 86400000).toISOString(),
    notes: isLifetime ? 'اشتراک مادام‌العمر' : 'اشتراک فعال',
  });

  order.status = 'paid';
  order.paid_at = new Date().toISOString();
  order.reference_id = referenceId || order.reference_id || `REF-${order.id}`;

  const payment = state.payments.find(p => p.order_id === order.id && p.status === 'pending');
  if (payment) {
    payment.status = 'paid';
    payment.reference_id = order.reference_id;
    payment.verified_at = order.paid_at;
  }

  if (order.coupon_code) {
    const cp = state.coupons.find(c => c.code === order.coupon_code);
    if (cp) cp.used_count = (cp.used_count || 0) + 1;
  }

  const invNumber = `KS-${new Date().getFullYear()}-${String(state.nextIds.invoice++).padStart(5, '0')}`;
  state.invoices.unshift({
    number: invNumber,
    order_id: order.id,
    store_id: order.store_id,
    plan_code: order.plan,
    plan_name: order.plan_label,
    seats: order.seats,
    months: order.months,
    subtotal: order.subtotal,
    discount: order.discount || 0,
    total: order.amount,
    currency: 'toman',
    snapshot: order.price_snapshot,
    issued_at: order.paid_at,
    voided_at: null,
  });

  state.history.unshift({
    id: state.nextIds.history++,
    store_id: order.store_id,
    license_id: lic.id,
    action: order.type === 'renewal' ? 'subscription_renewed' : 'subscription_started',
    reason: `پرداخت سفارش #${order.id}`,
    payload: { order_id: order.id, plan_code: order.plan, amount: order.amount, expires_at: lic.expires_at },
    created_at: order.paid_at,
  });

  return order;
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
    const store = storeId ? state.stores.find(s => s.id === storeId) : null;
    state.audit.unshift({
      id: state.nextIds.audit++,
      action,
      storeId,
      storeName: store?.name || null,
      userName: user?.name || null,
      userEmail: user?.email || null,
      ip: '127.0.0.1',
      meta,
      createdAt: new Date().toISOString(),
    });
  }

  function resolveCoupon(code) {
    if (!code) return null;
    const norm = String(code).trim().toUpperCase();
    if (!norm) return null;
    const cp = state.coupons.find(c => c.code === norm && c.is_active !== false);
    if (!cp) return { error: 'کد تخفیف معتبر یا فعال نیست.' };
    if (cp.max_uses && (cp.used_count || 0) >= cp.max_uses) return { error: 'سقف استفاده از این کد تخفیف تکمیل شده است.' };
    if (cp.expires_at && Date.parse(cp.expires_at) < Date.now()) return { error: 'مهلت استفاده از این کد تخفیف به پایان رسیده است.' };
    return { coupon: cp };
  }

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(url.pathname);
    const method = request.method || 'GET';

    if (pathname === '/up') {
      sendJson(response, 200, { ok: true, service: 'karensoft-taxino' });
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

      // مسیرهای عمومی اشتراک (بدون نیاز به ورود)
      if (pathname === '/api/subscription/plans' && method === 'GET') {
        sendJson(response, 200, {
          product_name: 'تاکسینو',
          brand_name: 'کارن سافت',
          slogan: 'همه‌چیز تحت کنترل شما',
          plans: state.plans.filter(p => p.is_active !== false).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(p => serializePlan(state, p)),
          gateways: availableGateways(state),
          default_gateway: state.zarinpalEnabled ? 'zarinpal' : 'manual',
          currency: 'toman',
          currency_label: 'تومان',
          tax_percent: state.taxPercent,
          trial_days: 14,
          public_registration: false,
          support: KARENSOFT_SUPPORT,
        });
        return;
      }

      if (pathname === '/api/subscription/quote' && method === 'GET') {
        const planCode = String(url.searchParams.get('plan_code') || '').trim().toLowerCase();
        const plan = state.plans.find(p => p.code === planCode && p.is_active !== false);
        if (!plan) {
          sendJson(response, 422, { message: 'پلن انتخاب‌شده معتبر یا فعال نیست.', errors: { plan_code: ['پلن انتخاب‌شده معتبر یا فعال نیست.'] } });
          return;
        }
        const seats = Math.max(1, Number(url.searchParams.get('seats') || 1));
        if (seats > (plan.max_seats || 50)) {
          sendJson(response, 422, { message: 'تعداد کاربر خارج از سقف مجاز پلن است.', errors: { seats: ['تعداد کاربر خارج از سقف مجاز پلن است.'] } });
          return;
        }
        const cpRes = resolveCoupon(url.searchParams.get('coupon_code'));
        if (cpRes?.error) {
          sendJson(response, 422, { message: cpRes.error, errors: { coupon_code: [cpRes.error] } });
          return;
        }
        const quote = computeQuote(state, plan, seats, url.searchParams.get('months'), cpRes?.coupon || null);
        sendJson(response, 200, { quote });
        return;
      }

      if (pathname === '/api/billing/callback' && method === 'GET') {
        const orderId = Number(url.searchParams.get('order') || 0);
        const order = state.orders.find(o => o.id === orderId);
        if (!order) {
          response.writeHead(302, { Location: '/?billing=missing#subscription' }).end();
          return;
        }
        if (order.status === 'paid') {
          response.writeHead(302, { Location: `/?billing=paid&order=${order.id}#subscription` }).end();
          return;
        }
        const statusParam = String(url.searchParams.get('Status') || 'OK').toUpperCase();
        const canVerify = order.gateway === 'zarinpal' && statusParam === 'OK' && state.zarinpalApprove;
        if (!canVerify) {
          if (order.status === 'pending') {
            order.status = 'failed';
            const p = state.payments.find(x => x.order_id === order.id && x.status === 'pending');
            if (p) p.status = 'failed';
            logAudit(null, 'order_failed', order.store_id, { order_id: order.id });
          }
          response.writeHead(302, { Location: `/?billing=failed&order=${order.id}#subscription` }).end();
          return;
        }
        const refId = String(url.searchParams.get('RefID') || `ZP-${100000 + order.id}`);
        completeOrder(state, order, refId);
        logAudit(null, 'order_paid', order.store_id, { order_id: order.id, reference: refId });
        response.writeHead(302, { Location: `/?billing=paid&order=${order.id}#subscription` }).end();
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
        const toEn = s => String(s || '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
        const normPhone = s => {
          let d = toEn(s).replace(/\D+/g, '');
          if (d.startsWith('0098') && d.length > 4) d = '0' + d.slice(4);
          else if (d.startsWith('98') && d.length === 12) d = '0' + d.slice(2);
          else if (d.length === 10 && d.startsWith('9')) d = '0' + d;
          return d;
        };
        const identifier = toEn(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');
        let user = state.users.find(u => u.email.toLowerCase() === identifier && u.password === password)
          || state.users.find(u => u.email.toLowerCase() === identifier);
        if (!user && !identifier.includes('@')) {
          const targetPhone = normPhone(identifier);
          if (targetPhone.length >= 7) {
            user = state.users.find(u => u.phone && normPhone(u.phone) === targetPhone && u.password === password)
              || state.users.find(u => u.phone && normPhone(u.phone) === targetPhone);
            if (!user) {
              const matchingStores = state.stores.filter(s => s.phone && normPhone(s.phone) === targetPhone).map(s => s.id);
              user = state.users.find(u => matchingStores.includes(u.store_id) && u.password === password)
                || state.users.find(u => matchingStores.includes(u.store_id));
            }
          }
        }
        if (!user || user.password !== password) {
          sendJson(response, 422, { message: 'شماره موبایل/ایمیل یا رمز عبور اشتباه است.', errors: { email: ['شماره موبایل/ایمیل یا رمز عبور اشتباه است.'] } });
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
        logAudit(user, 'user_logged_in', user.store_id);
        const formattedUser = formatUser(state, user);
        sendJson(response, 200, {
          user: formattedUser,
          license: formattedUser.store?.license || null,
          server_time: new Date().toISOString(),
        }, {
          'Set-Cookie': [`taxi_session=${sid}; Path=/; HttpOnly; SameSite=Lax`],
        });
        return;
      }

      if (pathname === '/api/logout' && method === 'POST') {
        if (sessionId) state.sessions.delete(sessionId);
        if (currentUser) logAudit(currentUser, 'user_logged_out', currentUser.store_id);
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
        const formattedUser = formatUser(state, currentUser);
        sendJson(response, 200, {
          user: formattedUser,
          license: formattedUser.store?.license || null,
          server_time: new Date().toISOString(),
        });
        return;
      }

      // مسیرهای اشتراک سمت آژانس
      if (pathname === '/api/subscription' && method === 'GET') {
        if (!currentUser.store_id) {
          sendJson(response, 422, { message: 'حساب مدیر کل به آژانس خاصی متصل نیست.' });
          return;
        }
        const lic = formatLicense(state, state.licenses.find(l => l.store_id === currentUser.store_id));
        const storeOrders = state.orders.filter(o => o.store_id === currentUser.store_id).map(o => formatOrder(state, o));
        const storeInvoices = state.invoices.filter(i => i.store_id === currentUser.store_id).map(i => ({ ...i, is_voided: !!i.voided_at }));
        sendJson(response, 200, {
          product_name: 'تاکسینو',
          brand_name: 'کارن سافت',
          tax_percent: state.taxPercent,
          license: lic,
          usage: { active_users: lic?.active_users || 1, seats: lic?.seats || 1 },
          orders: storeOrders,
          invoices: storeInvoices,
          plans: state.plans.filter(p => p.is_active !== false).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(p => serializePlan(state, p)),
          gateways: availableGateways(state),
          default_gateway: state.zarinpalEnabled ? 'zarinpal' : 'manual',
          currency: 'toman',
          currency_label: 'تومان',
          pending_order: storeOrders.find(o => o.status === 'pending') || null,
          bank: state.bank,
          support: KARENSOFT_SUPPORT,
        });
        return;
      }

      if (pathname === '/api/subscription/status' && method === 'GET') {
        const lic = currentUser.store_id ? formatLicense(state, state.licenses.find(l => l.store_id === currentUser.store_id)) : null;
        const orderId = Number(url.searchParams.get('order') || 0);
        const order = orderId && currentUser.store_id
          ? state.orders.find(o => o.id === orderId && o.store_id === currentUser.store_id)
          : null;
        sendJson(response, 200, {
          subscription: lic ? {
            plan_code: lic.plan_code,
            plan_name: lic.plan_name,
            tier: lic.tier,
            seats: lic.seats,
            status: lic.status,
            is_trial: lic.is_trial,
            is_lifetime: lic.is_lifetime,
            starts_at: lic.starts_at,
            expires_at: lic.expires_at,
            days_remaining: lic.days_remaining,
          } : null,
          license: lic,
          order: order ? formatOrder(state, order) : null,
        });
        return;
      }

      if (pathname === '/api/subscription/checkout' && method === 'POST') {
        if (!currentUser.store_id) {
          sendJson(response, 422, { message: 'آژانس برای این کاربر تعریف نشده است.' });
          return;
        }
        const body = await readJsonBody(request);
        const planCode = String(body.plan_code || '').trim().toLowerCase();
        const plan = state.plans.find(p => p.code === planCode && p.is_active !== false);
        if (!plan) {
          sendJson(response, 422, { message: 'پلن انتخاب‌شده معتبر یا فعال نیست.', errors: { plan_code: ['پلن انتخاب‌شده معتبر یا فعال نیست.'] } });
          return;
        }
        const cpRes = resolveCoupon(body.coupon_code);
        if (cpRes?.error) {
          sendJson(response, 422, { message: cpRes.error, errors: { coupon_code: [cpRes.error] } });
          return;
        }
        const curLic = state.licenses.find(l => l.store_id === currentUser.store_id);
        const seats = Math.max(1, Number(body.seats || curLic?.seats || 1));
        const gateway = String(body.gateway || (state.zarinpalEnabled ? 'zarinpal' : 'manual'));
        if (gateway === 'zarinpal' && !state.zarinpalEnabled) {
          sendJson(response, 422, { message: 'درگاه آنلاین زرین‌پال هنوز فعال نشده است؛ از روش ثبت سفارش/پشتیبانی استفاده کنید.', errors: { gateway: ['درگاه آنلاین فعال نیست.'] } });
          return;
        }
        const quote = computeQuote(state, plan, seats, body.months, cpRes?.coupon || null);
        const formattedCurLic = formatLicense(state, curLic);
        const orderType = !formattedCurLic || !formattedCurLic.is_valid
          ? 'new'
          : (plan.is_lifetime && !formattedCurLic.is_lifetime ? 'upgrade' : 'renewal');
        const orderId = state.nextIds.order++;
        const redirectUrl = gateway === 'zarinpal' ? `/api/billing/callback?order=${orderId}&Authority=A${String(orderId).padStart(10, '0')}&Status=OK` : null;
        const instructions = gateway === 'manual'
          ? `مبلغ ${quote.total.toLocaleString('en-US')} تومان — شناسه سفارش: #${orderId} (برای فعال‌سازی آنی، شماره پیگیری را به پشتیبانی کارن‌سافت اعلام کنید)`
          : null;
        const order = {
          id: orderId,
          store_id: currentUser.store_id,
          user_id: currentUser.id,
          plan: quote.plan_code,
          plan_label: quote.plan_name,
          tier: quote.tier,
          type: orderType,
          months: quote.months,
          seats: quote.seats,
          subtotal: quote.subtotal,
          discount: quote.discount,
          coupon_code: quote.coupon_code,
          price_snapshot: quote,
          is_lifetime: quote.is_lifetime,
          amount: quote.total,
          status: 'pending',
          gateway,
          reference_id: null,
          instructions,
          created_at: new Date().toISOString(),
        };
        state.orders.unshift(order);
        state.payments.unshift({
          id: state.nextIds.payment++,
          order_id: order.id,
          store_id: order.store_id,
          gateway,
          amount: order.amount,
          status: 'pending',
          reference_id: null,
          created_at: order.created_at,
        });
        logAudit(currentUser, 'order_created', currentUser.store_id, { order_id: order.id, plan: order.plan, amount: order.amount });
        sendJson(response, 201, {
          order: formatOrder(state, order),
          redirect_url: redirectUrl,
          instructions,
        });
        return;
      }

      const invMatch = pathname.match(/^\/api\/subscription\/invoices\/([^/]+)$/);
      if (invMatch && method === 'GET') {
        const inv = state.invoices.find(i => i.number === invMatch[1] && i.store_id === currentUser.store_id);
        if (!inv) { sendJson(response, 404, { message: 'فاکتور یافت نشد.' }); return; }
        const st = state.stores.find(s => s.id === currentUser.store_id);
        sendJson(response, 200, { invoice: { ...inv, is_voided: !!inv.voided_at, store: { name: st?.name || '' } } });
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
          const activeList = formattedLics.filter(l => l.is_valid);
          const subsActive = activeList.length;
          const subsLifetime = activeList.filter(l => l.is_lifetime).length;
          const subsTrial = activeList.filter(l => l.is_trial).length;
          const exp7 = activeList.filter(l => !l.is_lifetime && l.days_remaining <= 7).length;
          const subsExpired = formattedLics.filter(l => l.status === 'expired').length;
          const subsSuspended = formattedLics.filter(l => l.status === 'suspended').length;
          const paidOrders = state.orders.filter(o => o.status === 'paid');
          const revenueTotal = paidOrders.reduce((s, o) => s + Number(o.amount || 0), 0);
          let mrr = 0;
          for (const l of activeList.filter(x => !x.is_lifetime && !x.is_trial)) {
            const p = state.plans.find(pl => pl.code === l.plan_code);
            if (p) mrr += Math.round((p.total_price || p.base_monthly || 0) / Math.max(1, p.months_count || 1));
          }
          const soon = activeList
            .filter(l => !l.is_lifetime && l.days_remaining <= 14)
            .map(l => ({
              license_id: l.id,
              store_id: l.store_id,
              store_name: l.store?.name || '',
              email: l.email || '',
              plan_code: l.plan_code,
              plan_name: l.plan_name,
              expires_at: l.expires_at,
              days_remaining: l.days_remaining,
            }));
          const planBreakdown = state.plans.map(p => {
            const activeForPlan = activeList.filter(l => l.plan_code === p.code);
            const paidForPlan = paidOrders.filter(o => o.plan === p.code);
            return {
              plan_code: p.code,
              plan_name: p.name,
              total: activeForPlan.length,
              seats: activeForPlan.reduce((s, l) => s + (l.seats || 1), 0),
              orders: paidForPlan.length,
              revenue: paidForPlan.reduce((s, o) => s + Number(o.amount || 0), 0),
            };
          });
          sendJson(response, 200, {
            kpis: {
              stores_total: state.stores.filter(s => !s.is_archived).length,
              stores_archived: state.stores.filter(s => s.is_archived).length,
              users_active: state.users.filter(u => u.role === 'store' && u.is_active).length,
              subs_active: subsActive,
              subs_lifetime: subsLifetime,
              subs_trial: subsTrial,
              subs_expired: subsExpired,
              subs_suspended: subsSuspended,
              subs_expiring_7: exp7,
              orders_pending: state.orders.filter(o => o.status === 'pending').length,
              revenue_month: revenueTotal,
              revenue_year: revenueTotal,
              revenue_total: revenueTotal,
              mrr,
              currency: 'toman',
            },
            expiring_soon: soon,
            plan_breakdown: planBreakdown,
            recent_orders: state.orders.slice(0, 8).map(o => ({
              id: o.id,
              store_id: o.store_id,
              store_name: state.stores.find(s => s.id === o.store_id)?.name || '',
              plan: o.plan,
              plan_name: o.plan_label || o.plan,
              amount: o.amount,
              status: o.status,
              gateway: o.gateway,
              reference_id: o.reference_id,
              created_at: o.created_at,
            })),
          });
          return;
        }

        if (pathname === '/api/manager/stores' && method === 'GET') {
          const status = url.searchParams.get('status') || 'active';
          const q = (url.searchParams.get('q') || '').trim().toLowerCase();
          const list = state.stores
            .filter(s => status === 'all' ? true : status === 'archived' ? s.is_archived : !s.is_archived)
            .map(s => formatStore(state, s))
            .filter(s => !q || [s.name, s.owner_name, s.phone, s.email].some(v => String(v || '').toLowerCase().includes(q)));
          sendJson(response, 200, {
            stores: list,
            meta: { page: 1, per_page: 50, total: list.length, last_page: 1 },
            totals: {
              active: state.stores.filter(s => !s.is_archived).length,
              archived: state.stores.filter(s => s.is_archived).length,
            },
          });
          return;
        }

        if (pathname === '/api/manager/stores' && method === 'POST') {
          const body = await readJsonBody(request);
          const email = String(body.email || '').trim().toLowerCase();
          if (!body.name || !email || !body.password || String(body.password).length < 6) {
            sendJson(response, 422, { message: 'نام آژانس، ایمیل معتبر و رمز عبور حداقل ۶ کاراکتری الزامی است.' });
            return;
          }
          if (state.users.some(u => u.email.toLowerCase() === email)) {
            sendJson(response, 422, { message: 'این ایمیل قبلاً ثبت شده است.' });
            return;
          }
          const nested = body.license && typeof body.license === 'object' ? body.license : {};
          const requestedCode = String(nested.plan_code || body.plan_code || '').trim().toLowerCase();
          const byName = body.plan_name ? state.plans.find(p => p.name === String(body.plan_name).trim()) : null;
          let plan = state.plans.find(p => p.code === requestedCode) || byName || null;
          const isLifetime = !!(nested.is_lifetime ?? body.is_lifetime ?? plan?.is_lifetime ?? false);
          if (!plan) plan = state.plans.find(p => p.code === (isLifetime ? 'lifetime' : 'yearly')) || state.plans[0];
          const days = Math.max(1, Number(nested.days ?? body.days ?? plan?.duration_days ?? 365));
          const seats = Math.max(1, Number(nested.seats ?? body.seats ?? body.max_users ?? 3));
          const isActive = nested.is_active !== false;
          const expiresAt = isLifetime
            ? null
            : (nested.expires_at ? String(nested.expires_at) : new Date(Date.now() + days * 86400000).toISOString());

          const store = {
            id: state.nextIds.store++,
            name: String(body.name).trim(),
            slug: `agency-${Date.now()}`,
            owner_name: String(body.owner_name || '').trim(),
            phone: String(body.phone || '').trim(),
            address: String(body.address || '').trim(),
            admin_note: String(body.admin_note || '').trim(),
            is_active: true,
            is_archived: false,
            archived_at: null,
            created_at: new Date().toISOString(),
          };
          state.stores.unshift(store);
          state.licenses.push({
            id: state.nextIds.license++,
            store_id: store.id,
            tier: plan?.tier || 'proplus',
            plan_code: plan?.code || (isLifetime ? 'lifetime' : 'yearly'),
            plan_name: plan?.name || (isLifetime ? 'مادام‌العمر' : 'یک‌ساله'),
            status: isActive ? 'active' : 'suspended',
            is_active: isActive,
            is_lifetime: isLifetime,
            is_trial: !!nested.is_trial,
            starts_at: nested.starts_at || new Date().toISOString(),
            expires_at: expiresAt,
            seats,
            max_users: seats,
            notes: String(nested.notes || body.admin_note || (isLifetime ? 'اشتراک مادام‌العمر' : 'اشتراک فعال')),
          });
          state.users.push({
            id: state.nextIds.user++,
            store_id: store.id,
            name: String(body.user_name || body.owner_name || store.name).trim(),
            email,
            phone: store.phone || null,
            password: String(body.password),
            role: 'store',
            is_active: true,
            created_at: new Date().toISOString(),
          });
          logAudit(currentUser, 'store_created', store.id, { name: store.name, plan_code: plan?.code });
          sendJson(response, 201, { store: formatStore(state, store) });
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
              if (body.phone !== undefined) u.phone = store.phone;
              if (body.password && String(body.password).length >= 6) u.password = String(body.password);
            }
            logAudit(currentUser, 'store_updated', storeId);
            sendJson(response, 200, { store: formatStore(state, store) });
            return;
          }
          if (!subAction && method === 'DELETE') {
            const body = await readJsonBody(request);
            if (body.mode === 'purge') {
              if (!store.is_archived) {
                sendJson(response, 422, { message: 'ابتدا آژانس را آرشیو کنید؛ حذف دائمی مستقیم مجاز نیست.' });
                return;
              }
              if (String(body.confirm_name || '').trim() !== store.name) {
                sendJson(response, 422, { message: 'نام واردشده با نام آژانس مطابقت ندارد.' });
                return;
              }
              state.stores = state.stores.filter(s => s.id !== storeId);
              state.licenses = state.licenses.filter(l => l.store_id !== storeId);
              state.users = state.users.filter(u => u.store_id !== storeId);
              logAudit(currentUser, 'store_purged', storeId);
              sendJson(response, 200, { purged: true });
              return;
            }
            store.is_archived = true;
            store.archived_at = new Date().toISOString();
            store.is_active = false;
            logAudit(currentUser, 'store_archived', storeId);
            sendJson(response, 200, { archived: true, store: formatStore(state, store) });
            return;
          }
          if (subAction === 'license' && method === 'PUT') {
            const body = await readJsonBody(request);
            let lic = state.licenses.find(l => l.store_id === storeId);
            if (!lic) { lic = { id: state.nextIds.license++, store_id: storeId, starts_at: new Date().toISOString() }; state.licenses.push(lic); }
            const plan = body.plan_code ? state.plans.find(p => p.code === body.plan_code) : null;
            if (plan) { lic.plan_code = plan.code; lic.plan_name = plan.name; }
            else if (body.plan_name) lic.plan_name = String(body.plan_name);
            lic.is_active = body.is_active !== false;
            lic.is_lifetime = !!body.is_lifetime;
            lic.is_trial = !!body.is_trial;
            const seats = Math.max(1, Number(body.seats ?? body.max_users ?? lic.seats ?? 3));
            lic.seats = seats;
            lic.max_users = seats;
            lic.notes = String(body.notes ?? lic.notes ?? '');
            if (lic.is_lifetime) {
              lic.plan_code = lic.plan_code || 'lifetime';
              lic.expires_at = null;
              lic.status = lic.is_active ? 'active' : 'suspended';
            } else if (body.expires_at) {
              lic.expires_at = String(body.expires_at);
              lic.status = Date.parse(lic.expires_at) > Date.now() && lic.is_active ? 'active' : 'expired';
            } else if (body.days !== undefined && body.days !== null) {
              const days = Number(body.days);
              lic.expires_at = days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : new Date(Date.now() - 60000).toISOString();
              lic.status = days > 0 && lic.is_active ? 'active' : 'expired';
            }
            logAudit(currentUser, 'license_updated', storeId);
            sendJson(response, 200, { store: formatStore(state, store) });
            return;
          }
          if (subAction === 'trial' && method === 'POST') {
            const body = await readJsonBody(request);
            const days = Math.max(1, Number(body.days) || 14);
            let lic = state.licenses.find(l => l.store_id === storeId);
            if (!lic) { lic = { id: state.nextIds.license++, store_id: storeId }; state.licenses.push(lic); }
            Object.assign(lic, { plan_code: 'monthly', plan_name: 'آزمایشی', status: 'active', is_active: true, is_lifetime: false, is_trial: true, starts_at: new Date().toISOString(), expires_at: new Date(Date.now() + days * 86400000).toISOString(), seats: 3, max_users: 3 });
            logAudit(currentUser, 'trial_granted', storeId);
            sendJson(response, 200, { store: formatStore(state, store) });
            return;
          }
          if (subAction === 'archive' && method === 'POST') {
            store.is_archived = true; store.archived_at = new Date().toISOString(); store.is_active = false;
            logAudit(currentUser, 'store_archived', storeId);
            sendJson(response, 200, { archived: true, store: formatStore(state, store) });
            return;
          }
          if (subAction === 'restore' && method === 'POST') {
            store.is_archived = false; store.archived_at = null; store.is_active = true;
            logAudit(currentUser, 'store_restored', storeId);
            sendJson(response, 200, { store: formatStore(state, store) });
            return;
          }
        }

        if (pathname === '/api/manager/subscribers' && method === 'GET') {
          const rawStatus = url.searchParams.get('status') || '';
          const status = rawStatus === 'all' ? '' : rawStatus;
          const q = (url.searchParams.get('q') || url.searchParams.get('search') || '').trim().toLowerCase();
          const allRows = state.licenses.map(l => formatLicense(state, l));
          const rows = allRows.filter(l =>
            (!status || l.status === status)
            && (!q || [l.store?.name, l.owner_name, l.phone, l.email].some(v => String(v || '').toLowerCase().includes(q))),
          );
          sendJson(response, 200, {
            subscribers: rows,
            meta: { page: 1, per_page: 50, total: rows.length, last_page: 1 },
            stats: {
              total: allRows.length,
              active: allRows.filter(l => l.is_valid).length,
              expired: allRows.filter(l => l.status === 'expired').length,
              expiring_7: allRows.filter(l => l.is_valid && !l.is_lifetime && l.days_remaining <= 7).length,
              suspended: allRows.filter(l => l.status === 'suspended').length,
              pending_orders: state.orders.filter(o => o.status === 'pending').length,
            },
          });
          return;
        }

        const subMatch = pathname.match(/^\/api\/manager\/subscribers\/(\d+)(?:\/(extend|status|seats))?$/);
        if (subMatch) {
          const key = Number(subMatch[1]);
          const act = subMatch[2] || '';
          const lic = state.licenses.find(l => l.id === key) || state.licenses.find(l => l.store_id === key);
          const store = lic ? state.stores.find(s => s.id === lic.store_id) : null;
          if (!store || !lic) { sendJson(response, 404, { message: 'اشتراک پیدا نشد.' }); return; }
          if (!act && method === 'GET') {
            sendJson(response, 200, {
              subscriber: formatLicense(state, lic),
              store: { id: store.id, name: store.name, phone: store.phone },
              payments: state.orders.filter(o => o.store_id === store.id).map(o => formatOrder(state, o)),
              attempts: state.payments.filter(p => p.store_id === store.id),
              invoices: state.invoices.filter(i => i.store_id === store.id),
              history: state.history.filter(h => h.store_id === store.id),
              users: state.users.filter(u => u.store_id === store.id).map(u => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, is_active: u.is_active })),
            });
            return;
          }
          if (act === 'extend' && method === 'POST') {
            const body = await readJsonBody(request);
            if (!body.reason || String(body.reason).trim().length < 3) {
              sendJson(response, 422, { message: 'دلیل تمدید الزامی است.', errors: { reason: ['دلیل تمدید الزامی است.'] } });
              return;
            }
            const months = Math.max(1, Number(body.months) || 1);
            const plan = body.plan_code ? state.plans.find(x => x.code === body.plan_code) : null;
            if (plan?.is_lifetime) {
              lic.is_lifetime = true;
              lic.expires_at = null;
              lic.plan_code = plan.code;
              lic.plan_name = plan.name;
            } else {
              const baseMs = (!lic.is_lifetime && lic.expires_at && Date.parse(lic.expires_at) > Date.now()) ? Date.parse(lic.expires_at) : Date.now();
              const addDays = (plan && plan.duration_days && Number(plan.months_count) === months) ? Number(plan.duration_days) : months * 30;
              lic.is_lifetime = false;
              lic.expires_at = new Date(baseMs + addDays * 86400000).toISOString();
              if (plan) { lic.plan_code = plan.code; lic.plan_name = plan.name; }
            }
            lic.status = 'active'; lic.is_active = true; lic.is_trial = false;
            if (body.seats || body.max_users) {
              const s = Math.max(1, Number(body.seats || body.max_users));
              lic.seats = s; lic.max_users = s;
            }
            state.history.unshift({ id: state.nextIds.history++, store_id: store.id, license_id: lic.id, action: 'subscription_manual_extended', reason: String(body.reason), payload: { months, expires_at: lic.expires_at }, created_at: new Date().toISOString() });
            logAudit(currentUser, 'subscription_manual_extended', store.id, { months });
            sendJson(response, 200, { subscriber: formatLicense(state, lic) });
            return;
          }
          if (act === 'status' && method === 'POST') {
            const body = await readJsonBody(request);
            lic.status = String(body.status || 'active');
            lic.is_active = lic.status === 'active';
            state.history.unshift({ id: state.nextIds.history++, store_id: store.id, license_id: lic.id, action: 'subscription_status_changed', reason: String(body.reason || ''), payload: { to: lic.status }, created_at: new Date().toISOString() });
            logAudit(currentUser, 'subscription_status_changed', store.id, { status: lic.status });
            sendJson(response, 200, { subscriber: formatLicense(state, lic) });
            return;
          }
        }

        if (pathname === '/api/manager/plans' && method === 'GET') {
          const formattedLics = state.licenses.map(l => formatLicense(state, l)).filter(l => l.is_valid);
          const paidOrders = state.orders.filter(o => o.status === 'paid');
          sendJson(response, 200, {
            plans: state.plans.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(p => ({
              ...serializePlan(state, p),
              active_subscribers: formattedLics.filter(l => l.plan_code === p.code).length,
              sales: {
                orders: paidOrders.filter(o => o.plan === p.code).length,
                revenue: paidOrders.filter(o => o.plan === p.code).reduce((s, o) => s + Number(o.amount || 0), 0),
              },
            })),
          });
          return;
        }
        if (pathname === '/api/manager/plans' && method === 'POST') {
          const body = await readJsonBody(request);
          const isLifetime = !!body.is_lifetime;
          const monthsCount = isLifetime ? 0 : Math.max(1, Number(body.months_count || 1));
          const totalPrice = Number(body.total_price ?? body.base_monthly ?? 150000);
          const plan = {
            id: state.nextIds.plan++,
            code: String(body.code || 'custom').toLowerCase(),
            name: String(body.name || 'پلن جدید'),
            tier: 'proplus',
            description: String(body.description || ''),
            duration_days: isLifetime ? null : Number(body.duration_days || monthsCount * 30),
            months_count: monthsCount,
            total_price: totalPrice,
            base_monthly: isLifetime ? totalPrice : Math.round(totalPrice / monthsCount),
            extra_user_monthly: Number(body.extra_user_monthly || 0),
            min_seats: 1,
            max_seats: Number(body.max_seats || 50),
            is_lifetime: isLifetime,
            badge: body.badge || null,
            is_featured: !!body.is_featured,
            features: Array.isArray(body.features) ? body.features : [],
            is_active: true,
            sort_order: Number(body.sort_order || 100),
          };
          state.plans.push(plan);
          state.priceHistory.unshift({ id: state.nextIds.priceHistory++, plan_code: plan.code, base_monthly: totalPrice, extra_user_monthly: 0, note: 'ثبت اولیه تعرفه', changed_at: new Date().toISOString() });
          sendJson(response, 201, { plan: serializePlan(state, plan) });
          return;
        }
        const planMatch = pathname.match(/^\/api\/manager\/plans\/([^/]+)(?:\/(toggle|prices))?$/);
        if (planMatch) {
          const key = planMatch[1].toLowerCase();
          const sub = planMatch[2] || '';
          const plan = state.plans.find(p => p.code === key) || (/^\d+$/.test(key) ? state.plans.find(p => p.id === Number(key)) : null);
          if (!plan) { sendJson(response, 404, { message: 'پلن پیدا نشد.' }); return; }
          if (sub === 'prices' && method === 'GET') {
            sendJson(response, 200, {
              history: state.priceHistory.filter(h => h.plan_code === plan.code).map(h => ({
                price: h.base_monthly,
                base_monthly: h.base_monthly,
                extra_user_monthly: h.extra_user_monthly,
                note: h.note,
                changed_at: h.changed_at,
              })),
            });
            return;
          }
          if (sub === 'toggle' && method === 'PATCH') {
            const body = await readJsonBody(request);
            plan.is_active = body.is_active !== undefined ? !!body.is_active : !plan.is_active;
            sendJson(response, 200, { plan: serializePlan(state, plan) });
            return;
          }
          if (!sub && method === 'PUT') {
            const body = await readJsonBody(request);
            const oldPrice = plan.total_price;
            if (body.name !== undefined) plan.name = String(body.name);
            if (body.description !== undefined) plan.description = String(body.description);
            if (body.badge !== undefined) plan.badge = body.badge || null;
            if (body.total_price !== undefined) {
              plan.total_price = Number(body.total_price);
              plan.base_monthly = plan.is_lifetime ? plan.total_price : Math.round(plan.total_price / Math.max(1, plan.months_count || 1));
            } else if (body.base_monthly !== undefined) {
              plan.base_monthly = Number(body.base_monthly);
              plan.total_price = plan.is_lifetime ? plan.base_monthly : plan.base_monthly * Math.max(1, plan.months_count || 1);
            }
            if (oldPrice !== plan.total_price) {
              state.priceHistory.unshift({
                id: state.nextIds.priceHistory++,
                plan_code: plan.code,
                base_monthly: plan.total_price,
                extra_user_monthly: plan.extra_user_monthly || 0,
                note: String(body.price_note || body.note || 'ویرایش تعرفه توسط مدیر'),
                changed_at: new Date().toISOString(),
              });
            }
            logAudit(currentUser, 'plan_updated', null, { code: plan.code, total_price: plan.total_price });
            sendJson(response, 200, { plan: serializePlan(state, plan) });
            return;
          }
        }

        if (pathname === '/api/manager/orders' && method === 'GET') {
          const st = url.searchParams.get('status') || '';
          const q = (url.searchParams.get('q') || '').trim().toLowerCase();
          const allFormatted = state.orders.map(o => formatOrder(state, o));
          const filtered = allFormatted.filter(o =>
            (!st || o.status === st)
            && (!q || [o.store_name, o.reference_id, o.coupon_code, `#${o.id}`].some(v => String(v || '').toLowerCase().includes(q))),
          );
          const paidOrders = state.orders.filter(o => o.status === 'paid');
          const pendingOrders = state.orders.filter(o => o.status === 'pending');
          sendJson(response, 200, {
            orders: filtered,
            meta: { page: 1, per_page: 50, total: filtered.length, last_page: 1 },
            totals: {
              pending: pendingOrders.length,
              pending_amount: pendingOrders.reduce((s, o) => s + Number(o.amount || 0), 0),
              paid_this_month: paidOrders.length,
              revenue_this_month: paidOrders.reduce((s, o) => s + Number(o.amount || 0), 0),
            },
          });
          return;
        }
        const ordAct = pathname.match(/^\/api\/manager\/orders\/(\d+)\/(approve|reject|void)$/);
        if (ordAct && method === 'POST') {
          const order = state.orders.find(o => o.id === Number(ordAct[1]));
          if (!order) { sendJson(response, 404, { message: 'سفارش یافت نشد.' }); return; }
          const body = await readJsonBody(request);
          if (ordAct[2] === 'approve') {
            const ref = String(body.reference || body.payment_reference || '').trim();
            if (!ref) {
              sendJson(response, 422, { message: 'شماره پیگیری بانکی الزامی است.', errors: { reference: ['شماره پیگیری بانکی الزامی است.'] } });
              return;
            }
            completeOrder(state, order, ref);
            logAudit(currentUser, 'order_manually_approved', order.store_id, { order_id: order.id, reference: ref });
            sendJson(response, 200, { order: formatOrder(state, order) });
            return;
          }
          if (ordAct[2] === 'reject') {
            order.status = 'canceled';
            logAudit(currentUser, 'order_rejected', order.store_id, { order_id: order.id, reason: body.reason });
            sendJson(response, 200, { order: formatOrder(state, order) });
            return;
          }
          if (ordAct[2] === 'void') {
            order.status = 'voided';
            order.voided_at = new Date().toISOString();
            order.void_reason = String(body.reason || '');
            const inv = state.invoices.find(i => i.order_id === order.id);
            if (inv) inv.voided_at = order.voided_at;
            logAudit(currentUser, 'order_voided', order.store_id, { order_id: order.id, reason: order.void_reason });
            sendJson(response, 200, { order: formatOrder(state, order) });
            return;
          }
        }

        if (pathname === '/api/manager/coupons' && method === 'GET') {
          sendJson(response, 200, { coupons: state.coupons });
          return;
        }
        if (pathname === '/api/manager/coupons' && method === 'POST') {
          const body = await readJsonBody(request);
          const coupon = { id: state.nextIds.coupon++, code: String(body.code || '').trim().toUpperCase(), type: body.type || 'percent', value: Number(body.value) || 10, max_uses: body.max_uses ? Number(body.max_uses) : null, used_count: 0, is_active: true, ends_at: body.ends_at || null };
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
          sendJson(response, 200, {
            managers: state.users.filter(u => u.role === 'manager').map(u => ({
              ...formatUser(state, u),
              is_self: u.id === currentUser.id,
            })),
          });
          return;
        }
        if (pathname === '/api/manager/managers' && method === 'POST') {
          const body = await readJsonBody(request);
          const m = { id: state.nextIds.user++, store_id: null, name: String(body.name || ''), email: String(body.email || '').toLowerCase(), password: String(body.password || 'admin12345'), role: 'manager', is_active: body.is_active !== false, created_at: new Date().toISOString() };
          state.users.push(m);
          sendJson(response, 201, { manager: formatUser(state, m) });
          return;
        }
        const mgrItem = pathname.match(/^\/api\/manager\/managers\/(\d+)$/);
        if (mgrItem) {
          const targetMgr = state.users.find(u => u.id === Number(mgrItem[1]) && u.role === 'manager');
          if (!targetMgr) { sendJson(response, 404, { message: 'مدیر یافت نشد.' }); return; }
          if (method === 'PUT') {
            const body = await readJsonBody(request);
            if (body.name) targetMgr.name = String(body.name);
            if (body.email) targetMgr.email = String(body.email).toLowerCase();
            if (body.password) targetMgr.password = String(body.password);
            if (body.is_active !== undefined && targetMgr.id !== currentUser.id) targetMgr.is_active = !!body.is_active;
            sendJson(response, 200, { manager: formatUser(state, targetMgr) });
            return;
          }
          if (method === 'DELETE') {
            if (targetMgr.id === currentUser.id) {
              sendJson(response, 422, { message: 'نمی‌توانید حساب خودتان را غیرفعال کنید.' });
              return;
            }
            targetMgr.is_active = false;
            sendJson(response, 200, { manager: formatUser(state, targetMgr) });
            return;
          }
        }
        if (pathname === '/api/manager/audit' && method === 'GET') {
          const act = url.searchParams.get('action') || '';
          const q = (url.searchParams.get('q') || '').toLowerCase();
          const events = state.audit.filter(a => (!act || a.action.includes(act)) && (!q || JSON.stringify(a).toLowerCase().includes(q)));
          sendJson(response, 200, { events, meta: { page: 1, per_page: 50, total: events.length, last_page: 1 } });
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
