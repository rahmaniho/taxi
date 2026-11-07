# راهنمای راه‌اندازی «تاکسینو | Taxino» روی ساب‌دامین `taxi.karen-soft.ir` (cPanel) - نسخه ۱.۶.۰ (Laravel 13)

این راهنما دقیقاً برای بالا آوردن سامانه روی آدرس **`https://taxi.karen-soft.ir`** در هاست cPanel دامنهٔ `karen-soft.ir` تنظیم شده است (هم‌خانواده و بدون هیچ تداخل کوکی یا دیتابیس با سایر سرویس‌های `karen-soft.ir`).

## 📦 بسته‌های آمادهٔ آپلود (نسخه ۱.۶.۰)

🔗 **https://github.com/rahmaniho/taxi/releases/tag/cpanel-parts-v1.6.0**

| # | فایل | مقصد Extract |
|---|------|--------------|
| ۰۱ | `taxi-cpanel-01-core.zip` | `~/taxi-app` |
| ۰۲ | `taxi-cpanel-02-database.zip` | `~/taxi-app` |
| ۰۳ | `taxi-cpanel-03-public-bootstrap.zip` | `~/taxi-app` |
| ۰۴ | `taxi-cpanel-04-pwa-app.zip` | `~/taxi-app` |
| ۰۵ | `taxi-cpanel-05-pwa-icons.zip` | `~/taxi-app` |
| ۰۶ | `taxi-cpanel-06-storage.zip` | `~/taxi-app` |
| ۰۷ | `taxi-cpanel-07-vendor-01…04.zip` | `~/taxi-app` |
| 🩺 | `taxi-cpanel-00-root-tools.zip` | **ریشهٔ سایت** (کنار `laravel-backend`) — فقط برای عیب‌یابی |

> **همه به یک پوشه:** `~/taxi-app` — هر ZIP خودش پوشهٔ `laravel-backend/` را دارد. نقشهٔ فایل‌به‌فایل در **قدم ۳.۸**.

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
   taxi-cpanel-00-root-tools.zip     (فقط اگر سایت ۴۰۴ می‌دهد — ابزار عیب‌یابی)
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

**قدم ۳.۴ — آپلود همهٔ بسته‌ها در `~/taxi-app` (فقط Upload، بدون Extract)**

۱. **cPanel → File Manager** → وارد پوشهٔ `taxi-app` شوید.
۲. **Upload** را بزنید و **همهٔ** فایل‌های `taxi-cpanel-*.zip` را یک‌جا انتخاب کنید (به‌همراه `SHA256SUMS.txt` و `PARTS.md`).
۳. دکمهٔ **Go** / **Upload** را بزنید و منتظر پایان آپلود بمانید. هر بسته زیر ۳ مگابایت است، پس کل آپلود معمولاً کمتر از ۲ دقیقه طول می‌کشد.
۴. وقتی همه در `taxi-app` نشستند، **Extract** را انجام دهید — با یکی از دو روش قدم ۳.۴-الف یا ۳.۴-ب.

**قدم ۳.۴-الف (توصیه‌شده) — Extract همه با یک دستور**

اگر به **cPanel → Terminal** دسترسی دارید، این تنها راهی است که هر ۱۰ فایل را یک‌جا و بدون کلیک‌کردن استخراج می‌کند:

```bash
cd ~/taxi-app
# ۱) فقط بستهٔ ۰۱ را اول Extract کنید تا اسکریپتِ داخلش آزاد شود:
unzip -oq taxi-cpanel-01-core.zip
# ۲) بقیه (و خود ۰۱) را با اسکریپت کمکی Extract و بررسی کنید:
bash laravel-backend/bin/cpanel-extract-parts.sh --delete-zips
```

خروجی مورد انتظار در پایان:

```text
  ✓ artisan
  ✓ public/index.php
  ✓ public/taxi.html
  ✓ vendor/autoload.php  (77 پکیج نصب‌شده)
✓ همه‌چیز کامل است. قدم بعدی:
    cd ~/taxi-app/laravel-backend
    bash bin/cpanel-setup.sh
```

اسکریپت `cpanel-extract-parts.sh` این کارها را می‌کند:
- همهٔ `taxi-cpanel-*.zip` را به‌ترتیب Extract می‌کند (تکرارپذیر و بی‌خطر).
- اگر بسته‌ای ناقص آپلود شده باشد یا ساختارش درست نباشد، **همان بسته** را گزارش می‌کند و بقیه را ادامه می‌دهد.
- یک چک‌لیست ۱۹ فایلی حیاتی + وجود `vendor/autoload.php` را بررسی می‌کند.
- مجوز `storage` و `bootstrap/cache` را `ug+rwX` می‌کند.
- با سوییچ `--delete-zips` فایل‌های ZIP را بعد از Extract پاک می‌کند.

**قدم ۳.۴-ب — Extract با File Manager (بدون Terminal)**

