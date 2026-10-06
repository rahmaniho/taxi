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

test('راه‌اندازی پیش‌فرض: بدون قفل و با نقش مدیر', async t => {
  const { doc, App } = await boot(t);
  assert.ok(App, 'API برنامه در دسترس است');
  assert.equal(App.security.securityActive(), false);
  assert.equal(App.security.state().locked, false);
  assert.equal(doc.querySelector('#lock-root').children.length, 0, 'صفحهٔ قفل نمایش داده نمی‌شود');
  assert.equal(App.security.roleOf(), 'مدیر');
  assert.equal(App.security.can('settings.manage'), true);
  assert.equal(App.security.can('data.delete'), true);
  assert.equal(doc.querySelector('#lock-action').hidden, true, 'دکمهٔ قفل تا فعال‌نشدن PIN پنهان است');
  assert.equal(doc.querySelector('.sidebar [data-route="settings"]').hidden, false);
  assert.equal(doc.querySelector('.sidebar .nav-section').style.display, '', 'بخش‌های منو برای مدیر کامل دیده می‌شوند');
});

test('فعال‌سازی قفل ورود: تعیین PIN، کد بازیابی، ورود و بازیابی با کد', async t => {
  const { window, doc, App } = await boot(t);
  openRoute(window, doc, 'settings');
  const form = doc.querySelector('form[data-form="settings-security"]');
  assert.ok(form, 'کارت امنیت در تنظیمات رندر شده است');

  // مدیر هنوز PIN ندارد؛ با روشن‌کردن قفل باید فرم تعیین PIN باز شود
  form.querySelector('[name="requirePin"]').checked = true;
  form.querySelector('[name="autoLockMinutes"]').value = '5';
  submit(window, form);
  const pinForm = doc.querySelector('form[data-form="reset-pin"]');
  assert.ok(pinForm, 'فرم تعیین PIN باز شد');

  doc.querySelector('#reset-pin-value').value = '1234';
  doc.querySelector('#reset-pin-repeat').value = '1234';
  submit(window, pinForm);
  await waitFor(() => App.data.settings.security.requirePin === true, 'قفل ورود فعال نشد');

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
  assert.equal(App.security.state().attempts, 0, 'شمارندهٔ تلاش‌ها پس از ورود پاک می‌شود');

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

  // ورود با اپراتور دیگر فقط با PIN او ممکن است
  App.data.operators.push({ id: 'op-2', name: 'اپراتور دوم', role: 'اپراتور', active: true, pin: await App.security.createSecret('4321') });
  App.render();
  click(window, doc.querySelector('[data-action="operator-menu"]'));
  click(window, doc.querySelector('[data-action="select-operator"][data-id="op-2"]'));
  ok: {
    assert.ok(doc.querySelector('form[data-form="operator-pin"]'), 'درخواست PIN اپراتور مقصد');
    doc.querySelector('#operator-pin-value').value = '0000';
    submit(window, doc.querySelector('form[data-form="operator-pin"]'));
    await wait(120);
    assert.notEqual(App.data.meta.currentOperatorId, 'op-2', 'PIN نادرست اجازهٔ تغییر اپراتور نمی‌دهد');
    doc.querySelector('#operator-pin-value').value = '4321';
    submit(window, doc.querySelector('form[data-form="operator-pin"]'));
    await waitFor(() => App.data.meta.currentOperatorId === 'op-2', 'تغییر اپراتور با PIN درست انجام نشد');
  }
  assert.equal(App.security.roleOf(), 'اپراتور');
});

