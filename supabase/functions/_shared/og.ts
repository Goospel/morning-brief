// 원문 HTML 에서 og:image 를 뽑는다. RSS 에 이미지가 없는 소스(연합뉴스·한국경제 등)의 썸네일 백필용.
// 순수 함수라 fetch·재시도는 호출자(collect)가 맡는다.

/** 속성 순서를 가정하지 않으려고 meta 태그를 통째로 훑는다. */
const META_TAG = /<meta\b[^>]*>/gi;
// 닫는 따옴표까지 매칭하므로 og:image:width 같은 파생 속성은 자동으로 빠진다.
const OG_IMAGE_ATTR = /\b(?:property|name)\s*=\s*["']og:image["']/i;
const CONTENT_ATTR = /\bcontent\s*=\s*["']([^"']+)["']/i;

function httpUrl(s: string): string | null {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

/** HTML 에서 og:image URL 을 뽑는다. 없거나 쓸 수 없으면 null. */
export function extractOgImage(html: string): string | null {
  for (const [tag] of html.matchAll(META_TAG)) {
    if (!OG_IMAGE_ATTR.test(tag)) continue;
    const raw = CONTENT_ATTR.exec(tag)?.[1];
    if (!raw) continue;

    const url = httpUrl(raw.replace(/&amp;/gi, '&').trim());
    if (!url) return null;

    // 실측 표본 10건 중 5건이 언론사 로고였다(설계 1-3-1절). 카드 절반에 같은 로고가 붙느니
    // 이미지 없이 접히는 편이 낫다 — 오탐해도 최악이 「현상 유지」다.
    if (url.toLowerCase().includes('logo')) return null;
    return url;
  }
  return null;
}
