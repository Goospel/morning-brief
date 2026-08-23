import { Storage, TossAuth } from '@apps-in-toss/web-framework';
import * as mock from './mock';

const BASE = import.meta.env.VITE_API_BASE as string;

/** `vite dev --mode mock` 일 때만 true. prod 빌드에서는 상수 false 로 접혀 mock.ts 가 번들에서 빠진다. */
const MOCK = import.meta.env.VITE_MOCK === '1';

export type Card = {
  articleId: number; title: string; summaryKo: string;
  sourceName: string; url: string; publishedAt: string;
  topics: string[]; imageUrl: string | null;
};

export type BriefingResponse = {
  onboarded: boolean; date: string | null; isToday: boolean;
  nextHour: number | null; cards: Card[] | null;
};

export type Me = {
  jobField: string | null; household: string; topics: string[];
  pushHour: number; pushOn: boolean;
};

export type MePatch = {
  jobField?: string; household?: string; topics?: string[];
  pushHour?: number; pushOn?: boolean;
};

async function getSession(): Promise<string | null> {
  return (await Storage.getItem('session')) ?? null;
}

/** 로그인해서 세션을 저장한다. onboarded 를 돌려준다. */
async function realLogin(): Promise<{ onboarded: boolean }> {
  const { authorizationCode, referrer } = await TossAuth.login();
  const res = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ authorizationCode, referrer }),
  });
  if (!res.ok) throw new Error(`login ${res.status}`);
  const body = await res.json() as { sessionToken: string; onboarded: boolean };
  await Storage.setItem('session', body.sessionToken);
  return { onboarded: body.onboarded };
}

/**
 * 세션을 붙여 호출한다. 401 이면 조용히 한 번 재로그인하고 재시도한다.
 * 재시도는 딱 1회 — 무한 루프를 만들지 않는다.
 */
async function call<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const token = await getSession();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (res.status === 401 && !retried) {
    await realLogin();
    return call<T>(path, init, true);
  }
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return await res.json() as T;
}

async function realHasSession(): Promise<boolean> {
  return Boolean(await getSession());
}

/** 오프라인 대비 캐시 */
async function realCacheBriefing(b: BriefingResponse): Promise<void> {
  await Storage.setItem('lastBriefing', JSON.stringify(b));
}

async function realReadCachedBriefing(): Promise<BriefingResponse | null> {
  const raw = await Storage.getItem('lastBriefing');
  if (!raw) return null;
  try { return JSON.parse(raw) as BriefingResponse; } catch { return null; }
}

export const login: () => Promise<{ onboarded: boolean }> = MOCK ? mock.login : realLogin;
export const getBriefing: () => Promise<BriefingResponse> = MOCK ? mock.getBriefing : () => call<BriefingResponse>('/briefing');
export const getMe: () => Promise<Me> = MOCK ? mock.getMe : () => call<Me>('/me');
export const putMe: (patch: MePatch) => Promise<Me> = MOCK
  ? mock.putMe
  : (patch) => call<Me>('/me', { method: 'PUT', body: JSON.stringify(patch) });
export const hasSession: () => Promise<boolean> = MOCK ? mock.hasSession : realHasSession;
export const cacheBriefing: (b: BriefingResponse) => Promise<void> = MOCK ? mock.cacheBriefing : realCacheBriefing;
export const readCachedBriefing: () => Promise<BriefingResponse | null> = MOCK ? mock.readCachedBriefing : realReadCachedBriefing;
