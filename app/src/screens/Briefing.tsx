import { useEffect, useState } from 'react';
import { Device } from '@apps-in-toss/web-framework';
import { getBriefing, cacheBriefing, readCachedBriefing, type BriefingResponse } from '../api';

export function Briefing({ onSettings }: { onSettings: () => void }) {
  const [data, setData] = useState<BriefingResponse | null>(null);
  const [offline, setOffline] = useState(false);
  const [failed, setFailed] = useState(false);

  async function load() {
    setFailed(false);
    try {
      const b = await getBriefing();
      setData(b);
      setOffline(false);
      await cacheBriefing(b);
    } catch {
      const cached = await readCachedBriefing();
      if (cached) { setData(cached); setOffline(true); }
      else setFailed(true);
    }
  }

  useEffect(() => { void load(); }, []);

  if (failed) {
    return (
      <main style={{ padding: '24px' }}>
        <p>소식을 가져오지 못했어요.</p>
        <button onClick={() => void load()}>다시 시도</button>
      </main>
    );
  }
  if (!data) return <main style={{ padding: '24px' }}><p>불러오는 중…</p></main>;

  return (
    <main style={{ padding: '24px' }}>
      <header>
        <h1>오늘의 브리핑</h1>
        <button onClick={onSettings}>설정</button>
      </header>

      {offline && <p role="status">오프라인이에요. 마지막으로 받은 내용을 보여드려요.</p>}
      {data.cards && !data.isToday && (
        <p role="status">
          어제의 브리핑이에요 · 오늘 브리핑은 {data.nextHour}시에 도착해요
        </p>
      )}

      {!data.cards && (
        <section>
          <p>첫 브리핑을 준비하고 있어요.</p>
          <p>내일 아침 {data.nextHour}시에 도착해요.</p>
        </section>
      )}

      {data.cards?.map((c) => (
        <article key={c.articleId}>
          <h2>{c.title}</h2>
          <p>{c.summaryKo}</p>
          <footer>
            <span>{c.sourceName}</span>
            <button onClick={() => Device.openURL(c.url)}>원문 보기</button>
          </footer>
        </article>
      ))}

      {data.cards && data.cards.length > 0 && (
        <>
          <p>오늘의 브리핑 끝 ✓</p>
          <small>요약은 AI가 생성했어요. 정확한 내용은 원문을 확인해 주세요.</small>
        </>
      )}
    </main>
  );
}
