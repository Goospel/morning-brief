import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOPICS, JOB_FIELDS, HOUSEHOLDS,
  isTopic, isJobField, isHousehold,
} from '../supabase/functions/_shared/topics.ts';

test('고정 어휘 개수가 스펙과 맞는다', () => {
  assert.equal(TOPICS.length, 13);
  assert.equal(JOB_FIELDS.length, 8);
  assert.equal(HOUSEHOLDS.length, 3);
});

test('isJobField 는 어휘 안만 통과시킨다', () => {
  assert.equal(isJobField('it'), true);
  assert.equal(isJobField('medical'), true);
  assert.equal(isJobField('astronaut'), false);
  assert.equal(isJobField(''), false);
});

test('isHousehold 는 어휘 안만 통과시킨다', () => {
  assert.equal(isHousehold('single'), true);
  assert.equal(isHousehold('with_kids'), true);
  assert.equal(isHousehold('divorced'), false);
});

// TOPICS 의 'finance'(재테크 주제)와 JOB_FIELDS 의 'finance'(금융업)는 문자열이 같지만
// 서로 다른 컬럼(articles.topics / profiles.job_field)에 저장돼 섞일 일이 없다.
// 그래서 교차 중복은 허용하고, 한 어휘 안의 중복만 막는다 — 그건 오타의 신호다.
test('각 어휘 안에 중복이 없다', () => {
  const lists = [['TOPICS', TOPICS], ['JOB_FIELDS', JOB_FIELDS], ['HOUSEHOLDS', HOUSEHOLDS]] as const;
  for (const [name, list] of lists) {
    const dup = list.filter((v, i) => list.indexOf(v) !== i);
    assert.deepEqual(dup, [], `${name} 안에 중복: ${dup.join(', ')}`);
  }
});
