<?php
/**
 * cpanel-doctor.php — ابزار تشخیص و نصب «تاکسینو | Taxino» روی cPanel
 * ────────────────────────────────────────────────────────────────────
 * این فایل را در **Document Root** ساب‌دامین آپلود کنید
 * (همان پوشه‌ای که https://taxi.karen-soft.ir/ به آن اشاره می‌کند)
 * و در مرورگر باز کنید:  https://taxi.karen-soft.ir/cpanel-doctor.php
 *
 * حالت ۱ (پیش‌فرض) : تشخیص کامل — چه چیزی هست، چه چیزی نیست، مسیرها کجاست
 * حالت ۲ (نصب)     : ?action=extract&key=XXXX  → استخراج بسته‌ها در ~/taxi-app
 *
 * ⚠️ بعد از پایان کار، این فایل را حتماً از سرور پاک کنید.
 */

declare(strict_types=1);

// ───────────────────────────── تنظیمات ─────────────────────────────
const APP_FOLDER = 'laravel-backend';
const ZIP_PREFIX = 'taxi-cpanel-';
const BACKUP_NAME = 'cpanel-doctor.php.bak';

// ───────────────────────────── داده‌های تشخیص ─────────────────────────────

/** پوشه‌هایی که ممکن است نصب در آن‌ها باشد را پیدا می‌کند. */
function candidate_roots(): array
{
    $candidates = [];

    $home = null;
    if (function_exists('posix_getpwuid') && function_exists('posix_geteuid')) {
        $pw = @posix_getpwuid(posix_geteuid());
        if (is_array($pw) && !empty($pw['dir'])) {
            $home = rtrim($pw['dir'], '/');
        }
    }
    if (!$home && !empty($_SERVER['HOME'])) {
        $home = rtrim($_SERVER['HOME'], '/');
    }
    if (!$home) {
        $home = '/home/' . (function_exists('get_current_user') ? (string) @get_current_user() : '');
    }

    $docroot = rtrim((string) ($_SERVER['DOCUMENT_ROOT'] ?? ''), '/');
    $cwd = rtrim((string) getcwd(), '/');

    $push = static function (?string $path) use (&$candidates): void {
        if (!$path) {
            return;
        }
        $path = str_replace('//', '/', rtrim($path, '/'));
        if ($path !== '' && !in_array($path, $candidates, true)) {
            $candidates[] = $path;
        }
    };

    // ۱) پوشهٔ استاندارد نصب: ~/taxi-app
    if ($home) {
        $push($home . '/taxi-app/' . APP_FOLDER);
        $push($home . '/taxi-app');
        $push($home . '/public_html/taxi-app/' . APP_FOLDER);
    }

    // ۲) Document Root فعلی و فرزندانش
    if ($docroot) {
        $push($docroot);
        $push($docroot . '/' . APP_FOLDER);
        $push(dirname($docroot) . '/' . APP_FOLDER);
        $push(dirname($docroot) . '/taxi-app/' . APP_FOLDER);
        $push(dirname($docroot, 2) . '/taxi-app/' . APP_FOLDER);
    }

    if ($cwd) {
        $push($cwd);
    }

    // ۳) جست‌وجوی عمومی در /home/*/ (حداکثر دو سطح)
    foreach ((array) @glob('/home/*/taxi-app', GLOB_ONLYDIR | GLOB_NOSORT) as $dir) {
        $push($dir . '/' . APP_FOLDER);
        $push($dir);
    }
    foreach ((array) @glob('/home/*/public_html/*', GLOB_ONLYDIR | GLOB_NOSORT) as $dir) {
        $base = basename($dir);
        if ($base === APP_FOLDER || $base === 'taxi') {
            $push($dir);
        }
    }

    return $candidates;
}

/** اولین پوشه‌ای که واقعاً laravel-backend است. */
function find_backend(): ?string
{
    foreach (candidate_roots() as $root) {
        if (is_file($root . '/artisan')) {
            return $root;
        }
        if (is_file($root . '/' . APP_FOLDER . '/artisan')) {
            return $root . '/' . APP_FOLDER;
        }
    }
    return null;
}

