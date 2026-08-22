# 나만의정보 — 개인 맞춤 아침 브리핑 (설계)

- 작성일: 2026-08-22 (KST)
- 상태: 승인됨 (MVP 범위 확정)
- 배포 대상: 앱인토스(Apps in Toss) WebView 미니앱

## 1. 문제와 해법

정보는 넘치는데 나에게 맞는 건 찾기 어렵다. 특히 해외 매체는 접근 자체가 번거롭다.

**해법**: 사용자의 나이·성별·가구 형태·직업 분야에 맞춰 매일 아침 한 번, 브리핑 카드 몇 장을 푸시로 배달한다. "아침에 우유 배달" 모델 — 다 보면 끝나는 유한한 묶음이지, 무한 스크롤이 아니다.

**차별점**: 해외 영문 매체를 한글 요약으로 같이 배달한다. 국내 뉴스만이면 기존 뉴스앱과 다를 게 없다.

## 2. 플랫폼 제약 (앱인토스 실측)

설계를 강제한 사실들:

| 사실 | 설계에 미친 영향 |
|---|---|
| WebView 미니앱 = Vite + React + TS + `@apps-in-toss/web-framework` + TDS. 콘솔에 번들 업로드, `intoss://{appName}` 딥링크 | 프런트는 정적 번들. 서버 로직을 담을 수 없어 백엔드가 반드시 별도 필요 |
| 토스 로그인 스코프로 **성별·생일** 제공. 결혼여부·직업은 미제공 | 온보딩에서 직업 분야·가구 형태·관심 주제만 추가로 받는다 |
| `userKey`는 **미니앱 내에서만 고유** | 자체 회원 테이블의 PK로 그대로 쓴다. 다른 서비스와 매핑 불필요 |
| 푸시는 **mTLS 서버-투-서버**, **문구 사전 검수 승인 필수**, **예약 발송 없음** | 문구를 고정 템플릿 1개로 고정. 크론이 시간 맞춰 즉시 발송 |
| 푸시 발송량: 단건 앱당 분당 15,000 / 사용자당 분당 10, 대량 발송 요청당 50~2,500건 | 시간대별로 사용자를 묶어 대량 발송 API로 보낸다 |
| 개인정보는 "서비스 제공에 직접 필요한 최소한만 수집" | 온보딩 문항을 3개로 제한. CI·전화번호·이메일 스코프는 요청하지 않는다 |

## 3. 아키텍처

```
Supabase Cron (KST)
  03:00  수집 잡   sources 순회 → RSS/Atom 파싱 → articles upsert (url 기준 신규만)
  04:00  요약 잡   summary_ko IS NULL 인 article → Claude Batch API → 요약·토픽 태그 저장
  매시 정각 배달 잡  push_hour = 현재시 인 사용자 → 점수 계산 → briefings 확정 → 토스 푸시 발송

앱인토스 WebView 미니앱 (Vite + React + TDS)
  온보딩 → 오늘의 브리핑 → 설정
  briefings 를 읽기만 한다
```

**핵심 원칙: 요약은 기사당 정확히 1회.** 모든 사용자가 같은 요약문을 공유하므로 AI 비용이 사용자 수와 무관하고 수집 기사 수에만 비례한다. 배달 잡은 순수 SQL 점수 계산이라 비용이 사실상 0이다.

**두 번째 원칙: 앱은 읽기 전용.** 사용자가 앱을 열 때는 브리핑이 이미 DB에 확정돼 있다. 첫 진입이 빠르고, RSS 장애나 LLM 장애가 사용자 화면에 노출되지 않는다.

### 프런트 화면 3개

1. **온보딩** — 토스 로그인 → 3문항(직업 분야 / 가구 형태 / 관심 주제 멀티선택) → `profiles` 저장. 30초 안에 끝난다.
2. **오늘의 브리핑** — 오늘자 `briefings`의 카드 리스트. 카드 = 제목 + 한글 요약 3~5줄 + 출처명 + 원문 링크. 원문은 앱인토스 SDK로 외부 브라우저에서 연다.
3. **설정** — 알림 시간, 관심 주제 수정, 알림 끄기.

## 4. 데이터 모델

```sql
create table profiles (
  user_key    text primary key,          -- 토스 userKey
  gender      text,                      -- 토스 로그인 스코프
  birth_year  int,                        -- 생일에서 연도만 보관 (최소수집)
  household   text,                       -- single | married | with_kids
  job_field   text,                       -- it | finance | medical | edu | ...
  topics      text[]  not null default '{}',
  push_hour   int     not null default 7, -- KST 0~23
  push_on     boolean not null default true,
  created_at  timestamptz not null default now()
);

create table sources (
  id       bigserial primary key,
  name     text not null,                 -- 카드에 노출되는 출처명
  feed_url text not null unique,
  lang     text not null,                 -- ko | en
  topics   text[] not null default '{}',
  enabled  boolean not null default true
);

create table articles (
  id           bigserial primary key,
  source_id    bigint not null references sources(id),
  url          text not null unique,      -- 중복 수집·중복 요약 동시 차단
  title        text not null,
  published_at timestamptz not null,
  lang         text not null,
  raw_excerpt  text,                      -- RSS 가 제공한 범위의 발췌만
  summary_ko   text,
  topics       text[] not null default '{}',
  summarized_at timestamptz
);
create index on articles (published_at desc) where summary_ko is not null;

create table briefings (
  user_key    text not null references profiles(user_key),
  date        date not null,
  article_ids bigint[] not null,
  sent_at     timestamptz,
  opened_at   timestamptz,
  primary key (user_key, date)
);

-- 프로필 → 토픽 가중치. 코드 배포 없이 SQL 로 튜닝한다.
create table profile_rules (
  id        bigserial primary key,
  attribute text not null,   -- gender | age_band | household | job_field
  value     text not null,
  topic     text not null,
  weight    numeric not null
);
```

