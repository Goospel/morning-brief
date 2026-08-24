import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ageBand, topicWeights, freshness, selectBriefing,
  EVERGREEN_FRESHNESS, EVERGREEN_MAX,
  type Profile, type Rule, type Candidate,
} from '../supabase/functions/_shared/scoring.ts';

const NOW = new Date('2026-08-22T00:00:00Z');

const profile: Profile = {
  userKey: 'u1',
  gender: 'male',
  birthYear: 1990,
  household: 'married',
  jobField: 'it',
  topics: ['ai'],
};

const rules: Rule[] = [
  { attribute: 'job_field', value: 'it', topic: 'tech', weight: 3 },
  { attribute: 'job_field', value: 'it', topic: 'ai', weight: 2 },
  { attribute: 'age_band', value: '30s', topic: 'finance', weight: 1 },
  { attribute: 'household', value: 'married', topic: 'realestate', weight: 1 },
  { attribute: 'job_field', value: 'medical', topic: 'health', weight: 5 },
];

function candidate(id: number, topics: string[], lang = 'ko', hoursAgo = 1): Candidate {
  return {
    id,
    topics,
    lang,
    publishedAt: new Date(NOW.getTime() - hoursAgo * 3_600_000),
  };
}

test('ageBand: 1990년생은 2026년에 30대', () => {
  assert.equal(ageBand(1990, NOW), '30s');
});

test('ageBand: 경계값 — 40년 차이는 40대', () => {
  assert.equal(ageBand(1986, NOW), '40s');
});

test('ageBand: 생년이 없으면 null', () => {
  assert.equal(ageBand(null, NOW), null);
});

test('topicWeights: 맞는 규칙만 합산한다', () => {
  const w = topicWeights(profile, rules, NOW);
  assert.equal(w.get('tech'), 3);
  assert.equal(w.get('finance'), 1);
  assert.equal(w.get('realestate'), 1);
  assert.equal(w.get('health'), undefined, '직업이 다른 규칙은 안 걸려야 한다');
});

test('topicWeights: 사용자가 직접 고른 토픽에 보너스가 더해진다', () => {
  const w = topicWeights(profile, rules, NOW);
  assert.equal(w.get('ai'), 3.5, '규칙 2 + 사용자 보너스 1.5');
});

test('freshness: 갓 나온 기사가 오래된 기사보다 높다', () => {
  assert.ok(freshness(new Date(NOW.getTime() - 3_600_000), NOW) >
            freshness(new Date(NOW.getTime() - 48 * 3_600_000), NOW));
});

test('freshness: 아주 오래되면 0 아래로 안 내려간다', () => {
  assert.equal(freshness(new Date('2020-01-01T00:00:00Z'), NOW), 0);
});

test('selectBriefing: 점수 높은 순으로 고른다', () => {
  const ids = selectBriefing(profile, rules, [
    candidate(1, ['culture']),
    candidate(2, ['tech']),
    candidate(3, ['ai']),
  ], NOW);
  assert.deepEqual(ids.slice(0, 2), [3, 2], 'ai(3.5) > tech(3) > culture(0)');
});

test('selectBriefing: 기본 6건까지만 고른다', () => {
  const many = Array.from({ length: 20 }, (_, i) => candidate(i + 1, ['tech']));
  assert.equal(selectBriefing(profile, rules, many, NOW).length <= 6, true);
});

test('selectBriefing: 한 토픽은 최대 2건까지만', () => {
  const ids = selectBriefing(profile, rules, [
    candidate(1, ['tech']), candidate(2, ['tech']),
    candidate(3, ['tech']), candidate(4, ['tech']),
    candidate(5, ['culture']), candidate(6, ['living']),
  ], NOW);
  const techCount = ids.filter((id) => id <= 4).length;
  assert.equal(techCount, 2);
});

test('selectBriefing: 해외 기사가 최소 1건 들어간다', () => {
  const ids = selectBriefing(profile, rules, [
    candidate(1, ['tech']), candidate(2, ['ai']),
    candidate(3, ['finance']), candidate(4, ['realestate']),
    candidate(5, ['culture']), candidate(6, ['living']),
    candidate(99, ['world'], 'en', 20),
  ], NOW);
  assert.ok(ids.includes(99), '점수가 낮아도 해외 1건은 보장된다');
});

test('selectBriefing: 해외 후보가 아예 없으면 국내로만 채운다', () => {
  const ids = selectBriefing(profile, rules, [
    candidate(1, ['tech']), candidate(2, ['ai']),
  ], NOW);
  assert.deepEqual(ids.slice().sort((a, b) => a - b), [1, 2]);
});

test('selectBriefing: 후보가 없으면 빈 배열', () => {
  assert.deepEqual(selectBriefing(profile, rules, [], NOW), []);
});

test('selectBriefing: 동점이면 id 순으로 결정론적이다', () => {
  const a = selectBriefing(profile, rules, [
    candidate(7, ['culture']), candidate(3, ['culture']), candidate(5, ['culture']),
  ], NOW);
  const b = selectBriefing(profile, rules, [
    candidate(5, ['culture']), candidate(7, ['culture']), candidate(3, ['culture']),
  ], NOW);
  assert.deepEqual(a, b);
});

test('selectBriefing: 자리가 남으면 해외 기사를 교체가 아니라 추가로 넣는다', () => {
  const ids = selectBriefing(profile, rules, [
    candidate(1, ['tech']),
    candidate(2, ['tech']),
    candidate(99, ['tech'], 'en', 20),
  ], NOW);
  assert.equal(ids.length, 3, '국내 2건이 밀려나면 안 된다');
  assert.ok(ids.includes(1) && ids.includes(2) && ids.includes(99));
});

