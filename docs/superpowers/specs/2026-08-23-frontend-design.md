# 프런트엔드 + 앱↔서버 인증/API 설계

- 작성일: 2026-08-23 (KST)
- 상태: 초안 (승인 대기)
- 전제: [2026-08-22 서비스 설계](2026-08-22-personal-briefing-design.md) 승인분. 백엔드(Phase 0~5) 완료·실측 검증됨.

## 0. 목표 / 비목표

**목표** — Phase 6 범위:

1. 앱인토스 WebView 미니앱 (Vite + React 18 + TS + `@apps-in-toss/web-framework` + TDS) — 화면 3개: 인트로+온보딩 / 오늘의 브리핑 / 설정
2. 앱↔서버 인증: 토스 로그인 → 자체 세션 토큰
3. 앱 전용 API (Edge Function) — RLS 전면 차단이라 앱이 DB에 직접 붙는 경로는 없다
4. mTLS 불확실성을 흡수하는 토스 API 호출 경계

**비목표** (YAGNI — 안 한다):

- **토스 refreshToken 보관 안 함** — 로그인 직후 토스 토큰을 전부 버린다 (근거는 2절)
- **sessions 테이블 안 만듦** — 세션은 무상태 HMAC 토큰
- **상태관리 라이브러리·라우터·react-query 안 들임** — 화면 3개, `useState` + `fetch` + history API로 끝난다
- **다크 모드 안 함** — 심사 요건이 라이트 모드 구현이다. 다크는 요건에 없다
- **푸시 발송 없음** — Phase 7. 단 mTLS 경계(3절)는 푸시가 올라탈 자리까지 그려 둔다
- **과거 브리핑 아카이브 없음** — 기존 스펙 v2 보류 그대로. 단 "가장 최근 브리핑 1건 보여주기"는 한다(4절 — 아카이브가 아니라 빈 화면 회피)
- **프런트 화면 테스트 없음** — 기존 스펙 9절 원칙 유지. 테스트는 서버 쪽 순수 함수에만(7절)

## 1. 앱↔서버 API 표면

### Edge Function 구성 — `app` 하나에 경로 라우팅

크론 잡 4개(collect / summarize-submit / summarize-collect / deliver)는 그대로 두고, 앱이 부르는 **Edge Function 하나(`app`)를 새로 만든다**. 내부에서 URL 경로로 분기한다.

- 함수를 엔드포인트마다 쪼개면(4~5개) 세션 검증·에러 포맷·CORS를 함수마다 반복한다. 한 함수 안의 라우팅 분기는 `if` 몇 줄이다.
- 반대로 크론 잡과 합치지 않는 이유: 크론은 스케줄러가, `app`은 앱이 부른다 — 트리거·시크릿·장애 반경이 다르다.

### 엔드포인트 4개 + 콜백 1개

인증: `POST /login`과 `POST /unlink` 제외 전부 `Authorization: Bearer <세션토큰>` 필수. 검증 실패는 401.

#### `POST /app/login` — 토스 로그인 교환

```
요청:  { authorizationCode: string, referrer: string }   // appLogin() 결과 그대로
응답:  { sessionToken: string, onboarded: boolean }
오류:  401 (인가코드 무효·만료 — 코드는 10분·일회성)
```

서버 동작 순서:

1. 토스 `generate-token` (mTLS) → `accessToken`
2. 토스 `login-me` (mTLS) → `userKey`, 암호화된 `gender`·`birthday`
3. AES-256-GCM 복호화 (5절) → `gender`, `birth_year`(연도만 — 최소수집)
4. `profiles` upsert — 있으면 gender/birth_year만 갱신, 없으면 신규 행 (job_field NULL)
5. **토스 토큰(access/refresh)은 여기서 버린다. 저장하지 않는다**
6. 세션 토큰 발급 (2절) → 응답. `onboarded = (job_field IS NOT NULL)`

#### `GET /app/briefing` — 브리핑 조회

```
응답: {
  onboarded: boolean,            // false면 앱은 온보딩 화면으로 보낸다
  date: "2026-08-23",           // 이 브리핑의 날짜 (오늘이 아닐 수 있다)
  isToday: boolean,
  nextHour: number | null,       // 오늘 것이 아직 없을 때 안내용 push_hour
  cards: [{ articleId, title, summaryKo, sourceName, url, publishedAt }] | null
}
```