`articles.url` UNIQUE 제약 하나가 중복 수집과 중복 요약을 동시에 막는다. `briefings`의 복합 PK가 하루 두 번 배달을 막는다.

### 고정 어휘

`sources.topics` · `articles.topics` · `profile_rules.topic` · `profiles.topics`가 **같은 어휘를 공유**해야 매칭이 성립한다. 요약 잡의 태그 프롬프트도 이 목록만 쓰도록 제한한다.

- **topic** (12개): `economy` 경제 · `finance` 재테크·투자 · `realestate` 부동산 · `policy` 정책·제도 · `tech` 기술 · `ai` AI · `career` 커리어·일 · `health` 건강 · `parenting` 육아·교육 · `living` 생활·소비 · `culture` 문화·여가 · `world` 국제

- **job_field** (8개): `it` · `finance` · `medical` · `edu` · `public` · `manufacturing` · `service` · `etc`

- **household** (3개): `single` 미혼 · `married` 기혼(자녀 없음) · `with_kids` 자녀 있음

목록을 늘리는 건 `profile_rules` 행 추가로 되지만, topic을 늘릴 때는 요약 프롬프트의 허용 태그도 같이 고쳐야 한다.

## 5. 개인화 점수

```
score(article, profile) =
    Σ profile_rules.weight  (article.topics ∩ 프로필 속성이 가리키는 topic)
  + 사용자가 직접 고른 topics 매치 보너스
  + 신선도 (published_at 이 최근일수록 가산)
  - 최근 7일 내 이미 배달된 기사는 후보에서 제외
```

선정 규칙:
- 상위 **5~7건**을 배달한다.
- **한 토픽 최대 2건** — 같은 주제로 채워지는 걸 막는다.
- **해외(lang='en') 소스 최소 1건 보장** — 이 서비스의 차별점이 점수에 밀려 사라지지 않게 강제한다.

나이는 `birth_year`에서 밴드(20s/30s/40s/50s+)로 환산해 매칭한다.

## 6. 요약 잡

- 모델: **Claude Haiku 4.5** (`claude-haiku-4-5`)
- **Message Batches API** 사용 — 비동기라 50% 할인, 새벽 배치라 지연은 무관하다.
- 시스템 프롬프트는 고정 → 프롬프트 캐싱으로 추가 절감.
- 입력: 제목 + `raw_excerpt` + 출처명. 출력: 한글 요약 3~5줄 + 토픽 태그 배열.
- 영문 기사는 요약 단계에서 한글로 번역된다 — 별도 번역 단계를 두지 않는다.
- 실패한 건은 `summary_ko`가 NULL로 남아 다음 날 잡이 자동 재시도한다. 별도 재시도 큐를 만들지 않는다.

**추정 비용** (하루 300건, 건당 입력 ~2K·출력 ~400 토큰, Batch 50% 할인, 1450원 환율): 월 2~3만 원.

## 7. 푸시

- 문구는 **완전 고정 템플릿 1개**로 시작한다 (예: "오늘의 브리핑이 도착했어요"). 변수를 넣으면 사전 검수가 까다로워진다.
- 배달 잡이 매시 정각에 돌며 `push_hour = 현재시 AND push_on` 인 사용자만 처리한다.
- 대량 발송 API로 묶어 보낸다(요청당 50~2,500건). 사용자당 분당 10회 제한에는 여유가 크다.
- 발송 결과를 `briefings.sent_at`에 기록한다.

## 8. 저작권 방침

- **원문을 재배포하지 않는다.** 앱에는 요약 + 출처명 + 원문 링크만 싣는다.
- 요약 입력은 RSS가 스스로 제공한 범위의 텍스트(`raw_excerpt`)만 쓴다. 본문 크롤링은 하지 않는다.
- 카드에 출처명을 항상 노출하고, 원문은 외부 브라우저로 연다.
- 요약문에는 AI 생성물임을 표기한다.

## 9. 테스트 (TDD)

먼저 실패하는 테스트를 쓰고 구현한다. 붙일 것은 셋뿐:

1. **점수 함수** — 프로필별 기대 선정 결과. 다양성 규칙(한 토픽 2건 제한)과 해외 1건 보장이 실제로 걸리는지, 최근 7일 중복이 걸러지는지.
2. **수집 파서** — RSS/Atom 픽스처 파일로 파싱. 잘못된 XML·날짜 누락·중복 URL 같은 엣지 케이스 포함.
3. **요약 잡** — Claude API를 목킹해 배치 요청 구성과 결과 저장을 검증. 실패 건이 NULL로 남는지 포함.

프런트 화면과 CRUD에는 테스트를 붙이지 않는다.

## 10. 범위 밖 (v2 이후)

의도적으로 미룬다 — 아래 넷이 없어도 "아침에 우유"는 완성된다.

- **유튜브** — 할당량·자막 추출·품질 편차로 손이 가장 많이 간다.
- **클릭 행동 학습** — 사용자가 없는 초기엔 데이터가 없어 무의미하다. `briefings.opened_at`만 미리 쌓아둔다.
- **인앱결제·광고** — 수익화는 사용자가 생긴 다음 문제다.
- **검색·아카이브** — 과거 브리핑 다시 보기.

## 11. 미해결 사항

- 앱인토스 콘솔 개발자 등록 및 미니앱 생성 (사용자 계정 필요)
- 푸시 mTLS 인증서 발급 절차
- 초기 `sources` 목록 선정 — 국내 언론사 RSS + 직업 분야별 해외 영문 소스
- 개인정보 처리방침·서비스 약관 문안 (콘솔 등록 필수)
