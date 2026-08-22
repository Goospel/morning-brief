// 후보 피드를 실제로 받아 파싱까지 되는지 확인한다.
// 통과한 줄만 골라 0003_seed_sources.sql 에 옮긴다.
import { XMLValidator } from 'fast-xml-parser';

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
    const valid = XMLValidator.validate(xml);
    if (valid !== true) throw new Error(`invalid XML: ${valid.err.msg}`);
    const items = (xml.match(/<item[\s>]/g)?.length ?? 0) + (xml.match(/<entry[\s>]/g)?.length ?? 0);
    if (items === 0) throw new Error('항목 0건');
    console.log(`  OK   ${name} (${items}건)`);
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
