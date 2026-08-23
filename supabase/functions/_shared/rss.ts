import { XMLParser, XMLValidator } from 'fast-xml-parser';

export type FeedItem = {
  url: string;
  title: string;
  publishedAt: Date;
  excerpt: string;
  /** 썸네일 후보. 피드에 없으면 null — collect 잡이 원문 og:image 로 백필한다. */
  imageUrl: string | null;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  trimValues: true,
});

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

/** CDATA·속성이 섞인 노드에서 텍스트만 뽑는다. */
function text(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return String((v as Record<string, unknown>)['#text'] ?? '');
  return String(v);
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** 확장자로 이미지를 알아보는 마지막 수단 — type·medium 이 둘 다 없을 때만 쓴다. */
const IMAGE_EXT = /\.(jpe?g|png|webp|gif)([?#]|$)/i;

/** 상대경로를 항목 링크 기준으로 절대화하고 http(s) 가 아니면(data: 등) 버린다. */
function absoluteHttpUrl(src: string, base: string): string | null {
  if (!src) return null;
  try {
    const u = new URL(src, base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

function attr(node: unknown, name: string): string {
  if (node && typeof node === 'object') return String((node as Record<string, unknown>)[name] ?? '');
  return '';
}

/** HTML 원문의 첫 <img src>. stripHtml 을 거치기 **전** 문자열에 써야 한다. */
function firstImgSrc(html: string): string {
  return /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i.exec(html)?.[1] ?? '';
}

/** media:thumbnail → 이미지 media:content → 본문 첫 img 순으로 고른다. */
function pickImage(node: Record<string, unknown>, html: string, base: string): string | null {
  for (const t of asArray(node['media:thumbnail'] as unknown)) {
    const u = absoluteHttpUrl(attr(t, '@url'), base);
    if (u) return u;
  }
  for (const c of asArray(node['media:content'] as unknown)) {
    const url = attr(c, '@url');
    const type = attr(c, '@type');
    const medium = attr(c, '@medium');
    // 팟캐스트류 피드는 media:content 에 오디오를 넣는다 — 타입 검사를 건너뛰면 안 된다.
    const isImage = type.startsWith('image/') || medium === 'image'
      || (!type && !medium && IMAGE_EXT.test(url));
    if (!isImage) continue;
    const u = absoluteHttpUrl(url, base);
    if (u) return u;
  }
  return absoluteHttpUrl(firstImgSrc(html), base);
}

function toDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fromRss(it: Record<string, unknown>): FeedItem | null {
  const url = text(it.link).trim();
  const title = text(it.title).trim();
  const publishedAt = toDate(text(it.pubDate));
  if (!url || !title || !publishedAt) return null;
  const body = text(it['content:encoded']) || text(it.description);
  return {
    url, title, publishedAt,
    excerpt: stripHtml(text(it.description)),
    imageUrl: pickImage(it, body, url),
  };
}

function fromAtom(e: Record<string, unknown>): FeedItem | null {
  const links = asArray(e.link as Record<string, string> | Record<string, string>[]);
  const alt = links.find((l) => !l['@rel'] || l['@rel'] === 'alternate') ?? links[0];
  const url = String(alt?.['@href'] ?? '').trim();
  const title = text(e.title).trim();
  const publishedAt = toDate(text(e.published)) ?? toDate(text(e.updated));
  if (!url || !title || !publishedAt) return null;
  const body = text(e.content) || text(e.summary);
  const excerpt = stripHtml(text(e.summary) || text(e.content));
  return { url, title, publishedAt, excerpt, imageUrl: pickImage(e, body, url) };
}

/**
 * RSS 2.0 또는 Atom 피드를 파싱한다.
 * 형식이 깨졌으면 던진다 — 호출자가 소스 단위로 잡아서 나머지 소스를 계속 돌린다.
 */
export function parseFeed(xml: string): FeedItem[] {
  const valid = XMLValidator.validate(xml);
  if (valid !== true) throw new Error(`invalid XML: ${valid.err.msg}`);

  const doc = parser.parse(xml) as Record<string, any>;

  const rssItems = asArray(doc?.rss?.channel?.item);
  if (rssItems.length > 0) {
    return rssItems.map(fromRss).filter((i): i is FeedItem => i !== null);
  }

  const atomEntries = asArray(doc?.feed?.entry);
  return atomEntries.map(fromAtom).filter((i): i is FeedItem => i !== null);
}
