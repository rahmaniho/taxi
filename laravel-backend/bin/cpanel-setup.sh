#!/usr/bin/env bash
# اسکریپت راه‌اندازی و به‌روزرسانی خودکار «تاکسی کارن» روی cPanel (taxi.karen-soft.ir)
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== ۱) بررسی نسخهٔ PHP ==="
PHP_BIN="${PHP_BIN:-php}"
PHP_VER="$($PHP_BIN -r 'echo PHP_VERSION;')"
echo "PHP فعلی: $PHP_VER"
$PHP_BIN -r 'if (version_compare(PHP_VERSION, "8.4.0", "<")) { fwrite(STDERR, "خطا: نسخهٔ PHP باید 8.4 یا بالاتر باشد (از MultiPHP Manager در cPanel روی 8.4 بگذارید).\n"); exit(1); }'

echo "=== ۲) بررسی فایل .env ==="
if [ ! -f .env ]; then
  if [ -f .env.production.example ]; then
    cp .env.production.example .env
    echo "فایل .env از روی .env.production.example ساخته شد. لطفاً مشخصات دیتابیس و رمز مدیر کل را در .env تنظیم کرده و دوباره این دستور را اجرا کنید."
    exit 0
  else
    cp .env.example .env
    echo "فایل .env ساخته شد. لطفاً مقادیر دیتابیس را در .env تنظیم کنید."
    exit 0
  fi
fi

echo "=== ۳) بررسی پوشهٔ vendor ==="
if [ ! -f vendor/autoload.php ]; then
  composer install --no-dev --optimize-autoloader --no-interaction
fi

echo "=== ۴) تنظیم مجوز پوشه‌های storage و bootstrap/cache ==="
chmod -R ug+rwX storage bootstrap/cache || true

echo "=== ۵) ساخت APP_KEY در صورت خالی بودن ==="
if ! grep -qE '^APP_KEY=base64:.+' .env; then
  $PHP_BIN artisan key:generate --force
fi

echo "=== ۶) پاک‌سازی کش قبلی پیش از مهاجرت و Seed ==="
$PHP_BIN artisan config:clear || true

echo "=== ۷) اجرای مهاجرت جداول و ساخت/به‌روزرسانی حساب مدیر کل ==="
$PHP_BIN artisan migrate --seed --force

echo "=== ۸) پیوند storage و کش پیکربندی تولید ==="
$PHP_BIN artisan storage:link || true
$PHP_BIN artisan config:cache
$PHP_BIN artisan route:cache

echo ""
echo "✓ راه‌اندازی تاکسی کارن با موفقیت انجام شد!"
echo "آدرس سلامت سرور: https://taxi.karen-soft.ir/up"
echo "آدرس سامانه:      https://taxi.karen-soft.ir/"
