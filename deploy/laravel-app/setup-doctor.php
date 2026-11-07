<?php
/**
 * setup-doctor.php — عیب‌یابی و اصلاح زندهٔ راه‌اندازی «تاکسینو | Taxino»
 * ────────────────────────────────────────────────────────────────────────
 * این فایل را در ریشهٔ لاراول بگذارید (همان پوشه‌ای که artisan هست):
 *      /home/karensof/public_html/laravel-backend/
 *
 * سپس این آدرس را باز کنید:
 *      https://taxi.karen-soft.ir/setup-doctor.php
 *
 * 🟢 هیچ کلید/رمزی لازم نیست. فقط می‌خواند و تست می‌کند.
 * 🔴 در پایان همین فایل را حذف کنید.
 */

declare(strict_types=1);

// ─────────────────────── تشخیص ریشهٔ لاراول ───────────────────────
function laravel_root(): ?string
{
    $candidates = [__DIR__, dirname(__DIR__), __DIR__ . '/laravel-backend', dirname(__DIR__) . '/laravel-backend'];
    foreach ($candidates as $dir) {
        $dir = str_replace('//', '/', $dir);
        if (is_file($dir . '/artisan') && is_file($dir . '/composer.json')) {
            return $dir;
        }
    }
    foreach ((array) @glob('/home/*/public_html', GLOB_ONLYDIR) as $base) {
        foreach (['', '/laravel-backend'] as $suffix) {
            if (is_file($base . $suffix . '/artisan')) {
                return $base . $suffix;
            }
        }
    }
    return null;
}

/** خواندن همهٔ کلیدهای .env */
function env_all(string $file): array
{
    $out = [];
    if (!is_file($file)) {
        return $out;
    }
    foreach ((array) @file($file, FILE_IGNORE_NEW_LINES) as $line) {
        $line = (string) $line;
        if (preg_match('/^\s*#/', $line) || !str_contains($line, '=')) {
            continue;
        }
        [$k, $v] = explode('=', $line, 2);
        $k = trim($k);
        if ($k === '') {
            continue;
        }
        $v = trim($v);
        if (strlen($v) >= 2 && ($v[0] === '"' || $v[0] === "'") && $v[strlen($v) - 1] === $v[0]) {
            $v = substr($v, 1, -1);
        }
        $out[$k] = $v;
    }
    return $out;
}

