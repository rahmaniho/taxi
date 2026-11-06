# بک‌اند لاراول «تاکسی کارن» (`laravel-backend`)

سرور احراز هویت، مدیریت اشتراک آژانس‌ها، صدور فاکتور/تمدید و پنل مدیریت کل (سوپرادمین) برای **تاکسی کارن**، مبتنی بر **Laravel 13** و الگوهای پایدار کارن‌سافت.

> **حریم دادهٔ عملیاتی آژانس‌ها:** این سرور صرفاً مسئول **ورود کاربران، اعتبارسنجی اشتراک، لایسنس، پلن‌ها و سفارش‌ها** است. تمام داده‌های عملیاتی آژانس (سفرها، رانندگان، خودروها، مشترکین، هزینه‌ها و پرداخت‌ها) همچنان **۱۰۰٪ آفلاین و محلی** روی مرورگر هر آژانس (`localStorage` + `IndexedDB`) ذخیره می‌شوند و به سرور ارسال نمی‌گردند.

---

## قابلیت‌های کلیدی

- **احراز هویت نشستی (`web` + کوکی `XSRF-TOKEN` و مسیر کمکی `GET /api/csrf`)**:
  - `POST /api/login`، `POST /api/logout`، `GET /api/me`، `PUT /api/me/password`
  - `POST /api/forgot-password`، `POST /api/reset-password`
  - `POST /api/register` (به‌طور پیش‌فرض غیرفعال با `TAXI_PUBLIC_SIGNUP=false`؛ تعریف آژانس از پنل مدیر کل انجام می‌شود)
- **سفارش و تمدید اشتراک آژانس‌ها**:
  - `GET /api/plans`، `POST /api/coupons/validate`
  - `GET /api/orders`، `POST /api/orders`، `POST /api/orders/{order}/proof` (بارگذاری رسید کارت‌به‌کارت + پشتیبانی از زرین‌پال)
  - `GET /api/invoices`، `GET /api/invoices/{invoice}/print`
- **پنل مدیریت کل (سوپرادمین — نقش `manager`)**:
  - `GET /api/manager/dashboard` — آمار اشتراک‌ها، درآمد، هشدار انقضا و سفارش‌های منتظر تأیید
  - `/api/manager/stores/*` — ساخت آژانس + مالک + اشتراک اولیه، تمدید، تغییر پلن، فعال/غیرفعال و آرشیو
  - `/api/manager/subscribers/*` — مدیریت پیشرفتهٔ مشترکین، سقف دستگاه، یادداشت، پرداخت دستی و تاریخچه
  - `/api/manager/plans/*` و `/api/manager/coupons/*` — مدیریت پلن‌ها، قیمت‌گذاری پلکانی و کدهای تخفیف
  - `/api/manager/orders/*` — تأیید یا رد سفارش‌های تمدید و صدور خودکار فاکتور و لایسنس
  - `/api/manager/users/*` و `GET /api/manager/audit-logs` — مدیریت کاربران و لاگ ممیزی
- **سرو یکپارچهٔ PWA تک‌فایلی**:
  - فایل‌های `taxi.html`، `sw.js`، `manifest.json` و `icons/` با دستور `npm run laravel:sync` در `laravel-backend/public/` قرار می‌گیرند و مسیر `/` مستقیماً `public/taxi.html` را سرو می‌کند.

---

## راه‌اندازی سریع محلی (PHP 8.2+ و Composer)

```bash
# ۱) همگام‌سازی فایل‌های PWA در پوشهٔ public لاراول (از ریشهٔ مخزن)
npm run laravel:sync

# ۲) نصب وابستگی‌ها و آماده‌سازی پایگاه‌داده
cd laravel-backend
cp .env.example .env
composer install
php artisan key:generate
touch database/database.sqlite
php artisan migrate --seed

# ۳) اجرای سرور روی پورت 8000
php artisan serve --host=0.0.0.0 --port=8000
```

حساب مدیر کل اولیه از مقادیر `TAXI_ADMIN_EMAIL` و `TAXI_ADMIN_PASSWORD` در فایل `.env` ساخته می‌شود.

### اجرای تست‌های بک‌اند (Pest / PHPUnit)

```bash
cd laravel-backend
php artisan test
```

### یادآور خودکار انقضای اشتراک

```bash
php artisan taxi:licenses:remind
```

این دستور در زمان‌بند لاراول (`routes/console.php`) نیز به‌صورت روزانه تنظیم شده است.