`onboarded`가 응답에 있는 이유: 온보딩 도중 앱을 닫은 사용자는 세션은 있는데 `job_field`가 NULL이다. 앱 시작 분기가 세션이 있으면 이 API부터 부르므로, 여기서 알려주지 않으면 그 사용자가 빈 브리핑 화면에 갇힌다.

- `briefings`에서 `user_key = 세션 userKey AND date <= 오늘(KST)` 중 **가장 최근 1건**을 찾아 `article_ids`를 `articles` + `sources`(출처명)로 풀어 준다.
- 조회한 브리핑의 `opened_at`이 NULL이면 지금 시각으로 채운다 (별도 "열람" 엔드포인트를 만들지 않는다 — 조회가 곧 열람이다).
- 브리핑이 하나도 없으면 `cards: null` — 앱이 빈 상태를 그린다(4절).

"어제 것이라도 보여준다"인 이유: 하루 한 번 갱신 서비스라 push_hour 전에 열면 오늘 것이 없는 게 **정상**이다. 그때 빈 화면이면 앱이 고장 난 것처럼 보인다. `date <= 오늘` 최근 1건 조회는 아카이브가 아니라 쿼리 조건 한 줄이다.

#### `GET /app/me` — 프로필 조회

```
응답: { jobField, household, topics, pushHour, pushOn }
```

#### `PUT /app/me` — 온보딩 제출 · 설정 변경 (같은 엔드포인트)

```
요청: { jobField?, household?, topics?, pushHour?, pushOn? }   // 보낸 필드만 갱신
응답: GET /app/me와 동일
오류: 400 (고정 어휘 밖 값 — 서버가 고정 어휘로 검증)
```

고정 어휘의 위치: topic은 `_shared/topics.ts`에 이미 있다. **job_field 8개·household 3개 상수는 아직 코드에 없으므로 `_shared/topics.ts`에 같이 추가**한다(기존 스펙 4절 어휘 그대로) — 서버 검증과 프런트 선택지가 같은 상수를 import 해 이중 기재를 없앤다.

**웰컴 브리핑**: 이 PUT으로 `job_field`가 NULL → NOT NULL이 되는 순간(= 온보딩 완료), **서버가 즉시 오늘자 브리핑을 생성**한다. `deliver`가 쓰는 `_shared/scoring.ts`의 `selectBriefing`을 그대로 import — 순수 함수라 재사용 비용이 0이다. `sent_at`은 NULL로 둔다(푸시 안 나감).

- 이게 없으면 가입 직후 사용자(그리고 **심사자**)가 빈 화면을 본다. 심사자는 핵심 기능을 봐야 통과시킨다 — 온보딩 30초 뒤 브리핑이 바로 뜨는 것이 심사 리스크를 직접 줄인다.
- 온보딩 완료 순간에만 생성한다. 설정 변경(topics 수정 등)으로는 재생성하지 않는다 — `briefings` PK(user_key, date)가 어차피 하루 1건을 강제하고, 내일 배달부터 자연히 반영된다.

#### `POST /app/unlink` — 토스 연결 해제 콜백 (앱이 아니라 토스가 부른다)

사용자가 토스에서 연결을 끊으면 콘솔에 등록한 콜백 URL로 이벤트가 온다(referrer: `UNLINK` / `WITHDRAWAL_TERMS` / `WITHDRAWAL_TOSS`). 심사 요건 「로그인 해제 시 미니앱에 사용자 데이터 미잔존」에 따라 **해당 userKey의 `briefings` → `profiles` 행을 삭제**한다.

- ⚠️ **미확인**: 콜백 요청의 인증 방식(서명 헤더인지, 토스 측 mTLS인지, 페이로드 스키마). 콘솔에서 콜백 URL을 등록하는 시점에 문서·실페이로드로 확정한다.
- **구현은 fail-closed다** (설계 수정 2026-08-23). 설계 초안은 "확정 전에는 로깅 + userKey 존재 검증만"이라고 적었지만, 그 상태로 배포하면 `userKey` 하나만 알면 누구나 남의 데이터를 지울 수 있는 **공개 삭제 경로**가 된다. 그래서 인증 수단이 확정될 때까지 경로를 닫아 둔다:
  - `UNLINK_CALLBACK_SECRET` 미설정 → **503** (`{"error":"not configured"}`) — 실수로 열린 채 배포되는 것을 막는다
  - 설정됨 + `x-unlink-secret` 헤더 불일치 → **401**
  - 일치 → 페이로드 로깅 후 `briefings` → `profiles` 삭제
  - 콘솔에서 실제 콜백 인증 방식(서명 헤더/mTLS)을 확인하면 이 공유 시크릿 검증을 그것으로 교체한다.