function h(?string $s): string
{
    return htmlspecialchars((string) $s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function badge(string $state, string $text): string
{
    return '<span class="b ' . $state . '">' . h($text) . '</span>';
}

// ─────────────────────── اجرای بررسی‌ها ───────────────────────
$root = laravel_root();
$envPath = $root ? $root . '/.env' : null;
$env = $envPath ? env_all($envPath) : [];

$rows = [];
$problems = [];
$fixable = [];

$add = static function (string $name, string $state, string $detail, ?string $fix = null) use (&$rows, &$problems, &$fixable): void {
    $rows[] = ['name' => $name, 'state' => $state, 'detail' => $detail];
    if ($state === 'bad') {
        $problems[] = $name . ' — ' . strip_tags($detail);
        if ($fix !== null) {
            $fixable[] = $fix;
        }
    }
};

// ۱) ریشه
if ($root === null) {
    $add('ریشهٔ لاراول', 'bad', 'پیدا نشد. این فایل باید کنار <code>artisan</code> باشد.');
} else {
    $add('ریشهٔ لاراول', 'ok', '<code>' . h($root) . '</code>');
}

// ۲) PHP
$phpOk = version_compare(PHP_VERSION, '8.4.0', '>=');
$add('نسخهٔ PHP', $phpOk ? 'ok' : 'bad', h(PHP_VERSION) . ($phpOk ? '' : ' — باید ≥ 8.4 باشد'));

// ۳) افزونه‌های لازم
$exts = ['mbstring', 'openssl', 'pdo_mysql', 'fileinfo', 'ctype', 'json', 'tokenizer', 'xml', 'curl'];
$missingExt = array_values(array_filter($exts, static fn ($e) => !extension_loaded($e)));
$add('افزونه‌های PHP', $missingExt === [] ? 'ok' : 'bad',
    $missingExt === [] ? 'همه موجود' : 'غایب: <code>' . h(implode(', ', $missingExt)) . '</code>');

// ۴) .env
$envReady = $env !== [];
$add('.env', $envReady ? 'ok' : 'bad',
    $envReady ? 'خوانده شد (' . count($env) . ' کلید)' : 'نیست یا خالی است');

// ۵) APP_KEY
$appKey = (string) ($env['APP_KEY'] ?? '');
$keyOk = str_starts_with($appKey, 'base64:') && strlen($appKey) >= 44;
if ($keyOk) {
    $decoded = base64_decode(substr($appKey, 7), true);
    $keyOk = $decoded !== false && strlen($decoded) === 32;
}
$add('APP_KEY', $keyOk ? 'ok' : 'bad',
    $keyOk ? 'معتبر · ۳۲ بایت (' . substr($appKey, 0, 16) . '…)' : 'خالی یا نامعتبر است');

// ۶) مقادیر placeholder در .env
$placeholders = ['CPANELUSER', 'CHANGE_ME', 'رمز_واقعی'];
$leftover = [];
foreach ($env as $k => $v) {
    foreach ($placeholders as $p) {
        if ($v !== '' && str_contains($v, $p)) {
            $leftover[$k] = $v;
            break;
        }
    }
}
if ($leftover !== []) {
    $list = '';
    foreach (array_keys($leftover) as $k) {
        $list .= '<code>' . h((string) $k) . '</code> ';
    }
    $add('مقادیر placeholder', 'bad', 'این کلیدها هنوز مقدار نمونه دارند: ' . $list);
} else {
    $add('مقادیر placeholder', 'ok', 'هیچ placeholder باقی نمانده');
}

// ۷) تست واقعی اتصال دیتابیس
$dbError = null;
$dbInfo = '';
$dbOk = false;
if ($envReady && ($env['DB_CONNECTION'] ?? '') === 'mysql') {
    $host = (string) ($env['DB_HOST'] ?? '127.0.0.1');
    $port = (int) ($env['DB_PORT'] ?? 3306);
    $db   = (string) ($env['DB_DATABASE'] ?? '');
    $user = (string) ($env['DB_USERNAME'] ?? '');
    $pass = (string) ($env['DB_PASSWORD'] ?? '');
    try {
        $pdo = @new PDO(
            "mysql:host={$host};port={$port};dbname={$db}",
            $user,
            $pass,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 5]
        );
        $dbOk = true;
        $dbInfo = 'متصل شد به <code>' . h($db) . '</code> با کاربر <code>' . h($user) . '</code>';
        // آیا جدول‌ها ساخته شده‌اند؟
        $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
        $need = ['users', 'sessions', 'migrations', 'stores'];
        $miss = array_values(array_filter($need, static fn ($t) => !in_array($t, $tables, true)));
        if ($miss !== []) {
            $dbInfo .= '<br>⚠️ جدول‌های غایب: <code>' . h(implode(', ', $miss)) . '</code> — <b>migrate اجرا نشده</b>';
            $problems[] = 'migrate --seed اجرا نشده (جدول‌ها ساخته نشده‌اند)';
        } else {
            $dbInfo .= '<br>✓ جدول‌ها ساخته شده‌اند (' . count($tables) . ' جدول)';
            // آیا حساب مدیر هست؟
            try {
                $mgr = (string) ($env['TAXI_MANAGER_EMAIL'] ?? '');
                if ($mgr !== '') {
                    $st = $pdo->prepare('SELECT COUNT(*) FROM users WHERE email = ? AND role = ?');
                    $st->execute([$mgr, 'manager']);
                    $cnt = (int) $st->fetchColumn();
                    $dbInfo .= $cnt > 0
                        ? '<br>✓ حساب مدیر <code>' . h($mgr) . '</code> ساخته شده'
                        : '<br>⚠️ حساب مدیر <code>' . h($mgr) . '</code> ساخته نشده — seed اجرا نشده';
                    if ($cnt === 0) {
                        $problems[] = 'حساب مدیر کل ساخته نشده (seed اجرا نشده)';
                    }
                }
            } catch (Throwable $e) {
                $dbInfo .= '<br>⚠️ بررسی حساب مدیر ناموفق: ' . h($e->getMessage());
            }
        }
    } catch (Throwable $e) {
        $dbError = $e->getMessage();
    }
}
if ($dbError !== null) {
    $msg = $dbError;
    $hint = '';
    if (str_contains($msg, '1045')) {
        $hint = 'نام کاربر یا رمز دیتابیس غلط است';
    } elseif (str_contains($msg, '1049')) {
        $hint = 'دیتابیسی با این نام وجود ندارد (نام در cPanel را چک کنید)';
    } elseif (str_contains($msg, '2002') || str_contains($msg, 'timed out')) {
        $hint = 'هاست/پورت اشتباه است — معمولاً <code>127.0.0.1</code> و <code>3306</code>';
    }
    $add('اتصال دیتابیس', 'bad', '<b>' . h($hint ?: 'ناموفق') . '</b><br><code>' . h(substr($msg, 0, 180)) . '</code>');
} elseif ($dbOk) {
    $add('اتصال دیتابیس', 'ok', $dbInfo);
} elseif (!$envReady) {
    $add('اتصال دیتابیس', 'skip', 'چون .env خوانده نشد، تست نشد');
} else {
    $add('اتصال دیتابیس', 'skip', 'DB_CONNECTION=mysql نیست');
}

// ۸) پوشه‌های قابل نوشتن
$writable = [];
foreach (['storage', 'bootstrap/cache', 'storage/logs', 'storage/framework/sessions'] as $d) {
    $p = $root ? $root . '/' . $d : null;
    $writable[$d] = $p !== null && is_dir($p) && is_writable($p);
}
$badWritable = array_keys(array_filter($writable, static fn ($v) => !$v));
$add('مجوز نوشتن', $badWritable === [] ? 'ok' : 'bad',
    $badWritable === [] ? 'storage و bootstrap/cache قابل نوشتن‌اند' : 'قابل نوشتن نیست: <code>' . h(implode(', ', $badWritable)) . '</code>');

// ۹) کش config
$configCache = $root && is_file($root . '/bootstrap/cache/config.php');
$add('کش config', $configCache ? 'warn' : 'ok',
    $configCache ? 'فایل <code>bootstrap/cache/config.php</code> هست — بعد از تغییر .env باید پاک شود' : 'پاک است (مقدار تازهٔ .env خوانده می‌شود)');

// ۱۰) بررسی زندهٔ خود لاراول (بدون HTTP)
$bootError = null;
if ($root !== null && $envReady && is_file($root . '/vendor/autoload.php')) {
    try {
        require_once $root . '/vendor/autoload.php';
        $app = require $root . '/bootstrap/app.php';
        $kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
        $kernel->bootstrap();
        // اگر APP_KEY بخواند و DB کار کند، اینجا سالم است
        $app->make('encrypter')->encrypt('ping');
        $add('بوت کامل لاراول', 'ok', 'اپلیکیشن بوت شد و سرویس‌ها ساخته شدند');
    } catch (Throwable $e) {
        $bootError = get_class($e) . ': ' . $e->getMessage();
        $add('بوت کامل لاراول', 'bad', '<code>' . h(substr($bootError, 0, 220)) . '</code>');
    }
} else {
    $add('بوت کامل لاراول', 'skip', 'پیش‌نیازها نبود');
}

// ۱۱) نشت عمومی فایل‌های حساس
$add('فایل‌های حساس', 'warn',
    'لاگ <code>storage/logs/laravel.log</code> و کل درخت لاراول از اینترنت قابل خواندن است — بعد از راه‌اندازی با <code>.htaccess</code> ریشه بسته می‌شود');

// ─────────────────────── نوشتن مستقیم .env ───────────────────────
$writeResult = null;

if (($_POST['write_env'] ?? '') === '1' && $root !== null) {
    // مقادیر فرم
    $nDb   = trim((string) ($_POST['w_db'] ?? ''));
    $nUser = trim((string) ($_POST['w_user'] ?? ''));
    $nPass = (string) ($_POST['w_pass'] ?? '');
    $nMgrPw = (string) ($_POST['w_mgrpw'] ?? '');

    $template = $root . '/.env.production.example';
    $source = is_file($envPath ?? '') && (env_all((string) $envPath) !== [])
        ? (string) @file_get_contents((string) $envPath)
        : (is_file($template) ? (string) @file_get_contents($template) : '');

    if ($source === '') {
        $writeResult = ['bad', 'نه .env سالم هست و نه .env.production.example — نمی‌توان ساخت.'];
    } elseif ($nDb === '' || $nUser === '') {
        $writeResult = ['bad', 'نام دیتابیس و نام کاربر الزامی است.'];
    } else {
        $set = static function (string $text, string $key, string $val): string {
            $pattern = '/^\s*' . preg_quote($key, '/') . '\s*=.*$/m';
            $line = $key . '=' . $val;
            if (preg_match($pattern, $text) === 1) {
                return (string) preg_replace($pattern, str_replace(['\\', '$'], ['\\\\', '\\$'], $line), $text, 1);
            }
            return rtrim($text, "\n") . "\n" . $line . "\n";
        };

        $out = $source;

        // APP_KEY تازه — همیشه (کلید قبلی لو رفته بود)
        $out = $set($out, 'APP_KEY', 'base64:' . base64_encode(random_bytes(32)));

        // دیتابیس
        $out = $set($out, 'DB_CONNECTION', 'mysql');
        $out = $set($out, 'DB_HOST', '127.0.0.1');
        $out = $set($out, 'DB_PORT', '3306');
        $out = $set($out, 'DB_DATABASE', $nDb);
        $out = $set($out, 'DB_USERNAME', $nUser);
        $out = $set($out, 'DB_PASSWORD', '"' . str_replace('"', '', $nPass) . '"');

        // رمز مدیر
        if ($nMgrPw !== '') {
            if (strlen($nMgrPw) < 8) {
                $writeResult = ['bad', 'رمز مدیر باید حداقل ۸ کاراکتر باشد.'];
            }
            $out = $set($out, 'TAXI_MANAGER_PASSWORD', '"' . str_replace('"', '', $nMgrPw) . '"');
        }
        if ((string) ($env['TAXI_MANAGER_EMAIL'] ?? '') === '') {
            $out = $set($out, 'TAXI_MANAGER_EMAIL', 'admin@karen-soft.ir');
        }

        if ($writeResult === null) {
            $tmp = (string) $envPath . '.tmp' . bin2hex(random_bytes(4));
            if (@file_put_contents($tmp, $out) === false) {
                $writeResult = ['bad', 'نوشتن فایل موقت ناموفق بود — مجوز پوشه را چک کنید.'];
            } else {
                @chmod($tmp, 0644);
                if (@rename($tmp, (string) $envPath)) {
                    $cleared = [];
                    foreach ((array) @glob($root . '/bootstrap/cache/*.php') ?: [] as $f) {
                        if (@unlink($f)) {
                            $cleared[] = basename((string) $f);
                        }
                    }
                    $writeResult = ['ok', 'فایل .env نوشته شد و کش پاک شد' . ($cleared !== [] ? ' (' . implode(', ', $cleared) . ')' : '') . '. حالا صفحه را دوباره باز کنید.'];
                } else {
                    @unlink($tmp);
                    $writeResult = ['bad', 'جایگزینی .env ناموفق بود — مجوز فایل را چک کنید.'];
                }
            }
        }
    }
}

// ─────────────────────── مرتب‌سازی خروجی ───────────────────────
$badCount = count(array_filter($rows, static fn ($r) => $r['state'] === 'bad'));
$okCount  = count(array_filter($rows, static fn ($r) => $r['state'] === 'ok'));
$verdict = $badCount === 0
    ? ['good', '✅ همه‌چیز سالم است — سایت باید بالا بیاید']
    : ['bad', '❌ ' . $badCount . ' مورد مانده'];
?><!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>عیب‌یابی راه‌اندازی · تاکسینو</title>
<style>
  :root{--bg:#0b1420;--card:#132132;--line:#22374d;--fg:#e8f0f8;--dim:#8fa6bd;--ok:#28c76f;--bad:#ea5455;--warn:#ff9f43;--brand:#fdb400;--skip:#8fa6bd}
  *{box-sizing:border-box}
  body{margin:0;padding:22px;font-family:Vazirmatn,Tahoma,sans-serif;background:var(--bg);color:var(--fg);line-height:1.9}
  .w{max-width:1000px;margin:0 auto}
  h1{font-size:21px;margin:0 0 4px}
  h2{font-size:16px;color:var(--brand);margin:26px 0 10px;border-bottom:1px solid var(--line);padding-bottom:7px}
  .sub{color:var(--dim);font-size:13px;margin-bottom:16px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:12px 0}
  table{width:100%;border-collapse:collapse;font-size:13.5px}
  th,td{text-align:right;padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top}
  th{color:var(--dim);width:170px;font-weight:600}
  code{direction:ltr;display:inline-block;background:#0a1622;padding:2px 7px;border-radius:5px;font-family:monospace;font-size:12.5px;word-break:break-all}
  .b{display:inline-block;padding:1px 9px;border-radius:20px;font-size:12px;font-weight:700;white-space:nowrap}
  .b.ok{background:rgba(40,199,111,.15);color:var(--ok)}
  .b.bad{background:rgba(234,84,85,.15);color:var(--bad)}
  .b.warn{background:rgba(255,159,67,.15);color:var(--warn)}
  .b.skip{background:rgba(143,166,189,.15);color:var(--skip)}
  .verdict{font-size:15px;font-weight:700;padding:13px 17px;border-radius:12px;margin:14px 0}
  .verdict.good{background:rgba(40,199,111,.13);border:1px solid var(--ok)}
  .verdict.bad{background:rgba(234,84,85,.13);border:1px solid var(--bad)}
  .fix{background:rgba(253,180,0,.08);border-right:4px solid var(--brand);padding:12px 16px;border-radius:9px;margin:10px 0;font-size:13.5px}
  ol{padding-right:20px;margin:8px 0}
  a{color:var(--brand)}
  .num{color:var(--dim);font-size:12px}
</style>
</head>
<body>
<div class="w">
<h1>🩺 عیب‌یابی راه‌اندازی</h1>
<div class="sub">بررسی زندهٔ سرور · بدون نیاز به کلید · <?= h(date('Y-m-d H:i:s')) ?></div>

<div class="verdict <?= $verdict[0] ?>"><?= h($verdict[1]) ?></div>

<h2>نتیجهٔ بررسی‌ها</h2>
<div class="card">
<table>
<?php foreach ($rows as $r): ?>
  <tr>
    <th><?= h($r['name']) ?></th>
    <td>
      <?php
      $label = ['ok' => 'سالم', 'bad' => 'مشکل', 'warn' => 'هشدار', 'skip' => 'رد شد'][$r['state']] ?? $r['state'];
      echo badge($r['state'], $label);
      ?>
      <br><span style="font-size:13px"><?= $r['detail'] ?></span>
    </td>
  </tr>
<?php endforeach; ?>
</table>
</div>

<?php if ($problems !== []): ?>
<h2>فهرست مشکلات</h2>
<div class="card">
<ol>
<?php foreach ($problems as $p): ?>
  <li><?= h($p) ?></li>
<?php endforeach; ?>
</ol>
</div>
<?php endif; ?>

<?php if ($dbError !== null): ?>
<h2>🔧 اصلاح سریع اتصال دیتابیس</h2>
<div class="fix">
  <b>مقادیر فعلی که استفاده می‌شود:</b>
  <table style="margin-top:8px">
    <tr><th>DB_DATABASE</th><td><code><?= h((string) ($env['DB_DATABASE'] ?? '—')) ?></code></td></tr>
    <tr><th>DB_USERNAME</th><td><code><?= h((string) ($env['DB_USERNAME'] ?? '—')) ?></code></td></tr>
    <tr><th>DB_PASSWORD</th><td><code><?= h(($env['DB_PASSWORD'] ?? '') === '' ? '(خالی)' : 'تنظیم شده (' . strlen((string) $env['DB_PASSWORD']) . ' کاراکتر)') ?></code></td></tr>
  </table>
  <p style="margin:12px 0 0">
    اگر نام دیتابیس یا کاربر واقعی چیز دیگری است، همین‌جا می‌توانید تست کنید:
  </p>
  <form method="post" style="margin-top:10px">
    <input type="hidden" name="probe" value="1">
    <p style="margin:6px 0"><label>DB_DATABASE <input name="db" value="<?= h((string) ($env['DB_DATABASE'] ?? '')) ?>" style="direction:ltr;padding:6px;border-radius:6px;border:1px solid #22374d;background:#0a1622;color:#e8f0f8;width:280px"></label></p>
    <p style="margin:6px 0"><label>DB_USERNAME <input name="usr" value="<?= h((string) ($env['DB_USERNAME'] ?? '')) ?>" style="direction:ltr;padding:6px;border-radius:6px;border:1px solid #22374d;background:#0a1622;color:#e8f0f8;width:280px"></label></p>
    <p style="margin:6px 0"><label>DB_PASSWORD <input name="pwd" type="password" style="direction:ltr;padding:6px;border-radius:6px;border:1px solid #22374d;background:#0a1622;color:#e8f0f8;width:280px"></label></p>
    <p><button type="submit" style="padding:9px 20px;border-radius:8px;border:1px solid #fdb400;background:rgba(253,180,0,.15);color:#fdb400;font-weight:700;font-family:inherit">تست اتصال</button></p>
  </form>
  <?php
  if (($_POST['probe'] ?? '') === '1') {
      $tDb = trim((string) ($_POST['db'] ?? ''));
      $tUs = trim((string) ($_POST['usr'] ?? ''));
      $tPw = (string) ($_POST['pwd'] ?? '');
      $tHost = (string) ($env['DB_HOST'] ?? '127.0.0.1');
      $tPort = (int) ($env['DB_PORT'] ?? 3306);
      echo '<div style="margin-top:10px">';
      try {
          $pdo2 = @new PDO("mysql:host={$tHost};port={$tPort};dbname={$tDb}", $tUs, $tPw,
              [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 5]);
          $t = $pdo2->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
          echo badge('ok', 'موفق') . ' اتصال برقرار شد — ' . count($t) . ' جدول پیدا شد.';
          echo '<br><span class="sub">حالا همین سه مقدار را در فایل <code>.env</code> بگذارید.</span>';
      } catch (Throwable $e) {
          echo badge('bad', 'ناموفق') . ' <code>' . h(substr($e->getMessage(), 0, 200)) . '</code>';
      }
      echo '</div>';
  }
  ?>
</div>
<?php endif; ?>

<?php if ($root !== null): ?>
<h2>✍️ نوشتن مستقیم <code>.env</code> (بدون File Manager)</h2>
<div class="card">
  <?php if ($writeResult !== null): ?>
    <div style="margin-bottom:14px"><?= badge($writeResult[0] === 'ok' ? 'ok' : 'bad', $writeResult[0] === 'ok' ? 'انجام شد' : 'ناموفق') ?> <?= h($writeResult[1]) ?></div>
  <?php endif; ?>
  <p class="sub" style="margin:0 0 12px">
    این فرم سه مقدار دیتابیس را می‌نویسد، <b>APP_KEY تازه</b> می‌سازد و کش را پاک می‌کند.
    بقیهٔ کلیدها دست‌نخورده می‌مانند.
  </p>
  <form method="post">
    <input type="hidden" name="write_env" value="1">
    <table style="max-width:640px">
      <tr><th style="width:210px">نام دیتابیس</th><td><input name="w_db" value="<?= h((string) ($env['DB_DATABASE'] ?? '')) ?>" placeholder="karensof_taxi" style="direction:ltr;padding:7px;border-radius:6px;border:1px solid #22374d;background:#0a1622;color:#e8f0f8;width:100%"></td></tr>
      <tr><th>نام کاربر دیتابیس</th><td><input name="w_user" value="<?= h((string) ($env['DB_USERNAME'] ?? '')) ?>" placeholder="karensof_taxi" style="direction:ltr;padding:7px;border-radius:6px;border:1px solid #22374d;background:#0a1622;color:#e8f0f8;width:100%"></td></tr>
      <tr><th>رمز دیتابیس</th><td><input name="w_pass" type="password" style="direction:ltr;padding:7px;border-radius:6px;border:1px solid #22374d;background:#0a1622;color:#e8f0f8;width:100%"></td></tr>
      <tr><th>رمز مدیر کل (اختیاری)</th><td><input name="w_mgrpw" value="oXcuZYk2Dw39kXjvsKxdJfi2" style="direction:ltr;padding:7px;border-radius:6px;border:1px solid #22374d;background:#0a1622;color:#e8f0f8;width:100%"></td></tr>
    </table>
    <p style="margin-top:14px">
      <button type="submit" style="padding:11px 26px;border-radius:9px;border:1px solid #28c76f;background:rgba(40,199,111,.18);color:#28c76f;font-weight:700;font-family:inherit;font-size:14px">💾 نوشتن .env و ساخت APP_KEY</button>
    </p>
  </form>
</div>
<?php endif; ?>

<h2>📋 خلاصهٔ مقادیر .env (رمزها مخفی)</h2>
<div class="card">
<table>
<?php
$show = ['APP_ENV', 'APP_URL', 'DB_CONNECTION', 'DB_HOST', 'DB_PORT', 'DB_DATABASE', 'DB_USERNAME', 'DB_PASSWORD', 'SESSION_DRIVER', 'CACHE_STORE', 'QUEUE_CONNECTION', 'TAXI_MANAGER_EMAIL', 'TAXI_MANAGER_PASSWORD'];
foreach ($show as $k):
    $v = (string) ($env[$k] ?? '');
    $secret = in_array($k, ['DB_PASSWORD', 'TAXI_MANAGER_PASSWORD'], true);
    $disp = $secret ? ($v === '' ? '(خالی)' : 'تنظیم شده (' . strlen($v) . ' کاراکتر)') : ($v === '' ? '(خالی)' : $v);
?>
  <tr>
    <th><code><?= h($k) ?></code></th>
    <td><?= $v === '' ? badge('bad', 'خالی') : badge('ok', 'هست') ?> <?= h($disp) ?></td>
  </tr>
<?php endforeach; ?>
</table>
</div>

<h2>تست HTTP</h2>
<div class="card">
  <table>
    <tr><th><a href="/public/up" target="_blank"><code>/public/up</code></a></th><td>باید <code>Application up</code> بدهد</td></tr>
    <tr><th><a href="/public/api/csrf" target="_blank"><code>/public/api/csrf</code></a></th><td>باید <code>{"ok":true,"csrf_token":"…"}</code> بدهد</td></tr>
    <tr><th><a href="/public/taxi.html" target="_blank"><code>/public/taxi.html</code></a></th><td>صفحهٔ ورود</td></tr>
  </table>
</div>

<h2>🔴 حذف این ابزار</h2>
<div class="card">
  بعد از پایان کار، فایل <code>setup-doctor.php</code> را در File Manager حذف کنید.
</div>

<p class="sub" style="text-align:center;margin-top:28px;font-size:12px">
  تاکسینو | Taxino · کارن‌سافت
</p>
</div>
</body>
</html>
