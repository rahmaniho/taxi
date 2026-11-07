#!/usr/bin/env node
/**
 * ساخت بسته‌های «بخش‌به‌بخش» آمادهٔ آپلود در cPanel برای «تاکسینو | Taxino» (taxi.karen-soft.ir)
 *
 * چرا بخش‌بخش؟
 *   آپلود یک فایل ZIP چند ده مگابایتی (با vendor) در File Manager سی‌پنل معمولاً یا قطع می‌شود
 *   یا به سقف حجم آپلود هاست می‌خورد. با شکستن پروژه به بسته‌های کوچک:
 *     • هر بسته در چند ثانیه آپلود و Extract می‌شود،
 *     • اگر یکی از آپلودها نیمه‌کاره بماند فقط همان بسته تکرار می‌شود،
 *     • می‌توان تازه‌سازی‌ها را هم بخشی انجام داد (مثلاً فقط PWA یا فقط دیتابیس).
 *
 * ساختار همهٔ بسته‌ها یکسان است: مسیرها با پیشوند `laravel-backend/` ذخیره می‌شوند،
 * پس کافی است همه را در مسیر `~/taxi-app` سی‌پنل Extract کنید تا در جای درست بنشینند.
 *
 * کاربرد:
 *   node scripts/build-cpanel-parts.mjs                  # بسته‌های متنی/کدی (بدون vendor)
 *   node scripts/build-cpanel-parts.mjs --with-vendor     # به‌همراه بسته(های) vendor (در CI با Composer)
 *   node scripts/build-cpanel-parts.mjs --vendor-chunk-mb=8
 *
 * خروجی‌ها در `deploy/laravel-app/artifacts/parts/` ساخته می‌شوند:
 *   taxi-cpanel-01-core.zip … taxi-cpanel-07-vendor-N.zip
 *   SHA256SUMS.txt
 *   PARTS.md
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const backendDir = join(root, 'laravel-backend');
const artifactsDir = join(root, 'deploy', 'laravel-app', 'artifacts', 'parts');
const prefix = 'laravel-backend';

const includeVendor = process.argv.includes('--with-vendor');
const chunkArg = process.argv.find(arg => arg.startsWith('--vendor-chunk-mb='));
const vendorChunkMb = Math.max(2, Number(chunkArg ? chunkArg.split('=')[1] : 8) || 8);

const parts = [
  {
    id: '01-core',
    title: 'هستهٔ برنامه (app, config, routes, composer…)',
    hint: 'بخش اصلی کد لاراول؛ هیچ فایل رسانه‌ای حجیمی ندارد.',
    paths: [
      'app',
      'config',
      'routes',
      'resources',
      'bin',
      'artisan',
      'README.md',
      'composer.json',
      'composer.lock',
      '.env.example',
      '.env.production.example',
      '.gitignore',
    ],
  },
  {
    id: '02-database',
    title: 'دیتابیس (migrations, seeders, factories)',
    hint: 'برای ساخت جداول با دستور migrate؛ بدون این بخش مهاجرت‌ها اجرا نمی‌شوند.',
    paths: ['database'],
  },
  {
    id: '03-public-bootstrap',
    title: 'بوت‌استرپ و راه‌انداز وب (public/index.php، .htaccess، manifest)',
    hint: 'فایل‌های کوچک ولی حیاتی؛ بدون این‌ها سایت خطای ۵۰۰ می‌دهد.',
    paths: [
      'public/index.php',
      'public/.htaccess',
      'public/robots.txt',
      'public/favicon.ico',
      'bootstrap/app.php',
      'bootstrap/providers.php',
    ],
  },
  {
    id: '04-pwa-app',
    title: 'برنامهٔ PWA (taxi.html، sw.js، manifest.json)',
    hint: 'خودِ نرم‌افزار تک‌فایلی تاکسینو و سرویس‌ورکر آفلاین.',
    paths: ['public/taxi.html', 'public/sw.js', 'public/manifest.json'],
  },
  {
    id: '05-pwa-icons',
    title: 'آیکون‌ها و تصاویر PWA (icons/)',
    hint: 'سنگین‌ترین بخش پروژه؛ جدا نگه داشتنش آپلود بقیه را سریع می‌کند.',
    paths: ['public/icons'],
  },
  {
    id: '06-storage',
    title: 'پوشه‌های storage و bootstrap/cache',
    hint: 'اسکلت پوشه‌های نوشتنی؛ مجوزها بعد از Extract توسط اسکریپت تنظیم می‌شوند.',
    paths: [
      'storage/app',
      'storage/framework',
      'storage/logs',
      'bootstrap/cache/.gitignore',
    ],
  },
];

const mb = bytes => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
const kb = bytes => `${(bytes / 1024).toFixed(0)} KB`;
const human = bytes => (bytes >= 1024 * 1024 ? mb(bytes) : kb(bytes));

function sizeOf(target) {
  const st = statSync(target, { throwIfNoEntry: false });
  if (!st) return 0;
  if (!st.isDirectory()) return st.size;
  let total = 0;
  for (const entry of readdirSync(target)) {
    total += sizeOf(join(target, entry));
  }
  return total;
}

function collect(relPath) {
  const abs = join(backendDir, relPath);
  if (!existsSync(abs)) return { missing: relPath, bytes: 0 };
  return { missing: null, bytes: sizeOf(abs) };
}

function makeZip(zipPath, cwd, entries) {
  rmSync(zipPath, { force: true });
  if (entries.length === 0) return false;
  execFileSync('zip', ['-rq', '-9', zipPath, ...entries], { cwd, stdio: 'inherit' });
  return existsSync(zipPath);
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

if (!existsSync(backendDir)) {
  console.error('✖ پوشهٔ laravel-backend پیدا نشد.');
  process.exit(1);
}

rmSync(artifactsDir, { recursive: true, force: true });
mkdirSync(artifactsDir, { recursive: true });

const built = [];
const missing = [];

for (const part of parts) {
  const entries = [];
  let bytes = 0;

  for (const relPath of part.paths) {
    const { missing: missingPath, bytes: size } = collect(relPath);
    if (missingPath) {
      missing.push(missingPath);
      continue;
    }
    entries.push(`${prefix}/${relPath}`);
    bytes += size;
  }

  const zipName = `taxi-cpanel-${part.id}.zip`;
  const zipPath = join(artifactsDir, zipName);
  const ok = makeZip(zipPath, root, entries);
  if (!ok) {
    console.log(`ℹ بستهٔ ${part.id} خالی بود و ساخته نشد.`);
    continue;
  }

  const zipBytes = statSync(zipPath).size;
  built.push({ id: part.id, zipName, title: part.title, hint: part.hint, rawBytes: bytes, zipBytes });
  console.log(`✓ ${zipName}  (${human(bytes)} → ${human(zipBytes)})`);
}

// ————— بستهٔ vendor (فقط وقتی Composer روی ماشین اجرا شده باشد) —————
if (includeVendor) {
  const vendorDir = join(backendDir, 'vendor');
  if (!existsSync(join(vendorDir, 'autoload.php'))) {
    console.log('ℹ vendor/ نصب نیست؛ بسته‌های vendor ساخته نشدند (composer install --no-dev را اجرا کنید).');
  } else {
    const limit = vendorChunkMb * 1024 * 1024;
    // فایل‌های ریشهٔ vendor (autoload.php و…) و پوشه‌های کم‌حجم composer/ و bin/
    // همراه بستهٔ اول می‌روند؛ بقیه به‌صورت بسته‌بندی‌شده (vendor/package) بین بخش‌ها پخش می‌شوند.
    const vendorEntries = readdirSync(vendorDir).filter(name => name !== '.gitignore');
    const globals = vendorEntries.filter(name => {
      if (name === 'composer' || name === 'bin') return true;
      return !statSync(join(vendorDir, name)).isDirectory();
    });
    const packages = [];
    for (const vendorName of vendorEntries) {
      if (globals.includes(vendorName)) continue;
      const vendorPath = join(vendorDir, vendorName);
      if (!statSync(vendorPath).isDirectory()) continue;
      for (const pkg of readdirSync(vendorPath)) {
        const pkgPath = join(vendorPath, pkg);
        if (!statSync(pkgPath).isDirectory()) continue;
        packages.push({ rel: `${prefix}/vendor/${vendorName}/${pkg}`, bytes: sizeOf(pkgPath) });
      }
    }
    packages.sort((a, b) => b.bytes - a.bytes);

    const chunks = [];
    let current = { entries: globals.map(name => `${prefix}/vendor/${name}`), bytes: 0 };
    for (const pkg of packages) {
      if (current.entries.length > 0 && current.bytes + pkg.bytes > limit) {
        chunks.push(current);
        current = { entries: [], bytes: 0 };
      }
      current.entries.push(pkg.rel);
      current.bytes += pkg.bytes;
    }
    if (current.entries.length > 0) chunks.push(current);

    const width = Math.max(2, String(chunks.length).length);
    chunks.forEach((chunk, index) => {
      const id = `07-vendor-${String(index + 1).padStart(width, '0')}`;
      const zipName = `taxi-cpanel-${id}.zip`;
      const zipPath = join(artifactsDir, zipName);
      if (!makeZip(zipPath, root, chunk.entries)) return;
      const zipBytes = statSync(zipPath).size;
      built.push({
        id,
        zipName,
        title: `وابستگی‌های Composer (بخش ${index + 1} از ${chunks.length})`,
        hint: 'کتابخانه‌های لاراول؛ بدون این بخش سایت اجرا نمی‌شود. ترتیب Extract مهم نیست.',
        rawBytes: chunk.bytes,
        zipBytes,
      });
      console.log(`✓ ${zipName}  (${human(chunk.bytes)} → ${human(zipBytes)})`);
    });
  }
}

if (built.length === 0) {
  console.error('✖ هیچ بسته‌ای ساخته نشد.');
  process.exit(1);
}

// ————— چک‌سام و راهنمای بسته‌ها —————
const checksums = built.map(item => `${sha256(join(artifactsDir, item.zipName))}  ${item.zipName}`);
writeFileSync(join(artifactsDir, 'SHA256SUMS.txt'), `${checksums.join('\n')}\n`, 'utf8');

const totalRaw = built.reduce((sum, item) => sum + item.rawBytes, 0);
const totalZip = built.reduce((sum, item) => sum + item.zipBytes, 0);

const guide = [
  '# بسته‌های بخش‌به‌بخش تاکسینو برای cPanel',
  '',
  `آدرس هدف: \`https://taxi.karen-soft.ir\` — مسیر نصب: \`/home/USERNAME/taxi-app\``,
  '',
  `تعداد بسته‌ها: **${built.length}** · حجم اصلی: **${mb(totalRaw)}** · حجم فشرده: **${mb(totalZip)}**`,
  '',
  '| # | فایل | محتوا | حجم فشرده |',
  '|---|------|-------|-----------|',
  ...built.map(item => `| ${item.id} | \`${item.zipName}\` | ${item.title} | ${human(item.zipBytes)} |`),
  '',
  '## روش استفاده در cPanel',
  '',
  '۱. در **File Manager** به مسیر `~/taxi-app` بروید (اگر نیست، بسازید).',
  '۲. برای هر بسته: **Upload** → انتخاب فایل → پس از پایان آپلود، روی فایل راست‌کلیک → **Extract**.',
  '۳. به همین ترتیب همهٔ بسته‌ها را آپلود و Extract کنید؛ محتوای همه در `laravel-backend/` ادغام می‌شود.',
  '۴. **پس از Extract بستهٔ ۰۱** فایل `laravel-backend/.env.production.example` را به `.env` کپی و مقادیر دیتابیس/رمز مدیر را در آن بگذارید (گام ۴ راهنمای `INSTALL.md`).',
  '۵. در پایان یک‌بار `bash bin/cpanel-setup.sh` را در Terminal اجرا کنید (گام ۵ راهنمای `INSTALL.md`).',
  '',
  '> ترتیب Extract اهمیت ندارد؛ فقط **همهٔ** بسته‌ها باید Extract شوند. اگر یک آپلود نیمه‌کاره ماند، فقط همان بسته را دوباره آپلود کنید.',
  '',
  '## بررسی سلامت فایل‌ها',
  '',
  'برای اطمینان از سالم رسیدن فایل‌ها، مقدار SHA-256 هر بسته در فایل `SHA256SUMS.txt` آمده است:',
  '',
  '```bash',
  'sha256sum -c SHA256SUMS.txt',
  '```',
  '',
].join('\n');

writeFileSync(join(artifactsDir, 'PARTS.md'), guide, 'utf8');

if (missing.length > 0) {
  console.log(`ℹ مسیرهای یافت‌نشده (نادیده گرفته شد): ${[...new Set(missing)].join(', ')}`);
}
console.log('');
console.log(`✓ ${built.length} بسته در deploy/laravel-app/artifacts/parts ساخته شد (${mb(totalZip)} فشرده).`);
console.log('✓ فهرست بسته‌ها: deploy/laravel-app/artifacts/parts/PARTS.md');
