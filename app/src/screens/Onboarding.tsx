import { useState } from 'react';
import { Chip, ChipItem, FixedBottomCTA, ListHeader, Top, useToast } from '@toss/tds-mobile';
import { adaptive } from '@toss/tds-colors';
import { JOB_FIELDS, HOUSEHOLDS } from '@shared/topics.ts';
import { JOB_FIELD_LABELS, HOUSEHOLD_LABELS } from '../labels';
import { TopicChips } from '../components/TopicChips';
import { putMe } from '../api';

/** 하나만 고르는 칩 묶음. */
function SingleChips({
  options,
  labels,
  value,
  onChange,
}: {
  options: readonly string[];
  labels: Record<string, string>;
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <Chip wrap margin="none">
      {options.map((o) => (
        <ChipItem key={o} selected={value === o} onClick={() => onChange(o)}>
          {labels[o]}
        </ChipItem>
      ))}
    </Chip>
  );
}

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [jobField, setJobField] = useState<string | null>(null);
  const [household, setHousehold] = useState<string | null>(null);
  const [topics, setTopics] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const { openToast } = useToast();

  const ready = jobField !== null && household !== null && topics.length > 0;

  async function submit() {
    if (!ready) return;
    setBusy(true);
    try {
      await putMe({ jobField: jobField!, household: household!, topics });
      onDone();
    } catch {
      openToast('저장하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ paddingBottom: 120 }}>
      <Top
        title={<Top.TitleParagraph>어떤 소식이 필요하세요?</Top.TitleParagraph>}
        subtitleBottom={
          <Top.SubtitleParagraph color={adaptive.grey600}>
            맞는 소식만 골라서 배달해 드릴게요
          </Top.SubtitleParagraph>
        }
      />

      <ListHeader title={<ListHeader.TitleParagraph>하시는 일</ListHeader.TitleParagraph>} />
      <div style={{ padding: '0 24px' }}>
        <SingleChips
          options={JOB_FIELDS}
          labels={JOB_FIELD_LABELS}
          value={jobField}
          onChange={setJobField}
        />
      </div>

      <ListHeader title={<ListHeader.TitleParagraph>가구 형태</ListHeader.TitleParagraph>} />
      <div style={{ padding: '0 24px' }}>
        <SingleChips
          options={HOUSEHOLDS}
          labels={HOUSEHOLD_LABELS}
          value={household}
          onChange={setHousehold}
        />
      </div>

      <ListHeader
        title={<ListHeader.TitleParagraph>관심 주제</ListHeader.TitleParagraph>}
        description={<ListHeader.DescriptionParagraph>하나 이상 골라주세요</ListHeader.DescriptionParagraph>}
        descriptionPosition="bottom"
      />
      <div style={{ padding: '0 24px' }}>
        <TopicChips value={topics} onChange={setTopics} />
      </div>

      <FixedBottomCTA disabled={!ready} loading={busy} onClick={() => void submit()}>
        시작하기
      </FixedBottomCTA>
    </main>
  );
}
