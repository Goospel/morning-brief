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

test('media:thumbnail 의 url 을 쓴다', () => {
  const items = parseFeed(fixture('rss-images.xml'));
  assert.equal(items[0].imageUrl, 'https://ichef.bbci.co.uk/news/240/thumb.jpg');
});

test('media:thumbnail 이 없으면 이미지 타입 media:content 를 쓴다', () => {
  const items = parseFeed(fixture('rss-images.xml'));
  assert.equal(items[1].imageUrl, 'https://cdn.arstechnica.net/a.png');
});

test('media:content 가 오디오면 이미지로 쓰지 않는다', () => {
  const items = parseFeed(fixture('rss-images.xml'));
  assert.equal(items[2].imageUrl, null);
});

test('본문 HTML 의 첫 img 를 항목 링크 기준으로 절대화한다', () => {
  const items = parseFeed(fixture('rss-images.xml'));
  assert.equal(items[3].imageUrl, 'https://www.zdnet.co.kr/images/2026/08/21/a.jpg');
});

test('data: URI 이미지는 버린다', () => {
  const items = parseFeed(fixture('rss-images.xml'));
  assert.equal(items[4].imageUrl, null);
});

test('이미지가 아무 데도 없으면 null 이다', () => {
  const items = parseFeed(fixture('rss-images.xml'));
  assert.equal(items[5].imageUrl, null);
});

test('Atom 도 content 원문의 img 를 뽑는다', () => {
  const items = parseFeed(fixture('atom-image.xml'));
  assert.equal(items[0].imageUrl, 'https://example.org/img/atom1.png');
  assert.equal(items[1].imageUrl, null);
});
