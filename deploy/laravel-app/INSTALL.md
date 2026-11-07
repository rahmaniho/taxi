# راهنمای راه‌اندازی «تاکسینو | Taxino» روی ساب‌دامین `taxi.karen-soft.ir` (cPanel) - نسخه ۱.۶.۰ (Laravel 13)

این راهنما دقیقاً برای بالا آوردن سامانه روی آدرس **`https://taxi.karen-soft.ir`** در هاست cPanel دامنهٔ `karen-soft.ir` تنظیم شده است (هم‌خانواده و بدون هیچ تداخل کوکی یا دیتابیس با سایر سرویس‌های `karen-soft.ir`).

---
## گام ۱: پیش‌نیازهای ساب‌دامین در cPanel (نسخه ۱.۶.۰ / Laravel 13) - قدم به قدم

**قدم ۱.۱: ایجاد ساب‌دامین و تنظیم Document Root**
۱. وارد **cPanel** هاست `karen-soft.ir` شوید و به بخش **Domains → Create A New Domain** بروید.
۲. در فیلد **Domain** عبارت زیر را وارد کنید:
   ```text
   taxi.karen-soft.ir
   ```
۳. **تیک گزینهٔ *Share document root* را بردارید** و مسیر **Document Root** را روی مسیر زیر بگذارید (برای امنیت، هسته لاراول بیرون از پوشه وب است):
   ```text
   taxi-app/laravel-backend/public
   ```
   *(یعنی مسیر کامل `/home/USERNAME/taxi-app/laravel-backend/public` — با این کار فایل `.env` و هستهٔ لاراول بیرون از پوشهٔ عمومی وب قرار می‌گیرند و کاملاً امن هستند. در نسخه ۱.۶.۰ / Laravel 13، فایل‌های PWA `taxi.html` و `sw.js` مستقیماً از این مسیر سرو می‌شوند.)*
۴. **تایید:** کلیک بر **Create**.

**قدم ۱.۲: فعال‌سازی SSL (الزامی برای نسخه ۱.۶.۰ / Laravel 13)**
۱. به بخش **SSL/TLS Status** در cPanel بروید.
۲. ساب‌دامین `taxi.karen-soft.ir` را پیدا کنید و گزینه **Run AutoSSL** را بزنید.
۳. **نکته نسخه ۱.۶.۰:** چون `SESSION_SECURE_COOKIE=true` در بک‌اند (لینک `https://taxi.karen-soft.ir/laravel-backend/`) تنظیم شده، بدون SSL سایت کار نمی‌کند.
۴. پس از صدور گواهی، در **Domains** گزینه **Force HTTPS Redirect** را روشن کنید.

**قدم ۱.۳: تنظیم نسخه PHP (نسخه ۱.۶.۰ نیازمند PHP 8.4 است)**
۱. به بخش **MultiPHP Manager** در cPanel بروید.
۲. تیک ساب‌دامین `taxi.karen-soft.ir` را بزنید.
۳. نسخه PHP را روی **`PHP 8.4` (`ea-php84`)** قرار دهید.
۴. اکستنشن‌های زیر را تیک بزنید (الزامی برای Laravel 13):
   `mbstring`, `openssl`, `pdo_mysql`, `fileinfo`, `ctype`, `json`, `tokenizer`, `xml`, `bcmath`
۵. دکمه **Apply** را بزنید.

**قدم ۱.۴: ساخت دیتابیس MySQL (نسخه ۱.۶.۰)**
۱. در cPanel وارد **MySQL Database Wizard** شوید.
۲. دیتابیس بسازید (مثلاً `USERNAME_taxi`).
۳. کاربر بسازید (مثلاً `USERNAME_taxi_user`) و رمز قوی بدهید.
۴. **تیک ALL PRIVILEGES** را بزنید.
۵. **نکته نسخه ۱.۶.۰:** کاراکترست دیتابیس باید `utf8mb4` باشد (برای پشتیبانی از پلن‌های تومانی و کاراکترهای فارسی در نسخه ۱.۶.۰).

