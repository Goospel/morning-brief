import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeOf, parseProfilePatch } from '../supabase/functions/_shared/approuting.ts';

test('routeOf: 경로와 메서드로 분기한다', () => {
  assert.equal(routeOf('POST', '/app/login'), 'login');
  assert.equal(routeOf('GET', '/app/briefing'), 'briefing');
  assert.equal(routeOf('GET', '/app/me'), 'getMe');
  assert.equal(routeOf('PUT', '/app/me'), 'putMe');
  assert.equal(routeOf('POST', '/app/unlink'), 'unlink');
});

test('routeOf: 함수 이름 접두사가 없어도 동작한다', () => {
  assert.equal(routeOf('GET', '/briefing'), 'briefing');
});

test('routeOf: 모르는 경로·메서드는 null', () => {
  assert.equal(routeOf('GET', '/app/login'), null);
  assert.equal(routeOf('DELETE', '/app/me'), null);
  assert.equal(routeOf('GET', '/app/nope'), null);
});

test('parseProfilePatch: 유효한 값을 통과시킨다', () => {
  const r = parseProfilePatch({ jobField: 'it', household: 'single', topics: ['tech', 'ai'], pushHour: 7, pushOn: false });
  assert.deepEqual(r, {
    ok: true,
    patch: { job_field: 'it', household: 'single', topics: ['tech', 'ai'], push_hour: 7, push_on: false },
  });
});

test('parseProfilePatch: 보낸 필드만 담는다', () => {
  const r = parseProfilePatch({ pushHour: 9 });
  assert.deepEqual(r, { ok: true, patch: { push_hour: 9 } });
});

test('parseProfilePatch: 어휘 밖 jobField 는 거부', () => {
  assert.equal(parseProfilePatch({ jobField: 'astronaut' }).ok, false);
});

test('parseProfilePatch: 어휘 밖 topic 이 하나라도 있으면 거부', () => {
  assert.equal(parseProfilePatch({ topics: ['tech', 'weather'] }).ok, false);
});

test('parseProfilePatch: 빈 topics 는 거부 (최소 1개)', () => {
  assert.equal(parseProfilePatch({ topics: [] }).ok, false);
});

test('parseProfilePatch: pushHour 범위를 강제한다', () => {
  assert.equal(parseProfilePatch({ pushHour: 24 }).ok, false);
  assert.equal(parseProfilePatch({ pushHour: -1 }).ok, false);
  assert.equal(parseProfilePatch({ pushHour: 3.5 }).ok, false);
  assert.equal(parseProfilePatch({ pushHour: 0 }).ok, true);
  assert.equal(parseProfilePatch({ pushHour: 23 }).ok, true);
});

test('parseProfilePatch: 아무 필드도 없으면 거부', () => {
  assert.equal(parseProfilePatch({}).ok, false);
});

test('parseProfilePatch: 객체가 아니면 거부', () => {
  assert.equal(parseProfilePatch(null).ok, false);
  assert.equal(parseProfilePatch('nope').ok, false);
});
