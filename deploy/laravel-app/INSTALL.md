# راهنمای راه‌اندازی «تاکسی کارن» روی ساب‌دامین `taxi.karen-soft.ir` (cPanel)

این راهنما دقیقاً برای بالا آوردن سامانه روی آدرس **`https://taxi.karen-soft.ir`** در هاست cPanel دامنهٔ `karen-soft.ir` تنظیم شده است (هم‌خانواده و بدون هیچ تداخل کوکی یا دیتابیس با سایر سرویس‌های `karen-soft.ir`).

---

## پیش‌نیازهای ساب‌دامین در cPanel

| مورد | مقدار مورد نیاز |
|---|---|
| آدرس ساب‌دامین | `taxi.karen-soft.ir` |
| نسخهٔ PHP | **PHP 8.4** (از بخش **MultiPHP Manager** در cPanel برای `taxi.karen-soft.ir` انتخاب شود) |
| اکستنشن‌های PHP | `mbstring`, `openssl`, `pdo_mysql`, `fileinfo`, `ctype`, `json`, `tokenizer`, `xml`, `bcmath` |
| گواهی SSL (HTTPS) | فعال از بخش **SSL/TLS Status → Run AutoSSL** (الزامی برای کارکرد آفلاین Service Worker و کوکی امن) |
| دیتابیس | یک دیتابیس و کاربر MySQL/MariaDB با کاراکترست `utf8mb4` |

---

## گام ۱: ساخت ساب‌دامین `taxi.karen-soft.ir` و فعال‌سازی SSL

1. وارد **cPanel** هاست `karen-soft.ir` شوید و به بخش **Domains → Create A New Domain** بروید.
2. در فیلد Domain عبارت زیر را وارد کنید:
   ```text
   taxi.karen-soft.ir
   ```
3. تیک گزینهٔ *Share document root* را **بردارید** و مسیر **Document Root** را روی مسیر زیر بگذارید:
   ```text
   taxi-app/laravel-backend/public
   ```
   *(یعنی مسیر کامل `/home/USERNAME/taxi-app/laravel-backend/public` — با این کار فایل `.env` و هستهٔ لاراول بیرون از پوشهٔ عمومی وب قرار می‌گیرند و کاملاً امن هستند.)*
4. در صفحهٔ **Domains** گزینهٔ **Force HTTPS Redirect** را برای `taxi.karen-soft.ir` روشن کنید (یا در **SSL/TLS Status** گزینهٔ **Run AutoSSL** را روی `taxi.karen-soft.ir` بزنید تا گواهی HTTPS صادر شود).
5. به **MultiPHP Manager** بروید، تیک `taxi.karen-soft.ir` را بزنید و نسخهٔ PHP را روی **`PHP 8.4` (`ea-php84`)** قرار داده و **Apply** بزنید.

> **نکتهٔ DNS (اگر دامنه روی Cloudflare یا DNS خارجی است):** یک رکورد `A` به نام `taxi` با IP همان هاست `karen-soft.ir` ثبت کنید. اگر DNS دامنه روی خود همین cPanel است، رکورد `taxi.karen-soft.ir` به‌صورت خودکار ساخته می‌شود.

---

## گام ۲: ساخت دیتابیس MySQL در cPanel

1. در cPanel وارد **MySQL Database Wizard** شوید.
2. یک دیتابیس بسازید (مثلاً `USERNAME_taxi`).
3. یک کاربر دیتابیس با رمز قوی بسازید و در مرحلهٔ بعد تیک **ALL PRIVILEGES** را بزنید تا به دیتابیس متصل شود.

---

## گام ۳: آپلود فایل‌های پروژه در `/home/USERNAME/taxi-app`

دو راه دارید (هر کدام راحت‌تر است):