/** خواندن کلیدهای بی‌خطر از .env (فقط وجود/عدم وجود، بدون افشای رمز). */
function env_facts(string $backend): array
{
    $file = $backend . '/.env';
    if (!is_file($file)) {
        return ['exists' => false, 'rows' => []];
    }

    $wanted = [
        'APP_ENV', 'APP_DEBUG', 'APP_URL', 'APP_KEY',
        'DB_CONNECTION', 'DB_HOST', 'DB_PORT', 'DB_DATABASE', 'DB_USERNAME', 'DB_PASSWORD',
        'SESSION_DRIVER', 'SESSION_COOKIE', 'SESSION_SECURE_COOKIE',
        'TAXI_PUBLIC_SIGNUP', 'TAXI_PAYMENT_GATEWAY',
        'TAXI_MANAGER_EMAIL', 'TAXI_MANAGER_PASSWORD',
    ];
    $secrets = ['DB_PASSWORD', 'TAXI_MANAGER_PASSWORD', 'MAIL_PASSWORD', 'APP_KEY'];

    $values = [];
    foreach ((array) @file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim((string) $line);
        if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
            continue;
        }
        [$key, $value] = explode('=', $line, 2);
        $key = trim($key);
        if (!in_array($key, $wanted, true)) {
            continue;
        }
        $value = trim(trim($value), '"\'');
        if (in_array($key, $secrets, true)) {
            $values[$key] = [
                'value' => $value === '' ? '(خالی)' : 'تنظیم شده ✓ (' . strlen($value) . ' کاراکتر)',
                'ok' => $value !== '',
                'secret' => true,
            ];
        } else {
            $values[$key] = ['value' => $value === '' ? '(خالی)' : $value, 'ok' => true, 'secret' => false];
        }
    }

    return ['exists' => true, 'rows' => $values];
}

function rrmdir(string $dir): void
{
    if (!is_dir($dir)) {
        @unlink($dir);
        return;
    }
    foreach ((array) scandir($dir) as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        $path = $dir . '/' . $item;
        is_dir($path) && !is_link($path) ? rrmdir($path) : @unlink($path);
    }
    @rmdir($dir);
}

/** استخراج یک ZIP با پیشوند ایمن. */
function extract_zip(string $zipPath, string $target, string &$error): int
{
    if (!class_exists('ZipArchive')) {
        $error = 'افزونهٔ zip در PHP فعال نیست (cPanel → Select PHP Version → Extension → zip).';
        return 0;
    }

    $zip = new ZipArchive();
    if ($zip->open($zipPath) !== true) {
        $error = 'فایل ZIP باز نشد (احتمالاً ناقص آپلود شده).';
        return 0;
    }

    $count = 0;
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $name = (string) $zip->getNameIndex($i);
        // فقط مسیرهای مجاز — جلوگیری از path traversal
        if ($name === '' || $name[0] === '/' || str_contains($name, '..')) {
            continue;
        }
        if (!str_starts_with($name, APP_FOLDER . '/') && rtrim($name, '/') !== APP_FOLDER) {
            continue;
        }

        $dest = $target . '/' . $name;
        if (str_ends_with($name, '/')) {
            @mkdir($dest, 0755, true);
            continue;
        }
        @mkdir(dirname($dest), 0755, true);
        $stream = $zip->getStream($name);
        if ($stream === false) {
            continue;
        }
        $out = @fopen($dest, 'wb');
        if ($out !== false) {
            stream_copy_to_stream($stream, $out);
            fclose($out);
            $count++;
        }
        fclose($stream);
    }
    $zip->close();

    return $count;
}

