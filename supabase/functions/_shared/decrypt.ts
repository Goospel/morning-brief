/**
 * 토스 login-me 가 주는 암호화 개인정보(AES-256-GCM) 복호화.
 * 키·AAD 는 토스 로그인 설정 후 이메일로 받는다.
 * 실패는 던지지 않고 null 을 준다 — 개인정보가 없어도 로그인은 진행돼야 한다.
 */

const IV_BYTES = 12;

function b64ToBytes(s: string): Uint8Array | null {
  try {
    return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

export async function decryptField(
  encryptedBase64: string,
  keyBase64: string,
  aad: string,
): Promise<string | null> {
  if (!encryptedBase64) return null;

  const raw = b64ToBytes(encryptedBase64);
  const keyBytes = b64ToBytes(keyBase64);
  // GCM 태그 16바이트가 뒤에 붙으므로 IV + 태그보다는 길어야 한다
  if (!raw || !keyBytes || raw.length <= IV_BYTES + 16) return null;

  try {
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
    const plain = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: raw.slice(0, IV_BYTES),
        additionalData: new TextEncoder().encode(aad),
      },
      key,
      raw.slice(IV_BYTES),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;   // 키·AAD 불일치, 태그 검증 실패 전부 여기로 온다
  }
}

/** 생일에서 연도만 남긴다 — 원문은 저장하지 않는다(최소수집). */
export function extractBirthYear(birthday: string | null | undefined): number | null {
  if (!birthday) return null;
  const digits = birthday.replace(/\D/g, '');
  if (digits.length < 4) return null;
  const year = Number(digits.slice(0, 4));
  if (!Number.isFinite(year) || year < 1900 || year > 2100) return null;
  return year;
}
