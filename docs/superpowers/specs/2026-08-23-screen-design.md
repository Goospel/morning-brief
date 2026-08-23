# 화면 디자인 (TDS) + 심사 스크린샷 경로 설계

날짜: 2026-08-23 · 브랜치: feat/screen-design
선행 문서: [2026-08-23-frontend-design.md](2026-08-23-frontend-design.md) (화면 흐름·API — 이번 설계는 그 위에 "디자인만" 입힌다)

---

## 0. 목표 / 비목표

**목표**
1. 4개 화면(Intro / Onboarding / Briefing / Settings)에 TDS 컴포넌트 기반 디자인을 입힌다 — 화면 흐름·API 계약은 그대로.
2. 토스 로그인 없이(mTLS 인증서 미발급) 목 데이터로 화면을 띄워, 심사 제출용 스크린샷 3장(636×1048 PNG)을 뽑는다.
3. 브랜드 색을 로고와 일치시킨다 (`brand.primaryColor` → `#3E7BD1`).

**비목표 (YAGNI)**
- 라우터 도입, 화면 추가·기능 변경, 다크모드 커스텀 팔레트(TDS adaptive가 자동 처리 — 우리는 토큰만 쓴다), 애니메이션·스켈레톤 로딩, 탭바(화면 2개뿐이라 탭바 최소 2탭 규정 대상 아님 — 탭바 자체를 안 쓴다), 새 의존성.
- 테스트 러너 도입 없음: `app/`에는 vitest가 없고 새 의존성이 금지다. 이 작업의 검증 게이트는 ① `tsc -b && vite build && ait build` 통과 ② 목 모드 실측(스크린샷) ③ prod 번들에 목 코드 부재 확인(아래 8절)이다. TDD의 "실패 먼저"는 각 태스크의 "빌드/실측 확인" 단계로 대체한다 — UI 스타일링에 단위 테스트를 억지로 만들지 않는다.

---

## 1. 실측 근거 — TDS의 실제 API (전부 d.ts/번들 소스에서 확인)

조사 대상: `app/node_modules/@toss/tds-mobile@2.5.1/dist/esm/index.d.ts`(34,396줄), `@toss/tds-mobile-ait/dist/esm/*.d.ts`, `@toss/tds-colors@0.1.0/dist/esm/index.js`. 아래 표의 컴포넌트·prop은 **전부 d.ts에서 존재와 시그니처를 확인한 것만** 적었다.

### 1-1. tds-mobile-ait는 Provider 래퍼일 뿐이다

`@toss/tds-mobile-ait`의 export는 `TDSMobileAITProvider` 하나(+내부 `GlobalCSSVariables`, `SafeAreaInsets`). userAgent 파싱·brandPrimaryColor 주입을 대신해 주는 `TDSMobileProvider` 래퍼다. **모든 UI 컴포넌트는 `@toss/tds-mobile`에서 import한다.**
`main.tsx`는 이미 `TDSMobileAITProvider brandPrimaryColor={config.brand.primaryColor}`로 감싸져 있다 — **Provider 셋업은 추가 작업이 필요 없다.** TDSMobileProvider는 내부에서 ① 전역 CSS 리셋(Toss Product Sans 폰트 스택, body 리셋 — `resetGlobalCss` 기본 true) ② adaptive 색상 CSS 변수 주입 ③ PortalProvider(BottomSheet·Toast용)까지 다 감싼다(번들 소스에서 합성 순서 확인).

### 1-2. 사용할 컴포넌트와 확인된 props