### 스키마 변경: 없음

`profiles`가 온보딩 필드를 이미 다 갖고 있고, 온보딩 완료 판별은 `job_field IS NOT NULL`로 충분하다. 새 테이블·새 컬럼 0개.

## 2. 세션 — 무상태 HMAC 토큰, 토스 토큰은 버린다

### 판단의 근거가 되는 실측

- `appLogin()`은 **이미 동의한 사용자에게는 동의 화면 없이 조용히 인가코드를 반환**한다 (개발자센터 authentication/intro 확인). 즉 "다시 로그인"의 사용자 비용이 0이다.
  - ⚠️ 이 문서가 `appLogin()`이라 부르는 것을 **구현은 `TossAuth.login()`으로 호출한다** — SDK 3.0.2 타입 정의에서 최상위 `appLogin`이 deprecated로 표시돼 있고 시그니처가 같다. 아래 서술의 `appLogin()`은 전부 이 현행 API를 가리킨다.
- 토스 accessToken이 로그인 이후 필요한 곳이 **없다**. 사용자 정보는 가입 시 1회 받으면 끝이고, 브리핑 API는 우리 DB만 본다. 푸시(Phase 7)도 userKey 기반 파트너 API라 사용자별 토큰이 필요 없다.

### 대안 비교

| 대안 | 내용 | 기각/채택 |
|---|---|---|
| A. 매번 `appLogin()` | 앱 열 때마다 인가코드 → 서버에서 토스 API 2회 교환 | 기각 — 열 때마다 mTLS 경로(최대 리스크 지점)를 2회 태우고, 토스 파트너 API 장애가 곧 앱 장애가 된다. 지연도 왕복 2회만큼 늘어난다 |
| B. 자체 세션 + 토스 refreshToken 서버 보관 | 세션 만료 시 refreshToken으로 재검증 | 기각 — refreshToken을 쓸 일이 없는데(위 실측) 보관하면 암호화 저장 의무(심사 요건 「민감 정보 DB 암호화 저장」)와 14일 만료 관리만 생긴다. 죽은 자산의 관리 비용 |
| **C. 자체 세션만, 토스 토큰 폐기 (채택)** | 만료 시 `appLogin()` 재실행 — 조용히 되므로 사용자는 모른다 | 서버에 비밀이 HMAC 키 하나, DB에 토큰 관련 저장 0 |

### 토큰 사양

- **형식**: `base64url(userKey.만료epoch)` + `.` + `base64url(HMAC-SHA256(앞부분, SESSION_SECRET))` — 손으로 만드는 ~15줄. JWT 라이브러리를 들이지 않는다(클레임이 2개뿐이다).
- **수명**: 30일 고정. 갱신(sliding) 없음 — 만료되면 조용한 재로그인이 갱신이다.
- **저장**: 앱에서 `Storage.setItem('session', token)` (`@apps-in-toss/web-framework`의 Storage — 비동기 API, 토스 앱 삭제 시 같이 삭제됨). 인가코드·토스 토큰은 앱에 절대 저장하지 않는다.
- **검증**: Edge Function이 HMAC 재계산 + 만료 확인. Web Crypto만 쓴다(Deno·Node 공통이라 테스트가 Node에서 그대로 돈다).
- **폐기**: unlink 콜백으로 프로필이 지워지면, 남은 세션 토큰은 유효해도 모든 조회가 빈 결과/404가 된다 — 프로필 없음 = 401로 응답해 재온보딩 흐름으로 보낸다.

## 3. mTLS 경계 — 모듈 인터페이스로 자르고, Edge Function 직결을 먼저 실측한다

### 문제

토스 파트너 API(generate-token / login-me / 푸시)는 전부 mTLS다. Supabase Edge Functions(Deno)에서 클라이언트 인증서(`Deno.createHttpClient({cert, key})`)가 되는지는 **미확인** — API는 존재하나 Supabase 환경에서 unstable이라 안 된다는 사용자 보고가 있다. 토스 인증서는 콘솔 등록 후에나 나오므로 지금 토스 상대로는 실측할 수 없다.

### 경계: `_shared/toss.ts` 하나로 자른다

호출자(로그인 엔드포인트, 나중의 푸시)는 **전송 방식을 모른다**. 이 모듈의 함수 시그니처만 안다:

