# راهنمای استقرار «تاکسی کارن» روی هاست اشتراکی (cPanel) و سرور مجازی

این راهنما نحوهٔ بسته‌بندی و بارگذاری هم‌زمان **PWA تاکسی کارن** و **بک‌اند لاراول (`laravel-backend`)** را توضیح می‌دهد.

---

## ۱. ساخت بستهٔ آمادهٔ استقرار

در ریشهٔ مخزن دستورات زیر را اجرا کنید:

```bash
# در محیطی که PHP و Composer نصب است (یا در CI):
cd laravel-backend && composer install --no-dev --optimize-autoloader && cd ..

# همگام‌سازی PWA و ساخت پوشهٔ deploy/laravel-app/stage:
npm run laravel:package
```

خروجی در مسیر `deploy/laravel-app/stage/` شامل دو پوشه خواهد بود:
- `laravel-app/` — هستهٔ برنامهٔ لاراول (خارج از `public_html` قرار می‌گیرد تا فایل‌های `.env` و دیتابیس در معرض وب نباشند)
- `public_html/` — شامل `index.php` بازنویسی‌شده، `.htaccess`، `taxi.html`، `sw.js`، `manifest.json` و `icons/`

---

## ۲. بارگذاری در cPanel

1. محتویات `deploy/laravel-app/stage/laravel-app/` را در مسیر `/home/<CPANEL_USER>/laravel-app/` بارگذاری کنید.
2. محتویات `deploy/laravel-app/stage/public_html/` را در `/home/<CPANEL_USER>/public_html/` (یا پوشهٔ ساب‌دامنه) قرار دهید.
3. فایل `/home/<CPANEL_USER>/laravel-app/.env.example` را به `.env` تغییر نام دهید و مقادیر زیر را تنظیم کنید:
   ```dotenv
   APP_ENV=production
   APP_DEBUG=false
   APP_URL=https://taxi.yourdomain.ir
   PUBLIC_FOLDER_PATH=/home/<CPANEL_USER>/public_html

   DB_CONNECTION=mysql
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_DATABASE=cpaneluser_taxi
   DB_USERNAME=cpaneluser_taxi
   DB_PASSWORD=STRONG_DB_PASSWORD

   TAXI_PUBLIC_SIGNUP=false
   TAXI_ADMIN_NAME="مدیر کل تاکسی کارن"
   TAXI_ADMIN_EMAIL=admin@yourdomain.ir
   TAXI_ADMIN_PASSWORD=CHANGE_THIS_STRONG_PASSWORD
   ```
4. در ترمینال cPanel (یا SSH) دستورات زیر را اجرا کنید:
   ```bash
   cd ~/laravel-app
   php artisan key:generate --force
   php artisan migrate --seed --force
   php artisan config:cache
   php artisan route:cache
   ```
5. برای ارسال خودکار ایمیل‌های یادآور انقضای اشتراک، یک Cron Job در cPanel تنظیم کنید:
   ```cron
   * * * * * cd /home/<CPANEL_USER>/laravel-app && php artisan schedule:run >> /dev/null 2>&1
   ```

---

## ۳. چرخهٔ کارکرد آفلاین برای آژانس‌ها

1. مدیر کل با حساب `TAXI_ADMIN_EMAIL` وارد سامانه می‌شود و از تب **«آژانس‌ها»**، حساب هر آژانس و مدت اشتراک آن را تعریف می‌کند.
2. اپراتور/مدیر آژانس در اولین مراجعه با ایمیل و رمز عبور خود وارد می‌شود؛ توکن نشست و وضعیت اشتراک در مرورگر کش می‌شود و Service Worker کل پوستهٔ PWA را ذخیره می‌کند.
3. از آن لحظه به بعد، برنامه حتی در زمان قطع کامل اینترنت باز می‌شود و تمام عملیات ثبت سفر، دیسپچ، حسابداری و چاپ رسید به‌صورت آفلاین روی همان سیستم انجام می‌گیرد.
4. پس از پایان اعتبار اشتراک، برنامه به حالت **فقط‌خواندنی و پشتیبان‌گیری (`readonly_backup`)** می‌رود: مشاهدهٔ تمام سفرها و گزارش‌ها، چاپ اسناد و دریافت پشتیبان JSON/CSV باز است و به‌محض تمدید اشتراک، ثبت و ویرایش دوباره فعال می‌شود.
