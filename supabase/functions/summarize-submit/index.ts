import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { TOPICS } from '../_shared/topics.ts';

const BATCH_MAX = 500;

const SYSTEM = `당신은 한국어 뉴스 요약가다. 입력된 기사(한국어 또는 영어)를 읽고 JSON만 출력한다.

출력 형식:
{"summary": "한국어 요약", "topics": ["태그", ...]}

규칙:
- 요약은 한국어 3~5문장. 영어 기사도 한국어로 옮겨 요약한다.
- 원문 문장을 그대로 옮기지 말고 자기 말로 요약한다.
- topics 는 다음 목록에서만 1~3개 고른다: ${TOPICS.join(', ')}
- 원문에 없는 사실을 지어내지 않는다. 특히 누가 무엇을 말했는지(발언 주체), 찬반 입장, 인과 관계는 원문에 명시된 대로만 쓴다. 원문이 짧아 알 수 없으면 그 부분을 요약에서 빼고, 추측으로 채우지 않는다.
- 제목에 서로 다른 주체의 발언이 나란히 나오면 각 발언을 원래 주체에 정확히 붙인다. 주체를 다른 표현으로 바꾸지 말고 원문 표기를 그대로 쓴다 — 예를 들어 「與」를 「여당」이나 「야당」으로 해석해 옮기지 않는다.
- JSON 외의 텍스트는 출력하지 않는다.`;

Deno.serve(async () => {
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: pending, error } = await db
    .from('articles')
    .select('id,title,raw_excerpt')
    .is('summary_ko', null)
    .order('published_at', { ascending: false })
    .limit(BATCH_MAX);
  if (error) return new Response(error.message, { status: 500 });
  if (!pending || pending.length === 0) return Response.json({ submitted: 0 });

  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

  const batch = await anthropic.messages.batches.create({
    requests: pending.map((a) => ({
      custom_id: String(a.id),
      params: {
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        system: SYSTEM,
        messages: [{
          role: 'user' as const,
          content: `제목: ${a.title}\n\n본문 발췌:\n${a.raw_excerpt ?? '(발췌 없음)'}`,
        }],
      },
    })),
  });

  const { error: insertError } = await db.from('summary_batches').insert({
    batch_id: batch.id,
    article_ids: pending.map((a) => a.id),
  });
  if (insertError) return new Response(insertError.message, { status: 500 });

  return Response.json({ submitted: pending.length, batch_id: batch.id });
});
