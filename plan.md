# plan — 나만의정보

> 앞으로 할 일. 완료 기록은 [changeLog.md](changeLog.md), 함정은 [claude-docs/troubleshooting.md](claude-docs/troubleshooting.md).
> 설계 원본: [docs/superpowers/specs/2026-08-22-personal-briefing-design.md](docs/superpowers/specs/2026-08-22-personal-briefing-design.md)

**범례**: ✅ 완료 · 🔜 다음 · ⬜ 예정 · ⏸ 의도적 보류(v2) · ⚠️ 리스크·전제

---

## Phase 0 · 프로젝트 셋업 ✅

- [x] git 레포 초기화, `.gitignore`(`.commit-msg-tmp` 포함)
- [x] 작업 추적 3종(plan / changeLog / troubleshooting 분할 시스템 + pre-commit 훅)
- [x] GitHub 원격 레포 생성 및 push — [Goospel/morning-brief](https://github.com/Goospel/morning-brief). 레포명은 ASCII, 한글은 description에([T-001](claude-docs/troubleshooting/T-001.md))

## Phase 1 · 설계 ✅

- [x] 앱인토스 플랫폼 제약 조사(WebView 스택·로그인 스코프·푸시 검수/발송량)
- [x] MVP 범위·아키텍처·데이터 모델·점수 규칙 확정
- [x] 고정 어휘 정의(topic 12 / job_field 8 / household 3)

## Phase 2~5 · 백엔드 파이프라인 ✅

> 상세 구현 계획: [docs/superpowers/plans/2026-08-22-backend-pipeline.md](docs/superpowers/plans/2026-08-22-backend-pipeline.md) — 태스크 14개, TDD 스텝 단위

### Phase 2 · 백엔드 기반

- [x] Supabase 프로젝트 생성, 로컬 개발 환경(`supabase` CLI) 구성
- [x] 스키마 마이그레이션 — `profiles` / `sources` / `articles` / `briefings` / `profile_rules`
- [x] RLS 전면 차단 — 정책을 두지 않아 anon/authenticated를 전부 막는다(토스 로그인은 Supabase Auth가 아니라 `userKey`를 신뢰할 수 없다). 앱은 전용 Edge Function 경유
  - 차단만으로는 부족했다 — 최근 Supabase CLI가 신규 테이블을 Data API 롤에 자동 노출하지 않아, `service_role` GRANT 두 줄을 함께 넣어야 Edge Function이 `permission denied (42501)`로 죽지 않는다
- [x] 초기 `sources` 시드 — 국내 언론사 RSS + 직업 분야별 해외 영문 소스. 등록 전 `npm run verify-feeds`로 실제 파싱 건수를 확인한다(태그 개수 같은 대리 지표로 판정하면 죽은 소스가 통과한다 — [T-003](claude-docs/troubleshooting/T-003.md))
- [x] 초기 `profile_rules` 시드 — 프로필 속성 → topic 가중치

### Phase 3 · 수집 잡

- [x] RSS/Atom 파서 (TDD: 픽스처 기반, 깨진 XML·날짜 누락·중복 URL 케이스)
- [x] `articles` upsert (url UNIQUE 충돌 무시)
- [x] 03:00 KST 크론 등록

### Phase 4 · 요약 잡

> 실제 키로 5건을 한 바퀴 돌려 검증했다 — `batches.create` → `.retrieve` → `.results` → DB 반영까지. 영문 기사(BBC World)가 한국어로 요약되고 `topics`가 고정 어휘 안에 들어오는 것을 확인했다. 비용 통제는 코드가 아니라 DB에서 대상을 5건으로 좁혀서 했다.

- [x] Claude Batch API 요약 (Haiku 4.5, 고정 시스템 프롬프트). 프롬프트 캐싱은 안 쓴다 — 최소 캐시 프리픽스(~1,024토큰)에 못 미쳐 조용히 캐시되지 않는다
- [x] 제출/수거 2단계 분할 — Batch는 비동기인데 Edge Function엔 실행 시간 제한이 있다
- [x] 출력 파싱 — 한글 요약 + 고정 어휘 내 topic 태그
- [x] 실패 건은 `summary_ko` NULL 유지 → 다음 날 자동 재시도 (별도 재시도 큐 없음)
- [x] 04:00 KST 크론 등록
- [x] ⚠️ Batch 결과는 순서 보장이 없다 — `custom_id`로 키잉할 것

### Phase 5 · 점수·배달 잡

- [x] 점수 함수 (TDD: 토픽 매치·신선도·7일 중복 제외)
- [x] 선정 규칙 (5~7건 / 한 토픽 최대 2건 / 해외 최소 1건 보장)
- [x] `briefings` 확정 저장
- [x] 매시 정각 크론 — `push_hour = 현재시 AND push_on`

## Phase 6 · 프런트 ✅ (코드·디자인 완료 · 실기기 검증은 콘솔 등록 후)

> 설계: [2026-08-23-frontend-design.md](docs/superpowers/specs/2026-08-23-frontend-design.md) ✅ (화면 흐름·API) · [2026-08-23-screen-design.md](docs/superpowers/specs/2026-08-23-screen-design.md) ✅ (TDS 디자인·스크린샷) · 구현 계획: [2026-08-23-frontend.md](docs/superpowers/plans/2026-08-23-frontend.md) ✅ (태스크 11개)
>
> mTLS 스파이크(설계 3절) 통과 — Edge Function 직결로 간다. 프록시 분리 불필요.

- [x] mTLS 가부 실측 (T0) — 로컬 edge-runtime에서 200/400 대조 통과. 클라우드 재확인은 프로젝트 생성 후
- [x] `create-ait-app` 스캐폴딩 (Vite + React + TS + TDS) — `--tds --inline` 필요. 설정 파일은 `apps-in-toss.config.ts`
- [x] 앱 전용 Edge Function `app` — 경로 라우팅 4개(login / briefing / me GET·PUT) + unlink 콜백
- [x] 무상태 HMAC 세션 토큰 + 토스 개인정보 AES-256-GCM 복호화 (순수 함수, 테스트 71개)
- [x] 토스 로그인 연동 코드, `userKey` → `profiles` 매핑 (`POST /app/login`)
- [x] 온보딩 3문항 화면 — 선택지 어휘는 `_shared/topics.ts`를 프런트가 직접 import
- [x] 오늘의 브리핑 화면 (카드 = 제목·요약·출처·원문 링크, 원문은 `Device.openURL` = 기기 기본 브라우저)
- [x] 설정 화면 (알림 시간·관심 주제·알림 끄기)
- [x] 프런트 빌드에 타입 검사 게이트 — `build`가 `tsc -b && vite build && ait build`
- [x] 4개 화면 TDS 디자인 — Top/ListRow/Chip/Switch/BottomSheet/FixedBottomCTA 등 실측 확인한 컴포넌트만 사용, 색은 `adaptive.*`(다크모드 자동)
- [x] 브랜드 색을 로고에 맞춤 — `brand.primaryColor` `#3182F6`(토스 기본) → `#3E7BD1`
- [x] 목 데이터 경로 — `vite dev --mode mock` + `api.ts` 게이트. 로그인 없이 4개 화면 실측 가능. prod 번들 미포함을 grep으로 확인
- [x] 심사 제출용 세로 스크린샷 3장 (636×1048) — `store-assets/screenshots/`
- [x] UI 완성도 — 기사 썸네일(RSS 이미지 + 원문 og:image 백필, 언론사 로고 필터), 주제 배지, TDS 아이콘 9자리 도입(OS 이모지 전량 교체), 카드 메타에 상대 발행 시각. 설계: [2026-08-23-ui-polish-design.md](docs/superpowers/specs/2026-08-23-ui-polish-design.md)
- [ ] **배포 후**: collect 응답의 `ogFetched` 로 og 백필 실효 커버리지 확인 — 지속 0이면 Supabase 실행 한도(시간 예산 60초)를 의심한다
- [ ] **콘솔 등록 후**: 실제 토스 로그인 흐름 검증(`TossAuth.login()` → `POST /app/login` → 세션 발급). 일반 브라우저에는 토스 SDK가 없어 로컬에서는 인트로가 뜨고 「시작하기」가 오류를 내는 것까지만 확인 가능
- [ ] **콘솔 등록 후**: 실기기(샌드박스) 확인 — 내비게이션 바 뒤로가기 ↔ history 연동(설정 화면의 자체 「뒤로」 버튼을 지웠으므로 네이티브 바가 유일한 복귀 경로다), 웰컴 브리핑, `Device.openURL` 실동작, 재진입 시 세션 유지
- [ ] **콘솔 등록 후**: unlink 콜백의 실제 인증 방식 확인 → 현재의 임시 공유 시크릿(`UNLINK_CALLBACK_SECRET`) 검증을 교체. 확정 전까지는 fail-closed(503/401)
- [ ] **키 수령 후**: 복호화 키·AAD·`birthday` 포맷 확정 — 현 구현은 GCM 태그가 암호문 뒤에 붙는 표준 배치를 가정

## evergreen · 시의성 없는 글 ✅ (판정 정확도 실측은 배포 후)

> 설계: [2026-08-24-evergreen-design.md](docs/superpowers/specs/2026-08-24-evergreen-design.md)

- [x] `articles.evergreen` + 요약 프롬프트 판정 — 기사당 1회라 추가 비용이 월 700원 수준이다(입력은 이미 보내는 중)
- [x] 신선도 고정 1.5(감쇠 없음) · 후보 창 30일 · 브리핑 내 상한 2건
- [x] 중복 제외를 evergreen 만 30일로 — **불변식: 중복 제외 ≥ 후보 창**. 어기면 같은 글을 한 달에 서너 번 받는다
- [x] 보장 슬롯은 두지 않았다 — 기존 「해외 보장」이 최하위를 덮어쓰는 구조라 보장이 둘이면 서로 밀어낸다
- [ ] **배포 후**: 실제 브리핑의 evergreen 비율을 보고 `EVERGREEN_FRESHNESS`·`EVERGREEN_MAX` 조정 — 두 값은 서열 논리로 고른 추측이지 실측이 아니다
- [ ] **배포 후**: 판정을 실제 기사 10건+ 로 눈 대조. 테스트는 「boolean 인가」만 본다([T-004](claude-docs/troubleshooting/T-004.md) 교훈). 경계 사례(출시 리뷰·인터뷰·연말 결산)를 골라 본다
- [ ] **배포 후**: 프롬프트를 건드렸으므로 요약문·토픽 태그 품질도 함께 대조
- [ ] 블로그 소스 추가 — evergreen 과 독립이라 나중에 해도 된다. `npm run verify-feeds` 로 파싱 건수 먼저([T-003](claude-docs/troubleshooting/T-003.md))

## 배포 · 클라우드 셋업 🔜

> CLI 는 전역 설치가 아니라 `npx supabase`.
>
> ⏸ **2026-08-24 이후 일시 정지** — 조직(Free)에 `fitcheck` 과 둘이라 자리가 찼고, **한도가 프로젝트별이 아니라 조직 합산**이다(DB 500MB · Egress 5GB · 파일 1GB). `fitcheck` 존치 여부가 2026-08-26경 정해지며 그에 따라 사이징 판단이 갈린다. 그때 재개한다.

- [x] Supabase 클라우드 프로젝트 생성 — `morning-brief` / ref `yyizuydiknlqyreqkacz` / Northeast Asia (Seoul). Data API 켬, **「신규 테이블 자동 노출」은 껐다**(0001 이 `service_role` 에만 명시 GRANT 한다). GitHub 통합은 끊었다 — `db push` 를 손으로 통제한다
- [ ] `npx supabase login` (브라우저 토큰) → `npx supabase link --project-ref yyizuydiknlqyreqkacz`
- [ ] `npx supabase db push` — 0001~0005 적용. **0005 는 아직 어떤 DB 에도 적용된 적이 없다**
- [ ] 확장 스키마 확인 — `pg_cron → cron` / `pg_net → net` 이 아니면 `invoke_job` 이 조용히 죽는다
- [ ] Vault 시크릿 2개(`functions_base_url` / `service_role_key`) — 없으면 크론이 매번 예외를 던진다
- [ ] 함수 시크릿 — `ANTHROPIC_API_KEY` / `SESSION_SECRET`. `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY` 는 자동 주입이라 불필요
- [x] `app` 함수만 `verify_jwt = false` — 프런트가 Supabase JWT 가 아니라 자체 HMAC 세션 토큰을 보낸다. 켜 둔 채 배포하면 우리 코드에 닿기 전에 401
- [x] `app/.env.production` 생성 — prod 빌드의 `VITE_API_BASE` 가 `undefined` 이던 것을 메웠다
- [ ] 함수 5개 배포 → 수동 스모크(collect → summarize-submit → 요약을 눈으로 대조)
- [ ] ⚠️ `db push` 가 크론 4개를 즉시 무장시킨다 — 04:00 KST 의 summarize-submit 이 쌓인 기사 전량을 Batch 에 밀어 넣기 전에 건수를 먼저 본다
- [ ] ⚠️ [미확인] 무료 티어는 7일 비활성이면 프로젝트를 재운다. 이 앱은 외부 요청이 0일 수 있는데 내부 pg_cron 활동이 활성으로 집계되는지 모른다 — 배포 후 며칠 관찰

## Phase 7 · 푸시 🔜

- [ ] **고정 문구 템플릿 1개 사전 검수 신청 — 제일 먼저 건다.** 리드타임이 미지수이고 남의 시간이라 출시 전체의 임계 경로다
  - 문구 확정(2026-08-24): 제목 `오늘의 브리핑` / 본문 `나에게 맞는 뉴스가 도착했어요`
  - ⚠️ 시간 중립이 조건 — `push_hour` 가 0~23 이라 시간대 표현을 못 쓴다. 문구를 바꿀 일이 생겨도 이 제약은 유지
  - [미확인] 토스 푸시 API 의 필드 구조(제목/본문 분리 여부)와 글자 수 제한 — 콘솔에서 확인 후 필요하면 다듬는다
- [ ] mTLS 인증서 발급·보관 → `TOSS_CERT_B64` / `TOSS_KEY_B64`
- [ ] 대량 발송 API 연동 (요청당 50~2,500건 묶음)
- [ ] `briefings.sent_at` 기록

## Phase 8 · 출시 🔜

- [x] 앱인토스 콘솔 개발자 등록·미니앱 생성 — 2026-08-24 승인. 인증서 발급·복호화 키 수령이 열렸다
- [ ] 로그인 스코프 신청 — 성별·생일만 (CI·전화번호·이메일 미신청)
- [ ] 개인정보 처리방침·서비스 약관 문안 등록
- [ ] 비게임 출시 체크리스트 통과 → 심사 신청

---

## ⏸ 보류 (v2 이후)

- **유튜브 소스** — 할당량·자막 추출·품질 편차로 손이 가장 많이 간다. 텍스트 브리핑이 자리 잡은 뒤에 붙인다.
- **클릭 행동 학습** — 사용자가 없는 초기엔 데이터가 없어 무의미. `briefings.opened_at`만 미리 쌓아둔다.
- **인앱결제·광고** — 수익화는 사용자가 생긴 다음 문제.
- **검색·아카이브** — 과거 브리핑 다시 보기.

## ⚠️ 리스크·전제

- **푸시 문구 검수 리드타임 미지** — 승인이 늦으면 출시가 밀린다. Phase 7을 앞당겨 착수하는 편이 안전하다.
- **RSS 발췌 길이 편차** — 매체에 따라 `raw_excerpt`가 한 줄뿐일 수 있다. 요약 품질이 소스별로 갈리면 해당 소스를 내린다(본문 크롤링으로 우회하지 않는다 — 저작권 방침).
- **LLM 요약의 내용 정확도는 형식 테스트로 못 잡는다** — 테스트 37개는 JSON 파싱·어휘 검사 같은 **형식**만 본다. 요약이 사실인지 보는 계측기는 없고, 자동화하기도 어렵다 — 실제로 정치 기사의 발언 주체가 여↔야로 뒤집힌 채로 파이프라인을 통과했다([T-004](claude-docs/troubleshooting/T-004.md)). 프롬프트 가드를 넣었으나 보장은 아니다 — 프롬프트나 소스를 고칠 때마다 실제 기사 몇 건을 눈으로 대조한다.
- **[미검증] 앱인토스 웹뷰가 외부 이미지 도메인을 허용하는지** — `AppsInTossConfig` 에 CSP·도메인 항목이 없어 우리가 제어할 수 없다. 차단되면 썸네일이 전부 접히고 화면은 텍스트 레이아웃(= 이전 상태)으로 돌아간다. 실기기 확인 대상.
- **소스 선정이 곧 제품 품질** — 코드보다 `sources` 목록이 체감 품질을 좌우한다. Phase 2에서 시간을 아끼지 않는다.