/** چک‌لیست فایل‌های حیاتی. */
function required_files(string $backend): array
{
    $required = [
        'artisan' => 'فایل اجرایی Artisan',
        'composer.json' => 'تعریف وابستگی‌ها',
        '.env' => 'تنظیمات محیط (باید بسازید)',
        '.env.production.example' => 'نمونهٔ تنظیمات تولید',
        'vendor/autoload.php' => 'کتابخانه‌های Composer',
        'bootstrap/app.php' => 'راه‌انداز اپ',
        'bootstrap/cache' => 'پوشهٔ کش (نوشتنی)',
        'config/app.php' => 'پیکربندی',
        'routes/web.php' => 'همهٔ مسیرهای API',
        'app/Http/Controllers/Api/AuthController.php' => 'کنترلر ورود',
        'database/migrations' => 'فایل‌های مهاجرت',
        'database/seeders/DatabaseSeeder.php' => 'ساخت مدیر کل',
        'public/index.php' => 'نقطهٔ ورود وب',
        'public/.htaccess' => 'بازنویسی URL',
        'public/taxi.html' => 'برنامهٔ تاکسینو',
        'public/sw.js' => 'سرویس‌ورکر آفلاین',
        'public/manifest.json' => 'مانیفست PWA',
        'public/icons/icon-512.png' => 'آیکون‌ها',
        'storage/framework' => 'پوشهٔ فریم‌ورک',
        'storage/logs' => 'پوشهٔ لاگ',
        'bin/cpanel-setup.sh' => 'اسکریپت راه‌اندازی',
    ];

    $result = [];
    foreach ($required as $path => $label) {
        $full = $backend . '/' . $path;
        $result[] = [
            'path' => $path,
            'label' => $label,
            'exists' => file_exists($full),
            'writable' => file_exists($full) ? is_writable($full) : null,
        ];
    }
    return $result;
}

