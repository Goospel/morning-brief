import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ageBand, topicWeights, freshness, selectBriefing,
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
  assert.deepEqual(ids.sort(), [1, 2]);
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