برای هر بستهٔ `taxi-cpanel-*.zip` جداگانه:
۱. روی فایل ZIP **راست‌کلیک → Extract** بزنید.
۲. در کادر **Extract to** فقط بنویسید:
   ```text
   /home/USERNAME/taxi-app
   ```
   (این همان پوشه‌ای است که ZIP داخلش است؛ اگر کادر خالی بماند هم همان‌جا Extract می‌شود.)
۳. **Extract File(s)** را بزنید و صبر کنید تا پیام *Extraction completed* بیاید.
۴. فایل ZIP را **Delete** کنید (برای صرفه‌جویی فضا).
۵. برای بستهٔ بعدی همین کار را تکرار کنید.

> **مهم:** تا وقتی همهٔ بسته‌ها Extract نشده‌اند سایت را باز نکنید — نبود `vendor/` باعث خطای ۵۰۰ می‌شود.

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

**قدم ۳.۸ — نقشهٔ دقیق «هر فایل کجا می‌رود» (مرجع اصلی)**

> **قانون طلایی:** **همهٔ** بسته‌ها به **یک پوشه** Extract می‌شوند و آن پوشه همیشه `~/taxi-app` است. هیچ بسته‌ای را جای دیگری Extract نکنید. داخل هر ZIP، مسیرها از پیش با پیشوند `laravel-backend/` ذخیره شده‌اند؛ پس `unzip` خودش فایل‌ها را در جای صحیح می‌گذارد و شما لازم نیست چیزی را جابه‌جا یا کپی کنید.

**نمای کلی مسیرها روی هاست**

```text
/home/USERNAME/
└── taxi-app/                         ← فقط همین یک پوشه می‌سازید
    ├── taxi-cpanel-01-core.zip        ← این‌ها را آپلود می‌کنید
    ├── taxi-cpanel-02-database.zip
    ├── taxi-cpanel-03-public-bootstrap.zip
    ├── taxi-cpanel-04-pwa-app.zip
    ├── taxi-cpanel-05-pwa-icons.zip
    ├── taxi-cpanel-06-storage.zip
    ├── taxi-cpanel-07-vendor-01.zip
    ├── … 07-vendor-02 … 04
    ├── SHA256SUMS.txt
    ├── PARTS.md
    └── laravel-backend/              ← این پوشه توسط Extract ساخته می‌شود
        ├── app/  config/  routes/  resources/  database/  bin/  bootstrap/  storage/  public/
        ├── artisan
        ├── composer.json   composer.lock   README.md
        ├── .env            ← خودتان از .env.production.example می‌سازید
        └── vendor/         ← از بسته‌های 07-vendor-*
```

**جزئیات: هر بسته چه فایل‌هایی را کجا می‌گذارد**

<details>
<summary><b>بستهٔ ۰۱ — <code>taxi-cpanel-01-core.zip</code></b> (۱۵۰ KB) → مقصد: <code>~/taxi-app/laravel-backend/</code></summary>

| فایل/پوشه داخل بسته | مسیر نهایی روی هاست |
|---|---|
| `laravel-backend/artisan` | `~/taxi-app/laravel-backend/artisan` |
| `laravel-backend/composer.json` | `~/taxi-app/laravel-backend/composer.json` |
| `laravel-backend/composer.lock` | `~/taxi-app/laravel-backend/composer.lock` |
| `laravel-backend/.env.example` | `~/taxi-app/laravel-backend/.env.example` |
| `laravel-backend/.env.production.example` | `~/taxi-app/laravel-backend/.env.production.example` |
| `laravel-backend/.gitignore` | `~/taxi-app/laravel-backend/.gitignore` |
| `laravel-backend/README.md` | `~/taxi-app/laravel-backend/README.md` |
| `laravel-backend/app/**` | `~/taxi-app/laravel-backend/app/**` |
| `…/app/Http/Controllers/Api/*.php` | کنترلرهای API (Auth, Billing, License, Sync, Team, Registration, Audit) |
| `…/app/Http/Controllers/Api/Manager/*.php` | کنترلرهای پنل مدیر کل |
| `…/app/Models/*.php` | مدل‌ها (User, Store, License, Order, Subscription*) |
| `…/app/Services/Billing/*.php` | سرویس‌های اشتراک و درگاه‌ها (Zarinpal, Manual) |
| `…/app/Services/Sync/AgencySyncMergeService.php` | سرویس همگام‌سازی آژانس |
| `…/app/Support/Jalali.php` | تبدیل تاریخ شمسی |
| `laravel-backend/config/**` | همهٔ فایل‌های پیکربندی لاراول |
| `laravel-backend/routes/web.php` | همهٔ مسیرهای `/api/*` و `/up` |
| `laravel-backend/routes/console.php` | زمان‌بند یادآور اشتراک |
| `laravel-backend/resources/views/mail/license-expiring.blade.php` | قالب ایمیل یادآور |
| `laravel-backend/bin/cpanel-setup.sh` | اسکریپت راه‌اندازی (گام ۵) |
| `laravel-backend/bin/cpanel-extract-parts.sh` | اسکریپت کمکی Extract خودکار (قدم ۳.۹) |

</details>

