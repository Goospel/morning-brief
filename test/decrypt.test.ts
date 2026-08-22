import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, randomBytes } from 'node:crypto';
import { decryptField, extractBirthYear } from '../supabase/functions/_shared/decrypt.ts';

const KEY = randomBytes(32);
const AAD = 'test-aad';

/** 토스가 보내는 형태를 흉내낸다: base64(IV 12바이트 + 암호문 + GCM태그 16바이트) */
function encrypt(plain: string, key = KEY, aad = AAD): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, body, cipher.getAuthTag()]).toString('base64');
}

const KEY_B64 = KEY.toString('base64');

test('암호문을 복호화한다', async () => {
  assert.equal(await decryptField(encrypt('MALE'), KEY_B64, AAD), 'MALE');
});

test('한글도 왕복한다', async () => {
  assert.equal(await decryptField(encrypt('남성'), KEY_B64, AAD), '남성');
});

test('키가 다르면 null 을 준다', async () => {
  const other = randomBytes(32).toString('base64');
  assert.equal(await decryptField(encrypt('MALE'), other, AAD), null);
});

test('AAD 가 다르면 null 을 준다', async () => {
  assert.equal(await decryptField(encrypt('MALE'), KEY_B64, 'wrong-aad'), null);
});

test('잘린 입력은 null 을 준다', async () => {
  const cut = encrypt('MALE').slice(0, 10);
  assert.equal(await decryptField(cut, KEY_B64, AAD), null);
});

test('base64 가 아니면 null 을 준다', async () => {
  assert.equal(await decryptField('!!!not base64!!!', KEY_B64, AAD), null);
});

test('빈 문자열은 null 을 준다', async () => {
  assert.equal(await decryptField('', KEY_B64, AAD), null);
});

test('extractBirthYear: YYYYMMDD 에서 연도만 뽑는다', () => {
  assert.equal(extractBirthYear('19900215'), 1990);
});

test('extractBirthYear: 하이픈 형식도 받는다', () => {
  assert.equal(extractBirthYear('1990-02-15'), 1990);
});

test('extractBirthYear: 알 수 없는 형식은 null', () => {
  assert.equal(extractBirthYear('unknown'), null);
  assert.equal(extractBirthYear(''), null);
  assert.equal(extractBirthYear(null), null);
});

test('extractBirthYear: 터무니없는 연도는 null', () => {
  assert.equal(extractBirthYear('18000101'), null);
  assert.equal(extractBirthYear('29990101'), null);
});
