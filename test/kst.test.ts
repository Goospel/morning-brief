import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kstHour, kstDateString } from '../supabase/functions/_shared/kst.ts';

test('kstHour: UTC 22시는 KST 다음날 7시', () => {
  assert.equal(kstHour(new Date('2026-08-22T22:00:00Z')), 7);
});

test('kstHour: UTC 자정은 KST 9시', () => {
  assert.equal(kstHour(new Date('2026-08-22T00:00:00Z')), 9);
});

test('kstHour: UTC 15시는 KST 자정(0시)', () => {
  assert.equal(kstHour(new Date('2026-08-22T15:00:00Z')), 0);
});

test('kstDateString: UTC 22시는 KST 기준 다음 날짜', () => {
  assert.equal(kstDateString(new Date('2026-08-22T22:00:00Z')), '2026-08-23');
});

test('kstDateString: UTC 14시는 KST 기준 같은 날짜', () => {
  assert.equal(kstDateString(new Date('2026-08-22T14:00:00Z')), '2026-08-22');
});
