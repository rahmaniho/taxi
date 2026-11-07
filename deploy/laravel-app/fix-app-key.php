<?php
/**
 * fix-app-key.php — ساخت/اصلاح `.env` و `APP_KEY` برای «تاکسینو | Taxino»
 * ──────────────────────────────────────────────────────────────────────
 * این فایل را در همان پوشه‌ای بگذارید که `artisan` و پوشهٔ `.env` هست
 * (یعنی /home/karensof/public_html/laravel-backend/)
 *
 * ۱) کنار همین فایل، فایلی به نام `.fix-key` بسازید و داخلش یک عبارت بگذارید (مثل taxino2026)
 * ۲) این آدرس را باز کنید:
 *      https://taxi.karen-soft.ir/public/fix-app-key.php?key=taxino2026
 * ۳) دکمه‌ها را به ترتیب بزنید
 *
 * 🔴 بعد از پایان کار همین فایل و .fix-key را پاک کنید.
 */

declare(strict_types=1);

const KEY_FILE = '.fix-key';

/** مسیر ریشهٔ لاراول را از محل این فایل پیدا می‌کند. */
function laravel_root(): ?string
{
    $candidates = [
        __DIR__,
        dirname(__DIR__),
        __DIR__ . '/laravel-backend',
        dirname(__DIR__) . '/laravel-backend',
    ];

    foreach ($candidates as $dir) {
        $dir = str_replace('//', '/', $dir);
        if (is_file($dir . '/artisan') && is_file($dir . '/composer.json')) {
            return $dir;
        }
    }

    // جست‌وجو در مسیرهای متداول cPanel
    foreach ((array) @glob('/home/*/public_html', GLOB_ONLYDIR) as $base) {
        foreach (['', '/laravel-backend'] as $suffix) {
            if (is_file($base . $suffix . '/artisan')) {
                return $base . $suffix;
            }
        }
    }

    return null;
}

/** خواندن مقدار یک کلید از .env */
function env_get(string $file, string $key): ?string
{
    if (!is_file($file)) {
        return null;
    }
    foreach ((array) @file($file, FILE_IGNORE_NEW_LINES) as $line) {
        $line = (string) $line;
        if (preg_match('/^\s*' . preg_quote($key, '/') . '\s*=\s*(.*)$/', $line, $m)) {
            return trim(trim($m[1]), "\"'");
        }
    }
    return null;
}

/** جایگزینی یا افزودن یک کلید در .env (اتمیک: نوشتن در فایل موقت سپس rename) */
function env_set(string $file, string $key, string $value): bool
{
    $lines = is_file($file) ? (array) @file($file, FILE_IGNORE_NEW_LINES) : [];
    $found = false;
    $pattern = '/^\s*' . preg_quote($key, '/') . '\s*=/';

    foreach ($lines as $i => $line) {
        if (preg_match($pattern, (string) $line)) {
            $lines[$i] = $key . '=' . $value;
            $found = true;
            break;
        }
    }
    if (!$found) {
        $lines[] = $key . '=' . $value;
    }

    $tmp = $file . '.tmp' . bin2hex(random_bytes(4));
    $payload = implode("\n", array_map(static fn ($l) => (string) $l, $lines)) . "\n";

    if (@file_put_contents($tmp, $payload) === false) {
        return false;
    }
    @chmod($tmp, 0644);

    return @rename($tmp, $file);
}

/** حذف کش config تا مقدار جدید خوانده شود */
function clear_config_cache(string $root): array
{
    $removed = [];
    foreach ((array) glob($root . '/bootstrap/cache/*.php') ?: [] as $file) {
        if (@unlink($file)) {
            $removed[] = basename((string) $file);
        }
    }
    return $removed;
}