<details>
<summary><b>بستهٔ ۰۲ — <code>taxi-cpanel-02-database.zip</code></b> (۲۰ KB) → مقصد: <code>~/taxi-app/laravel-backend/database/</code></summary>

| فایل داخل بسته | مسیر نهایی |
|---|---|
| `laravel-backend/database/migrations/0001_01_01_000000_create_users_table.php` | `~/taxi-app/laravel-backend/database/migrations/…` |
| `…/0001_01_01_000001_create_cache_table.php` | همان پوشه (جدول cache و cache_locks) |
| `…/0001_01_01_000002_create_jobs_table.php` | همان پوشه (jobs, job_batches, failed_jobs) |
| `…/2026_11_05_090000_create_stores_table.php` | همان پوشه (آژانس‌ها) |
| `…/2026_11_05_100015_create_licenses_table.php` | همان پوشه (لایسنس‌ها) |
| `…/2026_11_06_010000_create_audit_logs_table.php` | همان پوشه (لاگ ممیزی) |
| `…/2026_11_06_020000_create_orders_table.php` | همان پوشه (سفارش‌ها) |
| `…/2026_11_06_020100_add_billing_fields.php` | همان پوشه |
| `…/2026_11_06_030000_create_subscription_plans_table.php` | همان پوشه (پلن‌ها) |
| `…/2026_11_06_030100_create_subscription_support_tables.php` | همان پوشه |
| `…/2026_11_06_030200_add_subscription_fields_to_orders.php` | همان پوشه |
| `…/2026_11_06_030300_add_subscription_fields_to_licenses.php` | همان پوشه |
| `…/2026_11_06_030400_create_subscription_payments_table.php` | همان پوشه (پرداخت‌ها) |
| `…/2026_11_07_000000_add_admin_panel_fields.php` | همان پوشه (فیلدهای پنل مدیر) |
| `…/2026_11_07_020000_create_agency_sync_states_table.php` | همان پوشه (همگام‌سازی) |
| `…/2026_11_07_040000_upgrade_to_taxino_five_plans.php` | همان پوشه (۵ پلن تومانی) |
| `laravel-backend/database/seeders/DatabaseSeeder.php` | `~/taxi-app/laravel-backend/database/seeders/` (ساخت مدیر کل) |
| `laravel-backend/database/factories/*.php` | `~/taxi-app/laravel-backend/database/factories/` |
| `laravel-backend/database/.gitignore` | `~/taxi-app/laravel-backend/database/.gitignore` |

</details>

<details>
<summary><b>بستهٔ ۰۳ — <code>taxi-cpanel-03-public-bootstrap.zip</code></b> (۲ KB) → مقصد: <code>~/taxi-app/laravel-backend/public/</code> و <code>…/bootstrap/</code></summary>

| فایل داخل بسته | مسیر نهایی | نقش |
|---|---|---|
| `laravel-backend/public/index.php` | `~/taxi-app/laravel-backend/public/index.php` | نقطهٔ ورود همهٔ درخواست‌ها |
| `laravel-backend/public/.htaccess` | `~/taxi-app/laravel-backend/public/.htaccess` | بازنویسی URL و هدر Authorization |
| `laravel-backend/public/robots.txt` | `~/taxi-app/laravel-backend/public/robots.txt` | دستور موتور جستجو |
| `laravel-backend/public/favicon.ico` | `~/taxi-app/laravel-backend/public/favicon.ico` | آیکون مرورگر |
| `laravel-backend/bootstrap/app.php` | `~/taxi-app/laravel-backend/bootstrap/app.php` | راه‌اندازی اپ + رجیستر middleware |
| `laravel-backend/bootstrap/providers.php` | `~/taxi-app/laravel-backend/bootstrap/providers.php` | فهرست Providerها |

</details>

<details>
<summary><b>بستهٔ ۰۴ — <code>taxi-cpanel-04-pwa-app.zip</code></b> (۱۴۵ KB) → مقصد: <code>~/taxi-app/laravel-backend/public/</code></summary>

| فایل داخل بسته | مسیر نهایی | نقش |
|---|---|---|
| `laravel-backend/public/taxi.html` | `~/taxi-app/laravel-backend/public/taxi.html` | **کل نرم‌افزار تاکسینو** (تک‌فایلی، ۵۷۰ KB) |
| `laravel-backend/public/sw.js` | `~/taxi-app/laravel-backend/public/sw.js` | Service Worker آفلاین (`CACHE_VERSION = taxi-v1.6.0`) |
| `laravel-backend/public/manifest.json` | `~/taxi-app/laravel-backend/public/manifest.json` | مانیفست PWA (نام، آیکون‌ها، میان‌بُرها) |

> **این بسته تنها بسته‌ای است که برای به‌روزرسانی‌های بعدی لازم دارید** — فقط همین ZIP را آپلود و Extract کنید تا نسخهٔ PWA عوض شود.

</details>

<details>
<summary><b>بستهٔ ۰۵ — <code>taxi-cpanel-05-pwa-icons.zip</code></b> (۸۱۶ KB) → مقصد: <code>~/taxi-app/laravel-backend/public/icons/</code></summary>

