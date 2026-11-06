#!/usr/bin/env node
/**
 * ساخت بستهٔ آمادهٔ استقرار سرور لاراول + PWA آفلاین تاکسی کارن برای cPanel / لینوکس
 *
 * خروجی:
 *   deploy/laravel-app/stage/laravel-app/   (هستهٔ لاراول خارج از public_html)
 *   deploy/laravel-app/stage/public_html/   (وب‌روت شامل index.php، .htaccess و PWA آفلاین)
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncLaravelPwa } from './sync-laravel-pwa.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const backendDir = join(root, 'laravel-backend');
const stageDir = join(root, 'deploy', 'laravel-app', 'stage');
const appStage = join(stageDir, 'laravel-app');
const publicStage = join(stageDir, 'public_html');

syncLaravelPwa({ checkOnly: false });

rmSync(stageDir, { recursive: true, force: true });
mkdirSync(appStage, { recursive: true });
mkdirSync(publicStage, { recursive: true });

const skipNames = new Set(['.git', 'node_modules', '.env', 'tests']);
for (const entry of readdirSync(backendDir)) {
  if (skipNames.has(entry)) continue;
  if (entry === 'public') {
    cpSync(join(backendDir, 'public'), publicStage, { recursive: true });
    continue;
  }
  cpSync(join(backendDir, entry), join(appStage, entry), { recursive: true });
}

const indexPath = join(publicStage, 'index.php');
if (existsSync(indexPath)) {
  const indexPhp = readFileSync(indexPath, 'utf8')
    .replace(/__DIR__\s*\.\s*'\/\.\.\/storage/g, "__DIR__.'/../laravel-app/storage")
    .replace(/__DIR__\s*\.\s*'\/\.\.\/vendor/g, "__DIR__.'/../laravel-app/vendor")
    .replace(/__DIR__\s*\.\s*'\/\.\.\/bootstrap/g, "__DIR__.'/../laravel-app/bootstrap");
  writeFileSync(indexPath, indexPhp);
}

console.log('✓ ساختار آمادهٔ استقرار cPanel در deploy/laravel-app/stage ساخته شد.');