**قدم ۱.۵: تنظیم DNS (در صورت نیاز)**
۱. اگر DNS روی Cloudflare است، رکورد `A` به نام `taxi` با IP هاست ثبت کنید.
۲. اگر DNS روی cPanel است، رکورد `taxi.karen-soft.ir` به‌صورت خودکار ساخته می‌شود.

---
## گام ۲: ساخت دیتابیس MySQL در cPanel (نسخه ۱.۶.۰ / Laravel 13) - قدم به قدم

> **چرا این گام مهم است؟** جداول لاراول (کاربران، آژانس‌ها، لایسنس‌ها، پلن‌ها و فاکتورها) در MySQL ذخیره می‌شوند. تا این گام کامل نشود، `migrate` در گام ۵ خطا می‌دهد.

**قدم ۲.۱: ورود به MySQL Database Wizard**
۱. در **cPanel** به بخش **Databases → MySQL® Database Wizard** بروید.
   *(اگر می‌خواهید دستی و مرحله‌مرحله انجام دهید، از **MySQL® Databases** هم می‌شود؛ ولی Wizard همهٔ سه کار «ساخت دیتابیس + کاربر + دسترسی» را یک‌جا انجام می‌دهد.)*
۲. در صفحهٔ اول روی **Next Step** بزنید.

**قدم ۲.۲: ساخت دیتابیس**
۱. در فیلد **Step 1: Create A Database** نام دیتابیس را وارد کنید:
   ```text
   taxi
   ```
۲. cPanel به‌طور خودکار نام کاربر هاست را به ابتدای آن می‌چسباند؛ یعنی اگر نام کاربری هاست شما `karensof` باشد، دیتابیس نهایی می‌شود:
   ```text
   karensof_taxi
   ```
۳. **نام کاملِ نهایی را یادداشت کنید** (نه فقط `taxi`) — همین را در `.env` می‌گذاریم.
۴. **Next Step**.

**قدم ۲.۳: ساخت کاربر دیتابیس**
۱. در **Step 2: Create A Database User** نام کاربر را وارد کنید:
   ```text
   taxi_user
   ```
۲. در فیلد **Password** یک رمز قوی بگذارید (حداقل ۱۶ کاراکتر، ترکیب حرف بزرگ/کوچک/عدد/نماد).
۳. اگر cPanel دکمهٔ **Password Generator** دارد می‌توانید از آن استفاده کنید.
۴. **رمز را همین حالا جایی امن ذخیره کنید** — بعداً در `.env` لازم می‌شود و دیگر نمایش داده نمی‌شود.
۵. **Create User**.

**قدم ۲.۴: دادن دسترسی کامل (ALL PRIVILEGES)**
۱. در **Step 3: Add User To Database**، از لیست **User** کاربر ساخته‌شده (مثل `karensof_taxi_user`) و از لیست **Database** دیتابیس ساخته‌شده (مثل `karensof_taxi`) را انتخاب کنید.
۲. **Next Step**.
۳. در صفحهٔ **Manage User Privileges** تیک **ALL PRIVILEGES** را بزنید.
۴. **Make Changes** → باید پیام سبز *You have successfully…* ببینید.

**قدم ۲.۵: تنظیم کاراکترست `utf8mb4` (الزامی برای متن فارسی و پلن‌های تومانی)**
۱. در **cPanel → phpMyAdmin** دیتابیس `karensof_taxi` را از ستون چپ انتخاب کنید.
۲. تب **Operations** → بخش **Collation** → مقدار زیر را انتخاب و **Go** بزنید:
   ```text
   utf8mb4_unicode_ci
   ```
۳. **نکته:** کدگذاری جداول را خود لاراول در زمان `migrate` روی `utf8mb4` تنظیم می‌کند (در `config/database.php` مقدار `charset=utf8mb4` و `collation=utf8mb4_unicode_ci` است)؛ این قدم فقط برای اطمینان از پیش‌فرض دیتابیس است.

