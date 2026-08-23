import { useState } from 'react';
import { FixedBottomCTA, List, ListRow, Paragraph, Spacing, useToast } from '@toss/tds-mobile';
import { adaptive } from '@toss/tds-colors';
import { login } from '../api';
import logoUrl from '../assets/logo.png';

const VALUES = [
  { icon: 'icon-user-mono', bg: adaptive.blue50, fg: adaptive.blue500, text: '나이·직업·관심사에 맞춘 기사 5~6건' },
  { icon: 'icon-earth-mono', bg: adaptive.teal50, fg: adaptive.teal500, text: '해외 매체도 한국어 요약으로 배달돼요' },
  { icon: 'icon-check-circle-mono', bg: adaptive.orange50, fg: adaptive.orange500, text: '다 보면 끝나는 하루치 묶음이에요' },
];

export function Intro({ onDone }: { onDone: (onboarded: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const { openToast } = useToast();

  async function start() {
    setBusy(true);
    try {
      const { onboarded } = await login();
      onDone(onboarded);
    } catch {
      // 사용자가 로그인 창을 닫은 경우도 여기로 온다 — 크게 알리지 않는다
      openToast('로그인하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '0 24px 104px',
        }}
      >
        <img src={logoUrl} width={96} height={96} style={{ borderRadius: 22 }} alt="" />
        <Spacing size={24} />
        <Paragraph typography="t2" fontWeight="bold">나만의 정보</Paragraph>
        <Spacing size={8} />
        <Paragraph typography="st9" color={adaptive.grey600}>매일 아침 나에게 맞는 뉴스 5분</Paragraph>
        <Spacing size={32} />
        <List style={{ width: '100%' }}>
          {VALUES.map((v) => (
            <ListRow
              key={v.icon}
              border="none"
              verticalPadding="small"
              horizontalPadding="small"
              left={<ListRow.AssetIcon variant="fill" size="medium" name={v.icon} backgroundColor={v.bg} color={v.fg} />}
              contents={<ListRow.Texts type="1RowTypeA" top={v.text} />}
            />
          ))}
        </List>
      </div>
      <FixedBottomCTA loading={busy} onClick={() => void start()}>토스로 시작하기</FixedBottomCTA>
    </main>
  );
}
