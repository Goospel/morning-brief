import { createClient } from '@supabase/supabase-js';
import { parseFeed } from '../_shared/rss.ts';

const MAX_AGE_MS = 3 * 86_400_000;   // 3일보다 오래된 항목은 안 담는다
const EXCERPT_MAX = 2000;

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
        }));

      if (rows.length === 0) continue;

      const { data, error: upsertError } = await db
        .from('articles')
        .upsert(rows, { onConflict: 'url', ignoreDuplicates: true })
        .select('id');
      if (upsertError) throw upsertError;
      inserted += data?.length ?? 0;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failures.push(`${s.name}: ${msg}`);
      console.error(`source ${s.id} ${s.name} failed: ${msg}`);
    }
  }

  return Response.json({ sources: sources?.length ?? 0, inserted, failures });
});