| فایل داخل بسته | مسیر نهایی |
|---|---|
| `laravel-backend/public/icons/icon-72.png` | `~/taxi-app/laravel-backend/public/icons/` |
| `…/icon-96.png` `96` · `…/icon-128.png` · `…/icon-144.png` · `…/icon-152.png` · `…/icon-192.png` · `…/icon-384.png` · `…/icon-512.png` | همان پوشه |
| `…/maskable-512.png` | آیکون maskable اندروید |
| `…/apple-touch-icon.png` | آیکون iOS |
| `…/logo.png` · `…/logo-dark.png` | لوگوها (تیره/روشن) |
| `…/brand.svg` | لوگوی برداری |
| `…/login-hero.jpg` | تصویر پس‌زمینهٔ صفحهٔ ورود |

</details>

<details>
<summary><b>بستهٔ ۰۶ — <code>taxi-cpanel-06-storage.zip</code></b> (۵ KB) → مقصد: <code>~/taxi-app/laravel-backend/storage/</code> و <code>…/bootstrap/cache/</code></summary>

| فایل داخل بسته | مسیر نهایی | نقش |
|---|---|---|
| `laravel-backend/storage/app/.gitignore` | `~/taxi-app/laravel-backend/storage/app/` | پوشهٔ فایل‌های اپ |
| `…/storage/app/private/.gitignore` | `…/storage/app/private/` | فایل‌های خصوصی (رسیدهای پرداخت) |
| `…/storage/app/public/.gitignore` | `…/storage/app/public/` | فایل‌های عمومی (storage:link) |
| `…/storage/framework/.gitignore` | `…/storage/framework/` | ریشهٔ فریم‌ورک |
| `…/storage/framework/cache/data/.gitignore` | `…/storage/framework/cache/data/` | کش دیتابیسی |
| `…/storage/framework/cache/locks/.gitignore` | `…/storage/framework/cache/locks/` | قفل‌ها |
| `…/storage/framework/sessions/.gitignore` | `…/storage/framework/sessions/` | نشست‌ها |
| `…/storage/framework/views/.gitignore` | `…/storage/framework/views/` | ویوهای کامپایل‌شده |
| `…/storage/framework/testing/.gitignore` | `…/storage/framework/testing/` | تست |
| `…/storage/logs/.gitignore` | `…/storage/logs/` | **لاگ خطاها** (`laravel.log`) |
| `laravel-backend/bootstrap/cache/.gitignore` | `~/taxi-app/laravel-backend/bootstrap/cache/` | کش config/route |

> این بسته فقط **اسکلت پوشه‌ها** را می‌سازد (چون ZIP پوشهٔ خالی نمی‌سازد). مجوز نوشتن بعداً در گام ۵ با `cpanel-setup.sh` تنظیم می‌شود.

</details>

<details>
<summary><b>بسته‌های ۰۷ — <code>taxi-cpanel-07-vendor-NN.zip</code></b> (۴ بخش، مجموع ≈ ۸.۷ MB) → مقصد: <code>~/taxi-app/laravel-backend/vendor/</code></summary>

| بخش | چه چیزی داخلش است | مقصد |
|---|---|---|
| `07-vendor-01` (۲.۷ MB) | `vendor/autoload.php` + `vendor/composer/` + `vendor/bin/` + پکیج‌های سبک + **`vendor/laravel/framework`** | `~/taxi-app/laravel-backend/vendor/…` |
| `07-vendor-02` (۲.۳ MB) | `vendor/symfony/*` (http-foundation, http-kernel, console, mailer…) | همان‌جا |
| `07-vendor-03` (۲.۹ MB) | `vendor/nesbot/carbon`، `guzzlehttp/*`، `psy/psysh`، `monolog/*`، `league/*`… | همان‌جا |
| `07-vendor-04` (۰.۷ MB) | باقی پکیج‌های کوچک (`psr/*`، `ramsey/*`، `brick/math`، `vlucas/phpdotenv`…) | همان‌جا |

> **مهم:** تقسیم‌بندی پکیج‌ها بین ۰۱ تا ۰۴ ممکن است بین نسخه‌ها کمی جابه‌جا شود — **مهم نیست**، چون همه داخل `vendor/` می‌روند. فقط کافی است **هر چهار (یا هر NN) بسته** Extract شوند.
> `vendor/` شامل **۷۷ پکیج تولیدی** است (بدون Pest/PHPUnit که فقط برای توسعه‌اند).

</details>

**فایل‌هایی که هرگز داخل بسته‌ها نیستند (و باید خودتان بسازید)**

| فایل | چرا نیست | چه کار کنید |
|---|---|---|
| `~/taxi-app/laravel-backend/.env` | حاوی رمز دیتابیس و رمز مدیر است — نباید در گیت باشد | از `.env.production.example` کپی و پر کنید (**گام ۴**) |
| `~/taxi-app/laravel-backend/storage/logs/laravel.log` | خودکار ساخته می‌شود | کاری نکنید |
| `~/taxi-app/laravel-backend/bootstrap/cache/config.php` و `routes-v7.php` | با `config:cache`/`route:cache` ساخته می‌شوند | در گام ۵ ساخته می‌شوند |
| `~/taxi-app/laravel-backend/public/storage` | لینک نمادین | با `php artisan storage:link` ساخته می‌شود |
| `phpunit.xml` و `tests/` | فقط برای توسعه | نیاز نیست روی سرور باشد |

