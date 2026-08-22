// 후보 피드를 실제로 받아 파싱까지 되는지 확인한다.
// 통과한 줄만 골라 0003_seed_sources.sql 에 옮긴다.
//
// 판정은 파이프라인이 실제로 쓰는 parseFeed 로 한다 — 원시 <item> 개수 같은
// 대리 지표로 판정하면 파싱 0건인 피드를 통과시킨다(claude-docs/troubleshooting/T-003.md).
import { parseFeed } from '../supabase/functions/_shared/rss.ts';

const CANDIDATES = [
  // name, feed_url, lang, topics
  ['BBC World',        'http://feeds.bbci.co.uk/news/world/rss.xml',        'en', ['world']],
  ['BBC Technology',   'http://feeds.bbci.co.uk/news/technology/rss.xml',   'en', ['tech']],
  ['BBC Business',     'http://feeds.bbci.co.uk/news/business/rss.xml',     'en', ['economy']],
  ['TechCrunch',       'https://techcrunch.com/feed/',                      'en', ['tech', 'ai']],
  ['Ars Technica',     'https://feeds.arstechnica.com/arstechnica/index',   'en', ['tech']],
  ['Hacker News',      'https://hnrss.org/frontpage',                       'en', ['tech']],
  ['한겨레',            'https://www.hani.co.kr/rss/',                       'ko', ['policy']],
  ['연합뉴스',          'https://www.yna.co.kr/rss/news.xml',                'ko', ['policy']],
  ['한국경제',          'https://www.hankyung.com/feed/economy',             'ko', ['economy']],
  ['ZDNet Korea',      'https://feeds.feedburner.com/zdkorea',              'ko', ['tech']],
];

const ok = [];
for (const [name, url, lang, topics] of CANDIDATES) {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'morning-brief/1.0' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    // 원시 개수는 판정이 아니라 진단용 — 파싱 수와 어긋나면 그 차이 자체가 신호다.
    const raw = (xml.match(/<item[\s>]/g)?.length ?? 0) + (xml.match(/<entry[\s>]/g)?.length ?? 0);
    const parsed = parseFeed(xml).length;
    if (parsed === 0) {
      throw new Error(`원시 ${raw}건인데 파싱 0건 (url·title·날짜 중 빠진 항목)`);
    }
    console.log(`  OK   ${name} (파싱 ${parsed} / 원시 ${raw})`);
    ok.push([name, url, lang, topics]);
  } catch (e) {
    console.log(`  FAIL ${name} — ${e.message}`);
  }
}

console.log(`\n통과 ${ok.length}/${CANDIDATES.length}. 아래를 0003_seed_sources.sql 에 넣는다:\n`);
console.log('insert into sources (name, feed_url, lang, topics) values');
console.log(ok.map(([n, u, l, t]) =>
  `  (${q(n)}, ${q(u)}, ${q(l)}, array[${t.map(q).join(', ')}])`).join(',\n') + ';');

function q(s) { return `'${String(s).replace(/'/g, "''")}'`; }
