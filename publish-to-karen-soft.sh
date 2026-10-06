#!/usr/bin/env bash
# ==========================================================================
# publish-to-karen-soft.sh
# انتشار نسخهٔ ۵٫۰٫۰ سامانهٔ تاکسی تلفنی در مخزن rahmaniho/karen-soft
# --------------------------------------------------------------------------
# چرا این اسکریپت؟ در محیط اجرای Arena، اتصال GitHub فقط اجازهٔ نوشتن روی
# مخزن همین جلسه (rahmaniho/taxi) را دارد و درخواست نوشتن روی
# rahmaniho/karen-soft با خطای 403 («Resource not accessible by integration»)
# رد می‌شود. بنابراین انتشار نهایی به karen-soft باید با اطلاعات ورود خودتان
# اجرا شود. این اسکریپت همهٔ کارها را انجام می‌دهد: کلون سبک، ساخت شاخه،
# کپی فایل‌ها، کامیت، پوش و ساخت Pull Request.
#
# اجرا:
#   bash publish-to-karen-soft.sh
# پیش‌نیاز: git و gh (وارد شده: gh auth login) با دسترسی نوشتن به karen-soft
# ==========================================================================
set -euo pipefail

REPO="rahmaniho/karen-soft"
BRANCH="arena/taxi-v5-rewrite"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/legacy"
WORK_DIR="${TMPDIR:-/tmp}/karen-soft-publish"

FILES=(
  index.html taxi.html sw.js manifest.json README.md CHANGELOG.md
  css js fonts icons tests
)

echo "▶ بررسی پیش‌نیازها…"
command -v git >/dev/null || { echo "✖ git نصب نیست"; exit 1; }
command -v gh  >/dev/null || { echo "✖ gh نصب نیست (https://cli.github.com)"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "✖ ابتدا وارد شوید: gh auth login"; exit 1; }
[ -d "$SRC_DIR" ] || { echo "✖ پوشهٔ legacy در کنار این اسکریپت یافت نشد"; exit 1; }

echo "▶ دریافت آخرین نسخهٔ مخزن $REPO (شاخهٔ main)…"
rm -rf "$WORK_DIR"
git clone --depth 1 --branch main "https://github.com/$REPO.git" "$WORK_DIR" >/dev/null

cd "$WORK_DIR"
git checkout -b "$BRANCH"

echo "▶ کپی فایل‌های سامانه در پوشهٔ legacy/…"
for item in "${FILES[@]}"; do
  cp -r "$SRC_DIR/$item" legacy/
done

git add -A legacy
if git diff --cached --quiet; then
  echo "ℹ تغییری برای ثبت وجود ندارد؛ انتشار قبلاً انجام شده است."
  exit 0
fi

git -c user.name="${GIT_AUTHOR_NAME:-Taxi Maintainer}" \
    -c user.email="${GIT_AUTHOR_EMAIL:-maintainer@karen-soft.ir}" \
    commit -q -m "بازنویسی کامل سامانهٔ تاکسی تلفنی (فاز ۱ تا ۴) — نسخهٔ ۵٫۰٫۰

- معماری ماژولار ES با تنها متغیر سراسری window.App
- لایهٔ داده Adapter (LocalStorage/REST) + mutateDB مرکزی و گزارش تغییرات
- تقویم شمسی اختصاصی، اعداد فارسی، اعتبارسنجی تلفن/کد ملی/پلاک
- ورود با رمز هش‌شده (SHA-256 + نمک)، سه نقش، شیفت‌ها
- صف انتظار، تخصیص هوشمند، وضعیت زندهٔ راننده، کرایهٔ پلکانی شب/تعطیلات
- بدهی مشترک، تسویهٔ راننده، گزارش‌ها و خروجی PDF
- PWA واقعی: sw.js، manifest.json، آیکون‌ها، فونت‌های woff2
- آزمون‌ها: ۱۰۹ بررسی داده/قواعد + ۶۳ بررسی رابط کاربری (jsdom)"

