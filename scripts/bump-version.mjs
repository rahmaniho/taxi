#!/usr/bin/env node
/**
 * هم‌گام‌سازی نسخهٔ برنامه از یک منبع واحد (package.json)
 *
 * - نسخهٔ نمایشی در `taxi.html` (`APP_VERSION`)
 * - نسخهٔ کش سرویس‌ورکر در `sw.js` (`CACHE_VERSION`)
 *
 * کاربرد:
 *   node scripts/bump-version.mjs          # نوشتن نسخهٔ package.json در همهٔ فایل‌ها
 *   node scripts/bump-version.mjs --check   # فقط بررسی هم‌خوانی (برای CI)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const cacheVersion = `taxi-v${version}`;

const targets = [
  {
    file: 'taxi.html',
    pattern: /APP_VERSION='[^']*'/,
    expected: `APP_VERSION='${version}'`,
    label: 'APP_VERSION',
  },
  {
    file: 'sw.js',
    pattern: /const CACHE_VERSION = '[^']*';/,
    expected: `const CACHE_VERSION = '${cacheVersion}';`,
    label: 'CACHE_VERSION',
  },
];

let mismatch = false;
for (const target of targets) {
  const path = join(root, target.file);
  const text = readFileSync(path, 'utf8');
  const match = text.match(target.pattern);
  if (!match) {
    console.error(`✖ ${target.label} در ${target.file} پیدا نشد.`);
    mismatch = true;
    continue;
  }
  if (match[0] === target.expected) {
    console.log(`✓ ${target.file} · ${target.label} = ${target.expected}`);
    continue;
  }
  if (checkOnly) {
    console.error(`✖ ${target.file} · ${target.label} = «${match[0]}» ولی انتظار «${target.expected}» بود.`);
    mismatch = true;
    continue;
  }
  writeFileSync(path, text.replace(target.pattern, target.expected));
  console.log(`✎ ${target.file} · ${target.label} → ${target.expected}`);
}

if (mismatch) {
  console.error('\nنسخه‌ها هم‌خوان نیستند؛ «node scripts/bump-version.mjs» را اجرا کنید.');
  process.exit(1);
}
console.log(checkOnly ? '\nنسخه‌ها هم‌خوان‌اند.' : '\nنسخه‌ها به‌روزرسانی شدند.');