| 컴포넌트 | 확인된 핵심 props | 용도 |
|---|---|---|
| `Top` | `title`, `subtitleBottom`, `right`, `upper`, `lower` (전부 ReactNode) + 하위 `Top.TitleParagraph`, `Top.SubtitleParagraph` | 화면 타이틀 영역 |
| `ListHeader` | `title`(ReactNode — `ListHeader.TitleParagraph` 사용), `description`, `descriptionPosition` | 섹션 제목 |
| `ListRow` | `left`, `contents`, `right`, `border`('indented'\|'none'), `verticalPadding`, `arrowType`, `withTouchEffect` + `ListRow.Texts`(`type: '1RowTypeA'…'3RowTypeF'`, `top`, `bottom`), `ListRow.AssetIcon` | 목록 행 |
| `Paragraph` | `typography`(필수), `fontWeight`('regular'\|'medium'\|'semibold'\|'bold'), `color`, `textAlign`, `ellipsisAfterLines` + `Paragraph.Text` | 모든 텍스트 |
| `Button` | `color`('primary'\|'danger'\|'light'\|'dark'), `variant`('fill'\|'weak'), `display`('inline'\|'block'\|'full'), `size`('small'…'xlarge'), `loading`, `disabled` | 일반 버튼 |
| `FixedBottomCTA` | `CTAButtonProps` 상속(= Button props + `disabledChildren`), 화면 하단 고정 + 그라디언트 | 화면 대표 액션 |
| `Chip` + `ChipItem` | Chip: `kind`('select'\|'action'), `wrap`(줄바꿈), `margin`, `size` / ChipItem: `selected`, `disabled`, `onClick`(div 속성) | 온보딩·설정의 선택지 |
| `Switch` | `checked`, `onChange(e, checked)`, `disabled` | 알림 on/off |
| `Selector` | `typography`(필수), `type`('arrow'\|'underline'\|'clear') + Paragraph.Text props | 설정의 시각 표시 |
| `useBottomSheet()` | `open({ header, children })`, `close()` | 시각 선택 시트 |
| `BottomSheet.Select` | `options: {name, value}[]`, `value`, `onChange(e)` | 0~23시 라디오 목록 |
| `useToast()` | `openToast(message, options?)` — 네이티브 토스트 컨텍스트가 없으면 **웹 토스트로 폴백**(번들 소스 확인: `t ?? useWebToast(...)`) | 에러·안내 |
| `Badge` | `variant`('fill'\|'weak'), `color`('blue'\|'teal'\|'green'\|'red'\|'yellow'\|'elephant'), `size` | 상태 배지 |
| `Border` | `variant`('full'\|'padding24') 또는 `height`(space형) | 구분선 |
| `Spacing` | `size`(px number), `direction` | 여백 |
| `TextButton` | `size`(필수), `variant`('arrow'\|'underline'\|'clear') + Paragraph.Text props | 원문 보기·설정 진입 |
| `Loader` | (기본 스피너) | 로딩 |

