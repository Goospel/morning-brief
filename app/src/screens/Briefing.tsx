import { useEffect, useState } from 'react';
import { Device } from '@apps-in-toss/web-framework';
import { Asset, Badge, Border, Button, IconButton, Loader, Paragraph, Spacing, TextButton, Top } from '@toss/tds-mobile';
import { adaptive } from '@toss/tds-colors';
import { getBriefing, cacheBriefing, readCachedBriefing, type BriefingResponse } from '../api';
import { TOPIC_LABELS } from '../labels';

function formatDate(d: string | null): string {
  if (d == null) return '';
  const [, m, day] = d.split('-');
  return `${Number(m)}월 ${Number(day)}일`;
}

/** 발행 시각은 상대 표기로 준다 — 후보 창이 3일이라 날짜 없는 절대 시각은 오해를 만든다. */
function formatAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 60) return '방금 전';
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}시간 전` : `${Math.floor(hours / 24)}일 전`;
}

/** 오프라인·어제 브리핑 안내 박스 */
function Banner({ icon, children }: { icon: string; children: string }) {
  return (
    <div
      style={{
        margin: '0 24px 8px',
        padding: '12px 16px',
        background: adaptive.grey50,
        borderRadius: 12,
        display: 'flex',
        gap: 8,
        alignItems: 'flex-start',
      }}
    >
      {/* Asset.Icon 은 style 을 프레임에 전달하지 않는다(실측) — 크기는 frameShape, 배치는 래퍼로 준다 */}
      <div style={{ flexShrink: 0, marginTop: 1 }}>
        <Asset.Icon name={icon} color={adaptive.grey600} frameShape={{ width: 18, height: 18 }} />
      </div>
      <Paragraph typography="st10" color={adaptive.grey600}>{children}</Paragraph>
    </div>
  );
}

export function Briefing({ onSettings }: { onSettings: () => void }) {
  const [data, setData] = useState<BriefingResponse | null>(null);
  const [offline, setOffline] = useState(false);
  const [failed, setFailed] = useState(false);
  // 이미지 로드 실패(CSP 차단·404)한 기사 — 썸네일 영역을 접어 텍스트 레이아웃으로 되돌린다.
  const [broken, setBroken] = useState<ReadonlySet<number>>(() => new Set());

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
        right={
          // Top 의 right 슬롯은 자체 오른쪽 여백이 없다(실측: 타이틀 left 24px 대 rightGap 0px).
          // 왼쪽 타이틀과 대칭이 되도록 24px 을 준다.
          <div style={{ paddingRight: 24 }}>
            <IconButton name="icon-setting-mono" aria-label="설정" color={adaptive.grey700} onClick={onSettings} />
          </div>
        }
      />

      {offline && <Banner icon="icon-info-mono">오프라인이에요. 마지막으로 받은 브리핑을 보여드려요</Banner>}
      {cards && !data.isToday && (
        <Banner icon="icon-clock-mono">{`어제의 브리핑이에요 · 오늘 브리핑은 ${data.nextHour}시에 도착해요`}</Banner>
      )}

      {cards == null && (
        <div style={{ textAlign: 'center', padding: '64px 24px' }}>
          <Asset.Icon name="icon-sunrise-mono" color={adaptive.orange500} frameShape={{ width: 56, height: 56 }} />
          <Spacing size={12} />
          <Paragraph typography="st9" fontWeight="semibold">첫 브리핑을 준비하고 있어요</Paragraph>
          <Spacing size={8} />
          <Paragraph typography="st10" color={adaptive.grey600}>
            {`내일 아침 ${data.nextHour}시에 배달돼요`}
          </Paragraph>
        </div>
      )}

      {cards?.map((c, i) => {
        // 오프라인 캐시에 구 스키마 카드가 남아 있을 수 있어 방어적으로 읽는다.
        const badges = (c.topics ?? []).filter((t) => TOPIC_LABELS[t]).slice(0, 2);
        const showImage = Boolean(c.imageUrl) && !broken.has(c.articleId);

        return (
          <article key={c.articleId} style={{ padding: '20px 24px 0' }}>
            {badges.length > 0 && (
              <>
                <div style={{ display: 'flex', gap: 4 }}>
                  {badges.map((t) => (
                    <Badge key={t} size="small" variant="weak" color="blue">{TOPIC_LABELS[t]}</Badge>
                  ))}
                </div>
                <Spacing size={8} />
              </>
            )}

            {/* 썸네일이 없으면 제목이 전체 폭을 쓴다 — 혼재가 「빈 자리」로 보이지 않는 레이아웃 */}
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Paragraph typography="t4" fontWeight="bold" ellipsisAfterLines={3}>{c.title}</Paragraph>
              </div>
              {showImage && (
                <Asset.Image
                  src={c.imageUrl!}
                  frameShape={{ width: 72, height: 72, radius: 14 }}
                  objectFit="cover"
                  loading="lazy"
                  alt=""
                  onError={() => setBroken((prev) => new Set(prev).add(c.articleId))}
                />
              )}
            </div>

            <Spacing size={8} />
            <Paragraph typography="t5" color={adaptive.grey700}>{c.summaryKo}</Paragraph>
            <Spacing size={12} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Paragraph typography="st11" color={adaptive.grey500}>
                {`${c.sourceName} · ${formatAgo(c.publishedAt)}`}
              </Paragraph>
              <TextButton size="small" variant="arrow" onClick={() => Device.openURL(c.url)}>원문 보기</TextButton>
            </div>
            <Spacing size={20} />
            {i < cards.length - 1 && <Border variant="padding24" />}
          </article>
        );
      })}

      {cards && cards.length > 0 && (
        <>
          <Spacing size={32} />
          <div style={{ textAlign: 'center', padding: '0 24px' }}>
            <Asset.Icon name="icon-check-circle-mono" color={adaptive.orange600} frameShape={{ width: 32, height: 32 }} />
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