**علت اینکه همه‌چیز این‌قدر ساده است:** هر ZIP از قبل پوشهٔ `laravel-backend/` را در خود دارد. پس وقتی در `~/taxi-app` راست‌کلیک → Extract می‌کنید، cPanel خودش `laravel-backend/...` را می‌سازد. **هرگز** محتویات ZIP را دستی به پوشه‌ای دیگر منتقل نکنید و **هرگز** بسته‌ها را داخل `public_html` یا `~/taxi.karen-soft.ir` Extract نکنید.


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
## 🟢 ساختار فعلی هاست شما (تخت / flat) — راه‌اندازی نهایی

بر اساس بررسی زنده، وضعیت الان این است:

```text
/home/karensof/public_html/          ← Document Root (تأیید شد)
├── app/  bin/  bootstrap/  config/  database/
├── public/            ← index.php، taxi.html، sw.js، icons/  ✅
├── resources/  routes/  storage/  vendor/
├── artisan  composer.json  composer.lock
└── .env               ← ❌ وجود ندارد یا APP_KEY خالی است
```

**چه چیزی کار می‌کند:** `https://taxi.karen-soft.ir/public/up` → **200 OK** ✅ (لاراول سالم است)
**چه چیزی کار نمی‌کند:** `/up` → ۴۰۴، `/` → لیست پوشه‌ها
**خطای ثبت‌شده:** `No application encryption key has been specified` (در `storage/logs/laravel.log`)

یعنی فقط **سه قدم** مانده:

---

> ⚠️ **اشتباه بسیار رایج:** گذاشتن `APP_KEY` در فایل `.env.production.example` هیچ اثری ندارد.
> لاراول **فقط** فایل `.env` را می‌خواند. فایل `.example` فقط یک الگو برای کپی است.

### 🚑 رفع خطای `Server Error` روی `/public/api/csrf`

اگر `/public/up` جواب می‌دهد ولی `/public/api/csrf` خطای **500 / Server Error** می‌دهد و در `storage/logs/laravel.log` این را می‌بینید:

```
production.ERROR: No application encryption key has been specified.
```

یعنی **`APP_KEY` نیست یا در فایل اشتباه است**. سه راه دارد:

#### راه A — ابزار خودکار `fix-app-key.php` (بدون Terminal، توصیه‌شده)

۱. از بستهٔ `taxi-cpanel-00-root-tools.zip` فایل **`fix-app-key.php`** را بردارید.
۲. آن را در **همان پوشه‌ای که `artisan` هست** آپلود کنید (یعنی `public_html/laravel-backend/`).
۳. کنارش فایلی به نام `.fix-key` بسازید و داخلش یک عبارت دلخواه بگذارید (مثل `taxino2026`).
۴. این آدرس را باز کنید (اگر در `public/` گذاشتید، مسیر را عوض کنید):
   ```text
   https://taxi.karen-soft.ir/public/fix-app-key.php?key=taxino2026
   ```
۵. سه دکمه را به ترتیب بزنید: **① ساخت .env** → **② ساخت APP_KEY** → تست کنید.
۶. در پایان با دکمهٔ **🗑 حذف خودکار** همین ابزار و `.fix-key` را پاک کنید.

این ابزار:
- ریشهٔ لاراول را خودش پیدا می‌کند (`artisan` + `composer.json`)
- اگر `.env` نیست، از `.env.production.example` می‌سازد
- با `random_bytes(32)` یک `APP_KEY` واقعاً امن می‌سازد و **اتمیک** در `.env` می‌نویسد
- کش `bootstrap/cache/*.php` را خودش پاک می‌کند
- رمزهای `DB_PASSWORD` و `TAXI_MANAGER_PASSWORD` را **فقط به‌صورت طول** نمایش می‌دهد

#### راه B — Terminal (راه رسمی)

```bash
cd ~/public_html/laravel-backend

# ۱) اگر .env نیست، بساز
[ -f .env ] || cp .env.production.example .env

# ۲) کلید بساز
php artisan key:generate --force

# ۳) کش را پاک کن (مهم!)
php artisan config:clear
```

#### راه C — دستی (اگر هیچ‌کدام نشد)

۱. کلید بسازید (در مرورگر، F12 → Console):
   ```js
   'base64:' + btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
   ```
۲. در File Manager فایل **`.env`** (نه `.example`) را Edit کنید و کل خط `APP_KEY=` را با این عوض کنید:
   ```dotenv
   APP_KEY=base64:xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx=
   ```
   > ⚠️ بدون فاصله دور `=`، بدون کوتیشن، بدون کاراکتر اضافه.
۳. **Save** → سپس فایل `bootstrap/cache/config.php` را **Delete** کنید (وگرنه مقدار قدیمی خوانده می‌شود).

