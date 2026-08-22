/**
 * 토스 파트너 API 호출의 유일한 통로.
 *
 * 전송 방식(mTLS 직결 / 프록시 경유)은 이 파일 안에만 있다. 호출자는 함수
 * 시그니처만 안다 — mTLS 가 클라우드에서 막히면 이 파일 내부만 갈아끼운다.
 * 로컬 edge-runtime 1.74.3 에서 Deno.createHttpClient mTLS 는 실측 통과했다.
 */

const BASE = 'https://apps-in-toss-api.toss.im/api-partner/v1/apps-in-toss';

export type LoginMe = {
  userKey: string;
  encryptedGender?: string;
  encryptedBirthday?: string;
  scope?: string[];
  agreedTerms?: unknown;
};

let cachedClient: unknown = null;

/** 인증서는 PEM 이 여러 줄이라 시크릿에 base64 로 넣는다. */
function mtlsClient(): unknown {
  if (cachedClient) return cachedClient;
  const dec = (b64: string) =>
    new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  cachedClient = (Deno as any).createHttpClient({
    cert: dec(Deno.env.get('TOSS_CERT_B64')!),
    key: dec(Deno.env.get('TOSS_KEY_B64')!),
  });
  return cachedClient;
}

async function call(path: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    client: mtlsClient(),
  } as RequestInit);

  const text = await res.text();
  if (!res.ok) throw new Error(`toss ${path} HTTP ${res.status}: ${text.slice(0, 200)}`);

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`toss ${path} 응답이 JSON 이 아니다: ${text.slice(0, 200)}`);
  }
}

export async function exchangeToken(
  authorizationCode: string,
  referrer: string,
): Promise<{ accessToken: string }> {
  const body = await call('/user/oauth2/generate-token', {
    method: 'POST',
    body: JSON.stringify({ authorizationCode, referrer }),
  }) as { success?: { accessToken?: string }; accessToken?: string };

  // 응답 래핑 형태가 문서마다 달라 양쪽을 받는다
  const accessToken = body?.success?.accessToken ?? body?.accessToken;
  if (!accessToken) throw new Error('toss generate-token 응답에 accessToken 이 없다');
  return { accessToken };
}

export async function getLoginMe(accessToken: string): Promise<LoginMe> {
  const body = await call('/user/oauth2/login-me', {
    method: 'GET',
    headers: { authorization: `Bearer ${accessToken}` },
  }) as { success?: LoginMe } & LoginMe;

  const me = body?.success ?? body;
  if (!me?.userKey) throw new Error('toss login-me 응답에 userKey 가 없다');
  return me;
}
