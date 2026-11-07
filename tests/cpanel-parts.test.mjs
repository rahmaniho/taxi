import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const artifactsDir = join(root, 'deploy', 'laravel-app', 'artifacts', 'parts');
const backendDir = join(root, 'laravel-backend');

const hasZip = (() => {
  try {
    execFileSync('zip', ['-v'], { stdio: 'ignore' });
    return true;
  } catch (_) {
    return false;
  }
})();

const listZip = zipPath => execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' }).split('\n').filter(Boolean);

test('بسته‌های بخش‌به‌بخش cPanel: پوشش همهٔ فایل‌های لازم و مسیر درست laravel-backend/', { skip: !hasZip && 'ابزار zip نصب نیست' }, () => {
  rmSync(artifactsDir, { recursive: true, force: true });
  execFileSync('node', [join(root, 'scripts', 'build-cpanel-parts.mjs')], { cwd: root, stdio: 'pipe' });

  const zips = readdirSync(artifactsDir).filter(name => name.endsWith('.zip')).sort();
  assert.ok(zips.length >= 6, `دست‌کم ۶ بسته باید ساخته شود (ساخته شد: ${zips.length})`);
  for (const expected of [
    'taxi-cpanel-01-core.zip',
    'taxi-cpanel-02-database.zip',
    'taxi-cpanel-03-public-bootstrap.zip',
    'taxi-cpanel-04-pwa-app.zip',
    'taxi-cpanel-05-pwa-icons.zip',
    'taxi-cpanel-06-storage.zip',
  ]) {
    assert.ok(zips.includes(expected), `بستهٔ ${expected} ساخته نشد`);
  }

  // همهٔ مسیرها با پیشوند laravel-backend/ ذخیره می‌شوند تا Extract در ~/taxi-app درست بنشیند
  const allEntries = new Set();
  for (const zip of zips) {
    const entries = listZip(join(artifactsDir, zip));
    if (zip.includes('00-root-tools')) {
      // بستهٔ ابزار ریشه: فایل‌ها باید در ریشهٔ ZIP باشند (نه داخل laravel-backend)
      for (const entry of entries) {
        assert.ok(!entry.startsWith('laravel-backend/'), `بستهٔ ریشه نباید پوشهٔ laravel-backend داشته باشد: ${entry}`);
      }
      assert.ok(entries.includes('root-router.htaccess'), 'root-router.htaccess در بستهٔ ریشه نیست');
      assert.ok(entries.includes('cpanel-doctor.php'), 'cpanel-doctor.php در بستهٔ ریشه نیست');
      continue;
    }
    for (const entry of entries) {
      assert.ok(entry.startsWith('laravel-backend/'), `${zip} مسیر بیگانه دارد: ${entry}`);
      allEntries.add(entry);
    }
  }

  for (const required of [
    'laravel-backend/artisan',
    'laravel-backend/composer.json',
    'laravel-backend/composer.lock',
    'laravel-backend/bin/cpanel-setup.sh',
    'laravel-backend/.env.production.example',
    'laravel-backend/public/index.php',
    'laravel-backend/public/.htaccess',
    'laravel-backend/public/taxi.html',
    'laravel-backend/public/sw.js',
    'laravel-backend/public/manifest.json',
    'laravel-backend/public/icons/icon-512.png',
    'laravel-backend/bootstrap/app.php',
    'laravel-backend/database/seeders/DatabaseSeeder.php',
    'laravel-backend/app/Http/Controllers/Api/AuthController.php',
    'laravel-backend/routes/web.php',
    'laravel-backend/config/database.php',
  ]) {
    assert.ok(allEntries.has(required), `فایل حیاتی در بسته‌ها نیست: ${required}`);
  }

  // فایل .env واقعی هرگز نباید داخل بسته‌ها برود
  assert.ok(!allEntries.has('laravel-backend/.env'), 'فایل .env نباید در بسته‌ها باشد');

  // هیچ فایل پروژه‌ای جا نماند (به‌جز tests/ و phpunit.xml که عمداً کنار گذاشته شده‌اند)
  // tests/ و phpunit.xml عمداً در بسته‌ها نیستند (فقط برای توسعه‌اند)
  const skipDirs = new Set(['tests', 'vendor', 'node_modules']);
  const skipFiles = new Set(['phpunit.xml', '.env']);
  const projectFiles = [];
  const walk = rel => {
    for (const name of readdirSync(join(backendDir, rel), { withFileTypes: true })) {
      const relPath = rel ? `${rel}/${name.name}` : name.name;
      if (name.isDirectory()) {
        if (!skipDirs.has(relPath)) walk(relPath);
        continue;
      }
      if (skipFiles.has(relPath)) continue;
      projectFiles.push(`laravel-backend/${relPath}`);
    }
  };
  walk('');

  const missing = projectFiles.filter(file => !allEntries.has(file));
  assert.deepEqual(missing, [], `این فایل‌ها در هیچ بسته‌ای نیستند: ${missing.join(', ')}`);

  // چک‌سام‌ها و راهنما هم ساخته می‌شوند
  assert.ok(existsSync(join(artifactsDir, 'SHA256SUMS.txt')), 'SHA256SUMS.txt ساخته نشد');
  const checksums = readFileSync(join(artifactsDir, 'SHA256SUMS.txt'), 'utf8').trim().split('\n');
  assert.equal(checksums.length, zips.length, 'برای هر بسته باید یک چک‌سام ثبت شود');
  for (const line of checksums) {
    assert.match(line, /^[0-9a-f]{64} {2}taxi-cpanel-[\w.-]+\.zip$/, `خط چک‌سام نامعتبر: ${line}`);
  }

  const guide = readFileSync(join(artifactsDir, 'PARTS.md'), 'utf8');
  assert.match(guide, /taxi-cpanel-01-core\.zip/, 'راهنمای بسته‌ها باید فهرست را داشته باشد');
  assert.match(guide, /sha256sum -c SHA256SUMS\.txt/, 'راهنمای بررسی سلامت لازم است');
});

