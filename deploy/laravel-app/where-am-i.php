<?php
/**
 * where-am-i.php — «من کجا هستم؟»
 * این فایل را در همان پوشه‌ای بگذارید که فکر می‌کنید ریشهٔ سایت است،
 * سپس باز کنید: https://taxi.karen-soft.ir/where-am-i.php
 *
 * اگر این صفحه را دیدید → آن پوشه واقعاً ریشهٔ سایت (Document Root) است.
 * اگر 404 گرفتید → ریشهٔ سایت جای دیگری است.
 *
 * بعد از استفاده پاکش کنید.
 */
header('Content-Type: text/html; charset=utf-8');

$docroot = rtrim((string) ($_SERVER['DOCUMENT_ROOT'] ?? ''), '/');
$dir = __DIR__;
$home = getenv('HOME') ?: (function_exists('posix_getpwuid') ? (posix_getpwuid(posix_geteuid())['dir'] ?? '') : '');

$candidates = [
    rtrim((string) $home, '/') . '/public_html',
    rtrim((string) $home, '/') . '/taxi-app',
    rtrim((string) $home, '/') . '/taxi-app/public_html',
    rtrim((string) $home, '/') . '/taxi.karen-soft.ir',
    rtrim((string) $home, '/') . '/public_html/taxi',
];

function row(string $label, string $value, ?bool $ok = null): void
{
    $badge = '';
    if ($ok === true) $badge = '<span class="y">✅</span> ';
    if ($ok === false) $badge = '<span class="n">❌</span> ';
    echo '<tr><th>' . htmlspecialchars($label, ENT_QUOTES, 'UTF-8') . '</th><td><code>'
        . $badge . htmlspecialchars($value, ENT_QUOTES, 'UTF-8') . '</code></td></tr>';
}

$here = $dir;
$hasBackendHere = is_dir($here . '/laravel-backend');
$backendInDocroot = is_dir($docroot . '/laravel-backend');

?><!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>من کجا هستم؟ · تاکسینو</title>
<style>
  body{font-family:Vazirmatn,Tahoma,sans-serif;background:#0b1420;color:#e8f0f8;padding:24px;line-height:2;margin:0}
  .w{max-width:900px;margin:0 auto}
  h1{font-size:22px;margin:0 0 16px}
  h2{font-size:16px;color:#fdb400;margin:26px 0 8px;border-bottom:1px solid #22374d;padding-bottom:6px}
  .box{background:#132132;border:1px solid #22374d;border-radius:12px;padding:14px 18px;margin:12px 0}
  table{width:100%;border-collapse:collapse;font-size:13.5px}
  th{text-align:right;padding:6px 8px;color:#8fa6bd;width:210px;font-weight:600;vertical-align:top}
  td{padding:6px 8px;border-bottom:1px solid #22374d;word-break:break-all}
  code{direction:ltr;display:inline-block;background:#0a1622;padding:2px 7px;border-radius:5px;font-family:monospace;font-size:12.5px}
  .verdict{font-size:16px;font-weight:700;padding:14px 18px;border-radius:12px;margin:16px 0}
  .good{background:rgba(40,199,111,.13);border:1px solid #28c76f}
  .bad{background:rgba(234,84,85,.13);border:1px solid #ea5455}
  .warn{background:rgba(255,159,67,.13);border:1px solid #ff9f43}
  ul{margin:8px 0;padding-right:22px}
  .y{color:#28c76f}.n{color:#ea5455}
</style>
</head>
<body>
<div class="w">
<h1>📍 من کجا هستم؟</h1>

<?php if ($docroot === $dir && $hasBackendHere): ?>
  <div class="verdict good">✅ عالی — این پوشه ریشهٔ سایت است و <code>laravel-backend</code> هم همین‌جاست.</div>
<?php elseif ($docroot === $dir): ?>
  <div class="verdict warn">⚠️ این پوشه ریشهٔ سایت است، ولی <code>laravel-backend</code> اینجا نیست — باید داخل همین پوشه باشد.</div>
<?php elseif ($hasBackendHere): ?>
  <div class="verdict bad">❌ <code>laravel-backend</code> اینجاست، ولی این پوشه <b>ریشهٔ سایت نیست</b>.<br>
  باید محتویات را به <code><?= htmlspecialchars($docroot, ENT_QUOTES, 'UTF-8') ?></code> منتقل کنید.</div>
<?php else: ?>
  <div class="verdict bad">❌ نه ریشهٔ سایت است، نه <code>laravel-backend</code> اینجاست.</div>
<?php endif; ?>

<h2>۱. مسیرهای واقعی</h2>
<div class="box">
<table>
<?php
row('مسیر این فایل (__DIR__)', $dir);
row('Document Root سرور', $docroot, $docroot === $dir);
row('پوشهٔ خانه (HOME)', $home ?: '(نامشخص)');
row('laravel-backend در همین پوشه هست؟', $hasBackendHere ? 'بله' : 'نه', $hasBackendHere);
row('laravel-backend در Document Root هست؟', $backendInDocroot ? 'بله' : 'نه', $backendInDocroot);
row('نسخهٔ PHP', PHP_VERSION);
?>
</table>
</div>

<h2>۲. مسیرهایی که روی هاست دیده می‌شوند</h2>
<div class="box">
<table>
<?php foreach ($candidates as $c) {
    $isDir = is_dir($c);
    $hasLb = $isDir && is_dir($c . '/laravel-backend');
    $mark = $isDir ? ($hasLb ? 'پوشه هست + laravel-backend ✓' : 'پوشه هست (بدون laravel-backend)') : 'وجود ندارد';
    row($c === $docroot ? '★ ' . $c : $c, $mark, $isDir && $hasLb);
} ?>
</table>
</div>

<h2>۳. محتویات Document Root</h2>
<div class="box">
<table>
<?php
$items = @scandir($docroot) ?: [];
$items = array_values(array_diff($items, ['.', '..']));
if ($items === []) {
    echo '<tr><td class="n">خالی است</td></tr>';
}
foreach ($items as $item) {
    $full = $docroot . '/' . $item;
    row($item, is_dir($full) ? 'پوشه' : 'فایل (' . filesize($full) . ' بایت)');
}
?>
</table>
</div>

<h2>۴. قدم بعدی</h2>
<div class="box">
<?php if ($docroot !== $dir): ?>
<ul>
  <li>در File Manager محتویات این پوشه را <b>Move</b> کنید به:<br><code><?= htmlspecialchars($docroot, ENT_QUOTES, 'UTF-8') ?></code></li>
  <li>این فایل را هم با خودش ببرید تا دوباره تست کنید.</li>
</ul>
<?php elseif (!$hasBackendHere): ?>
<ul>
  <li><code>laravel-backend</code> را به همین پوشه Move کنید:
      <br><code><?= htmlspecialchars($docroot, ENT_QUOTES, 'UTF-8') ?>/laravel-backend</code></li>
</ul>
<?php else: ?>
<ul>
  <li>✅ همه‌چیز سر جای درست است.</li>
  <li>حالا <code>.env</code> بسازید و <code>.htaccess</code> را در همین پوشه بگذارید.</li>
  <li>سپس در Terminal: <code>cd ~/public_html/laravel-backend &amp;&amp; bash bin/cpanel-setup.sh</code></li>
</ul>
<?php endif; ?>
</div>

<p style="color:#8fa6bd;font-size:12px;text-align:center;margin-top:30px">
  پس از پایان کار این فایل را از سرور پاک کنید.
</p>
</div>
</body>
</html>
