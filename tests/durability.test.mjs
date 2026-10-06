import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { readApp } from './extract.mjs';

const html = readApp();

/** برنامه را با WebCrypto تزریق‌شده بالا می‌آورد (jsdom خودش SubtleCrypto ندارد). */
async function boot(t, { webCrypto = true } = {}) {
  const dom = new JSDOM(html, {
    url: 'https://localhost/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(window) {
      if (!webCrypto) return;
      try {
        Object.defineProperty(window, 'crypto', { value: { getRandomValues: array => webcrypto.getRandomValues(array), randomUUID: () => webcrypto.randomUUID(), subtle: webcrypto.subtle }, configurable: true });
      } catch (_) { /* در صورت عدم امکان، مسیر جایگزین JS آزمایش می‌شود */ }
    },
  });
  const { window } = dom;
  t.after(() => window.close());
  if (window.document.readyState !== 'complete') {
    await Promise.race([new Promise(resolve => window.addEventListener('load', resolve, { once: true })), new Promise(resolve => setTimeout(resolve, 4000))]);
  }
  return { window, doc: window.document, App: window.App };
}

test('یادآور پشتیبان‌گیری: وضعیت اولیه، ثبت پشتیبان و بازگشت به حالت عادی', async t => {
  const { window, App, doc } = await boot(t);
  App.data.trips.push({ id: 't1', code: 'TRP-0001', date: '1404-01-01', fare: 100000, status: 'completed', passengerName: 'تست', origin: 'الف', destination: 'ب' });
  App.data.settings.backupReminderDays = 7;
  App.data.settings.lastBackupAt = '';
  assert.equal(App.durability.backupDue().due, true, 'بدون پشتیبان، هشدار فعال است');
  assert.equal(App.durability.backupDue().never, true);

  window.location.hash = '#dashboard';
  App.render();
  assert.match(doc.querySelector('#app-root').textContent, /هنوز از اطلاعات این آژانس پشتیبان نگرفته‌اید/);

  App.durability.takeBackupMarker();
  assert.equal(App.durability.backupDue().due, false, 'پس از پشتیبان‌گیری هشدار خاموش می‌شود');
  App.render();
  assert.doesNotMatch(doc.querySelector('#app-root').textContent, /پشتیبان نگرفته‌اید/);

  App.data.settings.backupReminderDays = 0;
  assert.equal(App.durability.backupDue().due, false, 'یادآور غیرفعال');
});

test('عکس فوری: ثبت، مشاهده و بازگردانی', async t => {
  const { window, App } = await boot(t);
  App.data.drivers.push({ id: 'd1', name: 'راننده اصلی', phone: '09120000000', commission: 15, status: 'available' });
  assert.equal(App.durability.takeSnapshot('تست عکس فوری'), true);
  const info = App.durability.snapshotInfo();
  assert.ok(info && info.data, 'عکس فوری ذخیره شد');
  assert.equal(info.reason, 'تست عکس فوری');

  // تغییر داده و بازگشت به عکس فوری
  App.data.drivers.push({ id: 'd2', name: 'راننده موقت', phone: '', commission: 10, status: 'available' });
  assert.equal(App.data.drivers.length, 2);
  window.location.hash = '#backup';
  App.render();
  assert.match(window.document.querySelector('#app-root').textContent, /عکس فوری/);

  App.durability.restoreSnapshot();
  const confirm = window.document.querySelector('#confirm-action');
  assert.ok(confirm, 'پنجرهٔ تأیید بازگشت نمایش داده شد');
  confirm.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(App.data.drivers.length, 1, 'داده‌ها به عکس فوری برگشتند');
  assert.equal(App.data.drivers[0].id, 'd1');
});

test('رمزگذاری پشتیبان: رفت‌وبرگشت AES-GCM و رد گذرواژهٔ نادرست', async t => {
  const { App } = await boot(t);
  const payload = { hello: 'کارن‌سافت', trips: [{ id: 'x', fare: 12345 }] };
  const text = JSON.stringify(payload);
  const encrypted = await App.durability.encryptBackupText(text, 'secret-pass-123');
  assert.equal(App.durability.isEncryptedBackup(encrypted), true, 'فایل به‌عنوان رمزگذاری‌شده شناسایی می‌شود');
  assert.doesNotMatch(encrypted, /کارن‌سافت/, 'متن اصلی در فایل نیست');
  assert.equal(App.durability.isEncryptedBackup(text), false);

  const decrypted = await App.durability.decryptBackupText(JSON.parse(encrypted), 'secret-pass-123');
  assert.deepEqual(JSON.parse(decrypted), payload);
  await assert.rejects(() => App.durability.decryptBackupText(JSON.parse(encrypted), 'wrong-pass'), /.*/);
});

test('ورود گروهی CSV: رانندگان، مشترکین و آدرس‌ها', async t => {
  const { App } = await boot(t);
  assert.equal(App.durability.csvRows('a,b\n1,2').length, 2);

  App.durability.importCsvRows('driver', 'نام,شماره همراه,گواهینامه,کمیسیون\nعلی رضایی,۰۹۱۲۱۱۱۲۲۳۳,۱۲۳۴۵,12\nمریم احمدی,09123334455,,18');
  assert.equal(App.data.drivers.length, 2, 'دو راننده وارد شد');
  assert.equal(App.data.drivers[0].name, 'علی رضایی');
  assert.equal(App.data.drivers[0].commission, 12);
  assert.equal(App.data.drivers[0].status, 'available');

  App.durability.importCsvRows('subscriber', 'شرکت نمونه,02188881234,حقوقی,شرکت نمونه,1405-01-01');
  assert.equal(App.data.subscribers.length, 1);
  assert.equal(App.data.subscribers[0].type, 'legal');
  assert.equal(App.data.subscribers[0].expiry, '1405-01-01');

  App.durability.importCsvRows('address', 'میدان ونک,تهران میدان ونک,5000,35.7575,51.4100');
  assert.equal(App.data.addresses.length, 1);
  assert.equal(App.data.addresses[0].lat, 35.7575);
  assert.equal(App.data.addresses[0].surcharge, 5000);

  const before = App.data.drivers.length;
  App.durability.importCsvRows('driver', 'نام,شماره همراه\n,0912');
  assert.equal(App.data.drivers.length, before, 'سطر بدون نام وارد نمی‌شود');
});

test('حجم داده و درصد فضا محاسبه می‌شود', async t => {
  const { App } = await boot(t);
  const usage = App.durability.storageUsage();
  assert.ok(usage.bytes > 0);
  assert.equal(usage.quota > usage.bytes, true);
  assert.ok(usage.percent >= 0 && usage.percent <= 100);
});