```ts
// _shared/toss.ts — 토스 파트너 API 호출의 유일한 통로
exchangeToken(code: string, referrer: string): Promise<{ accessToken: string }>
getLoginMe(accessToken: string): Promise<{ userKey, encryptedGender?, encryptedBirthday?, scope, agreedTerms }>
// Phase 7에서 추가: sendPush(...)
```

mTLS가 어디서 되든 안 되든, **바뀌는 것은 이 파일의 내부와 시크릿뿐**이다.

### 전송 대안 3개

| | A. Edge Function 직결 | B. mTLS 프록시 분리 | C. 앱 API 전체를 외부 Node 서버로 |
|---|---|---|---|
| 내용 | `Deno.createHttpClient({cert,key})`로 토스 직접 호출. 인증서는 Supabase secrets | 인증서를 든 초소형 서비스(Cloudflare Workers mTLS 바인딩 또는 Fly.io/Render의 Node ~50줄)가 토스만 중계. Edge Function이 공유 시크릿 헤더로 호출 | Edge Function을 버리고 앱 API 전부를 Node 서버에 |
| 추가 인프라 | 0 | 배포 1개 + 시크릿 2개 | 서버 1대 + DB 접근 경로 이중화 |
| 운영 부담 | 없음 | 낮음 (토스 중계 전용, 상태 없음) | 높음 — 스택이 둘로 갈라짐 |
| 실패 시 되돌리기 | B로 후퇴: `toss.ts` 내부만 교체 | Node `https.Agent({cert,key})`는 stdlib 표준 경로라 실패 여지가 사실상 없음 | — |
| 판정 | **로컬 실측 통과** (아래) | 확실히 됨 | 기각 — 문제(토스 호출 3개)에 비해 옮기는 코드가 너무 많다 |

### 스파이크 결과 — A 채택 (2026-08-23 실측)

**supabase-edge-runtime 1.74.3 (Deno 2.1.4) 로컬에서 mTLS 핸드셰이크가 성립한다.**

```
hasCreateHttpClient : true
인증서 있음         : HTTP 200   (badssl 클라이언트 페이지 본문 수신)
인증서 없음         : HTTP 400   (No required SSL certificate was sent)
```

판정은 설계대로 **HTTP 200 응답 본문으로만** 했다 — `Deno.createHttpClient`가 존재한다는 것은 핸드셰이크가 된다는 증거가 아니다(T-003 원칙). 그래서 세 겹으로 통제했다:

1. **인증서 유효성 확인** — badssl 클라이언트 인증서의 `notAfter`가 2028-08-17로 살아 있음을 `openssl x509`로 먼저 확인. 만료된 인증서로 실패하면 런타임 문제로 오진한다.
2. **Node 대조군** — 같은 인증서로 `https.Agent({cert, key})`가 200을 받는 것을 먼저 확인. 실패했다면 원인이 인증서인지 런타임인지 가를 수 없다.
3. **음성 대조** — 인증서 없이 같은 곳에 쏘아 400이 나오는 것을 확인. 이게 없으면 200이 "인증서 덕분"인지 "원래 아무나 되는 곳"인지 모른다.

**재현 절차** (클라우드 재확인 때 그대로 쓴다):

```bash
curl -sSo client.p12 https://badssl.com/certs/badssl.com-client.p12
openssl pkcs12 -in client.p12 -passin pass:badssl.com -nokeys  -out cert.pem -legacy
openssl pkcs12 -in client.p12 -passin pass:badssl.com -nocerts -nodes -out key.pem -legacy
openssl x509 -in cert.pem -noout -dates     # notAfter 가 미래인지 먼저 본다
```

```ts
// supabase/functions/probe-mtls/index.ts — 스파이크 전용, 확인 후 삭제한다
Deno.serve(async () => {
  const dec = (b64: string) => new TextDecoder().decode(
    Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)),
  );
  const client = (Deno as any).createHttpClient({
    cert: dec(Deno.env.get('MTLS_CERT_B64')!),
    key: dec(Deno.env.get('MTLS_KEY_B64')!),
  });
  const withCert = await fetch('https://client.badssl.com/', { client } as RequestInit);
  const without  = await fetch('https://client.badssl.com/');
  return Response.json({ withCert: withCert.status, withoutCert: without.status });
});
```

PEM은 여러 줄이라 env 파일에 그대로 못 넣는다 — `base64 -w0`으로 한 줄로 만들어 `MTLS_CERT_B64`/`MTLS_KEY_B64`로 주입한다.

