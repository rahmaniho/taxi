#!/usr/bin/env node
/**
 * ساخت بسته‌های آمادهٔ استقرار سرور لاراول + PWA آفلاین تاکسی کارن برای cPanel (`taxi.karen-soft.ir`)
 *
 * دو خروجی می‌سازد:
 *   ۱) deploy/laravel-app/artifacts/taxi-laravel.zip
 *      (روش پیشنهادی ساب‌دامین: آپلود در ~/taxi-app و تنظیم Document Root روی ~/taxi-app/laravel-backend/public)
 *   ۲) deploy/laravel-app/stage/{laravel-app,public_html}
 *      (روش جایگزین در صورتی که پوشهٔ وب ساب‌دامین از هستهٔ لاراول جدا باشد)
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncLaravelPwa } from './sync-laravel-pwa.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const backendDir = join(root, 'laravel-backend');
const stageDir = join(root, 'deploy', 'laravel-app', 'stage');
const artifactsDir = join(root, 'deploy', 'laravel-app', 'artifacts');
const appStage = join(stageDir, 'laravel-app');
const publicStage = join(stageDir, 'public_html');
const includeVendor = process.argv.includes('--with-vendor');

syncLaravelPwa({ checkOnly: false });

rmSync(stageDir, { recursive: true, force: true });
mkdirSync(appStage, { recursive: true });
mkdirSync(publicStage, { recursive: true });
mkdirSync(artifactsDir, { recursive: true });

const skipNames = new Set(['.git', 'node_modules', '.env', 'tests']);
if (!includeVendor) skipNames.add('vendor');

for (const entry of readdirSync(backendDir)) {
  if (skipNames.has(entry)) continue;
  if (entry === 'public') {
    cpSync(join(backendDir, 'public'), publicStage, { recursive: true });
    continue;
  }
  cpSync(join(backendDir, entry), join(appStage, entry), { recursive: true });
}

// تنظیم مسیرهای index.php برای ساختار جداگانه (laravel-app در کنار پوشهٔ وب)
const indexPath = join(publicStage, 'index.php');
if (existsSync(indexPath)) {
  const indexPhp = readFileSync(indexPath, 'utf8')
    .replace(/__DIR__\s*\.\s*'\/\.\.\/storage/g, "__DIR__.'/../laravel-app/storage")
    .replace(/__DIR__\s*\.\s*'\/\.\.\/vendor/g, "__DIR__.'/../laravel-app/vendor")
    .replace(/__DIR__\s*\.\s*'\/\.\.\/bootstrap/g, "__DIR__.'/../laravel-app/bootstrap");
  writeFileSync(indexPath, indexPhp);
}

// ساخت بستهٔ یکپارچهٔ ساب‌دامین (همان الگوی کارو: ~/taxi-app/laravel-backend/public)
const unifiedRoot = join(stageDir, 'subdomain-bundle');
const unifiedBackend = join(unifiedRoot, 'laravel-backend');
mkdirSync(unifiedBackend, { recursive: true });

for (const entry of readdirSync(backendDir)) {
  if (skipNames.has(entry)) continue;
  cpSync(join(backendDir, entry), join(unifiedBackend, entry), { recursive: true });
}

const installMd = join(root, 'deploy', 'laravel-app', 'INSTALL.md');
if (existsSync(installMd)) {
  cpSync(installMd, join(unifiedRoot, 'INSTALL.md'));
}

const zipName = includeVendor ? 'taxi-karen-cpanel-full.zip' : 'taxi-laravel.zip';
const zipOut = join(artifactsDir, zipName);
rmSync(zipOut, { force: true });

try {
  execFileSync('zip', ['-rq', zipOut, 'laravel-backend', 'INSTALL.md'], { cwd: unifiedRoot, stdio: 'inherit' });
  console.log(`✓ فایل فشردهٔ آمادهٔ آپلود در cPanel ساخته شد: deploy/laravel-app/artifacts/${zipName}`);
} catch (_) {
  console.log('ℹ ابزار zip یافت نشد؛ پوشهٔ آماده در deploy/laravel-app/stage/subdomain-bundle قرار گرفت.');
}

console.log('✓ ساختار آمادهٔ استقرار cPanel در deploy/laravel-app/stage ساخته شد.');
