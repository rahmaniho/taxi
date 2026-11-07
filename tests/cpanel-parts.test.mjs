import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
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
    for (const entry of listZip(join(artifactsDir, zip))) {
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
