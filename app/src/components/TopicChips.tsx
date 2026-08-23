import { Chip, ChipItem } from '@toss/tds-mobile';
import { TOPICS } from '@shared/topics.ts';
import { TOPIC_LABELS } from '../labels';

/** 관심 주제 13개 칩. 온보딩·설정이 함께 쓴다 — 토글 결과를 통째로 돌려주고 저장 정책은 호출부가 정한다. */
export function TopicChips({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <Chip wrap margin="none">
      {TOPICS.map((t) => {
        const on = value.includes(t);
        return (
          <ChipItem
            key={t}
            selected={on}
            onClick={() => onChange(on ? value.filter((x) => x !== t) : [...value, t])}
          >
            {TOPIC_LABELS[t]}
          </ChipItem>
        );
      })}
    </Chip>
  );
}