test('اسکریپت کمکی Extract بخش‌ها: وجود، مجوز اجرا و بررسی مسیرها', () => {
  const script = join(backendDir, 'bin', 'cpanel-extract-parts.sh');
  assert.ok(existsSync(script), 'bin/cpanel-extract-parts.sh باید وجود داشته باشد');

  const stat = statSync(script);
  assert.ok(stat.mode & 0o111, 'اسکریپت باید مجوز اجرا داشته باشد');

  const body = readFileSync(script, 'utf8');
  assert.match(body, /^#!\/usr\/bin\/env bash/, 'shebang bash لازم است');
  assert.match(body, /set -uo pipefail/, 'حالت سخت‌گیرانهٔ bash لازم است');
  // چک‌لیست فایل‌های حیاتی که باید بررسی شوند
  for (const required of [
    'artisan',
    'composer.json',
    'bin/cpanel-setup.sh',
    '.env.production.example',
    'public/index.php',
    'public/.htaccess',
    'public/taxi.html',
    'public/sw.js',
    'public/manifest.json',
    'vendor/autoload.php',
  ]) {
    assert.ok(body.includes(required), `چک‌لیست اسکریپت باید ${required} را بررسی کند`);
  }
  assert.match(body, /laravel-backend\//, 'اسکریپت باید پیشوند laravel-backend/ را اعتبارسنجی کند');
});

test('INSTALL.md: نقشهٔ مقصد همهٔ بسته‌ها مستند شده باشد', () => {
  const install = readFileSync(join(root, 'deploy/laravel-app/INSTALL.md'), 'utf8');

  // همهٔ بسته‌ها در جدول معرفی شده‌اند
  for (const part of [
    'taxi-cpanel-01-core.zip',
    'taxi-cpanel-02-database.zip',
    'taxi-cpanel-03-public-bootstrap.zip',
    'taxi-cpanel-04-pwa-app.zip',
    'taxi-cpanel-05-pwa-icons.zip',
    'taxi-cpanel-06-storage.zip',
    'taxi-cpanel-07-vendor',
  ]) {
    assert.ok(install.includes(part), `INSTALL.md باید ${part} را نام ببرد`);
  }

  // مقصد نهایی همه: ~/taxi-app
  assert.match(install, /~\/taxi-app/, 'مسیر ~/taxi-app باید در راهنما باشد');
  assert.match(install, /laravel-backend\/public\/taxi\.html/, 'مسیر نهایی taxi.html باید ذکر شود');
  assert.match(install, /laravel-backend\/public\/icons/, 'پوشهٔ icons باید ذکر شود');
  assert.match(install, /laravel-backend\/database\/migrations/, 'پوشهٔ migrations باید ذکر شود');
  assert.match(install, /laravel-backend\/vendor/, 'پوشهٔ vendor باید ذکر شود');
  assert.match(install, /laravel-backend\/storage/, 'پوشهٔ storage باید ذکر شود');

  // هشدارهای ایمنی
  assert.match(install, /\.env/, 'راهنما باید دربارهٔ .env توضیح دهد');
  assert.match(install, /cpanel-extract-parts\.sh/, 'راهنما باید اسکریپت کمکی را معرفی کند');
  assert.ok(!/نسخه ۱\.۴\.۰/.test(install), 'نسخهٔ قدیمی ۱.۴.۰ نباید در راهنما بماند');
  assert.match(install, /releases\/tag\/cpanel-parts-v1\.6\.0/, 'لینک ریلیز باید در ابتدای راهنما باشد');
});

test('ابزار تشخیص cPanel: وجود، مسیر بسته، و اعتبارسنجی PHP', () => {
  for (const rel of ['laravel-backend/bin/cpanel-doctor.php', 'deploy/laravel-app/cpanel-doctor.php']) {
    const p = join(root, rel);
    assert.ok(existsSync(p), `${rel} باید وجود داشته باشد`);
    const body = readFileSync(p, 'utf8');
    assert.match(body, /^<\?php/, 'باید با تگ PHP شروع شود');
    assert.match(body, /declare\(strict_types=1\)/, 'strict_types لازم است');
    // نباید رمزها را افشا کند
    assert.match(body, /\$secrets/, 'باید فهرست کلیدهای حساس داشته باشد');
    assert.match(body, /strlen\(\$value\)/, 'برای رمزها فقط طول نمایش داده شود');
    // حفاظت path traversal
    assert.match(body, /str_contains\(\$name, '\.\.'\)/, 'باید path traversal مسدود شود');
    // دسترسی به ZIP فقط با کلید
    assert.match(body, /\.install-key/, 'باید با فایل کلید محافظت شود');
  }

  const router = join(root, 'deploy/laravel-app/root-router.htaccess');
  assert.ok(existsSync(router), 'root-router.htaccess باید وجود داشته باشد');
  const ht = readFileSync(router, 'utf8');
  for (const rule of ['RewriteEngine On', 'laravel-backend/public%{REQUEST_URI}', 'laravel-backend/public/index.php', '[F,L]']) {
    assert.ok(ht.includes(rule), `.htaccess باید شامل «${rule}» باشد`);
  }
  // مسیرهای حساس باید مسدود شوند
  // همهٔ پوشه‌های حساس باید در یک RewriteRule مسدود شوند
  const denyLine = ht.split('\n').find(line => line.includes('[F,L]') && line.includes('|config|'));
  assert.ok(denyLine, 'خط مسدودسازی پوشه‌های حساس پیدا نشد');
  for (const dir of ['app', 'config', 'database', 'storage', 'vendor', 'routes', 'bootstrap']) {
    assert.ok(denyLine.includes(dir), `مسیر ${dir} باید در خط مسدودسازی باشد`);
  }
});

test('root-router-flat.htaccess: قواعد ساختار تخت (public/ کنار artisan)', () => {
  const f = join(root, 'deploy/laravel-app/root-router-flat.htaccess');
  assert.ok(existsSync(f), 'root-router-flat.htaccess باید وجود داشته باشد');
  const ht = readFileSync(f, 'utf8');

  // مسیر public بدون پیشوند laravel-backend
  assert.ok(ht.includes('public%{REQUEST_URI}'), 'باید فایل استاتیک را از public/ سرو کند');
  assert.ok(ht.includes('public/index.php'), 'باید به public/index.php برود');
  // فقط خطوط قاعده بررسی می‌شوند، نه کامنت‌ها
  const rules = ht.split('\n').filter(l => !l.trim().startsWith('#')).join('\n');
  assert.ok(!rules.includes('laravel-backend'), 'در ساختار تخت قواعد نباید پیشوند laravel-backend داشته باشند');

  // مسدودسازی هسته
  const deny = ht.split('\n').find(l => l.includes('[F,L]') && l.includes('config'));
  assert.ok(deny, 'خط مسدودسازی پوشه‌ها پیدا نشد');
  for (const d of ['app', 'config', 'database', 'storage', 'vendor', 'bootstrap', 'routes']) {
    assert.ok(deny.includes(d), `${d} باید مسدود شود`);
  }
  assert.ok(ht.includes('artisan'), 'artisan باید مسدود شود');
  assert.ok(/<FilesMatch "\^\\\.">/.test(ht), 'فایل‌های مخفی (.env) باید مسدود شوند');
  assert.ok(ht.includes('Options -Indexes'), 'لیست پوشه باید خاموش شود');
});

test('بستهٔ ۰۰ شامل هر چهار ابزار ریشه باشد', () => {
  const zip = join(artifactsDir, 'taxi-cpanel-00-root-tools.zip');
  if (!existsSync(zip)) {
    // اگر هنوز ساخته نشده، از اسکریپت بساز
    execFileSync('node', [join(root, 'scripts', 'build-cpanel-parts.mjs')], { cwd: root, stdio: 'pipe' });
  }
  const entries = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split('\n').filter(Boolean);
  for (const f of ['root-router.htaccess', 'root-router-flat.htaccess', 'cpanel-doctor.php', 'where-am-i.php']) {
    assert.ok(entries.includes(f), `${f} باید در بستهٔ ریشه باشد`);
  }
});

test('fix-app-key.php: ایمنی و درستی منطق .env', () => {
  const f = join(root, 'deploy/laravel-app/fix-app-key.php');
  assert.ok(existsSync(f), 'fix-app-key.php باید وجود داشته باشد');
  const body = readFileSync(f, 'utf8');

  assert.match(body, /^<\?php/, 'باید با تگ PHP شروع شود');
  assert.match(body, /declare\(strict_types=1\)/, 'strict_types لازم است');

  // ساخت کلید امن
  assert.match(body, /random_bytes\(32\)/, 'باید کلید ۳۲ بایتی با random_bytes بسازد');
  assert.match(body, /base64_encode/, 'باید به base64 تبدیل شود');

  // محافظت
  assert.match(body, /\.fix-key/, 'باید فایل کلید داشته باشد');
  assert.match(body, /selfdestruct/, 'باید امکان حذف خودکار داشته باشد');
  assert.match(body, /rename\(\$tmp, \$file\)/, 'نوشتن .env باید اتمیک باشد');

  // پاک کردن کش
  assert.match(body, /bootstrap\/cache\/\*\.php/, 'باید کش config را پاک کند');

  // نباید رمزها را افشا کند
  assert.match(body, /DB_PASSWORD.*TAXI_MANAGER_PASSWORD/s, 'باید رمزها را مخفی کند');
  assert.match(body, /strlen\(\$v\)/, 'برای رمز فقط طول نمایش داده شود');
});

test('fix-app-key.php: رفع دو مانع واقعی (.env خالی و کلید به‌صورت نام فایل)', () => {
  const f = join(root, 'deploy/laravel-app/fix-app-key.php');
  const body = readFileSync(f, 'utf8');

  // ۱) .env خالی باید «خالی» تشخیص داده شود، نه «موجود»
  assert.match(body, /function env_is_blank\(string \$file\): bool/, 'تابع env_is_blank لازم است');
  assert.match(body, /\$body = \(string\) @file_get_contents\(\$file\)/, 'محتوای .env باید خوانده شود');
  assert.match(body, /if \(trim\(\$body\) === ''\)/, 'فایل فقط-فاصله هم باید خالی شمرده شود');
  assert.match(body, /APP_KEY\|DB_DATABASE\|APP_ENV/, 'نبود کلیدهای ساختاری هم باید «خالی» شمرده شود');

  // دکمهٔ create نباید با دیدن .env خالی دست از کار بکشد
  assert.match(body, /envExists && !env_is_blank/, 'شرط «وجود دارد پس دست نزن» باید خالی‌بودن را استثنا کند');
  assert.match(body, /env_is_blank\(\(string\) \$envPath\) && is_file/, 'باید .env خالی را از نمونه پر کند');

  // ۲) عملیات یک‌کلیکی
  assert.match(body, /action === 'all'/, 'اکشن all لازم است');
  assert.match(body, /\?action=all&amp;key=/, 'دکمهٔ «همه را درست کن» باید در پنل باشد');

  // ۳) پذیرش کلید به‌صورت نام فایل، اما نه فایل‌های خود لاراول
  assert.match(body, /\$tokenAsFile/, 'باید حالت «کلید به‌صورت نام فایل» پشتیبانی شود');
  assert.match(body, /\$protectedNames/, 'باید فایل‌های محافظت‌شده تعریف شوند');
  for (const name of ['artisan', 'composer.json', 'composer.lock']) {
    assert.ok(body.includes(`'${name}'`), `${name} باید در فهرست محافظت‌شده باشد`);
  }
  assert.match(body, /\$size <= 8192/, 'فایل کلید باید اندازهٔ محدود داشته باشد');
  assert.match(body, /\$content === '' \|\| \$content === \$token/, 'محتوای فایل کلید باید خالی یا همان کلید باشد');
  assert.match(body, /!in_array\(\$token, \$protectedNames, true\)/, 'نام محافظت‌شده نباید به‌عنوان کلید پذیرفته شود');
});

test('بستهٔ ۰۰ شامل fix-app-key.php باشد', () => {
  const zip = join(artifactsDir, 'taxi-cpanel-00-root-tools.zip');
  if (!existsSync(zip)) {
    execFileSync('node', [join(root, 'scripts', 'build-cpanel-parts.mjs')], { cwd: root, stdio: 'pipe' });
  }
  const entries = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split('\n').filter(Boolean);
  assert.ok(entries.includes('fix-app-key.php'), 'fix-app-key.php باید در بستهٔ ریشه باشد');
});

test('setup-doctor.php: عیب‌یابی و نوشتن مستقیم .env', () => {
  const f = join(root, 'deploy/laravel-app/setup-doctor.php');
  assert.ok(existsSync(f), 'setup-doctor.php باید وجود داشته باشد');
  const body = readFileSync(f, 'utf8');

  assert.match(body, /^<\?php/, 'باید با تگ PHP شروع شود');
  assert.match(body, /declare\(strict_types=1\)/, 'strict_types لازم است');

  // تست واقعی دیتابیس بدون بوت لاراول
  assert.match(body, /new PDO\(/, 'باید اتصال دیتابیس را با PDO تست کند');
  assert.match(body, /SHOW TABLES/, 'باید وجود جدول‌ها را بررسی کند');
  assert.match(body, /1045/, 'باید خطای 1045 را تفسیر کند');
  assert.match(body, /1049/, 'باید خطای 1049 را تفسیر کند');

  // نوشتن مستقیم .env
  assert.match(body, /write_env/, 'فرم نوشتن .env لازم است');
  assert.match(body, /random_bytes\(32\)/, 'APP_KEY تازه باید ساخته شود');
  assert.match(body, /rename\(\$tmp/, 'نوشتن باید اتمیک باشد');
  assert.match(body, /bootstrap\/cache\/\*\.php/, 'کش باید پاک شود');

  // نباید رمز خام را برگرداند
  assert.match(body, /strlen\(\$v\)|strlen\(\(string\) \$env\['DB_PASSWORD'\]\)/, 'رمز فقط به‌صورت طول نمایش داده شود');

  // هیچ POST بدون escape چاپ نشود
  assert.equal((body.match(/echo .*\$_POST/g) || []).length, 0, 'هیچ $_POST نباید مستقیم echo شود');
});

test('setup-doctor.php: در بستهٔ ۰۰ باشد', () => {
  const zip = join(artifactsDir, 'taxi-cpanel-00-root-tools.zip');
  if (!existsSync(zip)) {
    execFileSync('node', [join(root, 'scripts', 'build-cpanel-parts.mjs')], { cwd: root, stdio: 'pipe' });
  }
  const entries = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split('\n').filter(Boolean);
  assert.ok(entries.includes('setup-doctor.php'), 'setup-doctor.php باید در بستهٔ ریشه باشد');
});