⚠️ **로컬 통과는 클라우드 통과가 아니다.** 로컬은 Docker 안 edge-runtime이고 Supabase 클라우드는 샌드박스 정책이 다를 수 있다. **클라우드 프로젝트가 생기는 즉시 같은 프로브를 배포해 한 번 더 확인한다** — 거기서 실패하면 그때 B로 후퇴하며, 아래 「A→B 전환 시 고치는 것」이 그대로 적용된다.

**A→B 전환 시 고치는 것 (전량)**:

- `_shared/toss.ts` 내부: `Deno.createHttpClient` 경로 → `fetch(PROXY_URL, { headers: { 'x-proxy-secret': ... } })` 경로
- 프록시 배포 1건 (토스 3개 엔드포인트를 그대로 중계 + 시크릿 헤더 검증, ~50줄)
- Supabase secrets: `TOSS_CERT`/`TOSS_KEY` 대신 `TOSS_PROXY_URL`/`TOSS_PROXY_SECRET`
- 앱·다른 Edge Function·DB: **변경 0**

⚠️ 잔여 미확인: badssl 성공이 곧 토스 성공은 아니다(토스 쪽 인증서 체인·TLS 설정이 다를 수 있다). 토스 인증서 수령 직후 `exchangeToken`을 무효 코드로 1회 쏘아 **TLS 계층 통과 여부**(401 응답이면 통과, 핸드셰이크 오류면 실패)를 재확인하는 절차를 Phase 8 체크리스트에 넣는다.

## 4. 화면 3개와 데이터 흐름

공통: TDS(`@toss/tds-mobile`) 컴포넌트, 라이트 모드(심사 요건). 네비게이션 바는 앱인토스가 자동 제공(비게임 내비게이션 바 — 설정으로 뒤로가기/홈/타이틀 제어). 자체 뒤로가기 버튼은 그리지 않는다(동시 표시 금지 요건).

### 앱 시작 분기

```
Storage에서 session 읽기
 ├─ 없음 → [인트로 화면]
 └─ 있음 → GET /app/briefing
      ├─ 200 & onboarded → [브리핑 화면]
      ├─ 200 & !onboarded → [온보딩]   ← 온보딩 도중 이탈 후 재진입
      ├─ 401 → 조용한 재로그인 (appLogin → POST /login) 1회
      │        ├─ 성공 & onboarded → 재시도 → [브리핑]
      │        ├─ 성공 & !onboarded → [온보딩]   ← unlink 후 재가입 케이스
      │        └─ 실패 → [인트로]
      └─ 네트워크 실패 → 캐시 있으면 [브리핑(오프라인)] / 없으면 [오류 패널]
```

### 화면 1. 인트로 + 온보딩

- **인트로**: 서비스 설명 1스크린 + 「시작하기」 CTA. 심사 요건이 인트로 페이지의 서비스 설명을 요구한다 — 진입하자마자 로그인 창을 띄우지 않는다.
- CTA → `appLogin()` → `POST /app/login`.
  - 사용자가 로그인 창을 닫으면(`appLogin` 거부/예외) 인트로로 되돌아온다.
  - `onboarded: true`면 온보딩을 건너뛰고 바로 브리핑으로.
- **온보딩**: 한 화면에 3문항(단계 위저드 안 만든다 — 30초 목표) — 직업 분야(8지선다) / 가구 형태(3지선다) / 관심 주제(13개 멀티선택, 최소 1개). 성별·생년은 묻지 않는다(로그인에서 이미 받음).
- 제출 → `PUT /app/me` → (서버가 웰컴 브리핑 생성) → 브리핑 화면으로 `history.replaceState` 이동. 뒤로가기로 온보딩에 돌아올 수 없어야 한다.
- **선택지 어휘는 `supabase/functions/_shared/topics.ts`를 프런트가 직접 import** 해서 코드 목록의 이중 기재를 없앤다(같은 레포·순수 상수라 Vite가 그대로 번들링). 한글 라벨은 프런트 전용 상수(`labels.ts`)로 둔다 — 서버는 라벨이 필요 없다.

### 화면 2. 오늘의 브리핑 (루트 화면)