function h(?string $s): string
{
    return htmlspecialchars((string) $s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function badge(bool $ok, string $yes = 'OK', string $no = 'نیست'): string
{
    $cls = $ok ? 'ok' : 'bad';
    return '<span class="badge ' . $cls . '">' . h($ok ? $yes : $no) . '</span>';
}

/**
 * نوشتن .htaccess در ریشهٔ سایت که بدون تغییر Document Root، لاراول را سرو می‌کند.
 * ترتیب قواعد مهم است: اول بستن دسترسی به هسته، بعد توقف بازنویسی،
 * بعد فایل استاتیک و در آخر front controller.
 */
function write_root_router(string $backend, string $docroot, string &$error): bool
{
    if (!str_starts_with($backend, $docroot . '/')) {
        $error = 'پوشهٔ لاراول داخل Document Root نیست؛ این روش کار نمی‌کند و باید Document Root را تغییر دهید.';
        return false;
    }

    $rel = trim(substr($backend, strlen($docroot)), '/');
    $relRe = preg_quote($rel, '/');

    $tpl = <<<'HTACCESS'
# ─── تاکسینو | Taxino — Router خودکار (ساختهٔ cpanel-doctor.php) ───
# لاراول در «%1$s» است و از همین پوشه سرو می‌شود.
# برای بازگرداندن: این فایل را حذف کنید و .htaccess.doctor-backup را برگردانید.

<IfModule mod_autoindex.c>
    Options -Indexes
</IfModule>

# امنیت: فایل‌های حساس هرگز سرو نشوند
<FilesMatch "^\.">
    Require all denied
</FilesMatch>
<FilesMatch "(^|/)\.env">
    Require all denied
</FilesMatch>

<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteBase /

    # ۰) مسیرهای حساس هسته را حتی اگر فایل واقعی باشند سرو نکن
    RewriteRule ^%1$s/public/(?!index\.php) - [L]
    RewriteRule ^%1$s/(app|config|database|routes|resources|bootstrap|storage|bin|tests|vendor)(/|$) - [F,L]
    RewriteRule ^%1$s/(\.env|\.env\..*|composer\.(json|lock)|artisan|phpunit\.xml)($|/) - [F,L]

    # ۱) هر درخواستی که فایل واقعی در public دارد → مستقیم سرو شود
    RewriteCond %{DOCUMENT_ROOT}/%1$s/public%{REQUEST_URI} -f
    RewriteRule ^ %1$s/public%{REQUEST_URI} [L]

    # ۲) بقیه → front controller لاراول
    RewriteCond %{DOCUMENT_ROOT}/%1$s/public/index.php -f
    RewriteRule ^ %1$s/public/index.php [L]
</IfModule>

<IfModule mod_headers.c>
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-Frame-Options "SAMEORIGIN"
</IfModule>
HTACCESS;

    $htaccess = sprintf($tpl, $rel);

    $target = $docroot . '/.htaccess';
    if (is_file($target) && !is_file($docroot . '/.htaccess.doctor-backup')) {
        @copy($target, $docroot . '/.htaccess.doctor-backup');
    }
    if (@file_put_contents($target, $htaccess) === false) {
        $error = 'نوشتن .htaccess ممکن نشد (مجوز پوشهٔ Document Root را بررسی کنید).';
        return false;
    }

    return true;
}

// ───────────────────────────── منطق درخواست ─────────────────────────────

$action = (string) ($_GET['action'] ?? '');
$key = (string) ($_GET['key'] ?? '');
$backend = find_backend();
$home = null;
foreach (candidate_roots() as $root) {
    if (basename($root) === 'taxi-app') {
        $home = $root;
        break;
    }
}
if ($home === null && $backend !== null && basename($backend) === APP_FOLDER) {
    $home = dirname($backend);
}

$messages = [];
$didExtract = false;
$docroot = rtrim((string) ($_SERVER['DOCUMENT_ROOT'] ?? ''), '/');
if ($docroot === '') {
    $docroot = __DIR__;
}

if ($action === 'extract') {
    // کلید امنیتی از فایل bin/.install-key خوانده می‌شود (خودتان در File Manager بسازید)
    $keyFile = __DIR__ . '/.install-key';
    if (!is_file($keyFile)) {
        $messages[] = ['bad', 'فایل کلید پیدا نشد. در File Manager کنار همین فایل، فایلی به نام <code>.install-key</code> بسازید و داخلش یک عبارت دلخواه بنویسید، سپس دوباره تلاش کنید.'];
    } elseif (trim((string) @file_get_contents($keyFile)) !== $key || $key === '') {
        $messages[] = ['bad', 'کلید نادرست است. مقدار داخل فایل <code>.install-key</code> را دقیقاً در آدرس <code>&amp;key=...</code> بگذارید.'];
    } elseif ($home === null) {
        $messages[] = ['bad', 'پوشهٔ مقصد (<code>~/taxi-app</code>) پیدا نشد.'];
    } else {
        // ZIPها را در چند مسیر محتمل بگرد (ریشهٔ سایت، ~/taxi-app، خانه)
        $searchDirs = array_values(array_unique(array_filter([
            $home, $docroot, __DIR__, dirname($docroot),
        ])));
        $zips = [];
        $zipDir = null;
        foreach ($searchDirs as $dir) {
            if (!is_dir($dir)) {
                continue;
            }
            $found = (array) glob($dir . '/' . ZIP_PREFIX . '*.zip') ?: [];
            if ($found !== []) {
                $zips = $found;
                $zipDir = $dir;
                break;
            }
        }

        if ($zips === []) {
            $messages[] = ['bad', 'هیچ فایل <code>' . ZIP_PREFIX . '*.zip</code> پیدا نشد. این مسیرها بررسی شدند: '
                . '<br><code class="path">' . h(implode('</code><br><code class="path">', $searchDirs)) . '</code>'];
        } else {
            $messages[] = ['info', 'ZIPها در <code>' . h((string) $zipDir) . '</code> پیدا شدند؛ مقصد استخراج: <code>' . h((string) $home) . '</code>'];
            if (!is_dir((string) $home)) {
                @mkdir((string) $home, 0755, true);
            }
            sort($zips);
            $messages[] = ['info', 'در حال استخراج ' . count($zips) . ' بسته در <code>' . h($home) . '</code>'];
            foreach ($zips as $zipPath) {
                $error = '';
                $n = extract_zip($zipPath, $home, $error);
                if ($error !== '') {
                    $messages[] = ['bad', basename($zipPath) . ' → ' . h($error)];
                } else {
                    $messages[] = ['ok', basename($zipPath) . ' → ' . $n . ' فایل'];
                }
            }
            $didExtract = true;
            $backend = find_backend();

            if ($backend !== null) {
                @chmod($backend . '/storage', 0775);
                foreach (['storage', 'bootstrap/cache'] as $dir) {
                    $path = $backend . '/' . $dir;
                    if (!is_dir($path)) {
                        @mkdir($path, 0775, true);
                    }
                }
                $messages[] = ['ok', 'پوشه‌های storage و bootstrap/cache آماده شدند.'];
            }

            // پاک‌سازی ZIPها
            foreach ($zips as $zipPath) {
                @unlink($zipPath);
            }
            $messages[] = ['ok', 'فایل‌های ZIP پاک شدند.'];
        }
    }
}

if ($action === 'router') {
    $keyFile = __DIR__ . '/.install-key';
    if (!is_file($keyFile)) {
        $messages[] = ['bad', 'فایل کلید پیدا نشد. فایلی به نام <code>.install-key</code> کنار همین فایل بسازید و عبارت دلخواهی در آن بنویسید.'];
    } elseif (trim((string) @file_get_contents($keyFile)) !== $key || $key === '') {
        $messages[] = ['bad', 'کلید نادرست است.'];
    } elseif ($backend === null) {
        $messages[] = ['bad', 'پوشهٔ laravel-backend پیدا نشد؛ اول بسته‌ها را آپلود/استخراج کنید.'];
    } else {
        $error = '';
        if (write_root_router($backend, $docroot, $error)) {
            $messages[] = ['ok', 'فایل <code>.htaccess</code> در <code>' . h($docroot) . '</code> ساخته شد. حالا <a href="/up" target="_blank">/up</a> را باز کنید.'];
            $messages[] = ['info', 'نسخهٔ قبلی (اگر بود) در <code>.htaccess.doctor-backup</code> نگه داشته شد.'];
        } else {
            $messages[] = ['bad', h($error)];
        }
    }
}

$env = $backend !== null ? env_facts($backend) : ['exists' => false, 'rows' => []];
$checks = $backend !== null ? required_files($backend) : [];
$phpOk = version_compare(PHP_VERSION, '8.4.0', '>=');
$extensions = ['mbstring', 'openssl', 'pdo_mysql', 'fileinfo', 'ctype', 'json', 'tokenizer', 'xml', 'bcmath', 'zip', 'curl'];
$missingExt = array_values(array_filter($extensions, static fn ($e) => !extension_loaded($e)));
$publicIsDocroot = $backend !== null && realpath($docroot) === realpath($backend . '/public');

?>
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>تاکسینو · ابزار تشخیص cPanel</title>
<style>
    :root { --bg:#0b1420; --card:#132132; --line:#22374d; --fg:#e8f0f8; --dim:#8fa6bd; --ok:#28c76f; --bad:#ea5455; --warn:#ff9f43; --brand:#fdb400; }
    * { box-sizing:border-box; }
    body { margin:0; padding:24px; font-family:Vazirmatn,Segoe UI,Tahoma,sans-serif; background:var(--bg); color:var(--fg); line-height:1.9; }
    .wrap { max-width:1080px; margin:0 auto; }
    h1 { font-size:22px; margin:0 0 4px; }
    h2 { font-size:17px; margin:28px 0 10px; padding-bottom:6px; border-bottom:1px solid var(--line); color:var(--brand); }
    .sub { color:var(--dim); font-size:13px; margin-bottom:18px; }
    .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px 18px; margin:14px 0; }
    table { width:100%; border-collapse:collapse; font-size:13.5px; }
    th,td { text-align:right; padding:7px 9px; border-bottom:1px solid var(--line); vertical-align:top; }
    th { color:var(--dim); font-weight:600; font-size:12.5px; }
    code { background:#0a1622; padding:2px 6px; border-radius:5px; font-family:ui-monospace,Menlo,Consolas,monospace; direction:ltr; display:inline-block; font-size:12.5px; }
    .badge { display:inline-block; padding:1px 9px; border-radius:20px; font-size:12px; font-weight:700; white-space:nowrap; }
    .badge.ok { background:rgba(40,199,111,.15); color:var(--ok); }
    .badge.bad { background:rgba(234,84,85,.15); color:var(--bad); }
    .badge.warn { background:rgba(255,159,67,.15); color:var(--warn); }
    .msg { padding:9px 13px; border-radius:9px; margin:7px 0; font-size:13.5px; border-right:4px solid; }
    .msg.ok { background:rgba(40,199,111,.1); border-color:var(--ok); }
    .msg.bad { background:rgba(234,84,85,.1); border-color:var(--bad); }
    .msg.info { background:rgba(143,166,189,.1); border-color:var(--dim); }
    .verdict { font-size:16px; font-weight:700; padding:14px 18px; border-radius:12px; margin:16px 0; }
    .verdict.good { background:rgba(40,199,111,.13); border:1px solid var(--ok); }
    .verdict.bad { background:rgba(234,84,85,.13); border:1px solid var(--bad); }
    .k { color:var(--dim); }
    .path { direction:ltr; text-align:left; font-family:ui-monospace,monospace; font-size:12.5px; }
    .steps { margin:0; padding-right:20px; }
    .steps li { margin:6px 0; }
    a { color:var(--brand); }
</style>
</head>
<body>
<div class="wrap">
    <h1>🔍 ابزار تشخیص و نصب تاکسینو روی cPanel</h1>
    <div class="sub">این صفحه وضعیت واقعی سرور را نشان می‌دهد. <b>بعد از پایان کار این فایل را پاک کنید.</b></div>

    <?php foreach ($messages as [$kind, $text]): ?>
        <div class="msg <?= h($kind) ?>"><?= $text ?></div>
    <?php endforeach; ?>

    <!-- نتیجهٔ کلی -->
    <?php if ($backend === null): ?>
        <div class="verdict bad">
            ❌ پوشهٔ <code>laravel-backend</code> روی این سرور پیدا نشد.<br>
            <span style="font-weight:400;font-size:14px">یعنی فایل‌های آپلودشده در مسیری هستند که این کد به آن دسترسی ندارد، یا هنوز آپلود نشده‌اند.</span>
        </div>
    <?php elseif ($publicIsDocroot): ?>
        <div class="verdict good">
            ✅ همه‌چیز درست است: Document Root روی <code>laravel-backend/public</code> تنظیم شده.
        </div>
    <?php else: ?>
        <div class="verdict bad">
            ⚠️ فایل‌ها پیدا شدند، ولی <b>Document Root اشتباه است</b>.<br>
            <span style="font-weight:400;font-size:14px">
                الان سایت از <code class="path"><?= h($docroot) ?></code> سرو می‌شود،
                در حالی که باید از <code class="path"><?= h($backend . '/public') ?></code> سرو شود.
            </span>
        </div>
    <?php endif; ?>

    <!-- اطلاعات پایه -->
    <h2>۱. اطلاعات محیط</h2>
    <div class="card">
        <table>
            <tr><th style="width:190px">نسخهٔ PHP</th>
                <td><code><?= h(PHP_VERSION) ?></code> <?= badge($phpOk, '۸.۴ یا بالاتر ✓', 'قدیمی — حداقل 8.4 لازم است') ?></td></tr>
            <tr><th>وضعیت PHP</th><td><?= h(PHP_SAPI) ?></td></tr>
            <tr><th>Document Root فعلی</th><td><code class="path"><?= h($docroot) ?></code></td></tr>
            <tr><th>مسیر این فایل</th><td><code class="path"><?= h(__DIR__) ?></code></td></tr>
            <tr><th>پوشهٔ کاربر (HOME)</th><td><code class="path"><?= h($home ?? '(نامشخص)') ?></code></td></tr>
            <tr><th>پوشهٔ لاراول</th>
                <td><?= $backend !== null ? '<code class="path">' . h($backend) . '</code>' : badge(false, '', 'پیدا نشد') ?></td></tr>
            <tr><th>افزونه‌های PHP</th>
                <td><?= $missingExt === []
                    ? badge(true, 'همه موجود ✓')
                    : badge(false, '', 'ناقص: ' . h(implode(', ', $missingExt))) ?></td></tr>
            <tr><th>ZipArchive</th><td><?= badge(class_exists('ZipArchive'), 'فعال ✓', 'غیرفعال') ?></td></tr>
            <tr><th>حجم آپلود مجاز</th>
                <td><code><?= h((string) ini_get('upload_max_filesize')) ?></code> ·
                    <code><?= h((string) ini_get('post_max_size')) ?></code></td></tr>
        </table>
    </div>

    <!-- چک‌لیست -->
    <?php if ($backend !== null): ?>
    <h2>۲. چک‌لیست فایل‌های حیاتی</h2>
    <div class="card">
        <table>
            <tr><th style="width:60px">وضعیت</th><th>فایل</th><th>توضیح</th><th style="width:90px">نوشتنی</th></tr>
            <?php foreach ($checks as $row): ?>
            <tr>
                <td><?= $row['exists'] ? badge(true, '✓', '') : badge(false, '', '✗') ?></td>
                <td><code class="path"><?= h($row['path']) ?></code></td>
                <td class="k"><?= h($row['label']) ?></td>
                <td><?= $row['writable'] === null ? '<span class="k">—</span>'
                    : ($row['writable'] ? badge(true, 'بله ✓', '') : badge(false, '', 'خیر')) ?></td>
            </tr>
            <?php endforeach; ?>
        </table>
    </div>
    <?php endif; ?>

    <!-- .env -->
    <?php if ($backend !== null): ?>
    <h2>۳. فایل تنظیمات <code>.env</code></h2>
    <div class="card">
        <?php if (!$env['exists']): ?>
            <div class="msg bad">
                فایل <code>.env</code> وجود ندارد. بسازید: در File Manager روی
                <code>.env.production.example</code> راست‌کلیک → Copy → نام <code>.env</code>،
                سپس Edit کنید و دیتابیس/رمز مدیر را پر کنید.
            </div>
        <?php else: ?>
            <table>
                <tr><th style="width:230px">کلید</th><th>مقدار</th></tr>
                <?php foreach ($env['rows'] as $k => $v): ?>
                <tr>
                    <td><code><?= h($k) ?></code></td>
                    <td><?= $v['secret'] ? badge($v['ok'], $v['value'], $v['value']) : '<code>' . h($v['value']) . '</code>' ?>
                        <?php if (!$v['ok']): ?><span class="badge bad">خالی</span><?php endif; ?></td>
                </tr>
                <?php endforeach; ?>
            </table>
        <?php endif; ?>
    </div>
    <?php endif; ?>

    <!-- آدرس‌های تست -->
    <h2>۴. تست مسیرهای واقعی سایت</h2>
    <div class="card">
        <table>
            <tr><th>آدرس</th><th style="width:130px">باید چه باشد</th></tr>
            <tr><td><code class="path">/up</code></td><td><span class="badge ok">200 OK</span></td></tr>
            <tr><td><code class="path">/api/csrf</code></td><td><span class="badge warn">JSON</span></td></tr>
            <tr><td><code class="path">/</code></td><td><span class="badge ok">صفحهٔ ورود تاکسینو</span></td></tr>
            <tr><td><code class="path">/taxi.html</code></td><td><span class="badge ok">۲۰۰</span></td></tr>
        </table>
        <p class="k" style="font-size:13px;margin:12px 0 0">
            الان باز کنید و نتیجه را ببینید:
            <a href="/up" target="_blank">/up</a> ·
            <a href="/api/csrf" target="_blank">/api/csrf</a> ·
            <a href="/taxi.html" target="_blank">/taxi.html</a>
        </p>
    </div>

    <!-- مسیرهای پیدا شده -->
    <h2>۵. مسیرهایی که بررسی شد</h2>
    <div class="card">
        <table>
            <?php foreach (candidate_roots() as $root): ?>
            <tr>
                <td><?= is_file($root . '/artisan') || is_file($root . '/' . APP_FOLDER . '/artisan')
                    ? badge(true, 'لاراول ✓', '')
                    : badge(false, '', 'خالی') ?></td>
                <td><code class="path"><?= h($root) ?></code></td>
                <td class="k"><?= is_dir($root) ? 'وجود دارد' : 'وجود ندارد' ?></td>
            </tr>
            <?php endforeach; ?>
        </table>
    </div>

    <!-- اقدام بعدی -->
    <h2>۶. اقدام بعدی</h2>
    <div class="card">
        <?php if ($backend === null): ?>
            <ol class="steps">
                <li>ZIPهای <code>taxi-cpanel-*.zip</code> را در این پوشه آپلود کنید: <code class="path"><?= h($home ?: '/home/USERNAME') ?>/taxi-app</code></li>
                <li>در File Manager کنار همین فایل، فایلی به نام <code>.install-key</code> بسازید و داخلش هر عبارتی بنویسید (مثلاً <code>taxino2026</code>).</li>
                <li>این آدرس را باز کنید: <code class="path">/cpanel-doctor.php?action=extract&amp;key=taxino2026</code></li>
            </ol>
        <?php elseif (!$publicIsDocroot): ?>
            <p style="margin:0 0 10px"><b>راه ۱ (توصیه‌شده) — با یک دکمه:</b></p>
            <ol class="steps">
                <li>یک فایل به نام <code>.install-key</code> کنار همین فایل بسازید و داخلش یک عبارت بگذارید (مثلاً <code>taxino2026</code>).</li>
                <li>این آدرس را باز کنید:
                    <br><code class="path">/cpanel-doctor.php?action=router&amp;key=taxino2026</code></li>
                <li>بعد <a href="/up" target="_blank">/up</a> را باز کنید.</li>
            </ol>
            <p class="k" style="font-size:13px;margin:14px 0 8px">
                این کار یک <code>.htaccess</code> در ریشهٔ سایت می‌سازد که خودش درخواست‌ها را
                به <code class="path"><?= h(basename((string) $backend)) ?>/public</code> می‌فرستد —
                بدون نیاز به تغییر Document Root.
            </p>
            <hr style="border:none;border-top:1px solid #22374d;margin:16px 0">
            <p style="margin:0 0 10px"><b>راه ۲ (تمیزترین) — تغییر Document Root در cPanel:</b></p>
            <ol class="steps">
                <li><b>cPanel → Domains</b> → روی <code>taxi.karen-soft.ir</code> → <b>Manage</b></li>
                <li><b>Document Root</b> را عوض کنید به:
                    <br>مطلق: <code class="path"><?= h($backend . '/public') ?></code></li>
                <li>ذخیره کنید، فایل <code>.htaccess</code> ساخته‌شده در ریشه را پاک کنید، و این صفحه را دوباره باز کنید.</li>
            </ol>
        <?php else: ?>
            <ol class="steps">
                <li>در <b>cPanel → Terminal</b> اجرا کنید:
                    <br><code class="path">cd <?= h($backend) ?> &amp;&amp; bash bin/cpanel-setup.sh</code></li>
                <li>سپس این آدرس را باز کنید: <a href="/up" target="_blank">/up</a> — باید <b>200 OK</b> بدهد.</li>
                <li>و در پایان <b>همین فایل <code>cpanel-doctor.php</code> را از سرور حذف کنید</b>.</li>
            </ol>
        <?php endif; ?>
    </div>

    <p class="k" style="font-size:12px;text-align:center;margin:32px 0 8px">
        تاکسینو | Taxino · کارن‌سافت — ابزار تشخیص cPanel · <?= h(date('Y-m-d H:i')) ?>
    </p>
</div>
</body>
</html>
