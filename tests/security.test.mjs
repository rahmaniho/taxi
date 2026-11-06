import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readApp } from './extract.mjs';

const html = readApp();
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/** برنامه را در یک DOM شبیه‌سازی‌شده بالا می‌آورد و پنجره را در پایان تست می‌بندد. */
async function boot(t) {
  const dom = new JSDOM(html, { url: 'https://localhost/', runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom;
  t.after(() => window.close());
  if (window.document.readyState !== 'complete') {
    await Promise.race([
      new Promise(resolve => window.addEventListener('load', resolve, { once: true })),
      wait(4000),
    ]);
  }
  return { dom, window, doc: window.document, App: window.App };
}

async function waitFor(predicate, message = 'شرط مورد انتظار محقق نشد', timeout = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (predicate()) return true;
    await wait(25);
  }
  throw new Error(message);
}

const submit = (window, form) => form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
const click = (window, element) => element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

function openRoute(window, doc, route) {
  window.location.hash = `#${route}`;
  window.App.render();
  return doc.querySelector('#app-root');
}

test('راه‌اندازی پیش‌فرض تک‌کاربره: بدون قفل، دسترسی کامل و بدون منوهای چنداپراتوره', async t => {
  const { doc, App } = await boot(t);
  assert.ok(App, 'API برنامه در دسترس است');
  assert.equal(App.security.securityActive(), false);
  assert.equal(App.security.state().locked, false);
  assert.equal(doc.querySelector('#lock-root').children.length, 0, 'صفحهٔ قفل نمایش داده نمی‌شود');
  assert.equal(App.security.roleOf(), 'مدیر');
  assert.equal(App.data.operators.length, 1, 'سیستم تک‌کاربره است و فقط یک پروفایل کاربری دارد');
  assert.equal(App.security.can('settings.manage'), true);
  assert.equal(App.security.can('data.delete'), true);
  assert.equal(doc.querySelector('#lock-action').hidden, true, 'دکمهٔ قفل تا فعال‌نشدن PIN پنهان است');
  assert.equal(doc.querySelector('#operator-pill'), null, 'دکمهٔ تغییر اپراتور حذف شده است');
  assert.ok(doc.querySelector('#top-logout-btn'), 'دکمهٔ خروج در نوار بالا هست');
  assert.ok(doc.querySelector('#sidebar-logout-btn'), 'دکمهٔ خروج در نوار کناری هست');
  assert.equal(doc.querySelector('.sidebar [data-route="settings"]').hidden, false);
});

test('قفل اختیاری PIN دستگاه در حالت تک‌کاربره: تعیین PIN، کد بازیابی، بازگشایی و بازیابی با کد', async t => {
  const { window, doc, App } = await boot(t);
  openRoute(window, doc, 'settings');
  const form = doc.querySelector('form[data-form="settings-security"]');
  assert.ok(form, 'کارت قفل PIN دستگاه در تنظیمات رندر شده است');
  assert.equal(doc.querySelector('#app-root').textContent.includes('پیام‌های آماده'), false, 'کارت پیام‌های آماده در تنظیمات وجود ندارد');

  // کاربر هنوز PIN ندارد؛ با روشن‌کردن قفل باید فرم تعیین PIN باز شود
  form.querySelector('[name="requirePin"]').checked = true;
  form.querySelector('[name="autoLockMinutes"]').value = '5';
  submit(window, form);
  const pinForm = doc.querySelector('form[data-form="reset-pin"]');
  assert.ok(pinForm, 'فرم تعیین PIN باز شد');

  doc.querySelector('#reset-pin-value').value = '1234';
  doc.querySelector('#reset-pin-repeat').value = '1234';
  submit(window, pinForm);
  await waitFor(() => App.data.settings.security.requirePin === true, 'قفل PIN دستگاه فعال نشد');

  assert.equal(App.security.operatorHasPin(), true);
  assert.equal(App.data.settings.security.autoLockMinutes, 5);
  const code = doc.querySelector('.recovery-code').textContent.trim();
  assert.match(code, /^[A-Z2-9]{5}-[A-Z2-9]{5}$/, 'کد بازیابی نمایش داده شد');
  click(window, doc.querySelector('[data-action="close-modal"]'));

  // قفل دستی
  assert.equal(App.security.lock('تست'), true);
  assert.equal(App.security.state().locked, true);
  assert.ok(doc.querySelector('.lock-screen'), 'صفحهٔ قفل نمایش داده می‌شود');
  assert.equal(doc.body.classList.contains('is-locked'), true);
  assert.equal(doc.querySelector('#lock-action').hidden, false, 'دکمهٔ قفل در نوار بالا فعال است');
  assert.equal(doc.querySelector('[data-action="lock-switch"]'), null, 'گزینهٔ تعویض اپراتور در صفحهٔ قفل وجود ندارد');
  assert.ok(doc.querySelector('.lock-screen [data-action="auth-logout"]'), 'امکان خروج از حساب روی صفحهٔ قفل هم در دسترس است');

  // PIN نادرست
  doc.querySelector('#lock-pin').value = '9999';
  await App.security.submitPin();
  assert.equal(App.security.state().attempts, 1, 'تلاش ناموفق ثبت شد');
  assert.equal(App.security.state().locked, true);
  assert.match(doc.querySelector('#lock-error').textContent, /نادرست/);

  // PIN درست با صفحه‌کلید عددی
  for (const key of ['1', '2', '3', '4']) click(window, doc.querySelector(`[data-action="pin-key"][data-key="${key}"]`));
  click(window, doc.querySelector('[data-action="pin-key"][data-key="ok"]'));
  await waitFor(() => App.security.state().locked === false, 'ورود با PIN درست انجام نشد');
  assert.equal(doc.querySelector('#lock-root').children.length, 0);
  assert.equal(doc.body.classList.contains('is-locked'), false);
  assert.equal(App.security.state().attempts, 0, 'شمارندهٔ تلاش‌ها پس از بازگشایی پاک می‌شود');

  // بازیابی با کد بازیابی و ساخت PIN جدید
  App.security.lock('تست دوم');
  click(window, doc.querySelector('[data-action="lock-recover"]'));
  assert.ok(doc.querySelector('#lock-code'), 'فرم کد بازیابی نمایش داده شد');
  doc.querySelector('#lock-code').value = code;
  doc.querySelector('#lock-pin').value = '5678';
  doc.querySelector('#lock-pin2').value = '5678';
  await App.security.submitPin();
  await waitFor(() => App.security.state().locked === false, 'بازیابی با کد انجام نشد');
  assert.equal(await App.security.verifyCurrentPin('5678'), true, 'PIN جدید فعال است');
  assert.equal(await App.security.verifyCurrentPin('1234'), false, 'PIN قبلی بی‌اعتبار شده است');

  // تغییر PIN از صفحهٔ تنظیمات
  openRoute(window, doc, 'settings');
  click(window, doc.querySelector('[data-action="change-pin"]'));
  assert.ok(doc.querySelector('form[data-form="change-pin"]'), 'فرم تغییر PIN باز شد');
  doc.querySelector('#change-pin-current').value = '5678';
  doc.querySelector('#change-pin-value').value = '4321';
  doc.querySelector('#change-pin-repeat').value = '4321';
  submit(window, doc.querySelector('form[data-form="change-pin"]'));
  await waitFor(async () => await App.security.verifyCurrentPin('4321'), 'تغییر PIN ذخیره نشد');
});

test('قفل بدون PIN ذخیره‌شده وارد مرحلهٔ تعیین رمز اولیه می‌شود', async t => {
  const { window, doc, App } = await boot(t);
  App.data.settings.security.requirePin = true;
  App.data.operators[0].pin = null;
  App.security.lock('تست');
  assert.equal(App.security.state().mode, 'setup');
  assert.ok(doc.querySelector('#lock-pin2'), 'فیلد تکرار رمز نمایش داده شد');
  doc.querySelector('#lock-pin').value = '1111';
  doc.querySelector('#lock-pin2').value = '1111';
  await App.security.submitPin();
  await waitFor(() => doc.querySelector('.recovery-code'), 'کد بازیابی نمایش داده نشد');
  assert.equal(App.security.operatorHasPin(), true);
  click(window, doc.querySelector('[data-action="lock-code-done"]'));
  await waitFor(() => App.security.state().locked === false, 'پس از ثبت کد، قفل باز نشد');
});

test('نرمال‌سازی دادهٔ قدیمی چنداپراتوره به حالت تک‌کاربره با حفظ PIN قبلی', async t => {
  const { App } = await boot(t);
  const savedPin = await App.security.createSecret('2468');
  const raw = JSON.parse(JSON.stringify(App.data));
  raw.operators = [
    { id: 'op-legacy-1', name: 'اپراتور شیفت صبح', role: 'اپراتور', active: true },
    { id: 'op-legacy-2', name: 'مدیر آژانس', role: 'مدیر', active: true, pin: savedPin },
  ];
  raw.settings.security = undefined;
  raw.meta.currentOperatorId = 'op-legacy-2';

  const dom2 = new JSDOM(html, {
    url: 'https://localhost/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(window) { window.localStorage.setItem('taxi_db_v1', JSON.stringify(raw)); },
  });
  t.after(() => dom2.window.close());
  await new Promise(resolve => dom2.window.addEventListener('load', resolve, { once: true }));

  const operators = dom2.window.App.data.operators;
  assert.equal(operators.length, 1, 'چند اپراتور قدیمی به یک کاربر واحد تجمیع شد');
  assert.equal(operators[0].role, 'مدیر', 'کاربر واحد دارای دسترسی کامل مدیر است');
  assert.equal(operators[0].active, true);
  assert.equal(await dom2.window.App.security.verifyCurrentPin('2468'), true, 'PIN قبلی حفظ شد');
  assert.equal(dom2.window.App.security.securityActive(), false, 'تنظیمات امنیتی پیش‌فرض بازسازی شد');
});