#### ✅ تست موفقیت

```text
https://taxi.karen-soft.ir/public/api/csrf
```
باید JSON بدهد:
```json
{"ok":true,"csrf_token":"..."}
```

اگر باز هم 500 داد، بررسی کنید:
| مورد | چطور چک کنیم |
|---|---|
| نام فایل دقیقاً `.env` است؟ | نه `.env.txt` و نه `.env.production.example` |
| `.env` در همان پوشهٔ `artisan` است؟ | بله |
| مجوز فایل 644 است؟ | File Manager → Change Permissions |
| کش پاک شده؟ | `bootstrap/cache/config.php` وجود نداشته باشد |

---

### قدم نهایی ۱ — ساخت `.env` با `APP_KEY`

**الف) در Terminal سی‌پنل:**

```bash
cd ~/public_html
cp .env.production.example .env
```

اگر `.env.production.example` نیست (چون فایل‌های مخفی ممکن است آپلود نشده باشند):

```bash
cd ~/public_html
cat > .env <<'ENVEOF'
APP_NAME="تاکسینو | Taxino"
APP_ENV=production
APP_KEY=
APP_DEBUG=false
APP_URL=https://taxi.karen-soft.ir

APP_LOCALE=fa
APP_FALLBACK_LOCALE=en
APP_FAKER_LOCALE=fa_IR
APP_MAINTENANCE_DRIVER=file
BCRYPT_ROUNDS=12

LOG_CHANNEL=stack
LOG_STACK=single
LOG_LEVEL=error

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=karensof_taxi
DB_USERNAME=karensof_taxi_user
DB_PASSWORD="رمز_دیتابیس_شما"

SESSION_DRIVER=database
SESSION_LIFETIME=43200
SESSION_ENCRYPT=false
SESSION_COOKIE=taxi_karen_session
SESSION_SECURE_COOKIE=true
SESSION_SAME_SITE=lax
SESSION_PATH=/
SESSION_DOMAIN=null

BROADCAST_CONNECTION=log
FILESYSTEM_DISK=local
QUEUE_CONNECTION=database
CACHE_STORE=database

MAIL_MAILER=smtp
MAIL_SCHEME=null
MAIL_HOST=mail.karen-soft.ir
MAIL_PORT=465
MAIL_USERNAME=noreply@karen-soft.ir
MAIL_PASSWORD="رمز_ایمیل"
MAIL_FROM_ADDRESS="noreply@karen-soft.ir"
MAIL_FROM_NAME="${APP_NAME}"

TAXI_PUBLIC_SIGNUP=false
TAXI_TRIAL_DAYS=14
TAXI_PAYMENT_GATEWAY=manual
ZARINPAL_MERCHANT_ID=
ZARINPAL_SANDBOX=false

TAXI_MANAGER_NAME="مدیر کل تاکسینو"
TAXI_MANAGER_EMAIL=admin@karen-soft.ir
TAXI_MANAGER_PASSWORD="یک_رمز_قوی_برای_مدیر_کل"
ENVEOF
```

**ب) با File Manager → Edit فقط این ۴ خط را عوض کنید:**

| خط | مقدار |
|---|---|
| `DB_DATABASE=` | نام واقعی دیتابیس (مثل `karensof_taxi`) |
| `DB_USERNAME=` | نام کاربر دیتابیس |
| `DB_PASSWORD="..."` | رمز دیتابیس |
| `TAXI_MANAGER_PASSWORD="..."` | رمز قوی مدیر کل |

**ج) ساخت `APP_KEY` (رفع خطای فعلی):**

```bash
cd ~/public_html
php artisan key:generate --force
```

باید ببینید: `Application key set successfully.`

---

### قدم نهایی ۲ — گذاشتن `.htaccess` در ریشه

فایل **`root-router-flat.htaccess`** از بستهٔ `taxi-cpanel-00-root-tools.zip`:

1. آپلود در `public_html` (کنار `artisan` و پوشهٔ `public/`)
2. راست‌کلیک → **Rename** → نام: `.htaccess`

این فایل این کارها را می‌کند:

| درخواست | مقصد |
|---|---|
| `/up` , `/api/*` , `/` , `/manager/*` | `public/index.php` |
| `/taxi.html` , `/sw.js` , `/icons/*` | `public/…` مستقیم |
| `/app/`, `/config/`, `/storage/`, `/vendor/`, `/artisan`, `/composer.json` | **۴۰۳ مسدود** |
| `/.env`, `/.htaccess` | **۴۰۳ مسدود** |

---

### قدم نهایی ۳ — دیتابیس و راه‌اندازی

```bash
cd ~/public_html
php artisan migrate --seed --force
php artisan storage:link
php artisan config:cache
php artisan route:cache
```

یا فقط:

```bash
cd ~/public_html && bash bin/cpanel-setup.sh
```

---

### ✅ تست نهایی

