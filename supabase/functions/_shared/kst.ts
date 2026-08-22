const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** UTC 시각을 KST 기준 시(0~23)로 변환한다. */
export function kstHour(now: Date): number {
  return new Date(now.getTime() + KST_OFFSET_MS).getUTCHours();
}

/** UTC 시각을 KST 기준 YYYY-MM-DD 문자열로 변환한다. */
export function kstDateString(now: Date): string {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}