앱인토스 공식 가이드의 "핵심 11 컴포넌트"(Badge·Border·BottomCTA·Button·Asset·ListRow·ListHeader·Navigation·Paragraph·Tab·Top)와 겹치게 골랐다. TDS 사용 자체가 심사 기준이다.
(출처: [TDS 컴포넌트](https://developers-apps-in-toss.toss.im/design/components.html), [UX 가이드](https://developers-apps-in-toss.toss.im/design/consumer-ux-guide.md))

### 1-3. 타이포 스케일 (번들 런타임 테이블 실측)

번들에 `["t1","st1",…,"st13"]` ↔ `[30,29,…,11]` 매핑 테이블이 있다. 이번 설계가 쓰는 것만:

| 토큰 | px | 용도 |
|---|---|---|
| `t2` | 26 | 인트로 앱 이름 |
| `t3` | 22 | 화면 타이틀(Top 기본) |
| `t4` | 20 | 기사 카드 제목 |
| `t5` | 17 | 본문(요약), ListRow 기본 |
| `st9` | 18 | 인트로 부제 |
| `st10` | 16 | 상태 배너, 보조 문구 |
| `st11` | 14 | 카드 메타(출처·시간), 면책 문구 |

### 1-4. 색 — `@toss/tds-colors`의 `adaptive`

`adaptive.grey600` 등은 `"var(--adaptiveGrey600)"` 문자열이고, 이 CSS 변수는 TDSMobileProvider가 colorPreference(라이트/다크)에 맞춰 런타임 주입한다(번들 소스에서 생성 함수 확인). **hex 하드코딩 대신 `adaptive.*`를 쓰면 다크모드가 공짜다.**

---

## 2. 브랜딩 결정

### 2-1. `brand.primaryColor` → `#3E7BD1` (변경 제안: 채택)

- 현재 `#3182F6`은 토스 기본값 그대로 = "브랜드 색을 안 정했다"는 신호. 공식 가이드가 "로고의 대표색 선택"을 명시하고, **색 대비는 앱인토스가 자동 보정**하므로 로고 파랑 `#3E7BD1`로 바꾸는 비용은 0이다.
- 이 값 하나가 `TDSMobileAITProvider brandPrimaryColor`를 타고 Button(primary)·CTA·Chip selected 등 전 컴포넌트의 주색이 된다. 코드에서 파랑을 따로 만질 필요 없음.

### 2-2. 보조 색 사용 원칙

- 주황(우유 뚜껑) 강조: **TDS `adaptive.orange600`(#fb8800, 로고 #FF8A00과 근사)** 만 포인트로 사용(브리핑 끝 체크 문구 등 1~2곳). 로고 hex를 직접 하드코딩하지 않는다 — 다크모드 자동 대응을 잃는다.
- 크림·남색: 로고 이미지 자체가 전달한다. UI 팔레트로 확장하지 않는다(YAGNI).
- 회색 계열: 전부 `adaptive.grey500~grey800`.

### 2-3. 말투

앱인토스 UX 라이팅 규정: 해요체·능동·긍정. 기존 문구가 이미 해요체 — 유지.

---

## 3. 목 데이터 경로 — vite `--mode mock` + `api.ts` 게이트 (대안 비교)

### 문제

`POST /app/login`은 mTLS 인증서 미발급으로 성공한 적이 없다. Briefing·Settings는 세션이 필요하므로 실 로그인 없이는 영영 못 띄운다. 스크린샷은 물론 디자인 실측 확인 자체가 막힌다. 또한 `api.ts`는 `Storage`/`TossAuth` SDK를 쓰는데 일반 브라우저에서는 이것도 신뢰할 수 없다 — 목 모드는 **SDK 호출 자체를 우회**해야 한다.

### 대안 비교

| 대안 | 평가 |
|---|---|
| **A. `api.ts`에 `import.meta.env` 게이트 + `mock.ts` (채택)** | export당 삼항 1줄. Vite가 `import.meta.env.*`를 빌드 시 정적 치환 → prod에서 분기가 상수 false로 접히고 `mock.ts`가 트리셰이킹으로 번들에서 제거된다(8절에서 실측 검증). 주입 지점이 이미 `api.ts` 하나로 모여 있어 화면 코드는 1줄도 안 바뀐다 |
| B. 별도 엔트리(`main.mock.tsx` + mock.html) | 엔트리·HTML 이중화, `ait build` 산출물에 목 엔트리가 섞일 위험. 과함 |
| C. vite alias로 `./api` → `./api.mock` 스왑 | 상대 경로 import(`'../api'`/`'./api'`)를 alias로 잡으려면 정규식 매칭이 필요 — 조용히 안 걸리면 **실 API를 목인 줄 알고 쓰는** 무성 실패. 마법은 기각 |
| D. MSW류 서비스워커 목 | 새 의존성 금지. 기각 |

### 채택안 상세

**모드 스위치는 셸 환경변수가 아니라 vite mode로 건다** — Windows PowerShell에서 `VITE_MOCK=1 npm run dev` 꼴 인라인 env는 안 되고 cross-env는 새 의존성이다. `--mode mock`은 어느 셸에서든 동일하게 동작한다.

```
app/.env.mock          # 새 파일: VITE_MOCK=1  (gitignore는 .env/.env.local만 무시 — 이 파일은 커밋한다, 확인함)
app/package.json       # scripts에 "dev:mock": "vite dev --mode mock" 추가
```

`app/src/mock.ts` (새 파일 — 목 데이터와 목 구현 전부 여기):

```ts
// 심사 스크린샷·디자인 확인용 목 API. prod 번들에는 포함되지 않는다(트리셰이킹).
import type { BriefingResponse, Me } from './api';

const CARDS = [ /* 실감나는 한국어 기사 5건: title, summaryKo(2~3문장), sourceName, url, publishedAt */ ];
const ME: Me = { jobField: 'it', household: 'married', topics: ['economy','tech','ai','health'], pushHour: 7, pushOn: true };

const wantScreen = () => new URLSearchParams(location.search).get('screen');

export const hasSession = async () => wantScreen() !== 'intro';
export const login = async () => ({ onboarded: wantScreen() !== 'onboarding' });
export const getBriefing = async (): Promise<BriefingResponse> =>
  wantScreen() === 'onboarding'
    ? { onboarded: false, date: null, isToday: false, nextHour: 7, cards: null }
    : { onboarded: true, date: '2026-08-23', isToday: true, nextHour: null, cards: CARDS };
export const getMe = async () => ME;
export const putMe = async (patch: Partial<Me>) => ({ ...ME, ...patch });
export const cacheBriefing = async () => {};
export const readCachedBriefing = async () => null;
```

`app/src/api.ts` — 각 export를 삼항으로 감싼다(프로덕션 경로 코드는 그대로):

```ts
import * as mock from './mock';
const MOCK = import.meta.env.VITE_MOCK === '1';

export const getBriefing = MOCK ? mock.getBriefing : () => call<BriefingResponse>('/briefing');
export const getMe      = MOCK ? mock.getMe      : () => call<Me>('/me');
// login, putMe, hasSession, cacheBriefing, readCachedBriefing 동일 패턴 (총 7개)
```

**화면 제어**: 앱 시작 분기(App.tsx)는 `hasSession`·`getBriefing.onboarded`로 정해지므로, 쿼리스트링으로 목이 응답을 바꾸면 화면이 따라온다 — App.tsx는 손대지 않는다.

| URL | 화면 |
|---|---|
| `/?screen=intro` | Intro (hasSession=false) |
| `/?screen=onboarding` | Onboarding (onboarded=false) |
| `/` | Briefing (기사 5건) |
| Briefing에서 "설정" 클릭 | Settings |

**한계(의도)**: 목 모드에서 `Device.openURL`(원문 보기)은 일반 브라우저에서 실패할 수 있다 — 스크린샷 경로에서 누르지 않으면 그만. api.ts 밖 SDK 호출은 이것 하나뿐(Briefing.tsx)이라 게이트 확장은 안 한다.

---

## 4. 공통 프레임

### 4-1. `index.css` 정리 (22줄 → 더 축소)

- `font-family: sans-serif` **제거** — TDSMobileProvider 리셋이 Toss Product Sans 폰트 스택을 body에 주입한다. 남겨두면 :root가 이기는 곳이 생길 수 있다.
- `min-width: 320px` **제거** — 스크린샷 뷰포트가 318px(6-2절)이라 2px 수평 오버플로를 만든다. 실기기 논리 해상도(360~420)에서 의미 없는 제약.
- tap-highlight 제거·데스크톱 센터링 블록은 유지.

### 4-2. 내비게이션에 대한 가정

앱인토스 웹뷰 미니앱은 **토스가 네이티브 내비게이션 바(뒤로가기 포함)를 상단에 제공**한다. 따라서 웹 화면 안에는 `TopNavigation`을 중복으로 그리지 않고 `Top`(타이틀 영역)만 쓴다. Settings의 자체 "뒤로" 버튼도 제거한다 — 실기기에선 네이티브 back(→ popstate → App.tsx가 briefing 복귀), dev 브라우저에선 브라우저 뒤로가기로 동일 동작. `Settings`의 `onBack` prop과 App.tsx의 전달부는 함께 지운다(죽은 코드를 남기면 tsc unused 에러).
⚠️ 이 가정(네이티브 바 존재)은 샌드박스 실기기에서만 최종 확인 가능 — 10절 미검증 가정에 기록.

### 4-3. 로고 에셋

`store-assets/logo.png`(dev 전용 목록이 아닌 리포 자산)를 `app/src/assets/logo.png`로 **복사**해 import한다(`import logoUrl from './assets/logo.png'`). vite가 번들에 포함하므로 경로 문제 없음. Intro에서만 쓴다.

### 4-4. 로딩 상태 공통

`불러오는 중…` 텍스트 → 화면 중앙 `Loader`. App.tsx loading 분기와 Briefing·Settings 로딩에 동일 적용 (3곳, 공용 컴포넌트로 뺄 정도는 아님 — 각자 3줄).

---

## 5. 화면별 설계

카드형 UI는 TDS에 없다(확인함). 토스 스타일 = 흰 배경 + 타이포 위계 + 구분선. 그 문법을 따른다. 아래 의사 JSX의 컴포넌트·prop은 전부 1-2절에서 확인한 것만 쓴다.

### 5-1. Intro — "아침 배달" 첫인상

```tsx
<main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
                justifyContent: 'center', alignItems: 'center', padding: '0 24px' }}>
    <img src={logoUrl} width={96} height={96} style={{ borderRadius: 22 }} alt="" />
    <Spacing size={24} />
    <Paragraph typography="t2" fontWeight="bold">나만의 정보</Paragraph>
    <Spacing size={8} />
    <Paragraph typography="st9" color={adaptive.grey600}>매일 아침 나에게 맞는 뉴스 5분</Paragraph>
    <Spacing size={40} />
    {/* 가치 3줄 — 이모지는 TDS 폰트 스택의 Tossface로 렌더된다 */}
    <List>  {/* ul 시맨틱 유지 */}
      <ListRow border="none" verticalPadding="small"
        left={<Paragraph typography="t4">🥛</Paragraph>}
        contents={<ListRow.Texts type="1RowTypeB" top="나이·직업·관심사에 맞춘 기사 5~6건" />} />
      <ListRow border="none" verticalPadding="small"
        left={<Paragraph typography="t4">🌏</Paragraph>}
        contents={<ListRow.Texts type="1RowTypeB" top="해외 매체도 한국어 요약으로 배달돼요" />} />
      <ListRow border="none" verticalPadding="small"
        left={<Paragraph typography="t4">✅</Paragraph>}
        contents={<ListRow.Texts type="1RowTypeB" top="다 보면 끝나는 하루치 묶음이에요" />} />
    </List>
  </div>
  <FixedBottomCTA loading={busy} onClick={start}>토스로 시작하기</FixedBottomCTA>
</main>
```

- 에러 `<p role="alert">` → `useToast().openToast('로그인하지 못했어요. 다시 시도해 주세요.')`.
- `1RowTypeB`의 정확한 시각 차이는 d.ts에 없다(A/B/C는 타이포 프리셋 차이) — 구현 때 A/B 중 눈으로 고른다.

### 5-2. Onboarding — 3문항 칩 선택

```tsx
<main style={{ paddingBottom: 120 }}>   {/* FixedBottomCTA에 안 가리게 */}
  <Top title={<Top.TitleParagraph>어떤 소식이 필요하세요?</Top.TitleParagraph>}
       subtitleBottom={<Top.SubtitleParagraph color={adaptive.grey600}>
         맞는 소식만 골라서 배달해 드릴게요</Top.SubtitleParagraph>} />

  <ListHeader title={<ListHeader.TitleParagraph>하시는 일</ListHeader.TitleParagraph>} />
  <div style={{ padding: '0 24px' }}>
    <Chip kind="select" wrap>
      {JOB_FIELDS.map(f => (
        <ChipItem key={f} selected={jobField === f} onClick={() => setJobField(f)}>
          {JOB_FIELD_LABELS[f]}
        </ChipItem>))}
    </Chip>
  </div>

  {/* 가구 형태: 동일 패턴 (HOUSEHOLDS 3개) */}
  {/* 관심 주제: ListHeader description "하나 이상 골라주세요" + TopicChips (5-4 공용) */}

  <FixedBottomCTA disabled={!ready} loading={busy} onClick={submit}>시작하기</FixedBottomCTA>
</main>
```

- `Chip kind="select"`는 "selected 1개 이상" 권고 — 초기 0개 상태가 있으므로 kind 기본값을 그대로 두되 경고성 동작이 보이면 구현 때 `kind` 생략(기본 select)로 확인. 시각만의 문제라 리스크 낮음.
- 단일 선택(하시는 일·가구 형태)은 상태 로직 그대로(이미 구현돼 있음) — ChipItem은 렌더만 바뀐다.

### 5-3. Briefing — 하루치 묶음, 다 보면 끝

```tsx
<main style={{ paddingBottom: 40 }}>
  <Top
    title={<Top.TitleParagraph>오늘의 브리핑</Top.TitleParagraph>}
    subtitleBottom={<Top.SubtitleParagraph color={adaptive.grey600}>
      {formatDate(data.date)} · 기사 {data.cards.length}건</Top.SubtitleParagraph>}
    right={<TextButton size="medium" onClick={onSettings}>설정</TextButton>} />

  {/* 상태 배너 (오프라인 / 어제 브리핑) — 해당 시에만 */}
  <div style={{ margin: '0 24px 8px', padding: '12px 16px',
                background: adaptive.grey50, borderRadius: 12 }}>
    <Paragraph typography="st10" color={adaptive.grey600}>
      오프라인이에요. 마지막으로 받은 브리핑을 보여드려요</Paragraph>
  </div>

  {/* 기사 카드 — cards.map */}
  <article style={{ padding: '20px 24px 0' }}>
    <Paragraph typography="t4" fontWeight="bold" ellipsisAfterLines={3}>{c.title}</Paragraph>
    <Spacing size={8} />
    <Paragraph typography="t5" color={adaptive.grey700}>{c.summaryKo}</Paragraph>
    <Spacing size={12} />
    {/* 메타 행: 출처 왼쪽, 원문 링크 오른쪽 */}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Paragraph typography="st11" color={adaptive.grey500}>{c.sourceName}</Paragraph>
      <TextButton size="small" variant="arrow" onClick={() => Device.openURL(c.url)}>원문 보기</TextButton>
    </div>
    <Spacing size={20} />
    <Border variant="padding24" />   {/* 마지막 카드는 생략 */}
  </article>

  {/* 끝 마감 — 우유 다 마심 */}
  <Spacing size={32} />
  <div style={{ textAlign: 'center', padding: '0 24px' }}>
    <Paragraph typography="t3">🥛</Paragraph>
    <Spacing size={8} />
    <Paragraph typography="st9" fontWeight="semibold" color={adaptive.orange600}>
      오늘의 브리핑을 다 읽었어요</Paragraph>
    <Spacing size={8} />
    <Paragraph typography="st11" color={adaptive.grey500}>
      요약은 AI가 만들었어요. 정확한 내용은 원문을 확인해 주세요</Paragraph>
  </div>
</main>
```

- **빈 상태**(cards=null): 중앙 정렬 `🥛`(t1) + "첫 브리핑을 준비하고 있어요"(st9 semibold) + "내일 아침 {nextHour}시에 배달돼요"(st10 grey600).
- **실패 상태**: 중앙 정렬 문구 + `Button variant="weak" size="medium"` "다시 시도".
- 어제 브리핑 배너는 오프라인 배너와 같은 박스 스타일, 문구만 "어제의 브리핑이에요 · 오늘 브리핑은 {nextHour}시에 도착해요".

### 5-4. Settings — ListRow 문법

```tsx
<main>
  <Top title={<Top.TitleParagraph>설정</Top.TitleParagraph>} />

  <ListHeader title={<ListHeader.TitleParagraph>알림</ListHeader.TitleParagraph>} />
  <List>
    <ListRow border="none"
      contents={<ListRow.Texts type="1RowTypeA" top="매일 아침 알림 받기" />}
      right={<Switch checked={me.pushOn} onChange={(_, checked) => patch({ pushOn: checked })} />} />
    <ListRow border="none" withTouchEffect
      onClick={openHourSheet}
      contents={<ListRow.Texts type="1RowTypeA" top="받을 시간" />}
      right={<Selector typography="t5" type="arrow">{me.pushHour}시</Selector>} />
  </List>

  <ListHeader title={<ListHeader.TitleParagraph>관심 주제</ListHeader.TitleParagraph>} />
  <div style={{ padding: '0 24px 24px' }}>
    <TopicChips value={me.topics} onChange={next => { /* 기존 0개 방지 로직 */ }} />
  </div>
</main>
```

- **시각 선택 시트**: `useBottomSheet().open({ header: <BottomSheet.Header>받을 시간</BottomSheet.Header>, children: <BottomSheet.Select options={hours} value={String(me.pushHour)} onChange={...} /> })` — options는 `{ name: '7시', value: '7' }` 24개. onChange에서 `patch({ pushHour: Number(v) })` 후 `close()`. `BottomSheet.Header`의 정확한 children 시그니처는 구현 때 d.ts 재확인(존재는 확인함 — `ExportedBottomSheet.Header`).
- 토스트 상태(`toast` state + `<p role="alert">`) → `useToast().openToast(...)`로 대체, state 제거.
- **공용 `TopicChips`** (새 파일 `app/src/components/TopicChips.tsx`): TOPICS 13개를 `Chip wrap` + `ChipItem`으로 렌더. Onboarding·Settings 중복 제거 — props는 `{ value: string[]; onToggle(next: string[]): void }` 수준으로 최소.

---

## 6. 심사 스크린샷 3장 — 구성과 절차

### 6-1. 3장 구성 (서비스 가치 순)

| # | 화면 | URL | 전달점 |
|---|---|---|---|
| 1 | 브리핑 (기사 5건) | `/` | 핵심 가치: 하루치 요약 묶음 |
| 2 | 온보딩 (칩 몇 개 선택된 상태) | `/?screen=onboarding` + 클릭 연출 | 개인 맞춤 |
| 3 | 설정 (알림 켜짐·7시) | `/`에서 "설정" 클릭 | 아침 배달 알림 |

### 6-2. 636×1048로 뽑는 절차

636×1048은 논리 318×524의 정확히 2배다 → **뷰포트 318×524 + deviceScaleFactor 2**로 캡처하면 픽셀 정확히 나온다. (index.css의 min-width:320 제거가 선행 조건 — 4-1절.)

브라우저 표면 선택(글로벌 규칙): 로그인 불필요한 로컬 목 모드 = **chrome-devtools MCP 1순위**. 절차:

1. `cd app && npm run dev:mock` (vite dev 서버 — 내부 패널 preview_start 불필요, chrome-devtools가 직접 접속)
2. chrome-devtools MCP: `emulate` `viewport: "318x524x2,mobile,touch"` → **그다음** `navigate_page`로 `http://localhost:5173/?screen=onboarding` 등 (⚠️ emulate를 navigate 앞에 — 글로벌 규칙. ⚠️ vite는 IPv6 바인딩이라 반드시 `localhost`, `127.0.0.1` 금지)
3. 온보딩: `take_snapshot`으로 uid 얻어 칩 3~4개 `click` 연출 → `take_screenshot`
4. 설정: `/` 로드 → "설정" 클릭 → `take_screenshot`
5. 저장: `store-assets/screenshots/01-briefing.png`, `02-onboarding.png`, `03-settings.png`
6. **크기 실측 검증** (스크린샷이 dsf를 반영해 636×1048인지 — 반영 안 되면 318×524로 나온다):
   ```powershell
   Add-Type -AssemblyName System.Drawing
   $img = [System.Drawing.Image]::FromFile("store-assets\screenshots\01-briefing.png")
   "$($img.Width)x$($img.Height)"   # 기대: 636x1048
   ```
   318×524로 나오면 폴백: `emulate` `viewport: "636x1048x1"`(레이아웃이 태블릿급으로 커져 모바일답지 않으면, 대안으로 스크린샷 후 무손실 2배 최근접 확대 — PowerShell System.Drawing `InterpolationMode.NearestNeighbor`. 318→636 정수배라 열화 없음).

---

## 7. 구현 태스크 분해 (순서대로)

각 태스크의 "확인"이 이 작업의 Red/Green 게이트다(0절 비목표 참조). 모든 태스크 후 `cd app && npx tsc -b`가 통과해야 다음으로 간다.

1. **브랜드·전역 정리** — `apps-in-toss.config.ts` primaryColor `#3E7BD1`, `index.css`에서 font-family·min-width 제거, `store-assets/logo.png` → `app/src/assets/logo.png` 복사.
   확인: `npm run dev`로 기존 화면이 여전히 뜬다(회귀 없음).
2. **목 경로** — `app/.env.mock`, `app/src/mock.ts`(기사 5건 목 데이터 포함), `api.ts` 7개 export 게이트, package.json `dev:mock` 스크립트.
   확인(Red→Green): 게이트 넣기 전 `npm run dev:mock`+`/` 접속이 로그인 실패로 인트로에 떨어지는 것을 먼저 보고 → 게이트 후 브리핑 5건이 뜨는 것을 본다. `?screen=onboarding`·`?screen=intro` 분기 확인.
3. **prod 오염 검증** — `npm run build` 후 목 전용 소스 리터럴(목 기사 제목 문자열 하나 — 소스에 따옴표째 실린 것)로 `dist/` grep → **0건**. 양성 대조: 같은 문자열이 `mock.ts` 소스에는 1건 grep 되는 것 먼저 확인(검사 문자열 자체 오류 방지 — 글로벌 번들 검사 원칙).
4. **공용** — `TopicChips.tsx` + Loader 공통 적용(App.tsx loading 분기).
5. **Intro** 리디자인 (5-1). 확인: `/?screen=intro` 실측.
6. **Onboarding** 리디자인 (5-2, TopicChips 사용). 확인: `/?screen=onboarding` 실측 — 칩 선택/해제, CTA disabled 해제 동작.
7. **Briefing** 리디자인 (5-3, 빈 상태·실패 상태·배너 포함). 확인: `/` 실측.
8. **Settings** 리디자인 (5-4, BottomSheet 시각 선택 + onBack 제거를 App.tsx와 함께). 확인: 설정 진입·스위치·시트·칩 토글 실측.
9. **빌드 게이트** — `npm run build`(tsc -b && vite build && ait build) 통과.
10. **스크린샷 3장** — 6-2절 절차 + 크기 실측 검증.
11. plan.md ✅ / changeLog.md 갱신은 PR 절차에서 한 세트로.

태스크 2·3이 4~8보다 먼저인 이유: 목 경로 없이는 5~8의 "확인"을 실측할 수단이 없다.

---

## 8. 기각한 대안 요약

- **목 데이터: 별도 엔트리·alias 스왑·서비스워커** — 3절 표 참조.
- **카드 UI를 그림자·테두리 박스로 자작** — TDS에 Card가 없고, 토스 화면 문법은 평면+구분선. 자작 박스는 심사 기준(TDS 준수)과 어긋날 위험만 늘린다.
- **시각 선택을 `WheelDatePicker`/`NumericSpinner`로** — 존재는 확인했으나 날짜/금액용. 24개 라디오(`BottomSheet.Select`)가 요구에 정확히 맞고 더 단순.
- **설정 진입을 아이콘 버튼으로** — `IconButton`·`AssetIcon name`의 유효 아이콘 이름 목록을 로컬에서 확인할 수 없다(CDN 아이콘 세트). 존재하지 않는 이름은 무성 실패할 수 있어 텍스트 버튼("설정")으로 확정. 아이콘은 이름 목록이 확보되면 후속.
- **primaryColor에 토스 기본 유지** — 2-1절.

---

## 9. 리스크

| 리스크 | 대비 |
|---|---|
| dsf=2 스크린샷이 636×1048로 안 나옴 | 6-2 폴백(정수배 최근접 확대) |
| `ListRow.Texts` type별 시각 차이를 문서로 알 수 없음 | 프리셋 나열이므로 구현 때 2~3개 눈으로 비교, 되돌리기 1줄 |
| `Chip kind="select"`의 "selected ≥ 1" 권고 위반(온보딩 초기 0개) | 시각 경고만 있을 것으로 예상, 실측서 문제 시 스타일 무관하므로 그대로 진행 |
| `BottomSheet.Header` children 시그니처 미확인 | 구현 직전 d.ts 확인, 안 맞으면 `open({ header: '받을 시간', … })` 문자열 폴백 |
| emotion 11 peer — 이미 dependencies에 있고 Provider가 동작 중 | 리스크 아님(실증됨) |

## 10. 미검증 가정 (정직 신고)

1. **앱인토스 네이티브 내비바가 뒤로가기를 제공한다** (4-2) — 샌드박스 실기기에서만 확인 가능. 틀리면 Settings에 back 버튼 복원(1줄 되돌림).
2. **`import.meta.env.VITE_MOCK` 미정의 시 트리셰이킹으로 mock.ts가 prod 번들에서 빠진다** — 표준 Vite 동작이지만 태스크 3에서 grep 실측으로 확정한다.
3. **chrome-devtools `take_screenshot`이 dsf를 반영한 픽셀로 캡처한다** — 태스크 10에서 실측, 폴백 준비됨.
4. **이모지가 토스 앱에서 Tossface로 렌더** — TDS 폰트 스택에 Tossface가 있음은 확인(번들 리셋 CSS). 일반 브라우저 스크린샷에서는 OS 이모지로 나온다 — 심사 스크린샷 품질에 큰 영향 없다고 판단.
5. ~~636×1048 규격~~ — **확인됨(가정 아님)**: 앱인토스 콘솔 「앱 정보 등록하기 · 2단계 카테고리 및 노출」 화면의 스크린샷 업로드 영역에 「세로형 (636×1048): 최소 3장 / 가로형 (1504×741): 최소 1장」으로 명시돼 있다. 공개 개발자 문서가 아니라 콘솔 UI가 출처다.
