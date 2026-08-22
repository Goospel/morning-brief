import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issueSession, verifySession, SESSION_TTL_MS } from '../supabase/functions/_shared/session.ts';

const SECRET = 'test-secret-do-not-use-in-production';
const NOW = new Date('2026-08-23T00:00:00Z');

test('발급한 토큰을 다시 검증하면 같은 userKey 가 나온다', async () => {
  const token = await issueSession('user-abc', SECRET, NOW);
  assert.equal(await verifySession(token, SECRET, NOW), 'user-abc');
});

test('서명이 변조되면 거부한다', async () => {
  const token = await issueSession('user-abc', SECRET, NOW);
  const [payload, sig] = token.split('.');
  const tampered = `${payload}.${sig.slice(0, -2)}XX`;
  assert.equal(await verifySession(tampered, SECRET, NOW), null);
});

test('페이로드가 변조되면 거부한다', async () => {
  const token = await issueSession('user-abc', SECRET, NOW);
  const other = await issueSession('user-victim', SECRET, NOW);
  const spliced = `${other.split('.')[0]}.${token.split('.')[1]}`;
  assert.equal(await verifySession(spliced, SECRET, NOW), null);
});

test('다른 비밀키로는 검증되지 않는다', async () => {
  const token = await issueSession('user-abc', SECRET, NOW);
  assert.equal(await verifySession(token, 'another-secret', NOW), null);
});

test('만료된 토큰은 거부한다', async () => {
  const token = await issueSession('user-abc', SECRET, NOW);
  const later = new Date(NOW.getTime() + SESSION_TTL_MS + 1000);
  assert.equal(await verifySession(token, SECRET, later), null);
});

test('만료 직전은 통과한다', async () => {
  const token = await issueSession('user-abc', SECRET, NOW);
  const justBefore = new Date(NOW.getTime() + SESSION_TTL_MS - 1000);
  assert.equal(await verifySession(token, SECRET, justBefore), 'user-abc');
});

test('형식이 어긋나면 거부한다', async () => {
  for (const bad of ['', 'nodot', 'a.b.c', '.', 'a.']) {
    assert.equal(await verifySession(bad, SECRET, NOW), null, `입력: ${JSON.stringify(bad)}`);
  }
});

test('userKey 에 마침표가 있어도 안전하다', async () => {
  const token = await issueSession('user.with.dots', SECRET, NOW);
  assert.equal(await verifySession(token, SECRET, NOW), 'user.with.dots');
});