test('قفل برای اپراتور بدون PIN وارد مرحلهٔ تعیین رمز می‌شود', async t => {
  const { window, doc, App } = await boot(t);
  App.data.settings.security.requirePin = true;
  App.data.operators.push({ id: 'op-9', name: 'اپراتور تازه', role: 'اپراتور', active: true });
  App.data.meta.currentOperatorId = 'op-9';
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

test('نقش اپراتور: بخش‌های مدیریتی بسته و اکشن‌های حساس غیرفعال', async t => {
  const { window, doc, App } = await boot(t);
  App.data.operators.push({ id: 'op-2', name: 'اپراتور دوم', role: 'اپراتور', active: true });
  App.data.subscribers.push({ id: 'sub-1', name: 'مشترک تست', phone: '09120000000', type: 'individual', company: '', expiry: '', active: true });
  App.data.meta.currentOperatorId = 'op-2';
  App.render();

  assert.equal(App.security.roleOf(), 'اپراتور');
  assert.equal(App.security.can('settings.manage'), false);
  assert.equal(App.security.can('trips.manage'), true);
  assert.equal(App.security.can('reports.view'), false);
  assert.equal(App.security.can('data.delete'), false);
  assert.equal(doc.querySelector('.sidebar [data-route="settings"]').hidden, true);
  assert.equal(doc.querySelector('.sidebar [data-route="accounting"]').hidden, true);
  assert.equal(doc.querySelector('.sidebar [data-route="trips"]').hidden, false);
  assert.equal(doc.querySelector('.sidebar [data-route="subscribers"]').hidden, false);
  assert.equal(doc.querySelector('.nav-sub[data-subnav="accounting"]').style.display, 'none', 'زیرمنوی حسابداری پنهان می‌شود');
  assert.equal(doc.querySelector('.nav-sub[data-subnav="trips"]').style.display, '', 'زیرمنوی سفرها برای اپراتور باز است');

  // ورود مستقیم با هش به بخش غیرمجاز
  openRoute(window, doc, 'settings');
  assert.match(doc.querySelector('#app-root').textContent, /دسترسی محدود/);

  // اکشن‌های حساس در صفحهٔ مشترکین غیرفعال می‌شوند
  openRoute(window, doc, 'subscribers');
  const deleteButton = doc.querySelector('[data-action="delete-subscriber"]');
  const editButton = doc.querySelector('[data-action="edit-subscriber"]');
  assert.ok(deleteButton && editButton);
  assert.equal(deleteButton.disabled, true, 'حذف مشترک برای اپراتور غیرفعال است');
  assert.equal(editButton.disabled, false, 'ویرایش مشترک برای اپراتور مجاز است');

  const before = App.data.subscribers.length;
  click(window, deleteButton);
  assert.equal(App.data.subscribers.length, before, 'حذف انجام نمی‌شود چون اکشن مسدود است');

  // ناوبری با کلیک روی منوی پنهان هم کار نمی‌کند
  const beforeHash = window.location.hash;
  window.App.navigate('accounting');
  assert.equal(window.location.hash, beforeHash, 'هدایت به بخش غیرمجاز مسدود می‌شود');
  assert.match(doc.querySelector('#app-root').textContent, /مشترکین/, 'صفحهٔ قبلی دست‌نخورده می‌ماند');
});

test('نقش حسابدار: گزارش‌ها و پرداخت‌ها باز، ثبت سفر بسته', async t => {
  const { doc, App } = await boot(t);
  App.data.operators.push({ id: 'op-3', name: 'حسابدار اصلی', role: 'حسابدار', active: true });
  App.data.meta.currentOperatorId = 'op-3';
  App.render();
  assert.equal(App.security.roleOf(), 'حسابدار');
  assert.equal(App.security.can('reports.view'), true);
  assert.equal(App.security.can('payments.record'), true);
  assert.equal(App.security.can('expenses.manage'), true);
  assert.equal(App.security.can('trips.manage'), false);
  assert.equal(App.security.can('settings.manage'), false);
  assert.equal(doc.querySelector('.sidebar [data-route="accounting"]').hidden, false);
  assert.equal(doc.querySelector('.nav-sub[data-subnav="accounting"]').style.display, '');
  assert.equal(doc.querySelector('.sidebar [data-route="trips"]').hidden, false, 'مشاهدهٔ سفرها برای حسابدار باز است');
  assert.equal(doc.querySelector('.top-actions [data-action="new-trip"]').disabled, true, 'ثبت سفر برای حسابدار بسته است');
});

test('نرمال‌سازی داده: نقش نامعتبر و اپراتور ناقص اصلاح می‌شود', async t => {
  const { window, App } = await boot(t);
  const raw = JSON.parse(JSON.stringify(App.data));
  raw.operators = [{ name: 'بی‌نقش' }, { id: 'op-x', name: 'مدیر دوم', role: 'مدیر' }];
  raw.settings.security = undefined;
  raw.meta.currentOperatorId = 'op-x';
  // پایگاه‌دادهٔ قدیمی (بدون تنظیمات امنیتی) هنگام بالا آمدن برنامه نرمال‌سازی می‌شود
  const { JSDOM } = await import('jsdom');
  const dom2 = new JSDOM(html, {
    url: 'https://localhost/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(window) { window.localStorage.setItem('taxi_db_v1', JSON.stringify(raw)); },
  });
  t.after(() => dom2.window.close());
  await new Promise(resolve => dom2.window.addEventListener('load', resolve, { once: true }));
  const operators = dom2.window.App.data.operators;
  assert.equal(operators[0].role, 'اپراتور', 'نقش نامعتبر به اپراتور تبدیل می‌شود');
  assert.equal(operators[0].active, true);
  assert.ok(operators[0].id, 'شناسهٔ نبوده ساخته می‌شود');
  assert.equal(operators[1].role, 'مدیر');
  assert.equal(dom2.window.App.security.securityActive(), false, 'تنظیمات امنیتی پیش‌فرض بازسازی می‌شود');
  assert.equal(dom2.window.localStorage.getItem('taxi_db_v1') !== null, true);
});

test('مدیریت اپراتورها: تعیین PIN، ویرایش، غیرفعال‌سازی و حذف با محافظ مدیر', async t => {
  const { window, doc, App } = await boot(t);
  App.data.operators.push({ id: 'op-2', name: 'اپراتور دوم', role: 'اپراتور', active: true });
  openRoute(window, doc, 'settings');

  // تعیین PIN برای اپراتور دوم توسط مدیر
  click(window, doc.querySelector('[data-action="reset-pin"][data-id="op-2"]'));
  doc.querySelector('#reset-pin-value').value = '2468';
  doc.querySelector('#reset-pin-repeat').value = '2468';
  submit(window, doc.querySelector('form[data-form="reset-pin"]'));
  await waitFor(() => {
    const operator = App.data.operators.find(o => o.id === 'op-2');
    return !!(operator && operator.pin && operator.pin.hash);
  }, 'PIN اپراتور دوم ثبت نشد');
  assert.match(doc.querySelector('.recovery-code').textContent.trim(), /^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
  click(window, doc.querySelector('[data-action="close-modal"]'));

  // ویرایش نام و غیرفعال‌سازی
  click(window, doc.querySelector('[data-action="edit-operator"][data-id="op-2"]'));
  doc.querySelector('#edit-operator-name').value = 'اپراتور ویرایش‌شده';
  doc.querySelector('form[data-form="edit-operator"] [name="active"]').checked = false;
  submit(window, doc.querySelector('form[data-form="edit-operator"]'));
  await waitFor(() => App.data.operators.find(o => o.id === 'op-2').active === false, 'وضعیت اپراتور تغییر نکرد');
  assert.equal(App.data.operators.find(o => o.id === 'op-2').name, 'اپراتور ویرایش‌شده');

  // اپراتور غیرفعال قابل انتخاب نیست
  openRoute(window, doc, 'dashboard');
  click(window, doc.querySelector('[data-action="operator-menu"]'));
  assert.equal(doc.querySelector('[data-action="select-operator"][data-id="op-2"]').disabled, true, 'اپراتور غیرفعال در فهرست ورود غیرفعال است');
  click(window, doc.querySelector('[data-action="close-modal"]'));

  // محافظ‌ها: حذف خود و حذف آخرین مدیر
  openRoute(window, doc, 'settings');
  assert.equal(doc.querySelector('[data-action="delete-operator"][data-id="op-1"]').disabled, true, 'حذف آخرین مدیر ممکن نیست');

  const before = App.data.operators.length;
  click(window, doc.querySelector('[data-action="delete-operator"][data-id="op-2"]'));
  click(window, doc.querySelector('#confirm-action'));
  await waitFor(() => App.data.operators.length === before - 1, 'اپراتور حذف نشد');
});
