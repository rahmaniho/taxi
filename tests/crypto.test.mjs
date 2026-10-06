import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { loadCryptoModule } from './extract.mjs';

const hex = bytes => Buffer.from(bytes).toString('hex');
const jsModule = loadCryptoModule({}); // بدون WebCrypto → مسیر جایگزین خالص JS
const webModule = loadCryptoModule({ crypto: globalThis.crypto }); // مسیر WebCrypto

test('SHA-256 با مرجع Node یکسان است', () => {
  const vectors = ['', 'abc', 'کارن‌سافت', '0123456789'.repeat(20)];
  for (const text of vectors) {
    const mine = hex(jsModule.sha256Bytes(new TextEncoder().encode(text)));
    const reference = crypto.createHash('sha256').update(text, 'utf8').digest('hex');
    assert.equal(mine, reference, `ورودی: ${text.slice(0, 12)}`);
  }
  for (const length of [1, 55, 56, 63, 64, 65, 119, 120, 1000]) {
    const buffer = crypto.randomBytes(length);
    assert.equal(hex(jsModule.sha256Bytes(new Uint8Array(buffer))), crypto.createHash('sha256').update(buffer).digest('hex'), `طول ${length}`);
  }
});

test('PBKDF2-SHA256 با مرجع Node یکسان است', () => {
  for (const iterations of [1, 2, 3, 10, 1000]) {
    const salt = crypto.randomBytes(16);
    const mine = Buffer.from(jsModule.pbkdf2Sha256Js('گذرواژه-۱۲۳۴', new Uint8Array(salt), iterations));
    const reference = crypto.pbkdf2Sync('گذرواژه-۱۲۳۴', salt, iterations, 32, 'sha256');
    assert.equal(mine.toString('hex'), reference.toString('hex'), `تعداد دور ${iterations}`);
  }
});

test('base64 رفت‌وبرگشت بدون تغییر', () => {
  const raw = crypto.randomBytes(24);
  const roundTrip = jsModule.b64ToBytes(jsModule.bytesToB64(new Uint8Array(raw)));
  assert.equal(Buffer.from(roundTrip).toString('hex'), raw.toString('hex'));
});

test('مسیر جایگزین بدون WebCrypto: ساخت و بررسی PIN', async () => {
  const spec = await jsModule.createSecret('4321');
  assert.equal(spec.algo, 'pbkdf2-js');
  assert.equal(spec.hash.length > 20, true);
  assert.equal(await jsModule.verifySecret(spec, '4321'), true);
  assert.equal(await jsModule.verifySecret(spec, '4322'), false);
  assert.equal(await jsModule.verifySecret({ ...spec, hash: 'x' }, '4321'), false);
  assert.equal(await jsModule.verifySecret(null, '4321'), false);
});

test('مسیر WebCrypto: ساخت و بررسی PIN', async () => {
  const spec = await webModule.createSecret(webModule.normalizePin('۹۸۷۶'));
  assert.equal(spec.algo, 'pbkdf2-sha256');
  assert.equal(spec.iterations, 120000);
  assert.equal(await webModule.verifySecret(spec, '9876'), true);
  assert.equal(await webModule.verifySecret(spec, '0000'), false);
});

test('کد بازیابی و اعتبارسنجی PIN', () => {
  const code = jsModule.recoveryCode();
  assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/);
  assert.notEqual(jsModule.recoveryCode(), jsModule.recoveryCode());
  assert.equal(jsModule.normalizePin('۱۲۳۴'), '1234');
  assert.equal(jsModule.normalizePin('12-34a'), '1234');
  assert.equal(jsModule.validPin('1234'), true);
  assert.equal(jsModule.validPin(jsModule.normalizePin('۱۲۳۴۵۶۷۸')), true);
  assert.equal(jsModule.validPin('123'), false);
  assert.equal(jsModule.validPin('123456789'), false);
  assert.equal(jsModule.validPin('abcd'), false);
});
