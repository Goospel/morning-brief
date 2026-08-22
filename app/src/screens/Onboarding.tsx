import { useState } from 'react';
import { TOPICS, JOB_FIELDS, HOUSEHOLDS } from '@shared/topics.ts';
import { TOPIC_LABELS, JOB_FIELD_LABELS, HOUSEHOLD_LABELS } from '../labels';
import { putMe } from '../api';

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [jobField, setJobField] = useState<string | null>(null);
  const [household, setHousehold] = useState<string | null>(null);
  const [topics, setTopics] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = jobField !== null && household !== null && topics.length > 0;

  function toggleTopic(t: string) {
    setTopics((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  async function submit() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await putMe({ jobField: jobField!, household: household!, topics });
      onDone();
    } catch {
      setError('저장하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ padding: '24px' }}>
      <h1>어떤 소식이 필요하세요?</h1>

      <section>
        <h2>하시는 일</h2>
        {JOB_FIELDS.map((f) => (
          <button key={f} aria-pressed={jobField === f} onClick={() => setJobField(f)}>
            {JOB_FIELD_LABELS[f]}
          </button>
        ))}
      </section>

      <section>
        <h2>가구 형태</h2>
        {HOUSEHOLDS.map((h) => (
          <button key={h} aria-pressed={household === h} onClick={() => setHousehold(h)}>
            {HOUSEHOLD_LABELS[h]}
          </button>
        ))}
      </section>

      <section>
        <h2>관심 주제 (하나 이상)</h2>
        {TOPICS.map((t) => (
          <button key={t} aria-pressed={topics.includes(t)} onClick={() => toggleTopic(t)}>
            {TOPIC_LABELS[t]}
          </button>
        ))}
      </section>

      {error && <p role="alert">{error}</p>}
      <button onClick={submit} disabled={!ready || busy}>
        {busy ? '저장 중…' : '시작하기'}
      </button>
    </main>
  );
}
