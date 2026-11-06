#!/usr/bin/env node
/**
 * هم‌گام‌سازی فایل‌های PWA آفلاین تاکسی کارن با پوشهٔ public سرور لاراول (`laravel-backend/public`)
 *
 * کاربرد:
 *   node scripts/sync-laravel-pwa.mjs          # کپی فایل‌های PWA به laravel-backend/public
 *   node scripts/sync-laravel-pwa.mjs --check   # بررسی هم‌خوانی بایت‌به‌بایت (برای CI)
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const root = join(dirname(__filename), '..');
const laravelPublic = join(root, 'laravel-backend', 'public');

export function syncLaravelPwa({ checkOnly = false } = {}) {
  const rootFiles = ['taxi.html', 'sw.js', 'manifest.json'];
  const iconFiles = readdirSync(join(root, 'icons')).filter(name => name.endsWith('.png') || name.endsWith('.svg'));
  const allFiles = [
    ...rootFiles,
    ...iconFiles.map(name => join('icons', name)),
  ];

  if (!checkOnly) {
    mkdirSync(join(laravelPublic, 'icons'), { recursive: true });
    for (const rel of allFiles) {
      cpSync(join(root, rel), join(laravelPublic, rel));
      console.log(`✎ laravel-backend/public/${rel} هم‌گام شد.`);
    }
    console.log('\nفایل‌های PWA در laravel-backend/public به‌روزرسانی شدند.');
    return true;
  }

  let mismatch = false;
  for (const rel of allFiles) {
    const src = join(root, rel);
    const dst = join(laravelPublic, rel);
    if (!existsSync(dst)) {
      console.error(`✖ فایل laravel-backend/public/${rel} وجود ندارد.`);
      mismatch = true;
      continue;
    }
    const srcBuf = readFileSync(src);
    const dstBuf = readFileSync(dst);
    if (!srcBuf.equals(dstBuf)) {
      console.error(`✖ عدم تطابق محتوا در laravel-backend/public/${rel}`);
      mismatch = true;
    } else {
      console.log(`✓ laravel-backend/public/${rel}`);
    }
  }

  if (mismatch) {
    console.error('\nفایل‌های PWA در laravel-backend/public هم‌گام نیستند؛ «npm run laravel:sync» را اجرا کنید.');
    return false;
  }
  console.log('\nفایل‌های PWA سرور لاراول کاملاً هم‌گام‌اند.');
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  const ok = syncLaravelPwa({ checkOnly: process.argv.includes('--check') });
  process.exit(ok ? 0 : 1);
}