**قدم ۲.۶: ثبت مشخصات در فایل `.env`**
۱. در **File Manager** به `~/taxi-app/laravel-backend/.env` بروید (اگر ساخته نشده، ابتدا **گام ۳** را انجام دهید).
۲. روی فایل راست‌کلیک → **Edit** → این چهار خط را با مقادیر واقعی خودتان جایگزین کنید:
   ```dotenv
   DB_CONNECTION=mysql
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_DATABASE=karensof_taxi
   DB_USERNAME=karensof_taxi_user
   DB_PASSWORD="رمز_قوی_که_در_قدم_۲.۳_ساختید"
   ```
   *(در cPanel معمولاً `DB_HOST` همان `127.0.0.1` یا `localhost` است؛ اگر هاست شما دیتابیس جداگانه دارد، آدرس را از بخش **Remote MySQL** یا ایمیل میزبان بگیرید.)*
۳. **Save Changes**.
۴. **قدم ۲.۷** را انجام دهید تا مطمئن شویم اتصال برقرار است.

**قدم ۲.۷: تست اتصال دیتابیس (قبل از اجرای migrate)**
۱. در **cPanel → Terminal** دستور زیر را بزنید (رمز را جایگزین کنید):
   ```bash
   mysql -u karensof_taxi_user -p karensof_taxi -e "SELECT @@character_set_database, @@collation_database;"
   ```
۲. باید `utf8mb4` و `utf8mb4_unicode_ci` را ببینید. اگر خطای `Access denied` گرفتید، یعنی رمز یا نام کاربر در `.env` اشتباه است — به **قدم ۲.۶** برگردید.
۳. اگر دسترسی به Terminal نداشتید، همین تست را از **phpMyAdmin** انجام دهید: روی دیتابیس کلیک کنید؛ در ستون راست، بخش **Database server → Database collation** را ببینید.

> **⚠️ هرگز این سه کار را نکنید:** دیتابیس را Delete نکنید، رمز کاربر را عوض نکنید و نام دیتابیس را بعد از `migrate` تغییر ندهید. اگر مجبور شدید، فقط `.env` را به‌روزرسانی کنید و در **گام ۵** یک‌بار دیگر `php artisan config:cache` بزنید.

---
## گام ۳: آپلود فایل‌های پروژه در `/home/USERNAME/taxi-app` — قدم به قدم

سه راه دارید؛ **راه الف تازه و پیشنهادی است** چون آپلود را به چند بستهٔ کوچک می‌شکند و در File Manager سی‌پنل هیچ‌وقت قطع نمی‌شود:

### راه الف (پیشنهادی) — آپلود بخش‌به‌بخش با بسته‌های `taxi-cpanel-0x-*.zip`

**قدم ۳.۱ — دانلود بسته‌ها از GitHub Releases**
۱. به صفحهٔ **Releases** مخزن بروید:
   ```text
   https://github.com/rahmaniho/taxi/releases
   ```
۲. آخرین ریلیز با برچسب **`cpanel-parts-v1.6.0`** را باز کنید.
۳. فایل‌های زیر را دانلود کنید (جمعاً حدود ۱۲ مگابایت؛ اگر ریلیز فقط بخش‌های بدون vendor را دارد، `07-vendor-*` را از آرتیفکت Actions بگیرید — قدم ۳.۲):
   ```text
   taxi-cpanel-01-core.zip
   taxi-cpanel-02-database.zip
   taxi-cpanel-03-public-bootstrap.zip
   taxi-cpanel-04-pwa-app.zip
   taxi-cpanel-05-pwa-icons.zip
   taxi-cpanel-06-storage.zip
   taxi-cpanel-07-vendor-01.zip  …  taxi-cpanel-07-vendor-NN.zip
   SHA256SUMS.txt
   PARTS.md
   ```

**قدم ۳.۲ — (جایگزین) دانلود از آرتیفکت GitHub Actions**
۱. به تب **Actions** مخزن بروید و آخرین اجرای موفق گردش‌کار **«بسته‌های بخش‌به‌بخش cPanel (با vendor)»** را باز کنید.
۲. در پایین صفحه، بخش **Artifacts** → روی **`taxi-cpanel-parts`** کلیک کنید تا ZIP آرتیفکت دانلود شود.
۳. آن را روی کامپیوتر خود Extract کنید؛ همان بسته‌های `taxi-cpanel-*.zip` بیرون می‌آیند.