// 위 테스트가 push 분기(자리 남음), 이 테스트가 교체 분기(꽉 참)를 덮는다.
test('selectBriefing: 자리가 꽉 찼으면 최하위를 해외 기사로 교체한다', () => {
  const ids = selectBriefing(profile, rules, [
    candidate(1, ['tech']), candidate(2, ['tech']),
    candidate(3, ['ai']), candidate(4, ['ai']),
    candidate(5, ['finance']), candidate(6, ['realestate']),
    candidate(99, ['tech'], 'en', 20),
  ], NOW);
  assert.ok(ids.includes(99), 'tech 가 이미 2건이어도 해외 보장이 이긴다');
});

// ── evergreen ────────────────────────────────────────────────
// 시의성 없는 글이 후보 창·신선도 감쇠에서 살아남게 한다.
// 설계: docs/superpowers/specs/2026-08-24-evergreen-design.md

function ever(id: number, topics: string[], lang = 'ko', daysAgo = 20): Candidate {
  return {
    id, topics, lang, evergreen: true,
    publishedAt: new Date(NOW.getTime() - daysAgo * 86_400_000),
  };
}

test('freshness: evergreen 은 경과일과 무관하게 고정값이다', () => {
  const day = 86_400_000;
  const a = freshness(new Date(NOW.getTime() - 1 * day), NOW, true);
  const b = freshness(new Date(NOW.getTime() - 30 * day), NOW, true);
  assert.equal(a, EVERGREEN_FRESHNESS);
  assert.equal(b, EVERGREEN_FRESHNESS);
});

test('freshness: evergreen 은 오늘 뉴스보다 낮고 이틀 지난 뉴스보다 높다', () => {
  const day = 86_400_000;
  const todayNews = freshness(NOW, NOW, false);
  const oldNews = freshness(new Date(NOW.getTime() - 2 * day), NOW, false);
  const green = freshness(new Date(NOW.getTime() - 30 * day), NOW, true);
  assert.ok(green < todayNews, 'evergreen 이 오늘 뉴스를 이기면 안 된다');
  assert.ok(green > oldNews, 'evergreen 이 이틀 지난 뉴스에 지면 안 된다');
});

test('freshness: evergreen 인자를 안 주면 기존 감쇠 그대로다', () => {
  const d = new Date(NOW.getTime() - 86_400_000);
  assert.equal(freshness(d, NOW), freshness(d, NOW, false));
});

test('selectBriefing: evergreen 은 상한 건수까지만 들어간다', () => {
  // 토픽이 전부 맞아 점수가 높은 evergreen 을 상한보다 많이 준다.
  const cands = [
    ever(1, ['tech']), ever(2, ['ai']), ever(3, ['tech']),
    ever(4, ['ai']), ever(5, ['tech']),
  ];
  const picked = selectBriefing(profile, rules, cands, NOW);
  assert.equal(picked.length, EVERGREEN_MAX);
});

test('selectBriefing: evergreen 상한을 넘으면 나머지 자리는 뉴스가 채운다', () => {
  const cands = [
    ever(1, ['tech']), ever(2, ['tech']), ever(3, ['tech']), ever(4, ['tech']),
    candidate(10, ['ai']), candidate(11, ['ai']),
  ];
  const picked = selectBriefing(profile, rules, cands, NOW);
  const greenPicked = picked.filter((id) => id <= 4);
  assert.equal(greenPicked.length, EVERGREEN_MAX);
  assert.ok(picked.includes(10) && picked.includes(11), '뉴스가 남은 자리를 채워야 한다');
});

test('selectBriefing: evergreen 후보가 없으면 결과가 기존과 같다 (회귀 가드)', () => {
  const cands = [
    candidate(1, ['tech']), candidate(2, ['ai']), candidate(3, ['finance']),
  ];
  // 점수 순: ai(3.5) > tech(3.0) > finance(1.0). evergreen 코드가 이 순서를 안 건드려야 한다.
  assert.deepEqual(selectBriefing(profile, rules, cands, NOW), [2, 1, 3]);
});

test('selectBriefing: 해외 보장은 evergreen 상한보다 우선한다', () => {
  // 국내 evergreen 이 상한을 채운 뒤에도 해외 1건 보장은 지켜져야 한다.
  // (보장이 상한에 막히면 보장이 아니게 된다 — 기존 per-topic 상한과 같은 원칙)
  const cands = [
    ever(1, ['tech'], 'ko'), ever(2, ['tech'], 'ko'),
    ever(3, ['tech'], 'en'),
  ];
  const picked = selectBriefing(profile, rules, cands, NOW);
  assert.ok(picked.includes(3), '해외 기사가 evergreen 상한에 막히면 안 된다');
});

test('selectBriefing: 30일 전 evergreen 이 이틀 지난 뉴스를 점수로 이긴다', () => {
  // 이 기능의 존재 이유 그 자체다. score() 가 evergreen 을 freshness 에 안 넘기면
  // 둘 다 신선도 0 이 돼 동점 → id 순으로 뒤집힌다.
  // evergreen 쪽 id 를 일부러 크게 줘서 「동점이면 진다」를 만들어 둔다.
  const cands = [
    ever(9, ['tech'], 'ko', 30),      // evergreen, 30일 전
    candidate(2, ['tech'], 'ko', 48), // 뉴스, 이틀 전 (신선도 0)
  ];
  assert.deepEqual(selectBriefing(profile, rules, cands, NOW), [9, 2]);
});