- 진입 시 `GET /app/briefing` 1회. 응답을 `Storage.setItem('lastBriefing', ...)`으로 캐시(오프라인 대비, 6절).
- **카드**: 제목 / 한글 요약 3~5줄 / 출처명 / 「원문 보기」. 리스트 하단에 "오늘의 브리핑 끝 ✓" 마감 표시 — "다 보면 끝나는 묶음" 컨셉을 화면이 말하게 한다. 요약 영역에 AI 생성물 표기(저작권 방침) 1줄.
- **원문 보기** = `Device.openURL(article.url)` (`@apps-in-toss/web-framework`) — 조사 결과 이것이 외부 URL을 여는 SDK 경로다. 최상위 `openURL(url)`은 SDK 3.0.2 타입 정의에 deprecated로 표시돼 있고 시그니처가 같아 `Device.openURL`로 구현했다.
  - ✅ **미확인 ⓐ 해소** (2026-08-23): SDK 타입 정의(`@apps-in-toss/web-framework` 3.0.2 `dist/index.d.ts`)가 「지정한 URL을 기기의 기본 브라우저나 관련 앱에서 열어요」라고 명시한다. 인앱 웹뷰가 아니라 기기 기본 브라우저다 — 저작권 방침(원문을 재배포하지 않고 외부 브라우저로 넘긴다)의 전제가 SDK 문서로 확인됐다.
  - ⚠️ **미확인 ⓑ 잔존**: "허용된 경우에만 제한적으로" 조항 — 뉴스 원문 링크가 운영 정책상 허용 대상인지. 심사 제출 전 운영 정책 문서(`policy` 계열 md)로 확정한다.
- **상태 분기** (하루 1회 갱신이라 전부 정상 상태다):
  - `isToday: true` → 그대로 표시
  - `isToday: false` (오늘 것 아직) → 상단 배너 "어제의 브리핑이에요 · 오늘 브리핑은 {nextHour}시에 도착해요" + 어제 카드 표시
  - `cards: null` (웰컴 생성 실패 등으로 아예 없음) → 빈 상태 일러스트 + "첫 브리핑을 준비하고 있어요 · 내일 아침 {nextHour}시에 도착해요"
- 우상단(내비게이션 바 우측 슬롯 또는 본문 상단)에 설정 진입.

### 화면 3. 설정

- 진입 시 `GET /app/me` → 알림 시간(시간 선택), 관심 주제(멀티선택 — 온보딩과 같은 컴포넌트 재사용), 알림 on/off.
- 변경 즉시 `PUT /app/me` (저장 버튼 없음 — 항목이 3개뿐이다). 실패 시 토스트 + 이전 값 복원.
- 직업 분야·가구 형태도 같은 화면에서 수정 가능하게 둔다 — PUT이 어차피 부분 갱신이라 추가 비용이 0이다.

### 네비게이션 — 라우터 없이 history API

- 브리핑 = 루트. 설정 진입 = `history.pushState`. 온보딩→브리핑 = `replaceState`.
- 앱인토스 내비게이션 바의 뒤로가기(<)가 WebView history와 연동되면 그대로 동작한다: 설정에서 < → 브리핑, 루트에서 < → 미니앱 종료(심사 요건과 정확히 일치).
- ⚠️ **미확인**: 내비게이션 바 뒤로가기 ↔ WebView history 자동 연동 여부(문서에 명시 없음). 스캐폴딩 직후 샌드박스에서 첫 번째로 확인한다. 연동이 안 되면 SDK의 뒤로가기 이벤트 구독으로 `history.back()`을 손으로 연결한다 — 화면 전환 구조는 그대로다.

## 5. 개인정보 복호화 (`_shared/decrypt.ts`)

- login-me의 `gender`·`birthday`는 AES-256-GCM 암호문. **키와 AAD는 토스 로그인 설정 후 이메일로 수령**(문서 확인 — AAD도 이메일에 같이 온다).
- 절차: Base64 디코드 → 앞 12바이트 = IV → 나머지 = 암호문(+GCM 태그) → AAD 적용 → 복호화. Web Crypto `crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData })` — Deno·Node 공통이라 그대로 테스트 가능.
- `birthday`에서 **연도만 뽑아 `birth_year`에 저장하고 원문은 버린다**(최소수집). 복호화 실패나 스코프 미동의로 필드가 없으면 NULL로 저장하고 로그인은 계속 진행한다 — 점수 함수가 NULL 속성을 이미 허용한다.
- ⚠️ 미확인: GCM 태그가 암호문 뒤에 붙는 표준 배치인지(Web Crypto는 태그가 ciphertext 끝에 붙은 형태를 기대), `birthday`의 정확한 포맷(`YYYYMMDD`인지). 키 수령 후 실데이터 1건으로 확정한다.

