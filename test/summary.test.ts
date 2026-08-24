import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSummary } from '../supabase/functions/_shared/summary.ts';

test('정상 JSON 을 파싱한다', () => {
  const r = parseSummary('{"summary":"세 문장 요약.","topics":["tech","ai"]}');
  assert.deepEqual(r, { summary: '세 문장 요약.', topics: ['tech', 'ai'], evergreen: false });
});

test('코드펜스로 감싼 JSON 도 파싱한다', () => {
  const r = parseSummary('```json\n{"summary":"요약","topics":["health"]}\n```');
  assert.deepEqual(r, { summary: '요약', topics: ['health'], evergreen: false });
});

test('어휘 밖 태그는 버린다', () => {
  const r = parseSummary('{"summary":"요약","topics":["tech","weather","ai"]}');
  assert.deepEqual(r?.topics, ['tech', 'ai']);
});

test('중복 태그는 하나로 접는다', () => {
  const r = parseSummary('{"summary":"요약","topics":["ai","ai","tech"]}');
  assert.deepEqual(r?.topics, ['ai', 'tech']);
});

test('JSON 이 아니면 null 을 준다', () => {
  assert.equal(parseSummary('죄송하지만 요약할 수 없습니다.'), null);
});

test('summary 가 비면 null 을 준다', () => {
  assert.equal(parseSummary('{"summary":"   ","topics":["tech"]}'), null);
});

test('topics 가 전부 어휘 밖이면 null 을 준다', () => {
  assert.equal(parseSummary('{"summary":"요약","topics":["gossip"]}'), null);
});

test('topics 가 배열이 아니면 null 을 준다', () => {
  assert.equal(parseSummary('{"summary":"요약","topics":"tech"}'), null);
});

// ── evergreen ────────────────────────────────────────────────
// 플래그 하나 때문에 멀쩡한 요약을 통째로 버리지 않는다 — 못 읽으면 false 로 접는다.
// 설계: docs/superpowers/specs/2026-08-24-evergreen-design.md

test('evergreen: true 를 읽는다', () => {
  const r = parseSummary('{"summary":"요약","topics":["tech"],"evergreen":true}');
  assert.equal(r?.evergreen, true);
});

test('evergreen: false 를 읽는다', () => {
  const r = parseSummary('{"summary":"요약","topics":["tech"],"evergreen":false}');
  assert.equal(r?.evergreen, false);
});

test('evergreen: 필드가 없으면 false 로 접는다 (요약은 살린다)', () => {
  const r = parseSummary('{"summary":"요약","topics":["tech"]}');
  assert.equal(r?.evergreen, false);
  assert.equal(r?.summary, '요약');
});

test('evergreen: boolean 이 아니면 false 로 접는다 (요약은 살린다)', () => {
  const r = parseSummary('{"summary":"요약","topics":["tech"],"evergreen":"네"}');
  assert.equal(r?.evergreen, false);
  assert.equal(r?.summary, '요약');
});

test('evergreen: 문자열 "true" 도 false 다 (조용한 통과를 막는다)', () => {
  const r = parseSummary('{"summary":"요약","topics":["tech"],"evergreen":"true"}');
  assert.equal(r?.evergreen, false);
});
