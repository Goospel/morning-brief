import { isTopic, type Topic } from './topics.ts';

export type Summary = { summary: string; topics: Topic[]; evergreen: boolean };

/** 모델이 코드펜스로 감싸는 경우가 있어 첫 { 부터 마지막 } 까지만 떼어낸다. */
function extractJson(raw: string): string | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  return raw.slice(start, end + 1);
}

/**
 * 요약 응답을 파싱한다. 조금이라도 어긋나면 null 을 돌려준다 —
 * 호출자는 그 기사를 미요약 상태로 남겨 다음 날 재시도한다.
 */
export function parseSummary(raw: string): Summary | null {
  const json = extractJson(raw);
  if (!json) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const { summary, topics, evergreen } = parsed as
    { summary?: unknown; topics?: unknown; evergreen?: unknown };

  if (typeof summary !== 'string' || summary.trim() === '') return null;
  if (!Array.isArray(topics)) return null;

  const clean = [...new Set(topics.filter((t): t is string => typeof t === 'string'))]
    .filter(isTopic);
  if (clean.length === 0) return null;

  // evergreen 은 요약의 부속이다 — 못 읽어도 요약을 버리지 않고 false 로 접는다.
  // `=== true` 인 이유: 느슨하게 받으면 모델이 문자열 "true" 를 뱉을 때 조용히 통과한다.
  return { summary: summary.trim(), topics: clean, evergreen: evergreen === true };
}
