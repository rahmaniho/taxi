import fs from 'node:fs';

const DEFAULT_BOOT_AUTH = {
  user: {
    id: 1,
    name: 'آژانس تست',
    email: 'test@taxi.ir',
    role: 'store',
    is_active: true,
    store_id: 0,
    store: {
      id: 0,
      name: 'کارن‌سافت',
      is_active: true,
      is_archived: false,
      license: {
        id: 1,
        plan_name: 'آژانس حرفه‌ای',
        plan_code: 'pro',
        status: 'active',
        is_active: true,
        is_lifetime: true,
        is_trial: false,
        is_valid: true,
        days_remaining: null,
        expires_at: null,
        max_users: 5,
        active_users: 1,
      },
    },
  },
  loggedInAt: '2026-11-06T08:00:00.000Z',
  lastVerifiedAt: '2026-11-06T08:00:00.000Z',
  maxSeenAt: 0,
};

/** متن فایل برنامهٔ تک‌فایلی را می‌خواند (در حالت پیش‌فرض نشست فعال آژانس برای تست‌های عملیاتی تزریق می‌شود). */
export function readApp({ authenticated = true, bootAuth = DEFAULT_BOOT_AUTH } = {}) {
  const raw = fs.readFileSync(new URL('../taxi.html', import.meta.url), 'utf8');
  if (!authenticated) return raw;
  const payload = JSON.stringify(bootAuth);
  return raw.replace(
    "'use strict';",
    `'use strict';if(!window.__TAXI_BOOT_AUTH__)window.__TAXI_BOOT_AUTH__=${payload};`,
  );
}

/** اسکریپت درون‌خطی برنامه را برمی‌گرداند. */
export function readInlineScript() {
  const match = readApp({ authenticated: false }).match(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('اسکریپت درون‌خطی پیدا نشد.');
  return match[1];
}

/** یک تابع را با تطبیق آکولادها از متن بیرون می‌کشد (برای تست توابع خالص). */
export function extractFunction(source, name) {
  let start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`تابع ${name} در متن برنامه پیدا نشد.`);
  if (source.slice(Math.max(0, start - 6), start) === 'async ') start -= 6;
  let depth = 0;
  let index = source.indexOf('{', start);
  for (; index < source.length; index++) {
    const ch = source[index];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        index++;
        break;
      }
    }
  }
  return source.slice(start, index);
}

/** توابع امنیتی خالص را از برنامه جدا می‌کند تا بدون مرورگر تست شوند. */
export function loadCryptoModule(win) {
  const script = readInlineScript();
  const names = [
    'utf8Bytes', 'sha256Bytes', 'concatBytes', 'hmacSha256', 'pbkdf2Sha256Js',
    'bytesToB64', 'b64ToBytes', 'hasWebCrypto', 'randomBytes', 'safeEqual',
    'deriveSecret', 'createSecret', 'verifySecret', 'recoveryCode',
    'normalizePin', 'validPin',
  ];
  const constant = script.match(/const SHA256_K=\[[^\]]*\];/);
  if (!constant) throw new Error('جدول ثابت‌های SHA-256 پیدا نشد.');
  const toEnglish = script.split('\n').find(line => line.trim().startsWith('const toEnglish='));
  if (!toEnglish) throw new Error('تابع toEnglish پیدا نشد.');
  const body = [constant[0], toEnglish, ...names.map(name => extractFunction(script, name))].join('\n');
  const factory = new Function('window', 'btoa', 'atob', 'TextEncoder', `${body}
    return { sha256Bytes, pbkdf2Sha256Js, bytesToB64, b64ToBytes, createSecret, verifySecret, recoveryCode, normalizePin, validPin };`);
  return factory(win, globalThis.btoa, globalThis.atob, TextEncoder);
}
