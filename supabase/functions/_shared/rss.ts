import { XMLParser, XMLValidator } from 'fast-xml-parser';

export type FeedItem = {
  url: string;
  title: string;
  publishedAt: Date;
  excerpt: string;
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
  return { url, title, publishedAt, excerpt: stripHtml(text(it.description)) };
}

function fromAtom(e: Record<string, unknown>): FeedItem | null {
  const links = asArray(e.link as Record<string, string> | Record<string, string>[]);
  const alt = links.find((l) => !l['@rel'] || l['@rel'] === 'alternate') ?? links[0];
  const url = String(alt?.['@href'] ?? '').trim();
  const title = text(e.title).trim();
  const publishedAt = toDate(text(e.published)) ?? toDate(text(e.updated));
  if (!url || !title || !publishedAt) return null;
  const excerpt = stripHtml(text(e.summary) || text(e.content));
  return { url, title, publishedAt, excerpt };
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
