import { useEffect, useState } from 'react';
import { TOPICS } from '@shared/topics.ts';
import { TOPIC_LABELS } from '../labels';
import { getMe, putMe, type Me } from '../api';

export function Settings({ onBack }: { onBack: () => void }) {
  const [me, setMe] = useState<Me | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { void getMe().then(setMe).catch(() => setToast('불러오지 못했어요')); }, []);

  /** 낙관적 갱신 후 실패하면 되돌린다 — 저장 버튼이 없으므로 되돌림이 곧 피드백이다. */
  async function patch(p: Parameters<typeof putMe>[0]) {
    if (!me) return;
    const before = me;
    setMe({ ...me, ...(p as Partial<Me>) });
    try {
      setMe(await putMe(p));
    } catch {
      setMe(before);
      setToast('저장하지 못했어요');
    }
  }

  if (!me) return <main style={{ padding: '24px' }}><p>불러오는 중…</p></main>;

  return (
    <main style={{ padding: '24px' }}>
      <header>
        <button onClick={onBack}>뒤로</button>
        <h1>설정</h1>
      </header>

      <section>
        <h2>알림</h2>
        <label>
          <input
            type="checkbox"
            checked={me.pushOn}
            onChange={(e) => void patch({ pushOn: e.target.checked })}
          />
          매일 아침 알림 받기
        </label>
        <label>
          받을 시간
          <select value={me.pushHour} onChange={(e) => void patch({ pushHour: Number(e.target.value) })}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>{h}시</option>
            ))}
          </select>
        </label>
      </section>

      <section>
        <h2>관심 주제</h2>
        {TOPICS.map((t) => {
          const on = me.topics.includes(t);
          return (
            <button
              key={t}
              aria-pressed={on}
              onClick={() => {
                const next = on ? me.topics.filter((x) => x !== t) : [...me.topics, t];
                if (next.length === 0) { setToast('하나 이상 골라주세요'); return; }
                void patch({ topics: next });
              }}
            >
              {TOPIC_LABELS[t]}
            </button>
          );
        })}
      </section>

      {toast && <p role="alert">{toast}</p>}
    </main>
  );
}
