import { useEffect, useState } from 'react';
import {
  BottomSheet,
  List,
  ListHeader,
  ListRow,
  Loader,
  Selector,
  Switch,
  Top,
  useBottomSheet,
  useToast,
} from '@toss/tds-mobile';
import { TopicChips } from '../components/TopicChips';
import { getMe, putMe, type Me, type MePatch } from '../api';

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({ name: `${h}시`, value: String(h) }));

export function Settings() {
  const [me, setMe] = useState<Me | null>(null);
  const { openToast } = useToast();
  const { open, close } = useBottomSheet();

  useEffect(() => { void getMe().then(setMe).catch(() => openToast('불러오지 못했어요')); }, [openToast]);

  /** 낙관적 갱신 후 실패하면 되돌린다 — 저장 버튼이 없으므로 되돌림이 곧 피드백이다. */
  async function patch(p: MePatch) {
    if (!me) return;
    const before = me;
    setMe({ ...me, ...p });
    try {
      setMe(await putMe(p));
    } catch {
      setMe(before);
      openToast('저장하지 못했어요');
    }
  }

  function openHourSheet() {
    if (!me) return;
    open({
      header: <BottomSheet.Header>받을 시간</BottomSheet.Header>,
      children: (
        <BottomSheet.Select
          options={HOUR_OPTIONS}
          value={String(me.pushHour)}
          onChange={(e) => {
            void patch({ pushHour: Number(e.target.value) });
            close();
          }}
        />
      ),
    });
  }

  if (!me) {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Loader />
      </main>
    );
  }

  return (
    <main style={{ paddingBottom: 40 }}>
      <Top title={<Top.TitleParagraph>설정</Top.TitleParagraph>} />

      <ListHeader title={<ListHeader.TitleParagraph>알림</ListHeader.TitleParagraph>} />
      <List>
        <ListRow
          border="none"
          contents={<ListRow.Texts type="1RowTypeA" top="매일 아침 알림 받기" />}
          right={<Switch checked={me.pushOn} onChange={(_, checked) => void patch({ pushOn: checked })} />}
        />
        {/* Selector 에 nowrap 이 없으면 좁은 폭(318px 실측)에서 화살표가 다음 줄로 떨어진다 */}
        <ListRow
          border="none"
          withTouchEffect
          onClick={openHourSheet}
          contents={<ListRow.Texts type="1RowTypeA" top="받을 시간" />}
          right={<Selector typography="t5" type="arrow" style={{ whiteSpace: 'nowrap' }}>{`${me.pushHour}시`}</Selector>}
        />
      </List>

      <ListHeader title={<ListHeader.TitleParagraph>관심 주제</ListHeader.TitleParagraph>} />
      <div style={{ padding: '0 24px 24px' }}>
        <TopicChips
          value={me.topics}
          onChange={(next) => {
            if (next.length === 0) { openToast('하나 이상 골라주세요'); return; }
            void patch({ topics: next });
          }}
        />
      </div>
    </main>
  );
}