| آدرس | انتظار |
|---|---|
| `https://taxi.karen-soft.ir/up` | **200 OK** (`Application up`) |
| `https://taxi.karen-soft.ir/api/csrf` | JSON شامل `csrf_token` |
| `https://taxi.karen-soft.ir/` | صفحهٔ ورود تاکسینو |
| `https://taxi.karen-soft.ir/taxi.html` | همان صفحه |
| `https://taxi.karen-soft.ir/.env` | **۴۰۳** |
| `https://taxi.karen-soft.ir/storage/logs/laravel.log` | **۴۰۳** |

---

### 🔧 بعداً: تمیزترین حالت (اختیاری)

اگر خواستید حرفه‌ای‌تر شود، **Document Root** را عوض کنید به:

```text
public_html/public
```

یا هسته را از `public_html` بیرون ببرید و `public` را داخل `public_html` بگذارید. آن‌وقت `root-router-flat.htaccess` هم لازم نیست و امنیت حداکثری است.

---

## 🩺 عیب‌یابی سریع: سایت ۴۰۴ / لیست پوشه نشان می‌دهد

اگر فایل‌ها آپلود شده‌اند ولی `https://taxi.karen-soft.ir/up` خطای **404** می‌دهد یا صفحهٔ اصلی **لیست پوشه‌ها** را نشان می‌دهد، یعنی **Document Root اشتباه است** — نه اینکه فایل‌ها ناقص باشند.

### علائم دقیق

| نشانه | معنی |
|---|---|
| صفحهٔ اصلی لیست `app/ config/ database/ …` را نشان می‌دهد | Document Root روی ریشهٔ پروژه است، نه `public` |
| `/laravel-backend/public/taxi.html` باز می‌شود ولی `/up` نه | فایل‌ها سالماند؛ فقط روتینگ لاراول اجرا نمی‌شود |
| `/laravel-backend/vendor/` خطای 403/404 می‌دهد | طبیعی است (سرور فایل‌های PHP را لیست نمی‌کند) — مدرک معتبر برای نبود vendor نیست |

### راه‌حل ۱ (بدون تغییر Document Root) — آپلود یک فایل `.htaccess`

۱. فایل **`root-router.htaccess`** را از مخزن دانلود کنید:
   👉 https://github.com/rahmaniho/taxi/raw/main/deploy/laravel-app/root-router.htaccess
۲. در **File Manager** به **ریشهٔ سایت** بروید — همان پوشه‌ای که `laravel-backend` داخلش است
   (اگر پوشه‌های `app/`, `config/`, `public/` را کنار هم می‌بینید، همان‌جاست).
۳. **Upload** → فایل را آپلود کنید → راست‌کلیک → **Rename** → نام را بگذارید:
   ```text
   .htaccess
   ```
   *(نکته: نقطهٔ اول نام الزامی است؛ اگر `.htaccess` از قبل هست، اول یک نسخهٔ پشتیبان از آن بگیرید.)*
۴. `https://taxi.karen-soft.ir/up` را باز کنید → باید **200 OK** بدهد.
۵. حالا لینک مستقیم `…/laravel-backend/public/taxi.html` را هم امتحان کنید؛ اگر باز شود، روتینگ درست است.

> این فایل چه می‌کند؟ همهٔ درخواست‌ها را به `laravel-backend/public/index.php` می‌فرستد، فایل‌های استاتیک (`taxi.html`، `sw.js`، `icons/`) را مستقیم سرو می‌کند و دسترسی به `app/`, `config/`, `.env`, `storage/`, `vendor/` را **مسدود** می‌کند.
> **اگر بعداً Document Root را روی `public` گذاشتید، این فایل `.htaccess` را حذف کنید** تا تداخل نکند.

### راه‌حل ۲ (تمیزترین) — تغییر Document Root

۱. **cPanel → Domains** → `taxi.karen-soft.ir` → **Manage**
۲. **Document Root** را روی این بگذارید:
   ```text
   taxi-app/laravel-backend/public
   ```
   یا مسیر مطلق: `/home/USERNAME/taxi-app/laravel-backend/public`
۳. **Update** → سپس `.htaccess` ساخته‌شده در ریشه را حذف کنید.

### راه‌حل ۳ — ابزار تشخیص خودکار `cpanel-doctor.php`

فایل `deploy/laravel-app/cpanel-doctor.php` را در ریشهٔ سایت آپلود کنید و باز کنید:
```text
https://taxi.karen-soft.ir/cpanel-doctor.php
```
این صفحه یک گزارش کامل می‌دهد:

- نسخهٔ PHP و افزونه‌های فعال (`zip`, `pdo_mysql`, `mbstring`…)
- **Document Root واقعی** و **مسیر پوشهٔ لاراول** که پیدا کرده
- چک‌لیست ۲۱ فایل حیاتی با وضعیت «هست/نیست/نوشتنی»
- محتویات `.env` — **بدون افشای رمزها** (فقط «تنظیم شده ✓ (طول)»)
- فهرست مسیرهایی که جست‌وجو کرده و در هر کدام چه دید

و دو کار را هم می‌تواند خودش انجام دهد (با کلید امنیتی):