- **راه الف — بستهٔ کاملِ بدون نیاز به Composer (پیشنهادی و سریع‌ترین):**
  از صفحهٔ **GitHub Actions** آخرین اجرای مخزن، آرتیفکت **`taxi-karen-cpanel-ready`** (فایل `taxi-karen-cpanel-full.zip` که پوشهٔ `vendor/` هم از قبل داخلش نصب شده است) را دانلود کنید، در **File Manager** به مسیر `/home/USERNAME/taxi-app` بروید، **Upload** و سپس **Extract** کنید.
- **راه ب — ساخت بسته یا کلون مستقیم با Composer روی سرور:**
  اجرای `npm run laravel:package` فایل `deploy/laravel-app/artifacts/taxi-laravel.zip` را می‌سازد؛ آن را در `/home/USERNAME/taxi-app` آپلود و Extract کنید.

پس از Extract، باید مسیر `/home/USERNAME/taxi-app/laravel-backend/public/index.php` و `/home/USERNAME/taxi-app/laravel-backend/public/taxi.html` موجود باشد.

---

## گام ۴: تنظیم فایل `.env` برای `https://taxi.karen-soft.ir`

یک نمونهٔ ازپیش‌تنظیم‌شده برای همین ساب‌دامین در `laravel-backend/.env.production.example` قرار دارد. در File Manager (یا Terminal) آن را به `.env` کپی کنید:

```bash
cd ~/taxi-app/laravel-backend
cp .env.production.example .env
```

سپس در فایل `~/taxi-app/laravel-backend/.env` فقط سه بخش **دیتابیس**، **رمز مدیر کل** و (در صورت نیاز) **ایمیل** را با مقادیر واقعی خود پر کنید:

```dotenv
APP_NAME="تاکسی کارن · کارن‌سافت"
APP_ENV=production
APP_KEY=
APP_DEBUG=false
APP_URL=https://taxi.karen-soft.ir

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=USERNAME_taxi
DB_USERNAME=USERNAME_taxi
DB_PASSWORD="رمز_دیتابیس_شما"

SESSION_DRIVER=database
SESSION_LIFETIME=43200
SESSION_COOKIE=taxi_karen_session
SESSION_SECURE_COOKIE=true
SESSION_SAME_SITE=lax
SESSION_DOMAIN=null

TAXI_PUBLIC_SIGNUP=false
TAXI_PAYMENT_GATEWAY=manual

TAXI_MANAGER_NAME="مدیر کل تاکسی کارن"
TAXI_MANAGER_EMAIL=admin@karen-soft.ir
TAXI_MANAGER_PASSWORD="یک_رمز_قوی_برای_مدیر_کل"
```

---

## گام ۵: اجرای دستور راه‌اندازی در Terminal سی‌پنل

در **cPanel → Terminal** دستورات زیر را اجرا کنید:

```bash
cd ~/taxi-app/laravel-backend
bash bin/cpanel-setup.sh
```

*(اسکریپت `bin/cpanel-setup.sh` به‌ترتیب نسخهٔ PHP 8.4 را بررسی می‌کند، اگر `vendor/` نباشد `composer install --no-dev` می‌زند، مجوز `storage` و `bootstrap/cache` را تنظیم می‌کند، `APP_KEY` می‌سازد، جداول دیتابیس و حساب مدیر کل را با `migrate --seed --force` ایجاد می‌کند و `config:cache` و `route:cache` را اجرا می‌نماید.)*

---

## گام ۶: تست نهایی و Cron Job یادآور اشتراک

1. آدرس **`https://taxi.karen-soft.ir/up`** را باز کنید — باید وضعیت سبز (`200 OK`) نمایش داده شود.
2. آدرس **`https://taxi.karen-soft.ir/`** را باز کنید — صفحهٔ ورود «تاکسی کارن» باز می‌شود.
3. با ایمیل و رمزی که در `TAXI_MANAGER_EMAIL` و `TAXI_MANAGER_PASSWORD` گذاشته‌اید وارد شوید و از تب **«آژانس‌ها»**، اشتراک آژانس‌ها را بسازید.
4. برای ارسال خودکار یادآور انقضای اشتراک، در **cPanel → Cron Jobs** یک کران‌جاب (Once Per Day یا هر دقیقه برای زمان‌بند لاراول) ثبت کنید:
   ```cron
   * * * * * cd /home/USERNAME/taxi-app/laravel-backend && /usr/local/bin/ea-php84 artisan schedule:run >> /dev/null 2>&1
   ```

