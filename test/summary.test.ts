import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSummary } from '../supabase/functions/_shared/summary.ts';

test('정상 JSON 을 파싱한다', () => {
  const r = parseSummary('{"summary":"세 문장 요약.","topics":["tech","ai"]}');
  assert.deepEqual(r, { summary: '세 문장 요약.', topics: ['tech', 'ai'] });
});

test('코드펜스로 감싼 JSON 도 파싱한다', () => {
  const r = parseSummary('```json\n{"summary":"요약","topics":["health"]}\n```');
  assert.deepEqual(r, { summary: '요약', topics: ['health'] });
});

test('어휘 밖 태그는 버린다', () => {
  const r = parseSummary('{"summary":"요약","topics":["tech","sports","ai"]}');
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
  assert.equal(parseSummary('{"summary":"요약","topics":["sports"]}'), null);
});

test('topics 가 배열이 아니면 null 을 준다', () => {
  assert.equal(parseSummary('{"summary":"요약","topics":"tech"}'), null);
});
