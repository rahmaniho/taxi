#!/usr/bin/env bash
# استخراج و بررسی بسته‌های بخش‌به‌بخش cPanel برای «تاکسینو | Taxino»
# استفاده (روی هاست، در cPanel → Terminal):
#   bash ~/taxi-app/laravel-backend/bin/cpanel-extract-parts.sh
#   bash ~/taxi-app/laravel-backend/bin/cpanel-extract-parts.sh --delete-zips
#
# پیش‌نیاز: همهٔ فایل‌های taxi-cpanel-*.zip در پوشهٔ ~/taxi-app آپلود شده باشند.
# نکته: بستهٔ 01-core باید *قبل از* اجرای این اسکریپت با دکمهٔ Extract فایل‌منیجر
#       استخراج شده باشد (چون همین اسکریپت داخل آن است).
set -uo pipefail

DELETE_ZIPS=0
for arg in "$@"; do
  case "$arg" in
    --delete-zips) DELETE_ZIPS=1 ;;
    -h|--help)
      sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
  esac
done

APP_ROOT="${APP_ROOT:-$HOME/taxi-app}"
cd "$APP_ROOT" 2>/dev/null || { echo "✖ پوشهٔ $APP_ROOT پیدا نشد."; exit 1; }

echo "══════════════════════════════════════════════════"
echo "  استخراج بسته‌های تاکسینو در: $APP_ROOT"
echo "══════════════════════════════════════════════════"

shopt -s nullglob
ZIPS=(taxi-cpanel-*.zip)
if [ ${#ZIPS[@]} -eq 0 ]; then
  echo "✖ هیچ فایل taxi-cpanel-*.zip در $APP_ROOT نیست."
  echo "  فایل‌ها را از صفحهٔ Releases دانلود و در همین پوشه آپلود کنید:"
  echo "  https://github.com/rahmaniho/taxi/releases/tag/cpanel-parts-v1.6.0"
  exit 1
fi
shopt -u nullglob

echo "→ ${#ZIPS[@]} بسته پیدا شد."
echo ""

FAILED=0
for zip in "${ZIPS[@]}"; do
  echo "── $zip"

  # همهٔ مسیرهای داخل بسته باید با laravel-backend/ شروع شوند
  bad=$(unzip -Z1 "$zip" 2>/dev/null | grep -vc '^laravel-backend/' || true)
  bad=$(printf '%s' "$bad" | tr -d '[:space:]')
  if [ -z "$bad" ]; then bad=0; fi
  if [ "$bad" != "0" ]; then
    echo "   ✖ این بسته ساختار درست ندارد ($bad مسیر بیرون از laravel-backend/). رد شد."
    FAILED=$((FAILED + 1))
    continue
  fi

  if unzip -oq "$zip"; then
    echo "   ✓ Extract شد"
    if [ "$DELETE_ZIPS" = "1" ]; then
      rm -f "$zip" && echo "   🗑 فایل ZIP پاک شد"
    fi
  else
    echo "   ✖ Extract ناموفق بود (فایل ناقص آپلود شده؟ دوباره آپلودش کنید.)"
    FAILED=$((FAILED + 1))
  fi
done

echo ""
echo "══════════════════════════════════════════════════"
echo "  بررسی نهایی"
echo "══════════════════════════════════════════════════"

cd "$APP_ROOT/laravel-backend" 2>/dev/null || { echo "✖ پوشهٔ laravel-backend ساخته نشد."; exit 1; }

REQUIRED=(
  "artisan"
  "composer.json"
  "bin/cpanel-setup.sh"
  ".env.production.example"
  "app/Http/Controllers/Api/AuthController.php"
  "config/database.php"
  "routes/web.php"
  "database/migrations"
  "database/seeders/DatabaseSeeder.php"
  "bootstrap/app.php"
  "bootstrap/providers.php"
  "public/index.php"
  "public/.htaccess"
  "public/taxi.html"
  "public/sw.js"
  "public/manifest.json"
  "public/icons/icon-512.png"
  "storage/framework"
  "storage/logs"
)

MISSING=0
for path in "${REQUIRED[@]}"; do
  if [ -e "$path" ]; then
    echo "  ✓ $path"
  else
    echo "  ✖ $path  ← نیست!"
    MISSING=$((MISSING + 1))
  fi
done

if [ -f vendor/autoload.php ]; then
  PKG=$(find vendor -mindepth 3 -maxdepth 3 -name composer.json 2>/dev/null | wc -l | tr -d ' ')
  echo "  ✓ vendor/autoload.php  ($PKG پکیج نصب‌شده)"
else
  echo "  ⚠ vendor/autoload.php نیست — بسته‌های 07-vendor-* را آپلود کنید"
  echo "     یا اجرا کنید: composer install --no-dev --optimize-autoloader"
  MISSING=$((MISSING + 1))
fi

chmod -R ug+rwX storage bootstrap/cache 2>/dev/null && echo "  ✓ مجوز storage و bootstrap/cache تنظیم شد"

echo ""
if [ "$MISSING" -gt 0 ] || [ "$FAILED" -gt 0 ]; then
  echo "⚠ $MISSING مورد ناقص و $FAILED بستهٔ ناموفق. فایل‌های بالا را بررسی و بستهٔ مربوطه را دوباره آپلود/Extract کنید."
  exit 1
fi

echo "✓ همه‌چیز کامل است. قدم بعدی:"
echo "    cd $APP_ROOT/laravel-backend"
echo "    bash bin/cpanel-setup.sh"
echo ""
echo "  (یادتان نباشد: فایل .env باید از .env.production.example ساخته و پر شده باشد.)"
