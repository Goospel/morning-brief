import { useEffect, useState } from 'react';
import { Device } from '@apps-in-toss/web-framework';
import { Border, Button, Loader, Paragraph, Spacing, TextButton, Top } from '@toss/tds-mobile';
import { adaptive } from '@toss/tds-colors';
import { getBriefing, cacheBriefing, readCachedBriefing, type BriefingResponse } from '../api';

function formatDate(d: string | null): string {
  if (d == null) return '';
  const [, m, day] = d.split('-');
  return `${Number(m)}월 ${Number(day)}일`;
}

/** 오프라인·어제 브리핑 안내 박스 */
function Banner({ children }: { children: string }) {
  return (
    <div
      style={{
        margin: '0 24px 8px',
        padding: '12px 16px',
        background: adaptive.grey50,
        borderRadius: 12,
      }}
    >
      <Paragraph typography="st10" color={adaptive.grey600}>{children}</Paragraph>
    </div>
  );
}

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
      <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '0 24px' }}>
        <Paragraph typography="st9" fontWeight="semibold">소식을 가져오지 못했어요</Paragraph>
        <Spacing size={8} />
        <Paragraph typography="st10" color={adaptive.grey600} textAlign="center">잠시 후 다시 시도해 주세요</Paragraph>
        <Spacing size={20} />
        <Button variant="weak" size="medium" onClick={() => void load()}>다시 시도</Button>
      </main>
    );
  }

  if (data == null) {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Loader />
      </main>
    );
  }

  const cards = data.cards;

  return (
    <main style={{ paddingBottom: 40 }}>
      <Top
        title={<Top.TitleParagraph>오늘의 브리핑</Top.TitleParagraph>}
        subtitleBottom={
          <Top.SubtitleParagraph color={adaptive.grey600}>
            {cards ? `${formatDate(data.date)} · 기사 ${cards.length}건` : '아직 배달 전이에요'}
          </Top.SubtitleParagraph>
        }
        right={<TextButton size="medium" onClick={onSettings}>설정</TextButton>}
      />

      {offline && <Banner>오프라인이에요. 마지막으로 받은 브리핑을 보여드려요</Banner>}
      {cards && !data.isToday && (
        <Banner>{`어제의 브리핑이에요 · 오늘 브리핑은 ${data.nextHour}시에 도착해요`}</Banner>
      )}

      {cards == null && (
        <div style={{ textAlign: 'center', padding: '64px 24px' }}>
          <Paragraph typography="t1">🥛</Paragraph>
          <Spacing size={12} />
          <Paragraph typography="st9" fontWeight="semibold">첫 브리핑을 준비하고 있어요</Paragraph>
          <Spacing size={8} />
          <Paragraph typography="st10" color={adaptive.grey600}>
            {`내일 아침 ${data.nextHour}시에 배달돼요`}
          </Paragraph>
        </div>
      )}

      {cards?.map((c, i) => (
        <article key={c.articleId} style={{ padding: '20px 24px 0' }}>
          <Paragraph typography="t4" fontWeight="bold" ellipsisAfterLines={3}>{c.title}</Paragraph>
          <Spacing size={8} />
          <Paragraph typography="t5" color={adaptive.grey700}>{c.summaryKo}</Paragraph>
          <Spacing size={12} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Paragraph typography="st11" color={adaptive.grey500}>{c.sourceName}</Paragraph>
            <TextButton size="small" variant="arrow" onClick={() => Device.openURL(c.url)}>원문 보기</TextButton>
          </div>
          <Spacing size={20} />
          {i < cards.length - 1 && <Border variant="padding24" />}
        </article>
      ))}

      {cards && cards.length > 0 && (
        <>
          <Spacing size={32} />
          <div style={{ textAlign: 'center', padding: '0 24px' }}>
            <Paragraph typography="t3">🥛</Paragraph>
            <Spacing size={8} />
            <Paragraph typography="st9" fontWeight="semibold" color={adaptive.orange600}>
              오늘의 브리핑을 다 읽었어요
            </Paragraph>
            <Spacing size={8} />
            <Paragraph typography="st11" color={adaptive.grey500}>
              요약은 AI가 만들었어요. 정확한 내용은 원문을 확인해 주세요
            </Paragraph>
          </div>
        </>
      )}
    </main>
  );
}
