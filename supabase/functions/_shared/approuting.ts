import { isTopic, isJobField, isHousehold } from './topics.ts';

export type Route = 'login' | 'briefing' | 'getMe' | 'putMe' | 'unlink';

/** Edge Function 은 /app/... 로도 /... 로도 불릴 수 있어 접두사를 걷어낸다. */
export function routeOf(method: string, pathname: string): Route | null {
  const tail = pathname.replace(/^\/app(?=\/|$)/, '') || '/';
  const key = `${method.toUpperCase()} ${tail.replace(/\/+$/, '') || '/'}`;
  switch (key) {
    case 'POST /login': return 'login';
    case 'GET /briefing': return 'briefing';
    case 'GET /me': return 'getMe';
    case 'PUT /me': return 'putMe';
    case 'POST /unlink': return 'unlink';
    default: return null;
  }
}

export type ProfilePatch = {
  job_field?: string;
  household?: string;
  topics?: string[];
  push_hour?: number;
  push_on?: boolean;
};

export type PatchResult =
  | { ok: true; patch: ProfilePatch }
  | { ok: false; reason: string };

/** 앱이 보낸 부분 갱신 요청을 DB 컬럼명으로 옮기며 고정 어휘로 검증한다. */
export function parseProfilePatch(input: unknown): PatchResult {
  if (typeof input !== 'object' || input === null) return { ok: false, reason: 'body 가 객체가 아니다' };
  const b = input as Record<string, unknown>;
  const patch: ProfilePatch = {};

  if (b.jobField !== undefined) {
    if (typeof b.jobField !== 'string' || !isJobField(b.jobField)) {
      return { ok: false, reason: 'jobField 가 고정 어휘 밖이다' };
    }
    patch.job_field = b.jobField;
  }

  if (b.household !== undefined) {
    if (typeof b.household !== 'string' || !isHousehold(b.household)) {
      return { ok: false, reason: 'household 가 고정 어휘 밖이다' };
    }
    patch.household = b.household;
  }

  if (b.topics !== undefined) {
    if (!Array.isArray(b.topics) || b.topics.length === 0) {
      return { ok: false, reason: 'topics 는 1개 이상이어야 한다' };
    }
    const clean = [...new Set(b.topics.filter((t): t is string => typeof t === 'string'))];
    if (clean.length !== b.topics.length || !clean.every(isTopic)) {
      return { ok: false, reason: 'topics 에 고정 어휘 밖 값이 있다' };
    }
    patch.topics = clean;
  }

  if (b.pushHour !== undefined) {
    if (typeof b.pushHour !== 'number' || !Number.isInteger(b.pushHour) || b.pushHour < 0 || b.pushHour > 23) {
      return { ok: false, reason: 'pushHour 는 0~23 정수여야 한다' };
    }
    patch.push_hour = b.pushHour;
  }

  if (b.pushOn !== undefined) {
    if (typeof b.pushOn !== 'boolean') return { ok: false, reason: 'pushOn 은 boolean 이어야 한다' };
    patch.push_on = b.pushOn;
  }

  if (Object.keys(patch).length === 0) return { ok: false, reason: '갱신할 필드가 없다' };
  return { ok: true, patch };
}