## 6. 오프라인·실패 처리

| 상황 | 사용자가 보는 것 | 동작 |
|---|---|---|
| 브리핑 조회 네트워크 실패 | 캐시된 마지막 브리핑 + 상단 "오프라인이에요" 배너 | `Storage`의 `lastBriefing` 렌더. 캐시도 없으면 오류 패널 + 「다시 시도」 |
| 서버 5xx | 오류 패널 + 「다시 시도」 | 재시도 버튼이 같은 요청을 다시 쏜다. 자동 재시도 없음 |
| 401 (세션 만료·프로필 삭제) | 아무것도 — 조용히 처리 | `appLogin()` → `POST /login` → 원 요청 재시도, **1회만**. 재로그인 후 `onboarded: false`면 온보딩으로(unlink 재가입) |
| `appLogin` 실패·사용자 취소 | 인트로 화면 | 오류를 크게 만들지 않는다 — 인트로의 CTA가 곧 재시도다 |
| 온보딩 PUT 실패 | 토스트 "저장하지 못했어요" + 입력값 유지 | 제출 버튼 재활성화 |
| 설정 PUT 실패 | 토스트 + 토글/값 원복 | |

- 재시도 큐·백그라운드 동기화는 만들지 않는다 — 쓰기가 온보딩·설정뿐이고 둘 다 사용자가 화면에서 다시 누르면 된다.

## 7. 테스트 전략 — 백엔드 원칙 그대로

프레임워크 추가 0. `node --test`가 `.ts`를 그대로 실행(기존 `npm test` 라인 그대로). 새 순수 함수 3개가 테스트 대상이고 전부 서버 쪽이다:

1. **세션 토큰** (`_shared/session.ts`) — 발급→검증 왕복 / 변조된 서명 거부 / 만료 거부 / 형식 오류(마침표 없음 등) 거부. Web Crypto라 Node에서 그대로 돈다.
2. **복호화** (`_shared/decrypt.ts`) — 테스트가 `node:crypto`로 AES-256-GCM 암호화한 픽스처(IV 12바이트 선두 배치 + AAD)를 만들어 왕복 검증 / 잘못된 키·AAD·잘린 입력은 null 반환.
3. **`app` 라우팅·검증 로직** — 라우팅 분기와 `PUT /me` 입력 검증(고정 어휘 밖 값 400)을 순수 함수로 떼어 검증. `Deno.serve` 핸들러 자체는 테스트하지 않는다(기존 스펙과 같은 이유 — Deno 목킹 하네스 비용 > 효용).

**안 하는 것**: 프런트 컴포넌트·화면 테스트(기존 스펙 9절 원칙), 토스 API 목킹(경계가 `toss.ts` 한 장이라 실키 스모크가 파서 테스트보다 싸다 — 인증서 수령 후 무효 코드 1발로 TLS+에러 경로를 실측), E2E. 웰컴 브리핑 선정은 이미 테스트된 `selectBriefing` 재사용이라 새 테스트가 없다.

## 8. 구현 태스크 분해 (TDD 순서 포함)

> 태스크 0이 게이트다 — 결과에 따라 태스크 4의 `toss.ts` 내부가 A/B로 갈린다. 나머지는 순서 독립.

