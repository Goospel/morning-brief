import { createClient } from '@supabase/supabase-js';
import { parseFeed } from '../_shared/rss.ts';
import { extractOgImage } from '../_shared/og.ts';

const MAX_AGE_MS = 3 * 86_400_000;   // 3일보다 오래된 항목은 안 담는다
const EXCERPT_MAX = 2000;

// ponytail: 상한 120건·시간 예산 60초·동시 6 — 하루 1회 잡이라 남는 건 null 로 두고 프런트가 접는다.
// 커버리지가 모자라면 전용 백필 잡 분리가 승격 경로.
const OG_MAX = 120, OG_BUDGET_MS = 60_000, OG_CONCURRENCY = 6;
// 수집용 커스텀 UA 는 뉴스 사이트에서 차단당하기 쉽다 — 실측으로 통과 확인된 브라우저형 UA 를 쓴다.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

Deno.serve(async () => {
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: sources, error } = await db
    .from('sources').select('id,name,feed_url,lang,topics').eq('enabled', true);
  if (error) return new Response(error.message, { status: 500 });

  const now = Date.now();
  let inserted = 0;
  const failures: string[] = [];
  // 이번 실행에 새로 들어왔고 피드에 이미지가 없던 기사 — 아래에서 원문 og:image 로 메운다.
  // ignoreDuplicates 가 신규 행만 돌려주므로 실패해도 다음 실행에 다시 쌓이지 않는다.
  const ogTargets: { id: number; url: string; publishedAt: string }[] = [];

  for (const s of sources ?? []) {
    // 한 소스가 죽어도 나머지는 계속 돈다.
    try {
      const res = await fetch(s.feed_url, {
        headers: { 'user-agent': 'morning-brief/1.0 (+https://github.com/Goospel/morning-brief)' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const rows = parseFeed(await res.text())
        .filter((i) => now - i.publishedAt.getTime() < MAX_AGE_MS)
        .map((i) => ({
          source_id: s.id,
          url: i.url,
          title: i.title,
          published_at: i.publishedAt.toISOString(),
          lang: s.lang,
          raw_excerpt: i.excerpt.slice(0, EXCERPT_MAX),
          topics: s.topics,
          image_url: i.imageUrl,
        }));

      if (rows.length === 0) continue;

      const { data, error: upsertError } = await db
        .from('articles')
        .upsert(rows, { onConflict: 'url', ignoreDuplicates: true })
        .select('id,url,image_url,published_at');
      if (upsertError) throw upsertError;
      inserted += data?.length ?? 0;
      for (const r of data ?? []) {
        if (!r.image_url) ogTargets.push({ id: r.id, url: r.url, publishedAt: r.published_at });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failures.push(`${s.name}: ${msg}`);
      console.error(`source ${s.id} ${s.name} failed: ${msg}`);
    }
  }

  // 원문 og:image 백필 — 실패는 전부 무시한다(null 로 남고 프런트가 썸네일 영역을 접는다).
  const targets = ogTargets
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, OG_MAX);   // 최신 기사가 브리핑 후보다
  const deadline = Date.now() + OG_BUDGET_MS;
  let ogFetched = 0;

  for (let i = 0; i < targets.length; i += OG_CONCURRENCY) {
    if (Date.now() > deadline) break;
    const results = await Promise.allSettled(
      targets.slice(i, i + OG_CONCURRENCY).map(async (t) => {
        const res = await fetch(t.url, {
          headers: { 'user-agent': BROWSER_UA },
          signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) return null;
        const image = extractOgImage(await res.text());
        if (!image) return null;
        await db.from('articles').update({ image_url: image }).eq('id', t.id);
        return image;
      }),
    );
    ogFetched += results.filter((r) => r.status === 'fulfilled' && r.value !== null).length;
  }

  return Response.json({ sources: sources?.length ?? 0, inserted, ogFetched, failures });
});