---

## حالت جایگزین: اگر cPanel اجازهٔ تغییر Document Root نداد

اگر در هاست شما پوشهٔ ساب‌دامین اجباراً `/home/USERNAME/taxi.karen-soft.ir` یا `/home/USERNAME/public_html/taxi` است:
1. خروجی `deploy/laravel-app/stage/laravel-app` را در `/home/USERNAME/laravel-app` بگذارید.
2. خروجی `deploy/laravel-app/stage/public_html` را درون پوشهٔ وب ساب‌دامین (`/home/USERNAME/taxi.karen-soft.ir`) بریزید.
3. در فایل `/home/USERNAME/laravel-app/.env` این خط را اضافه کنید:
   ```dotenv
   PUBLIC_FOLDER_PATH=/home/USERNAME/taxi.karen-soft.ir
   ```

---

## ارتقای بی‌دردسر به نسخه ۱.۴.۰ در cPanel (بدون SSH و بدون حذف اطلاعات)

اگر سامانه از قبل روی هاست شما (مثلاً ساختار `/home/karensof/taxi-laravel` و `/home/karensof/public_html/taxi`) نصب است:

1. **فایل‌های `.env` و `.htaccess` فعلی را نگه دارید** (به‌ویژه خط `AddHandler application/x-httpd-lsphp84 .php .php8 .phtml` در `/home/karensof/public_html/taxi/.htaccess` روی وب‌سرور LiteSpeed).
2. فایل‌های `taxi.html` و `sw.js` جدید را در پوشهٔ وب (`/home/karensof/public_html/taxi/`) جایگزین کنید.
3. پوشه‌های `app/`، `routes/` و `database/` جدید را در هستهٔ لاراول (`/home/karensof/taxi-laravel/`) جایگزین کنید.
4. در مسیر `/home/karensof/taxi-laravel/bootstrap/cache/` اگر فایل `routes-v7.php` وجود دارد آن را حذف کنید تا مسیرهای جدید `/api/sync` بلافاصله فعال شوند.
5. نیازی به SSH برای ساخت جدول جدید نیست: کنترلر `SyncController` در اولین همگام‌سازی، در صورت نبود جدول `agency_sync_states` آن را به‌صورت خودکار در دیتابیس ایجاد می‌کند (در صورت دسترسی به ترمینال می‌توانید `php artisan migrate --force` هم بزنید).

---

## رفع خطاهای رایج

- **خطای `Composer detected issues in your platform (>= 8.4.0)` یا نسخهٔ PHP قدیمی روی LiteSpeed:** اگر `.htaccess` پوشهٔ بالاتر نسخهٔ قدیمی PHP را تحمیل می‌کند، در ابتدای `/home/USERNAME/public_html/taxi/.htaccess` خط زیر را قرار دهید:
  ```apache
  <IfModule mime_module>
    AddHandler application/x-httpd-lsphp84 .php .php8 .phtml
  </IfModule>
  ```
- **خطای `419 Page Expired` هنگام ورود:** مطمئن شوید سایت را با **`https://taxi.karen-soft.ir`** باز کرده‌اید (نه `http://`)، چون `SESSION_SECURE_COOKIE=true` فقط روی HTTPS کوکی امن می‌فرستد.
- **عدم نصب PWA یا آفلاین نشدن:** مرورگرها فقط روی **`https://`** اجازهٔ ثبت Service Worker (`sw.js`) را می‌دهند؛ پس از فعال شدن AutoSSL در اولین بازدید کل برنامه در مرورگر کش می‌شود.
