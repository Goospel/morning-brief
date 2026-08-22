export type Profile = {
  userKey: string;
  gender: string | null;
  birthYear: number | null;
  household: string;
  jobField: string;
  topics: string[];
};

export type Rule = {
  attribute: string;
  value: string;
  topic: string;
  weight: number;
};

export type Candidate = {
  id: number;
  topics: string[];
  lang: string;
  publishedAt: Date;
};

export const BRIEFING_SIZE = 6;
export const PER_TOPIC_MAX = 2;
const USER_TOPIC_BONUS = 1.5;
const FRESHNESS_MAX = 2;

/** 생년을 연령대 밴드로 바꾼다. profile_rules 의 age_band 값과 대응한다. */
export function ageBand(birthYear: number | null, now: Date): string | null {
  if (!birthYear) return null;
  const age = now.getUTCFullYear() - birthYear;
  if (age < 30) return '20s';
  if (age < 40) return '30s';
  if (age < 50) return '40s';
  return '50s+';
}

export function topicWeights(profile: Profile, rules: Rule[], now: Date): Map<string, number> {
  const attrs = new Map<string, string | null>([
    ['gender', profile.gender],
    ['age_band', ageBand(profile.birthYear, now)],
    ['household', profile.household],
    ['job_field', profile.jobField],
  ]);

  const weights = new Map<string, number>();
  for (const rule of rules) {
    if (attrs.get(rule.attribute) !== rule.value) continue;
    weights.set(rule.topic, (weights.get(rule.topic) ?? 0) + Number(rule.weight));
  }
  for (const topic of profile.topics) {
    weights.set(topic, (weights.get(topic) ?? 0) + USER_TOPIC_BONUS);
  }
  return weights;
}

/** 하루 지날 때마다 1점씩 깎이고 0 에서 멈춘다. */
export function freshness(publishedAt: Date, now: Date): number {
  const days = (now.getTime() - publishedAt.getTime()) / 86_400_000;
  return Math.max(0, FRESHNESS_MAX - days);
}

function score(c: Candidate, weights: Map<string, number>, now: Date): number {
  let s = 0;
  for (const topic of c.topics) s += weights.get(topic) ?? 0;
  return s + freshness(c.publishedAt, now);
}

/**
 * 오늘의 브리핑에 넣을 기사 id 를 고른다.
 * 규칙: 점수 내림차순 -> 한 토픽 최대 2건 -> 최대 size 건 -> 해외 최소 1건 보장.
 * 동점은 id 오름차순으로 깨서 같은 입력이면 늘 같은 결과가 나오게 한다.
 */
export function selectBriefing(
  profile: Profile,
  rules: Rule[],
  candidates: Candidate[],
  now: Date,
  size: number = BRIEFING_SIZE,
): number[] {
  const weights = topicWeights(profile, rules, now);
  const ranked = candidates
    .map((c) => ({ c, s: score(c, weights, now) }))
    .sort((a, b) => b.s - a.s || a.c.id - b.c.id);

  const picked: typeof ranked = [];
  const perTopic = new Map<string, number>();

  for (const r of ranked) {
    if (picked.length >= size) break;
    if (r.c.topics.some((t) => (perTopic.get(t) ?? 0) >= PER_TOPIC_MAX)) continue;
    picked.push(r);
    for (const t of r.c.topics) perTopic.set(t, (perTopic.get(t) ?? 0) + 1);
  }

  // 해외 최소 1건 보장 — 차별점이 점수에 밀려 사라지지 않게 강제한다.
  if (picked.length > 0 && !picked.some((r) => r.c.lang === 'en')) {
    const bestEn = ranked.find((r) => r.c.lang === 'en');
    if (bestEn) picked[picked.length - 1] = bestEn;
  }

  return picked.map((r) => r.c.id);
}