> **اجرای دستی این گردش‌کار:** اگر ریلیز/آرتیفکتی موجود نبود، در تب Actions گردش‌کار **«بسته‌های بخش‌به‌بخش cPanel»** را انتخاب و **Run workflow** را بزنید؛ یا در ترمینال خودتان `npm run laravel:parts` (بدون vendor) و با Composer `npm run laravel:parts:vendor` را اجرا کنید. (این گردش‌کار به‌طور خودکار فقط وقتی اجرا می‌شود که پیام کامیت شامل `[parts]` باشد.)

**قدم ۳.۳ — ساخت پوشهٔ مقصد در cPanel**
۱. **cPanel → File Manager** را باز کنید.
۲. به مسیر خانه (`/home/USERNAME`) بروید.
۳. دکمهٔ **+ Folder** → نام: `taxi-app` → **Create New Folder**.

**قدم ۳.۴ — آپلود و Extract بسته‌ها (تک‌تک)**
برای هر بستهٔ `taxi-cpanel-*.zip` به‌ترتیب زیر عمل کنید:
۱. وارد پوشهٔ `taxi-app` شوید و **Upload** را بزنید.
۲. فایل ZIP را انتخاب و منتظر پایان آپلود بمانید (هر بستهٔ بدون vendor زیر ۱ مگابایت است، پس چند ثانیه‌ای تمام می‌شود).
۳. روی فایل آپلودشده **راست‌کلیک → Extract** → مسیر را همان `taxi-app` بگذارید → **Extract File(s)** → سپس فایل ZIP را **Delete** کنید (برای صرفه‌جویی فضا و جلوگیری از سردرگمی).
۴. برای بستهٔ بعدی همین کار را تکرار کنید.

> **نکتهٔ امنیتی:** بستهٔ `06-storage` فقط اسکلت پوشه‌های نوشتنی را می‌سازد. بستهٔ `04-pwa-app` هم فقط `taxi.html`، `sw.js` و `manifest.json` را جایگزین می‌کند؛ بنابراین می‌توانید در به‌روزرسانی‌های بعدی فقط همین یک بسته را آپلود کنید و بقیهٔ سرور دست‌نخورده بماند.

**قدم ۳.۵ — تنظیم فایل `.env` (قبل از ادامه)**
۱. در File Manager به `taxi-app/laravel-backend` بروید.
۲. روی فایل `.env.production.example` راست‌کلیک → **Copy** → مسیر: `taxi-app/laravel-backend/.env`.
۳. روی `.env` راست‌کلیک → **Edit** → مقادیر دیتابیس، رمز مدیر کل و ایمیل را پر کنید (جزئیات در **گام ۴**).
۴. **Save Changes**.

> اگر از قبل `.env` دارید (به‌روزرسانی روی نصب موجود)، این قدم را رد کنید؛ `.env` شما دست‌نخورده می‌ماند چون در هیچ بسته‌ای نیست.

**قدم ۳.۶ — بررسی سلامت Extract**
۱. مطمئن شوید این سه مسیر وجود دارد:
   ```text
   /home/USERNAME/taxi-app/laravel-backend/public/index.php
   /home/USERNAME/taxi-app/laravel-backend/public/taxi.html
   /home/USERNAME/taxi-app/laravel-backend/vendor/autoload.php
   ```
۲. اگر فایل `vendor/autoload.php` نیست، یا بسته‌های `07-vendor-*` را آپلود نکرده‌اید؛ آن‌ها را آپلود و Extract کنید، یا در **cPanel → Terminal** دستور زیر را بزنید:
   ```bash
   cd ~/taxi-app/laravel-backend
   composer install --no-dev --optimize-autoloader
   ```
۳. برای اطمینان از سالم‌بودن فایل‌ها، در **cPanel → Terminal** اجرا کنید:
   ```bash
   cd ~/taxi-app
   sha256sum -c SHA256SUMS.txt
   ```
   باید برای همهٔ بسته‌ها `OK` ببینید.

