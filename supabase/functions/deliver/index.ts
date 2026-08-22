import { createClient } from '@supabase/supabase-js';
import { kstHour, kstDateString } from '../_shared/kst.ts';
import { selectBriefing, type Candidate, type Profile, type Rule } from '../_shared/scoring.ts';

const CANDIDATE_WINDOW_MS = 3 * 86_400_000;   // 후보는 최근 3일치
const DEDUPE_DAYS = 7;                         // 최근 7일에 보낸 건 다시 안 보낸다

Deno.serve(async () => {
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const now = new Date();
  const hour = kstHour(now);
  const today = kstDateString(now);

  const { data: profiles, error } = await db
    .from('profiles')
    .select('user_key,gender,birth_year,household,job_field,topics')
    .eq('push_on', true)
    .eq('push_hour', hour);
  if (error) return new Response(error.message, { status: 500 });
  if (!profiles || profiles.length === 0) return Response.json({ hour, delivered: 0 });

  const { data: rules } = await db
    .from('profile_rules').select('attribute,value,topic,weight');

  const { data: articles } = await db
    .from('articles')
    .select('id,topics,lang,published_at')
    .not('summary_ko', 'is', null)
    .gte('published_at', new Date(now.getTime() - CANDIDATE_WINDOW_MS).toISOString());

  const pool: Candidate[] = (articles ?? []).map((a) => ({
    id: a.id,
    topics: a.topics ?? [],
    lang: a.lang,
    publishedAt: new Date(a.published_at),
  }));

  const since = kstDateString(new Date(now.getTime() - DEDUPE_DAYS * 86_400_000));
  let delivered = 0;

  for (const p of profiles) {
    const { data: recent } = await db
      .from('briefings').select('article_ids').eq('user_key', p.user_key).gte('date', since);
    const seen = new Set((recent ?? []).flatMap((r) => r.article_ids as number[]));

    const profile: Profile = {
      userKey: p.user_key,
      gender: p.gender,
      birthYear: p.birth_year,
      household: p.household,
      jobField: p.job_field,
      topics: p.topics ?? [],
    };

    const ids = selectBriefing(
      profile,
      (rules ?? []) as Rule[],
      pool.filter((c) => !seen.has(c.id)),
      now,
    );
    if (ids.length === 0) continue;

    // 복합 PK 덕분에 같은 날 두 번 돌아도 덮어쓰지 않는다.
    const { error: upsertError } = await db.from('briefings').upsert(
      { user_key: p.user_key, date: today, article_ids: ids },
      { onConflict: 'user_key,date', ignoreDuplicates: true },
    );
    if (!upsertError) delivered++;
  }

  return Response.json({ hour, date: today, targets: profiles.length, delivered });
});