echo "▶ ارسال شاخهٔ $BRANCH …"
git push -u origin "$BRANCH"

echo "▶ ساخت Pull Request …"
gh pr create --repo "$REPO" --base main --head "$BRANCH" \
  --title "بازنویسی حرفه‌ای سامانهٔ تاکسی تلفنی — نسخهٔ ۵٫۰٫۰" \
  --body "این PR نسخهٔ نمایشی \`legacy/taxi.html\` را به سامانهٔ کامل و پایدار (فاز ۱ تا ۴) تبدیل می‌کند.

## فاز ۱ — باگ‌های بحرانی
- \`sw.js\` واقعی + \`manifest.json\` و آیکون‌ها (نصب PWA در موبایل/دسکتاپ/تبلت)
- تقویم شمسی اختصاصی برای همهٔ فیلدهای تاریخ (حذف کامل \`input type=date\`)
- ثبت خودکار ساعت سوارشدن و پایان سفر
- رفع بدهی مشترک با نهاد \`subscriberPayments\` + دکمهٔ «ثبت پرداخت مشترک» و تاریخچه
- رفع تسویهٔ راننده با نهاد \`driverPayments\`؛ تفکیک «طلب آژانس از راننده» و «طلب راننده از آژانس»
- اعتبارسنجی تلفن همراه/ثابت، کد ملی و پلاک با پیام‌های فارسی
- فونت‌های \`woff2\` محلی + زنجیرهٔ jsDelivr (بدون raw.githubusercontent)

## فاز ۲
- صف انتظار سفرها (فوری بالاتر از رزرو، FIFO، زمان انتظار و هشدار)
- وضعیت زندهٔ راننده: آزاد/در سفر/آفلاین/استراحت با گذار خودکار و تغییر دستی
- تخصیص سریع بر اساس تعداد سفر امروز و امتیاز
- کاربران و شیفت‌ها؛ ثبت \`operatorId\` روی سفر
- کرایهٔ پلکانی: کرایهٔ پایه + کیلومتر + ضریب شب (۲۲–۶) + ضریب تعطیلات
- ثبت دلیل لغو سفر و نمایش در گزارش‌ها + چاپ رسید راننده

## فاز ۳
- ورود محلی با رمز هش‌شده (SHA-256 + نمک) و سه نقش مدیر/اپراتور/حسابدار
- گزارش تغییرات (\`auditLog\`) + بازیابی رکوردهای حذف‌شده
- حذف نرم در همهٔ موجودیت‌ها

## فاز ۴
- گزارش اپراتور، لغو، مشتریان بدهکار (۰-۳۰/۳۱-۶۰/۶۰+) و عملکرد ۳۰ روزهٔ رانندگان
- خروجی PDF/چاپ برای فاکتور مشترک، رسید راننده، گزارش مالی و گزارش شیفت
- یادآوری متنی مشتریان بدهکار (فقط UI؛ ارسال واقعی در فاز بعد)

## کیفیت
- صفر وابستگی بیرونی (آیکون SVG و نمودار SVG اختصاصی به‌جای CDN)
- تنها متغیر سراسری \`window.App\`؛ همهٔ نوشتن‌ها از \`DB.mutate\` مرکزی
- هر رندر idempotent؛ همهٔ تاریخ‌ها شمسی و همهٔ اعداد فارسی
- آزمون‌ها: \`node tests/smoke.mjs\` (۱۰۹ بررسی) و \`node tests/dom-smoke.mjs\` (۶۳ بررسی) — بدون خطا

راهنمای کامل در \`legacy/README.md\` و تاریخچهٔ تصمیم‌ها در \`legacy/CHANGELOG.md\` آمده است."

echo "✅ انتشار انجام شد. آدرس برنامه پس از ادغام:  https://<domain>/legacy/taxi.html"
