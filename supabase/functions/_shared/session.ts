/**
 * 무상태 세션 토큰. DB에 아무것도 저장하지 않는다.
 * 형식: base64url(userKey + "." + 만료epoch) + "." + base64url(HMAC-SHA256)
 * Web Crypto 만 쓰므로 Deno 와 Node 양쪽에서 그대로 돈다.
 */

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30일

function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return b64urlEncode(new Uint8Array(mac));
}

/** 타이밍 공격을 피하려고 길이와 내용을 상수 시간으로 비교한다. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function issueSession(userKey: string, secret: string, now: Date): Promise<string> {
  const expiresAt = now.getTime() + SESSION_TTL_MS;
  const raw = `${userKey}.${expiresAt}`;
  const payload = b64urlEncode(new TextEncoder().encode(raw));
  return `${payload}.${await sign(payload, secret)}`;
}

/** 유효하면 userKey, 아니면 null. 던지지 않는다 — 호출자는 401 로 응답한다. */
export async function verifySession(token: string, secret: string, now: Date): Promise<string | null> {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!payload || !signature) return null;

  if (!timingSafeEqual(signature, await sign(payload, secret))) return null;

  let raw: string;
  try {
    raw = new TextDecoder().decode(b64urlDecode(payload));
  } catch {
    return null;
  }

  const sep = raw.lastIndexOf('.');
  if (sep <= 0) return null;
  const userKey = raw.slice(0, sep);
  const expiresAt = Number(raw.slice(sep + 1));
  if (!Number.isFinite(expiresAt) || now.getTime() >= expiresAt) return null;

  return userKey;
}
