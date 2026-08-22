import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { parseSummary } from '../_shared/summary.ts';

Deno.serve(async () => {
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: open, error } = await db
    .from('summary_batches').select('id,batch_id').eq('status', 'submitted');
  if (error) return new Response(error.message, { status: 500 });

  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });
  let updated = 0;
  let stillRunning = 0;

  for (const b of open ?? []) {
    const info = await anthropic.messages.batches.retrieve(b.batch_id);
    if (info.processing_status !== 'ended') {
      stillRunning++;
      continue;
    }

    const now = new Date().toISOString();
    // 결과는 순서가 보장되지 않는다 — custom_id 로만 짝을 짓는다.
    for await (const entry of await anthropic.messages.batches.results(b.batch_id)) {
      if (entry.result.type !== 'succeeded') continue;

      const block = entry.result.message.content.find((c) => c.type === 'text');
      if (!block || block.type !== 'text') continue;

      const parsed = parseSummary(block.text);
      if (!parsed) continue;   // 파싱 실패는 미요약으로 남겨 다음 날 재시도한다

      const { error: updateError } = await db.from('articles').update({
        summary_ko: parsed.summary,
        topics: parsed.topics,
        summarized_at: now,
      }).eq('id', Number(entry.custom_id));
      if (!updateError) updated++;
    }

    await db.from('summary_batches')
      .update({ status: 'done', completed_at: now })
      .eq('id', b.id);
  }

  return Response.json({ updated, stillRunning });
});
