import { createClient } from '@supabase/supabase-js';
import { kstHour, kstDateString } from '../_shared/kst.ts';
import { selectBriefing, type Candidate, type Profile, type Rule } from '../_shared/scoring.ts';

const CANDIDATE_WINDOW_MS = 3 * 86_400_000;    // 뉴스 후보는 최근 3일치
const EVERGREEN_WINDOW_MS = 30 * 86_400_000;   // evergreen 은 30일치 — 발행이 뜸해도 잡힌다
const DEDUPE_DAYS = 7;                         // 최근 7일에 보낸 건 다시 안 보낸다
// 불변식: 중복 제외 기간 >= 후보 창. 어기면 창 안에 남은 글이 재선정돼
// 같은 글을 한 달에 서너 번 받게 된다. 창을 늘릴 때 이 둘은 같이 움직인다.
const EVERGREEN_DEDUPE_DAYS = 30;

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

  // 쿼리를 둘로 나눈다 — 하나로 30일을 긁으면 뉴스 9천 건을 받아 대부분 버린다.
  // `not.is.true` 는 NULL(판정 전)과 false 를 함께 잡는다.
  const selectCols = 'id,topics,lang,published_at,evergreen';
  const [newsRes, greenRes] = await Promise.all([
    db.from('articles').select(selectCols)
      .not('summary_ko', 'is', null).not('evergreen', 'is', true)
      .gte('published_at', new Date(now.getTime() - CANDIDATE_WINDOW_MS).toISOString()),
    db.from('articles').select(selectCols)
      .not('summary_ko', 'is', null).is('evergreen', true)
      .gte('published_at', new Date(now.getTime() - EVERGREEN_WINDOW_MS).toISOString()),
  ]);

  const pool: Candidate[] = [...(newsRes.data ?? []), ...(greenRes.data ?? [])].map((a) => ({
    id: a.id,
    topics: a.topics ?? [],
    lang: a.lang,
    publishedAt: new Date(a.published_at),
    evergreen: a.evergreen ?? false,
  }));

  const newsSince = kstDateString(new Date(now.getTime() - DEDUPE_DAYS * 86_400_000));
  const greenSince = kstDateString(new Date(now.getTime() - EVERGREEN_DEDUPE_DAYS * 86_400_000));
  let delivered = 0;

  for (const p of profiles) {
    // 긴 창으로 한 번만 읽고 두 집합으로 나눈다 — 왕복을 늘리지 않는다.
    const { data: recent } = await db
      .from('briefings').select('date,article_ids').eq('user_key', p.user_key)
      .gte('date', greenSince);
    const seenGreen = new Set((recent ?? []).flatMap((r) => r.article_ids as number[]));
    const seenNews = new Set(
      (recent ?? []).filter((r) => r.date >= newsSince)
        .flatMap((r) => r.article_ids as number[]),
    );

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
      pool.filter((c) => (c.evergreen ? !seenGreen.has(c.id) : !seenNews.has(c.id))),
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
