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

## Phase 2~5 · 백엔드 파이프라인 🔜

> 상세 구현 계획: [docs/superpowers/plans/2026-08-22-backend-pipeline.md](docs/superpowers/plans/2026-08-22-backend-pipeline.md) — 태스크 14개, TDD 스텝 단위

### Phase 2 · 백엔드 기반

- [ ] Supabase 프로젝트 생성, 로컬 개발 환경(`supabase` CLI) 구성
- [ ] 스키마 마이그레이션 — `profiles` / `sources` / `articles` / `briefings` / `profile_rules`
- [ ] RLS 전면 차단 — 정책을 두지 않아 anon/authenticated를 전부 막는다(토스 로그인은 Supabase Auth가 아니라 `userKey`를 신뢰할 수 없다). 앱은 전용 Edge Function 경유
- [ ] 초기 `sources` 시드 — 국내 언론사 RSS + 직업 분야별 해외 영문 소스
- [ ] 초기 `profile_rules` 시드 — 프로필 속성 → topic 가중치

### Phase 3 · 수집 잡

- [ ] RSS/Atom 파서 (TDD: 픽스처 기반, 깨진 XML·날짜 누락·중복 URL 케이스)
- [ ] `articles` upsert (url UNIQUE 충돌 무시)
- [ ] 03:00 KST 크론 등록

### Phase 4 · 요약 잡

- [ ] Claude Batch API 요약 (Haiku 4.5, 고정 시스템 프롬프트). 프롬프트 캐싱은 안 쓴다 — 최소 캐시 프리픽스(~1,024토큰)에 못 미쳐 조용히 캐시되지 않는다
- [ ] 제출/수거 2단계 분할 — Batch는 비동기인데 Edge Function엔 실행 시간 제한이 있다
- [ ] 출력 파싱 — 한글 요약 + 고정 어휘 내 topic 태그
- [ ] 실패 건은 `summary_ko` NULL 유지 → 다음 날 자동 재시도 (별도 재시도 큐 없음)
- [ ] 04:00 KST 크론 등록
- [ ] ⚠️ Batch 결과는 순서 보장이 없다 — `custom_id`로 키잉할 것

### Phase 5 · 점수·배달 잡

- [ ] 점수 함수 (TDD: 토픽 매치·신선도·7일 중복 제외)
- [ ] 선정 규칙 (5~7건 / 한 토픽 최대 2건 / 해외 최소 1건 보장)
- [ ] `briefings` 확정 저장
- [ ] 매시 정각 크론 — `push_hour = 현재시 AND push_on`

## Phase 6 · 프런트 ⬜

- [ ] `create-ait-app` 스캐폴딩 (Vite + React + TS + TDS)
- [ ] 토스 로그인 연동, `userKey` → `profiles` 매핑
- [ ] 온보딩 3문항 화면
- [ ] 오늘의 브리핑 화면 (카드 = 제목·요약·출처·원문 링크, 원문은 외부 브라우저)
- [ ] 설정 화면 (알림 시간·관심 주제·알림 끄기)

## Phase 7 · 푸시 ⬜

- [ ] mTLS 인증서 발급·보관
- [ ] 고정 문구 템플릿 1개 사전 검수 신청
- [ ] 대량 발송 API 연동 (요청당 50~2,500건 묶음)
- [ ] `briefings.sent_at` 기록

## Phase 8 · 출시 ⬜

- [ ] 앱인토스 콘솔 개발자 등록·미니앱 생성
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
- **소스 선정이 곧 제품 품질** — 코드보다 `sources` 목록이 체감 품질을 좌우한다. Phase 2에서 시간을 아끼지 않는다.