- **T0. mTLS 스파이크 (게이트)** — 프로브 함수 배포 → badssl 클라이언트 인증서로 핸드셰이크 실측(3절 판정 기준) → 결과를 troubleshooting 항목으로 기록. 코드는 스파이크 후 폐기.
- **T1. 스캐폴딩** — `create-ait-app`으로 Vite+React+TS+TDS 골격. ⚠️ **`--tds --inline`을 반드시 붙인다** — 플래그가 없으면 React·TDS·SDK가 하나도 없는 바닐라 TS 템플릿이 나오고 마지막 대화형 프롬프트에서 멈춘다(비대화형 환경에서는 "실패했는데 디렉터리는 있는" 상태가 된다). 설정 파일 이름은 `apps-in-toss.config.ts`다. 샌드박스에서 빈 화면 표시 + **내비게이션 바 뒤로가기 ↔ history 연동 실측**(4절 미확인 해소).
- **T2. 세션 토큰** — ① 실패 테스트: 왕복/변조/만료/형식 4케이스 작성 → 실패 확인 ② `_shared/session.ts` 구현 → 통과 ③ 리팩터.
- **T3. 복호화** — ① 실패 테스트: node:crypto 픽스처 왕복 + 오류 3케이스 → 실패 확인 ② `_shared/decrypt.ts` 구현 → 통과.
- **T4. `toss.ts` + `app` 함수** — ① 라우팅·입력 검증 순수 함수의 실패 테스트 → ② `app` 함수 구현(login/briefing/me/unlink 라우트, T0 결과에 따른 `toss.ts` 전송부) → ③ 로컬 `supabase functions serve`로 curl 스모크(세션 없는 요청 401, 어휘 밖 PUT 400).
- **T5. 프런트 화면** — 인트로+온보딩 → 브리핑 → 설정 순. 어휘는 `_shared/topics.ts` import. 테스트 없음, 샌드박스 실기기 확인으로 갈음.
- **T6. 통합 확인** — 샌드박스에서 전체 흐름 1바퀴: 로그인 → 온보딩 → 웰컴 브리핑 표시 → 원문 열기(`openURL` 동작·외부 브라우저 여부 실측) → 설정 변경 → 재진입 시 세션 유지.

## 9. 리스크·미확인 목록

| # | 항목 | 영향 | 해소 시점·방법 |
|---|---|---|---|
| 1 | ~~Edge Function에서 `Deno.createHttpClient` mTLS 가능 여부~~ | ~~토스 호출 전송 방식 (A/B)~~ | **해소(로컬)** 2026-08-23 — edge-runtime 1.74.3에서 200/400 대조 통과. 3절 참조 |
| 1b | 위 결과가 Supabase **클라우드**에서도 유지되는지 | A 채택이 뒤집히면 B로 후퇴 | 클라우드 프로젝트 생성 직후 같은 프로브 배포. 3절에 재현 절차 있음 |
| 2 | badssl 성공 ≠ 토스 성공 | A 채택 후 뒤집힐 가능성 | 토스 인증서 수령 즉시 무효 코드 1발로 TLS 통과 재확인 |
| 3 | unlink 콜백의 인증 방식·페이로드 스키마 | 콜백 위조로 타인 데이터 삭제 가능성 | 콘솔 등록 시점에 문서·실페이로드로 확정. **확정 전까지는 fail-closed** — 시크릿 미설정 503 / 헤더 불일치 401(1절). 위조 리스크는 이걸로 이미 막혀 있고, 남은 것은 "실제 콜백이 어떤 인증을 쓰는지"뿐이다 |
| 4ⓐ | ~~`openURL`이 외부 브라우저인지 인앱 웹뷰인지~~ | ~~저작권 방침("외부 브라우저로 연다")~~ | **해소** 2026-08-23 — SDK 3.0.2 타입 정의가 「기기의 기본 브라우저나 관련 앱에서 열어요」로 명시. 4절 참조 |
| 4ⓑ | 뉴스 원문 링크가 `openURL` 운영 정책상 허용 대상인지 | 심사 | 심사 제출 전 운영 정책 문서로 확정 |
| 5 | 내비게이션 바 뒤로가기 ↔ history 연동 | 화면 전환 구현 방식 | T1에서 첫 번째로 실측. 안 되면 이벤트 구독으로 수동 연결 |
| 6 | 복호화 키·AAD·birthday 포맷 | 성별·생년 저장 | 이메일 키 수령 후 실데이터 1건. 실패해도 NULL 저장으로 로그인은 진행 |
| 7 | `appLogin()` 재호출이 조용하다는 문서 서술의 실기기 재현 | 세션 설계(2절)의 전제 | T6에서 재진입 흐름으로 확인. 만약 매번 동의 화면이 뜬다면 → 세션 30일이 이미 완충이라 영향은 "만료 시 UX"뿐 |

## 10. 검증 계획 (완료 판정)

- `npm test` 전체 통과 (기존 37 + 신규 세션·복호화·라우팅 테스트).
- 로컬 `supabase functions serve` + curl: 401/400/200 경로 각 1회.
- 샌드박스 실기기: T6 흐름 1바퀴를 눈으로 — 특히 웰컴 브리핑이 온보딩 직후 뜨는 것, 루트에서 뒤로가기로 미니앱이 종료되는 것(심사 요건).
- 심사 체크리스트 대조: 인트로 페이지 有 / 라이트 모드 / 자체 뒤로가기 버튼 無 / 자사 유도 링크 無 / 진입 직후 바텀시트 無.
