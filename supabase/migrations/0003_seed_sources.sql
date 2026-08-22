-- verify-feeds 를 통과한 피드만 등록한다.
-- 소스를 늘릴 때도 npm run verify-feeds 를 먼저 돌린다.
-- (한겨레 https://www.hani.co.kr/rss/ 는 item 에 날짜 엘리먼트가 없어 parseFeed 가
--  전부 버린다 — 원시 30건 / 파싱 0건이라 제외. claude-docs/troubleshooting/T-003.md)
insert into sources (name, feed_url, lang, topics) values
  ('BBC World', 'http://feeds.bbci.co.uk/news/world/rss.xml', 'en', array['world']),
  ('BBC Technology', 'http://feeds.bbci.co.uk/news/technology/rss.xml', 'en', array['tech']),
  ('BBC Business', 'http://feeds.bbci.co.uk/news/business/rss.xml', 'en', array['economy']),
  ('TechCrunch', 'https://techcrunch.com/feed/', 'en', array['tech', 'ai']),
  ('Ars Technica', 'https://feeds.arstechnica.com/arstechnica/index', 'en', array['tech']),
  ('Hacker News', 'https://hnrss.org/frontpage', 'en', array['tech']),
  ('연합뉴스', 'https://www.yna.co.kr/rss/news.xml', 'ko', array['policy']),
  ('한국경제', 'https://www.hankyung.com/feed/economy', 'ko', array['economy']),
  ('ZDNet Korea', 'https://feeds.feedburner.com/zdkorea', 'ko', array['tech']);
