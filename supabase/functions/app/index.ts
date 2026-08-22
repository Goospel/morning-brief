import { createClient } from '@supabase/supabase-js';
import { routeOf, parseProfilePatch } from '../_shared/approuting.ts';
import { issueSession, verifySession } from '../_shared/session.ts';
import { exchangeToken, getLoginMe } from '../_shared/toss.ts';
import { decryptField, extractBirthYear } from '../_shared/decrypt.ts';
import { selectBriefing, type Candidate, type Profile, type Rule } from '../_shared/scoring.ts';
import { kstDateString } from '../_shared/kst.ts';

const CANDIDATE_WINDOW_MS = 3 * 86_400_000;

const db = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const json = (body: unknown, status = 200) => Response.json(body, { status });

Deno.serve(async (req) => {
  const route = routeOf(req.method, new URL(req.url).pathname);
  if (!route) return json({ error: 'not found' }, 404);

  try {
    if (route === 'login') return await handleLogin(req);
    if (route === 'unlink') return await handleUnlink(req);

    // 나머지는 전부 세션 필요
    const userKey = await authenticate(req);
    if (!userKey) return json({ error: 'unauthorized' }, 401);

    if (route === 'briefing') return await handleBriefing(userKey);
    if (route === 'getMe') return await handleGetMe(userKey);
    if (route === 'putMe') return await handlePutMe(req, userKey);
    return json({ error: 'not found' }, 404);
  } catch (e) {
    console.error(`${route} failed:`, e instanceof Error ? e.message : e);
    return json({ error: 'internal' }, 500);
  }
});

async function authenticate(req: Request): Promise<string | null> {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  return await verifySession(token, Deno.env.get('SESSION_SECRET')!, new Date());
}

async function handleLogin(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null) as { authorizationCode?: string; referrer?: string } | null;
  if (!body?.authorizationCode) return json({ error: 'authorizationCode 가 필요하다' }, 400);

  const { accessToken } = await exchangeToken(body.authorizationCode, body.referrer ?? 'DEFAULT');
  const me = await getLoginMe(accessToken);
  // 여기서 토스 토큰은 버린다. 저장하지 않는다.

  const key = Deno.env.get('TOSS_DECRYPT_KEY_B64') ?? '';
  const aad = Deno.env.get('TOSS_DECRYPT_AAD') ?? '';
  const gender = me.encryptedGender ? await decryptField(me.encryptedGender, key, aad) : null;
  const birthday = me.encryptedBirthday ? await decryptField(me.encryptedBirthday, key, aad) : null;

  const client = db();
  const { data: existing } = await client
    .from('profiles').select('job_field').eq('user_key', me.userKey).maybeSingle();

  if (existing) {
    await client.from('profiles')
      .update({ gender, birth_year: extractBirthYear(birthday) })
      .eq('user_key', me.userKey);
  } else {
    // household 는 NOT NULL 이라 온보딩 전 임시값을 넣는다. job_field 는 NULL 로 두어
    // 온보딩 완료 판정(job_field IS NOT NULL)을 유지한다.
    await client.from('profiles').insert({
      user_key: me.userKey,
      gender,
      birth_year: extractBirthYear(birthday),
      household: 'single',
      job_field: null,
    });
  }

  const sessionToken = await issueSession(me.userKey, Deno.env.get('SESSION_SECRET')!, new Date());
  return json({ sessionToken, onboarded: Boolean(existing?.job_field) });
}

async function handleBriefing(userKey: string): Promise<Response> {
  const client = db();
  const { data: profile } = await client
    .from('profiles').select('job_field,push_hour').eq('user_key', userKey).maybeSingle();
  if (!profile) return json({ error: 'unauthorized' }, 401);   // unlink 후 남은 세션

  if (!profile.job_field) {
    return json({ onboarded: false, date: null, isToday: false, nextHour: profile.push_hour, cards: null });
  }

  const today = kstDateString(new Date());
  const { data: briefing } = await client
    .from('briefings').select('date,article_ids,opened_at')
    .eq('user_key', userKey).lte('date', today)
    .order('date', { ascending: false }).limit(1).maybeSingle();

  if (!briefing) {
    return json({ onboarded: true, date: null, isToday: false, nextHour: profile.push_hour, cards: null });
  }

  const { data: rows } = await client
    .from('articles')
    .select('id,title,url,summary_ko,published_at,sources(name)')
    .in('id', briefing.article_ids);

  // .in() 은 순서를 보장하지 않는다 — 브리핑에 담긴 순서(점수순)를 복원한다
  const byId = new Map((rows ?? []).map((r) => [r.id, r]));
  const cards = (briefing.article_ids as number[])
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => ({
      articleId: r.id,
      title: r.title,
      summaryKo: r.summary_ko,
      sourceName: (r.sources as { name?: string } | null)?.name ?? '',
      url: r.url,
      publishedAt: r.published_at,
    }));

  if (!briefing.opened_at) {
    await client.from('briefings')
      .update({ opened_at: new Date().toISOString() })
      .eq('user_key', userKey).eq('date', briefing.date);
  }

  return json({
    onboarded: true,
    date: briefing.date,
    isToday: briefing.date === today,
    nextHour: profile.push_hour,
    cards,
  });
}