| آدرس | کار |
|---|---|
| `/cpanel-doctor.php?action=extract&key=XXX` | استخراج همهٔ `taxi-cpanel-*.zip` در `~/taxi-app` (نیاز به `ZipArchive`) |
| `/cpanel-doctor.php?action=router&key=XXX` | ساخت `.htaccess` در ریشه (همان راه‌حل ۱، ولی خودکار) |

**ساخت کلید:** کنار `cpanel-doctor.php` یک فایل `.install-key` بسازید و داخلش هر عبارتی بنویسید (مثلاً `taxino2026`). این کار مانع می‌شود غریبه‌ها بتوانند این عملیات را اجرا کنند.

> 🔴 **بعد از پایان کار، `cpanel-doctor.php` و `.install-key` را حتماً از سرور پاک کنید.**

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
## 🔴 وضعیت واقعی این هاست: ساب‌دامین به `public_html` اشاره می‌کند

در این هاست، `taxi.karen-soft.ir` روی **`/home/USERNAME/public_html`** تنظیم شده و `taxi-app` بیرون از آن است. نتیجه:

- `https://taxi.karen-soft.ir/` → لیست خالی (یا فایل‌های قدیمی)
- `https://taxi.karen-soft.ir/taxi-app/...` → **404** (چون بیرون از docroot است)
- `https://taxi.karen-soft.ir/up` → **404** (لاراول اجرا نمی‌شود)

دو راه دارد. **راه ۱ کوتاه‌ترین است.**

### راه ۱ — همه‌چیز را داخل `public_html` ببرید (بدون تغییر docroot)

مرحله ۱ — پوشهٔ `laravel-backend` را به `public_html` منتقل کنید:

1. **File Manager** → وارد `taxi-app` شوید
2. روی پوشهٔ `laravel-backend` راست‌کلیک → **Move** (یا **Cut**)
3. مقصد را بگذارید:
   ```text
   /home/USERNAME/public_html
   ```
4. **Move File(s)**

حالا ساختار باید این باشد:
```text
/home/USERNAME/public_html/
├── laravel-backend/          ← اینجا
│   ├── app/  config/  public/  vendor/ …
│   └── .env                  ← می‌سازیم
├── .htaccess                 ← می‌سازیم (مرحله ۳)
└── (فایل‌های قدیمی: artifact.tar, ROADMAP.html … که می‌توانید پاک کنید)
```

مرحله ۲ — فایل `.env` را در **`public_html/laravel-backend/.env`** بسازید:

```bash
cd ~/public_html/laravel-backend
cp .env.production.example .env
```
بعد در File Manager → Edit کنید و این ۷ خط را پر کنید:

```dotenv
DB_DATABASE=USERNAME_taxi
DB_USERNAME=USERNAME_taxi_user
DB_PASSWORD="رمز دیتابیس"
DB_HOST=127.0.0.1
TAXI_MANAGER_EMAIL=admin@karen-soft.ir
TAXI_MANAGER_PASSWORD="رمز قوی مدیر کل"
APP_URL=https://taxi.karen-soft.ir
```

مرحله ۳ — فایل router را در **ریشهٔ `public_html`** بگذارید:

1. فایل [`root-router.htaccess`](../../deploy/laravel-app/root-router.htaccess) را دانلود کنید
2. در File Manager داخل `public_html` آپلود کنید
3. راست‌کلیک → **Rename** → نامش را بگذارید:
   ```text
   .htaccess
   ```
   *(اگر `.htaccess` از قبل هست، اول نامش را به `.htaccess.old` تغییر دهید تا پشتیبان داشته باشید)*

مرحله ۴ — راه‌اندازی:

```bash
cd ~/public_html/laravel-backend
bash bin/cpanel-setup.sh
```

مرحله ۵ — تست: `https://taxi.karen-soft.ir/up` → باید **200 OK** بدهد.

---

### راه ۲ (تمیزترین) — تغییر Document Root به پوشهٔ `public`

اگر cPanel اجازه می‌دهد:

1. **cPanel → Domains** → `taxi.karen-soft.ir` → **Manage**
2. **Document Root**:
   ```text
   taxi-app/laravel-backend/public
   ```
   یا مطلق: `/home/USERNAME/taxi-app/laravel-backend/public`
3. **Save** → سپس هیچ `laravel-backend` یا `.htaccess` اضافه‌ای در `public_html` لازم نیست.

---

### نکتهٔ مهم دربارهٔ `PUBLIC_FOLDER_PATH`

اگر **مجبور شدید** هستهٔ لاراول را بیرون از پوشهٔ وب نگه دارید (مثلاً `~/laravel-app`) و فقط `public` را داخل پوشهٔ وب بگذارید:

```dotenv
PUBLIC_FOLDER_PATH=/home/USERNAME/public_html
```

این خط در `config/app.php` خوانده می‌شود (`AppServiceProvider::register()` با `usePublicPath()` مسیر `public` را عوض می‌کند) — **ولی فقط برای لاراول**. وب‌سرور همچنان `index.php` و `taxi.html` را از `public_html` سرو می‌کند، پس آن فایل‌ها باید آنجا باشند.

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
