// 심사 스크린샷·디자인 확인용 목 API. `vite dev --mode mock`(= VITE_MOCK=1)일 때만 api.ts 가 이쪽을 내보낸다.
// prod 빌드에서는 import.meta.env.VITE_MOCK 이 정적으로 치환돼 분기가 접히고 이 모듈이 통째로 트리셰이킹된다.
import type { BriefingResponse, Card, Me, MePatch } from './api';

const CARDS: Card[] = [
  {
    articleId: 1,
    title: '한국은행, 기준금리 3.00%로 동결… "물가 둔화세 지켜보겠다"',
    summaryKo:
      '한국은행 금융통화위원회가 기준금리를 연 3.00%로 동결했어요. 물가 상승률이 목표치에 가까워졌지만 환율과 가계부채가 여전히 부담이라는 판단이에요. 시장에서는 다음 분기 인하 가능성을 점치고 있어요.',
    sourceName: '연합뉴스',
    url: 'https://example.com/news/1',
    publishedAt: '2026-08-23T06:10:00+09:00',
    topics: ['economy'],
    imageUrl: 'https://picsum.photos/seed/brief1/240/240',
  },
  {
    articleId: 2,
    title: '전세 사기 피해 지원 특별법, 적용 기한 2년 연장 확정',
    summaryKo:
      '전세 사기 피해자 지원 특별법의 적용 기한이 2년 더 늘어났어요. 피해 인정 요건도 완화돼 보증금 기준이 상향됐고, 경매 유예 신청 절차가 간소화돼요. 기존 신청자도 소급 적용을 받을 수 있어요.',
    sourceName: '한겨레',
    url: 'https://example.com/news/2',
    publishedAt: '2026-08-23T05:40:00+09:00',
    topics: ['realestate', 'policy'],
    imageUrl: 'https://picsum.photos/seed/brief2/240/240',
  },
  {
    articleId: 3,
    title: 'AI 코딩 도구, 기업 도입률 1년 새 두 배로… 생산성 논쟁은 계속',
    summaryKo:
      '국내 개발 조직의 AI 코딩 도구 도입률이 1년 만에 두 배로 늘었어요. 반복 작업 시간은 눈에 띄게 줄었지만, 코드 리뷰 부담이 늘었다는 응답도 많았어요. 도입 효과는 팀의 리뷰 문화에 크게 좌우된다는 분석이에요.',
    sourceName: 'ZDNet Korea',
    url: 'https://example.com/news/3',
    publishedAt: '2026-08-23T04:55:00+09:00',
    topics: ['tech', 'ai'],
    imageUrl: 'https://picsum.photos/seed/brief3/240/240',
  },
  {
    articleId: 4,
    title: '주 4일제 시범 사업 1년, 참여 기업 78%가 "계속하겠다"',
    summaryKo:
      '주 4일제 시범 사업에 참여한 기업 가운데 78%가 제도를 이어가겠다고 답했어요. 이직률이 낮아지고 채용이 쉬워진 점을 이유로 꼽았어요. 다만 교대 근무가 많은 제조·서비스업에서는 적용이 어렵다는 지적도 나왔어요.',
    sourceName: 'BBC 코리아',
    url: 'https://example.com/news/4',
    publishedAt: '2026-08-23T03:20:00+09:00',
    topics: ['career'],
    imageUrl: null,
  },
  {
    articleId: 5,
    title: '하루 7시간 미만 수면, 대사증후군 위험 1.4배… 국내 코호트 분석',
    summaryKo:
      '성인 12만 명을 8년간 추적한 연구에서 하루 7시간 미만 수면 집단의 대사증후군 발생 위험이 1.4배 높게 나타났어요. 주말 몰아 자기로는 위험이 충분히 낮아지지 않았어요. 연구진은 규칙적인 취침 시각이 더 중요하다고 설명했어요.',
    sourceName: '헬스조선',
    url: 'https://example.com/news/5',
    publishedAt: '2026-08-23T02:30:00+09:00',
    topics: ['health'],
    imageUrl: 'https://picsum.photos/seed/brief5/240/240',
  },
];

const ME: Me = {
  jobField: 'it',
  household: 'married',
  topics: ['economy', 'realestate', 'tech', 'ai', 'health'],
  pushHour: 7,
  pushOn: true,
};

/** `?screen=intro` / `onboarding` / `empty` / `yesterday` 로 시작 화면을 고른다. */
const wantScreen = () => new URLSearchParams(location.search).get('screen');

export const hasSession = async () => wantScreen() !== 'intro';

export const login = async () => ({ onboarded: wantScreen() !== 'onboarding' });

export const getBriefing = async (): Promise<BriefingResponse> => {
  switch (wantScreen()) {
    case 'onboarding': return { onboarded: false, date: null, isToday: false, nextHour: 7, cards: null };
    case 'empty':      return { onboarded: true, date: null, isToday: false, nextHour: 7, cards: null };
    case 'yesterday':  return { onboarded: true, date: '2026-08-22', isToday: false, nextHour: 7, cards: CARDS };
    default:           return { onboarded: true, date: '2026-08-23', isToday: true, nextHour: null, cards: CARDS };
  }
};

export const getMe = async (): Promise<Me> => ME;

export const putMe = async (patch: MePatch): Promise<Me> => Object.assign(ME, patch);

export const cacheBriefing = async (): Promise<void> => {};

export const readCachedBriefing = async (): Promise<BriefingResponse | null> => null;
