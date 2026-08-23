import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractOgImage } from '../supabase/functions/_shared/og.ts';

/** 실측한 태그를 그대로 감싸는 최소 문서 */
const page = (head: string) => `<!DOCTYPE html><html><head><meta charset="utf-8">${head}</head><body>본문</body></html>`;

test('표준형 og:image 를 뽑는다 (한국경제 실측 형태)', () => {
  const html = page('<meta property="og:image" content="https://img.hankyung.com/photo/202608/AA.45423395.1.jpg" />');
  assert.equal(extractOgImage(html), 'https://img.hankyung.com/photo/202608/AA.45423395.1.jpg');
});

test('property 와 content 사이에 다른 속성이 껴 있어도 뽑는다 (연합뉴스 실측 형태)', () => {
  const html = page('<meta property="og:image" data-test-img="AAAA-2" content="https://img9.yna.co.kr/photo/etc/af/2026/08/23/PAF20260823178201009_P4.jpg">');
  assert.equal(extractOgImage(html), 'https://img9.yna.co.kr/photo/etc/af/2026/08/23/PAF20260823178201009_P4.jpg');
});

test('content 가 property 보다 앞에 와도 뽑는다', () => {
  const html = page('<meta content="https://example.com/photo/a.jpg" property="og:image">');
  assert.equal(extractOgImage(html), 'https://example.com/photo/a.jpg');
});

test('name="og:image" 형태도 받는다', () => {
  const html = page('<meta name="og:image" content="https://example.com/photo/b.jpg">');
  assert.equal(extractOgImage(html), 'https://example.com/photo/b.jpg');
});

test('og:image:width 만 있고 og:image 가 없으면 null 이다', () => {
  const html = page('<meta property="og:image:width" content="1200"><meta property="og:image:height" content="800">');
  assert.equal(extractOgImage(html), null);
});

test('og:image 가 아예 없으면 null 이다', () => {
  assert.equal(extractOgImage(page('<title>제목</title>')), null);
});

test('&amp; 를 디코드한다', () => {
  const html = page('<meta property="og:image" content="https://example.com/photo/a.jpg?w=1200&amp;h=800">');
  assert.equal(extractOgImage(html), 'https://example.com/photo/a.jpg?w=1200&h=800');
});

test('http(s) 가 아니면 버린다', () => {
  const html = page('<meta property="og:image" content="data:image/gif;base64,R0lGODlhAQABAA==">');
  assert.equal(extractOgImage(html), null);
});

// 표본 10건 중 5건이 언론사 로고였다(설계 1-3-1절 실측). 필터가 없으면 카드 절반에 같은 로고가 붙는다.
test('언론사 로고 URL 은 null 이다 — 연합뉴스 실측값', () => {
  const html = page('<meta property="og:image" content="https://r.yna.co.kr/global/home/v01/img/yonhapnews_logo_1200x800_kr01.jpg">');
  assert.equal(extractOgImage(html), null);
});

test('언론사 로고 URL 은 null 이다 — 한국경제 실측값', () => {
  const html = page('<meta property="og:image" content="https://static.hankyung.com/img/logo/logo-news-sns.png?v=20201130">');
  assert.equal(extractOgImage(html), null);
});

test('로고 검사는 대소문자를 가리지 않는다', () => {
  const html = page('<meta property="og:image" content="https://example.com/img/LOGO-news.png">');
  assert.equal(extractOgImage(html), null);
});

// 반대 방향 — 필터가 과하게 먹어 진짜 기사 사진까지 지우면 안 된다.
test('실제 기사 이미지는 통과한다 — 연합뉴스 실측값', () => {
  const html = page('<meta property="og:image" content="https://img9.yna.co.kr/photo/etc/af/2026/08/23/PAF20260823178201009_P4.jpg">');
  assert.equal(extractOgImage(html), 'https://img9.yna.co.kr/photo/etc/af/2026/08/23/PAF20260823178201009_P4.jpg');
});

test('실제 기사 이미지는 통과한다 — 한국경제 실측값', () => {
  const html = page('<meta property="og:image" content="https://img.hankyung.com/photo/202608/AA.45423395.1.jpg">');
  assert.equal(extractOgImage(html), 'https://img.hankyung.com/photo/202608/AA.45423395.1.jpg');
});
