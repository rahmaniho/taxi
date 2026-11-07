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