async function handleGetMe(userKey: string): Promise<Response> {
  const { data } = await db()
    .from('profiles')
    .select('job_field,household,topics,push_hour,push_on')
    .eq('user_key', userKey).maybeSingle();
  if (!data) return json({ error: 'unauthorized' }, 401);
  return json({
    jobField: data.job_field,
    household: data.household,
    topics: data.topics ?? [],
    pushHour: data.push_hour,
    pushOn: data.push_on,
  });
}

async function handlePutMe(req: Request, userKey: string): Promise<Response> {
  const parsed = parseProfilePatch(await req.json().catch(() => null));
  if (!parsed.ok) return json({ error: parsed.reason }, 400);

  const client = db();
  const { data: before } = await client
    .from('profiles').select('job_field').eq('user_key', userKey).maybeSingle();
  if (!before) return json({ error: 'unauthorized' }, 401);

  const { error } = await client.from('profiles').update(parsed.patch).eq('user_key', userKey);
  if (error) return json({ error: 'internal' }, 500);

  // 온보딩 완료 순간(job_field NULL -> NOT NULL)에만 웰컴 브리핑을 만든다
  if (!before.job_field && parsed.patch.job_field) {
    await createWelcomeBriefing(userKey);
  }

  return await handleGetMe(userKey);
}

/** deliver 잡과 같은 선정 로직을 재사용한다 — 순수 함수라 비용 0. */
async function createWelcomeBriefing(userKey: string): Promise<void> {
  const client = db();
  const now = new Date();

  const { data: p } = await client
    .from('profiles').select('user_key,gender,birth_year,household,job_field,topics')
    .eq('user_key', userKey).maybeSingle();
  if (!p) return;

  const { data: rules } = await client.from('profile_rules').select('attribute,value,topic,weight');
  const { data: articles } = await client
    .from('articles').select('id,topics,lang,published_at')
    .not('summary_ko', 'is', null)
    .gte('published_at', new Date(now.getTime() - CANDIDATE_WINDOW_MS).toISOString());

  const pool: Candidate[] = (articles ?? []).map((a) => ({
    id: a.id, topics: a.topics ?? [], lang: a.lang, publishedAt: new Date(a.published_at),
  }));

  const profile: Profile = {
    userKey: p.user_key, gender: p.gender, birthYear: p.birth_year,
    household: p.household, jobField: p.job_field, topics: p.topics ?? [],
  };

  const ids = selectBriefing(profile, (rules ?? []) as Rule[], pool, now);
  if (ids.length === 0) return;

  await client.from('briefings').upsert(
    { user_key: userKey, date: kstDateString(now), article_ids: ids },
    { onConflict: 'user_key,date', ignoreDuplicates: true },
  );
}

/**
 * 토스 연결 해제 콜백. 심사 요건「해제 시 데이터 미잔존」.
 * ⚠️ 인증 방식이 미확인이라 지금은 페이로드 검증 + 전체 로깅만 한다.
 *    콘솔에서 콜백을 등록할 때 서명 방식을 확인해 여기에 검증을 붙인다.
 */
async function handleUnlink(req: Request): Promise<Response> {
  // fail-closed: 토스 콜백의 인증 방식이 아직 미확인이라, 공유 시크릿을 설정하기
  // 전까지 이 경로를 아예 닫아 둔다. 열어 둔 채로 두면 userKey 하나만 알면
  // 누구나 남의 데이터를 지울 수 있는 공개 삭제 경로가 된다.
  // 콘솔에서 콜백을 등록할 때 실제 인증 방식(서명 헤더/mTLS)을 확인해 교체한다.
  const secret = Deno.env.get('UNLINK_CALLBACK_SECRET');
  if (!secret) {
    console.error('unlink callback 이 설정되지 않아 거부했다 (UNLINK_CALLBACK_SECRET 미설정)');
    return json({ error: 'not configured' }, 503);
  }
  if (req.headers.get('x-unlink-secret') !== secret) {
    return json({ error: 'unauthorized' }, 401);
  }

  const raw = await req.text();
  console.log('unlink callback payload:', raw.slice(0, 500));

  let body: { userKey?: string } | null = null;
  try { body = JSON.parse(raw); } catch { /* 페이로드 형식이 미확인이라 파싱 실패는 조용히 넘긴다 */ }
  if (!body?.userKey) return json({ ok: true });

  const client = db();
  await client.from('briefings').delete().eq('user_key', body.userKey);
  await client.from('profiles').delete().eq('user_key', body.userKey);
  return json({ ok: true });
}