**قدم ۳.۷ — جدول بسته‌ها (نسخهٔ فعلی ۱.۶.۰)**

| ردیف | فایل | محتوا | تقریباً |
|------|------|-------|---------|
| ۱ | `taxi-cpanel-01-core.zip` | `app/`، `config/`، `routes/`، `resources/`، `bin/`، `artisan`، `composer.json`/`composer.lock`، `.env.example`، `.env.production.example`، `README.md` | ۱۵۰ KB |
| ۲ | `taxi-cpanel-02-database.zip` | `database/migrations`، `seeders`، `factories` | ۲۰ KB |
| ۳ | `taxi-cpanel-03-public-bootstrap.zip` | `public/index.php`، `public/.htaccess`، `robots.txt`، `favicon.ico`، `bootstrap/app.php`، `bootstrap/providers.php` | ۲ KB |
| ۴ | `taxi-cpanel-04-pwa-app.zip` | `public/taxi.html`، `public/sw.js`، `public/manifest.json` | ۱۴۵ KB |
| ۵ | `taxi-cpanel-05-pwa-icons.zip` | `public/icons/` (همهٔ آیکون‌ها و لوگوها) | ۸۱۶ KB |
| ۶ | `taxi-cpanel-06-storage.zip` | اسکلت `storage/app`، `storage/framework`، `storage/logs`، `bootstrap/cache/.gitignore` | ۵ KB |
| ۷+ | `taxi-cpanel-07-vendor-NN.zip` | پوشهٔ `vendor/` (فقط در ریلیز/آرتیفکت با vendor؛ هر بسته ≈ ۸ مگابایت) | ۸ MB هر بسته |

> **چرا بخش‌به‌بخش سریع‌تر و امن‌تر است؟** در File Manager سی‌پنل، آپلود یک ZIP بزرگ (بیش از ۵۰ مگابایت با vendor) معمولاً به سقف `upload_max_filesize` می‌خورد یا وسط کار قطع می‌شود و فایل ناقص Extract می‌شود. با بسته‌های ۱ مگابایتی، هر آپلود در چند ثانیه تمام می‌شود؛ اگر یکی خراب شد فقط همان یکی را تکرار می‌کنید و لازم نیست کل پروژه را دوباره آپلود کنید.

### راه ب — بستهٔ کامل (اگر هاست اجازهٔ آپلود فایل بزرگ‌تر را می‌دهد)

- از صفحهٔ **GitHub Actions** آخرین اجرای مخزن، آرتیفکت **`taxi-karen-cpanel-ready`** (فایل `taxi-karen-cpanel-full.zip` که پوشهٔ `vendor/` هم از قبل داخلش نصب شده است) را دانلود کنید، در **File Manager** به مسیر `/home/USERNAME/taxi-app` بروید، **Upload** و سپس **Extract** کنید.

### راه ج — ساخت بسته یا کلون مستقیم با Composer روی سرور

- اجرای `npm run laravel:package` فایل `deploy/laravel-app/artifacts/taxi-laravel.zip` را می‌سازد؛ آن را در `/home/USERNAME/taxi-app` آپلود و Extract کنید.
- یا در **cPanel → Terminal**:
  ```bash
  cd ~/taxi-app
  git clone https://github.com/rahmaniho/taxi.git repo
  cp -r repo/laravel-backend .
  ```
  سپس `vendor` را با Composer نصب کنید (قدم ۳.۶-۲).

پس از Extract، باید مسیر `/home/USERNAME/taxi-app/laravel-backend/public/index.php` و `/home/USERNAME/taxi-app/laravel-backend/public/taxi.html` موجود باشد.

---
## گام ۴: تنظیم فایل `.env` برای `https://taxi.karen-soft.ir`

یک نمونهٔ از پیش‌تنظیم‌شده برای همین ساب‌دامین در `laravel-backend/.env.production.example` قرار دارد. در File Manager (یا Terminal) آن را به `.env` کپی کنید:

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
## ارتقای بی‌دردسر به نسخه ۱.۶.۰ در cPanel (بدون SSH و بدون حذف اطلاعات)

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