function h(?string $s): string
{
    return htmlspecialchars((string) $s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function badge(bool $ok, string $yes = 'OK', string $no = 'نیست'): string
{
    return '<span class="badge ' . ($ok ? 'ok' : 'bad') . '">' . h($ok ? $yes : $no) . '</span>';
}

// ───────────────────────── منطق ─────────────────────────

$root = laravel_root();
$token = (string) ($_GET['key'] ?? '');
$action = (string) ($_GET['action'] ?? '');
$keyFile = __DIR__ . '/' . KEY_FILE;
$authorized = is_file($keyFile) && $token !== '' && trim((string) @file_get_contents($keyFile)) === $token;

$messages = [];
$done = [];

$envPath = $root !== null ? $root . '/.env' : null;
$examplePath = $root !== null ? $root . '/.env.production.example' : null;
$envExists = $envPath !== null && is_file($envPath);
$currentKey = $envExists ? (string) env_get($envPath, 'APP_KEY') : '';
$keyOk = str_starts_with($currentKey, 'base64:') && strlen($currentKey) > 40;

if ($action !== '') {
    if (!$authorized) {
        $messages[] = ['bad', 'ابتدا فایل <code>.fix-key</code> را کنار همین فایل بسازید و عبارت داخلش را در آدرس <code>&amp;key=...</code> بگذارید.'];
    } elseif ($root === null) {
        $messages[] = ['bad', 'ریشهٔ لاراول پیدا نشد. این فایل را در همان پوشه‌ای بگذارید که <code>artisan</code> هست.'];
    } else {
        // ۱) ساخت .env از نمونه
        if ($action === 'create') {
            if ($envExists) {
                $messages[] = ['info', 'فایل <code>.env</code> از قبل وجود دارد (دست نزدم).'];
            } elseif (is_file((string) $examplePath)) {
                if (@copy((string) $examplePath, $root . '/.env')) {
                    @chmod($root . '/.env', 0644);
                    $envExists = true;
                    $messages[] = ['ok', 'فایل <code>.env</code> از <code>.env.production.example</code> ساخته شد.'];
                } else {
                    $messages[] = ['bad', 'کپی .env ناموفق بود (مجوز پوشه را بررسی کنید).'];
                }
            } else {
                $messages[] = ['bad', '<code>.env.production.example</code> پیدا نشد.'];
            }
        }

        // ۲) ساخت کلید تازه
        if ($action === 'key') {
            if (!$envExists) {
                $messages[] = ['bad', 'اول <code>.env</code> را بسازید (دکمهٔ ۱).'];
            } else {
                $newKey = 'base64:' . base64_encode(random_bytes(32));
                if (env_set((string) $envPath, 'APP_KEY', $newKey)) {
                    $done[] = $newKey;
                    $currentKey = $newKey;
                    $keyOk = true;
                    $messages[] = ['ok', 'APP_KEY تازه ساخته و در <code>.env</code> نوشته شد.'];
                    foreach (clear_config_cache($root) as $f) {
                        $messages[] = ['info', 'کش حذف شد: <code>' . h($f) . '</code>'];
                    }
                } else {
                    $messages[] = ['bad', 'نوشتن در <code>.env</code> ناموفق بود (مجوز فایل).'];
                }
            }
        }

        // ۳) پاک کردن کش
        if ($action === 'clear') {
            $removedFiles = clear_config_cache($root);
            $messages[] = $removedFiles === []
                ? ['info', 'کشی برای حذف نبود.']
                : ['ok', 'کش حذف شد: <code>' . h(implode(', ', $removedFiles)) . '</code>'];
        }
    }
}

// حذف خودکار (فقط با کلید)
if ($action === 'selfdestruct' && $authorized) {
    @unlink(__DIR__ . '/' . KEY_FILE);
    @unlink(__FILE__);
    echo '<!DOCTYPE html><html lang="fa" dir="rtl"><meta charset="utf-8">'
        . '<body style="font-family:Tahoma,sans-serif;background:#0b1420;color:#28c76f;padding:40px;text-align:center">'
        . '<h2>✓ ابزار حذف شد</h2><p style="color:#e8f0f8">این صفحه را ببندید.</p></body></html>';
    exit;
}

// بازخوانی وضعیت
if ($root !== null) {
    $envExists = is_file($root . '/.env');
    $currentKey = $envExists ? (string) env_get($root . '/.env', 'APP_KEY') : '';
    $keyOk = str_starts_with($currentKey, 'base64:') && strlen($currentKey) > 40;

    $exampleKey = is_file((string) $examplePath) ? (string) env_get((string) $examplePath, 'APP_KEY') : '';
    $exampleHasKey = str_starts_with($exampleKey, 'base64:');
}

$envRows = [];
if ($root !== null && $envExists) {
    $keys = ['APP_ENV', 'APP_DEBUG', 'APP_URL', 'DB_CONNECTION', 'DB_DATABASE', 'DB_USERNAME',
             'DB_PASSWORD', 'SESSION_DRIVER', 'TAXI_MANAGER_EMAIL', 'TAXI_MANAGER_PASSWORD'];
    foreach ($keys as $k) {
        $v = (string) env_get($root . '/.env', $k);
        $secret = in_array($k, ['DB_PASSWORD', 'TAXI_MANAGER_PASSWORD'], true);
        $envRows[$k] = [
            'raw' => $v,
            'display' => $secret ? ($v === '' ? '(خالی)' : 'تنظیم شده ✓ (' . strlen($v) . ' کاراکتر)') : ($v === '' ? '(خالی)' : $v),
            'ok' => $v !== '',
        ];
    }
}

$base = basename(__FILE__);
$qs = $authorized ? '&key=' . urlencode($token) : '';
?><!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ساخت APP_KEY · تاکسینو</title>
<style>
  :root{--bg:#0b1420;--card:#132132;--line:#22374d;--fg:#e8f0f8;--dim:#8fa6bd;--ok:#28c76f;--bad:#ea5455;--warn:#ff9f43;--brand:#fdb400}
  *{box-sizing:border-box}
  body{margin:0;padding:22px;font-family:Vazirmatn,Tahoma,sans-serif;background:var(--bg);color:var(--fg);line-height:1.9}
  .w{max-width:940px;margin:0 auto}
  h1{font-size:21px;margin:0 0 4px}
  h2{font-size:16px;color:var(--brand);margin:26px 0 10px;border-bottom:1px solid var(--line);padding-bottom:7px}
  .sub{color:var(--dim);font-size:13px;margin-bottom:16px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:12px 0}
  table{width:100%;border-collapse:collapse;font-size:13.5px}
  th,td{text-align:right;padding:7px 9px;border-bottom:1px solid var(--line);vertical-align:top}
  th{color:var(--dim);width:220px;font-weight:600}
  code{direction:ltr;display:inline-block;background:#0a1622;padding:2px 7px;border-radius:5px;font-family:monospace;font-size:12.5px;word-break:break-all}
  .badge{display:inline-block;padding:1px 9px;border-radius:20px;font-size:12px;font-weight:700}
  .badge.ok{background:rgba(40,199,111,.15);color:var(--ok)}
  .badge.bad{background:rgba(234,84,85,.15);color:var(--bad)}
  .msg{padding:10px 14px;border-radius:9px;margin:8px 0;font-size:13.5px;border-right:4px solid}
  .msg.ok{background:rgba(40,199,111,.1);border-color:var(--ok)}
  .msg.bad{background:rgba(234,84,85,.1);border-color:var(--bad)}
  .msg.info{background:rgba(143,166,189,.1);border-color:var(--dim)}
  .verdict{font-size:15px;font-weight:700;padding:13px 17px;border-radius:12px;margin:14px 0}
  .verdict.good{background:rgba(40,199,111,.13);border:1px solid var(--ok)}
  .verdict.bad{background:rgba(234,84,85,.13);border:1px solid var(--bad)}
  .btn{display:inline-block;padding:10px 18px;border-radius:9px;text-decoration:none;font-weight:700;font-size:13.5px;margin:5px 5px 5px 0;border:1px solid}
  .b1{background:rgba(40,199,111,.18);border-color:var(--ok);color:var(--ok)}
  .b2{background:rgba(253,180,0,.15);border-color:var(--brand);color:var(--brand)}
  .b3{background:rgba(143,166,189,.12);border-color:var(--dim);color:var(--fg)}
  .keybox{background:#0a1622;border:1px dashed var(--brand);border-radius:9px;padding:13px;margin:10px 0;font-family:monospace;direction:ltr;text-align:left;word-break:break-all;color:var(--brand);font-size:13px}
  ol{padding-right:20px;margin:8px 0}
  a{color:var(--brand)}
</style>
</head>
<body>
<div class="w">
<h1>🔑 ساخت <code>APP_KEY</code> و اصلاح <code>.env</code></h1>
<div class="sub">بررسی زنده + سه دکمهٔ اصلاح، بدون نیاز به Terminal</div>

<?php foreach ($messages as [$kind, $text]): ?>
  <div class="msg <?= h($kind) ?>"><?= $text ?></div>
<?php endforeach; ?>

<?php if ($done !== []): ?>
  <div class="card">
    <b>کلید ساخته‌شده:</b>
    <div class="keybox">APP_KEY=<?= h($done[0]) ?></div>
    <div class="sub" style="margin:8px 0 0">این مقدار در <code>.env</code> نوشته شد. کپی‌اش لازم نیست — فقط سایت را تست کنید.</div>
  </div>
<?php endif; ?>

<?php if ($root === null): ?>
  <div class="verdict bad">
    ❌ ریشهٔ لاراول پیدا نشد.<br>
    <span style="font-weight:400;font-size:13.5px">
      این فایل باید در همان پوشه‌ای باشد که <code>artisan</code> و <code>composer.json</code> هستند.
      مسیر فعلی این فایل: <code><?= h(__DIR__) ?></code>
    </span>
  </div>
<?php else: ?>

  <?php if (!$authorized): ?>
    <div class="verdict bad">
      🔐 برای تغییر، کلید لازم است.
      <div style="font-weight:400;font-size:13.5px;margin-top:8px">
        در File Manager کنار همین فایل، فایلی به نام <code>.fix-key</code> بسازید و داخلش یک عبارت دلخواه بگذارید (مثل <code>taxino2026</code>)،
        سپس بنویسید: <code><?= h($base) ?>?action=create&amp;key=taxino2026</code>
      </div>
    </div>
  <?php endif; ?>

  <h2>وضعیت فعلی</h2>
  <div class="card">
    <table>
      <tr><th>مسیر ریشهٔ لاراول</th><td><code><?= h($root) ?></code> <?= badge(true, 'پیدا شد ✓', '') ?></td></tr>
      <tr><th>فایل <code>.env</code></th>
          <td><?= badge($envExists, 'وجود دارد ✓', 'وجود ندارد ✗') ?>
              <?php if (!$envExists): ?><br><span class="sub">لاراول بدون این فایل کار نمی‌کند.</span><?php endif; ?></td></tr>
      <tr><th>مقدار <code>APP_KEY</code></th>
          <td><?= badge($keyOk, 'معتبر ✓', $envExists ? 'خالی یا نامعتبر ✗' : '—') ?>
              <?php if ($keyOk): ?><br><code><?= h(substr($currentKey, 0, 22)) ?>…</code>
              <span class="sub">(<?= strlen($currentKey) ?> کاراکتر)</span><?php endif; ?></td></tr>
      <tr><th><code>.env.production.example</code></th>
          <td><?= badge(is_file((string) $examplePath), 'وجود دارد', 'نیست') ?>
              <?php if (!empty($exampleHasKey)): ?>
                <span class="badge bad">APP_KEY داخل نمونه است — این کار نمی‌کند!</span>
              <?php endif; ?></td></tr>
      <tr><th>پوشهٔ <code>bootstrap/cache</code></th>
          <td><?= badge(is_dir($root . '/bootstrap/cache'), 'هست', 'نیست') ?></td></tr>
      <tr><th>نسخهٔ PHP</th><td><code><?= h(PHP_VERSION) ?></code></td></tr>
    </table>
  </div>

  <?php if (!empty($exampleHasKey) && !$keyOk): ?>
    <div class="msg bad">
      ⚠️ <b>مشکل پیدا شد:</b> <code>APP_KEY</code> را در <code>.env.production.example</code> گذاشته‌اید.
      آن فایل فقط یک <b>نمونه</b> است و لاراول آن را نمی‌خواند. باید در <code>.env</code> باشد.
      دکمهٔ شمارهٔ ۲ پایین این را درست می‌کند.
    </div>
  <?php endif; ?>

  <h2>سه دکمه (به ترتیب)</h2>
  <div class="card">
    <p style="margin:0 0 10px"><b>۱)</b> ساخت <code>.env</code> از روی نمونه:</p>
    <a class="btn b1" href="?action=create&amp;key=<?= h($token) ?>">① ساخت .env</a>

    <p style="margin:16px 0 10px"><b>۲)</b> ساخت <code>APP_KEY</code> تازه و نوشتن در <code>.env</code> (کش هم پاک می‌شود):</p>
    <a class="btn b2" href="?action=key&amp;key=<?= h($token) ?>">② ساخت APP_KEY</a>

    <p style="margin:16px 0 10px"><b>۳)</b> اگر بعداً مقدار .env را دستی عوض کردید، کش را پاک کنید:</p>
    <a class="btn b3" href="?action=clear&amp;key=<?= h($token) ?>">③ پاک کردن کش</a>
  </div>

  <?php if ($envExists): ?>
  <h2>مقادیر <code>.env</code> (رمزها مخفی‌اند)</h2>
  <div class="card">
    <table>
      <?php foreach ($envRows as $k => $row): ?>
        <tr><th><code><?= h($k) ?></code></th>
            <td><?= badge($row['ok'], h($row['display']), 'خالی ✗') ?></td></tr>
      <?php endforeach; ?>
    </table>
  </div>
  <?php endif; ?>

  <h2>تست</h2>
  <div class="card">
    بعد از دکمهٔ ۲، این‌ها را باز کنید:
    <table>
      <tr><td><a href="/public/up" target="_blank"><code>/public/up</code></a></td><td><?= badge(true, 'باید 200 OK', '') ?> Application up</td></tr>
      <tr><td><a href="/public/api/csrf" target="_blank"><code>/public/api/csrf</code></a></td><td><?= badge(true, 'باید JSON', '') ?> <code>{"ok":true,"csrf_token":"…"}</code></td></tr>
      <tr><td><a href="/public/taxi.html" target="_blank"><code>/public/taxi.html</code></a></td><td>صفحهٔ ورود تاکسینو</td></tr>
    </table>
  </div>

  <?php if ($keyOk): ?>
    <div class="verdict good">
      ✅ <code>APP_KEY</code> تنظیم شده است. قدم بعدی: <b>پر کردن دیتابیس در <code>.env</code></b> و اجرای
      <code>php artisan migrate --seed --force</code>.
    </div>
  <?php endif; ?>

  <h2>🔴 پاک کردن این ابزار</h2>
  <div class="card">
    بعد از پایان کار، در File Manager این دو فایل را <b>حذف</b> کنید:
    <ul>
      <li><code><?= h($base) ?></code></li>
      <li><code><?= h(KEY_FILE) ?></code></li>
    </ul>
    <a class="btn b3" href="?action=selfdestruct&amp;key=<?= h($token) ?>"
       onclick="return confirm('این فایل حذف شود؟')">🗑 حذف خودکار این فایل</a>
  </div>

<?php endif; ?>

<p class="sub" style="text-align:center;margin-top:28px;font-size:12px">
  تاکسینو | Taxino · کارن‌سافت — <?= h(date('Y-m-d H:i')) ?>
</p>
</div>
</body>
</html>
