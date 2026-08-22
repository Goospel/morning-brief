import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFeed } from '../supabase/functions/_shared/rss.ts';

const fixture = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');

test('RSS 2.0 을 파싱한다', () => {
  const items = parseFeed(fixture('rss.xml'));
  assert.equal(items.length, 2);
  assert.equal(items[0].url, 'https://example.com/a');
  assert.equal(items[0].title, '첫 번째 기사');
  assert.equal(items[0].publishedAt.toISOString(), '2026-08-21T01:00:00.000Z');
});

test('description 의 HTML 태그를 벗긴다', () => {
  const items = parseFeed(fixture('rss.xml'));
  assert.equal(items[0].excerpt, '본문 발췌 입니다.');
});

test('pubDate 가 없는 항목은 버린다', () => {
  const items = parseFeed(fixture('rss.xml'));
  assert.ok(!items.some((i) => i.url === 'https://example.com/b'));
});

test('Atom 을 파싱한다', () => {
  const items = parseFeed(fixture('atom.xml'));
  assert.equal(items.length, 2);
  assert.equal(items[0].url, 'https://example.org/x');
  assert.equal(items[0].excerpt, 'atom summary text');
});

test('Atom 에서 published 가 없으면 updated 로 대체한다', () => {
  const items = parseFeed(fixture('atom.xml'));
  assert.equal(items[1].publishedAt.toISOString(), '2026-08-20T01:00:00.000Z');
  assert.equal(items[1].excerpt, 'content fallback');
});

test('항목이 하나뿐이어도 배열로 돌려준다', () => {
  const items = parseFeed(fixture('single-item.xml'));
  assert.equal(items.length, 1);
  assert.equal(items[0].url, 'https://example.com/only');
});

test('깨진 XML 은 예외를 던진다', () => {
  assert.throws(() => parseFeed('<rss><channel><item></rss>'), /invalid XML/);
});

test('빈 문자열도 예외를 던진다', () => {
  assert.throws(() => parseFeed(''), /invalid XML/);
});
