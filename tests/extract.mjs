import fs from 'node:fs';

/** متن فایل برنامهٔ تک‌فایلی را می‌خواند. */
export function readApp() {
  return fs.readFileSync(new URL('../taxi.html', import.meta.url), 'utf8');
}

/** اسکریپت درون‌خطی برنامه را برمی‌گرداند. */
export function readInlineScript() {
  const match = readApp().match(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/);
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
