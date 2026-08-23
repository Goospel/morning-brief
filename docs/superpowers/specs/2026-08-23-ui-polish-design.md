# UI 완성도 설계 — 썸네일·아이콘·주제 배지·밀도

날짜: 2026-08-23 · 브랜치: feat/ui-polish
선행 문서: [2026-08-23-screen-design.md](2026-08-23-screen-design.md) (TDS 기본 디자인 — 이번 설계는 그 위에 "정보 밀도와 시각 요소"를 얹는다)

배경: 이전 작업의 결과가 "미니멀"이 아니라 "밋밋"했다 — 이미지 0장, 아이콘 0개, 이모지 톤 불일치, 주제 정보 미노출. 이번 설계는 장식이 아니라 **정보 전달에 기여하는 시각 요소**를 되찾는다.

---

## 0. 목표 / 비목표

**목표**
1. **기사 썸네일**: RSS 이미지 + 원문 `og:image` 백필로 커버리지를 확보하고, 브리핑 카드에 표시한다 (백엔드 마이그레이션·파서·수집 잡 포함).
2. **아이콘**: 실측 검증된 28개 이름 안에서 인트로·브리핑·설정에 도입한다. OS 이모지(🥛🌏✅) 전부 교체.
3. **주제 배지**: 기사가 어떤 주제로 골라졌는지 카드에 보이게 한다 (`articles.topics` → API → `Badge`).
4. **밀도**: 카드 메타에 발행 시각 추가, 배너에 아이콘, 설정 행에 아이콘 — 여백만 많던 곳을 정보로 채운다.
5. 심사 스크린샷 3장 재촬영 (dev 패널 숨김 포함).

**비목표 (YAGNI)**
- 이미지 프록시·리사이즈 서버 없음 (원본 CDN URL 직결, 실패 시 접힘).
- 이미지 없는 기사에 가짜 시각 요소(주제색 블록·이니셜 아바타) 없음 — 2-3절 근거.
- 스켈레톤 로딩·애니메이션·라우터·새 의존성·탭바 없음 (이전 설계와 동일).
- 아이콘 로드 실패 감지(`onLoad` 타임아웃 등) 없음 — 28개 이름이 HEAD 실측으로 검증됐고, `AssetIcon`에 `onError`가 없다(d.ts 확인). 검증된 목록이 곧 가드다.
- `sources` 테이블 스키마 변경 없음 — og 백필은 "이미지 없는 신규 기사 전부"에 일반 적용이라 소스별 플래그가 필요 없다.

---

## 1. 실측 근거 (이번 설계에서 새로 확인한 것)

### 1-1. TDS 컴포넌트 추가 확인 (전부 `@toss/tds-mobile@2.5.1` d.ts)

| 컴포넌트 | 확인된 시그니처 | 용도 |
|---|---|---|
| `Asset.Icon` | `name: string`(필수), `color?`, `style?`, `onLoad?`, `frameShape?`, `backgroundColor?` (d.ts 7065행 `Icon_2`) | 단독 아이콘 (빈 상태·끝 마감·배너) |
| `Asset.Image` | `<img>` 전체 attr(`loading`·`onError` 포함) + `objectFit?: 'contain'\|'cover'` + `frameShape?`(커스텀 `{width,height,radius}` 허용 — `AssetFrameShapeType` 전 필드 optional) + `backgroundColor?`(로드 전 배경, 기본 `adaptive.grey100`) (d.ts 7171행 `Image_2`, 2106행, 2187행) | 기사 썸네일 |
| `ListRow.AssetIcon` | `name?`, `color?`("mono 아이콘에게만 적용"이라고 d.ts 주석 명시), `variant?: 'fill'\|'none'`, `size?: 'xsmall'\|'small'\|'medium'`, `backgroundColor?`, `shape?` (d.ts 7928행) | 목록 행 왼쪽 아이콘 (인트로·설정) |
| `IconButton` | `name`(또는 `src`) + **`aria-label` 필수** + `color?`, `iconSize?`(기본 24), `variant?`(기본 'clear'), `bgColor?` (d.ts 7109·7117행) | 설정 진입 버튼 |
| `Badge` | `variant: 'fill'\|'weak'`(필수), `color: 'blue'\|'teal'\|'green'\|'red'\|'yellow'\|'elephant'`(필수), `size: 'large'\|'medium'\|'small'\|'xsmall'`(필수) (d.ts 2650·11479행) | 주제 배지 |

- `Asset.frameShape` 프리셋은 최대 ~100px(아바타·아이콘 스케일)이지만 `frameShape`는 커스텀 객체를 받는다 — 썸네일은 `{ width: 72, height: 72, radius: 14 }`로 지정.
- `adaptive` 팔레트에 `blue/teal/green/orange/red/yellow/purple`의 `50~600` 단계가 전부 있다(`@toss/tds-colors` 소스 grep). 기존 코드가 `adaptive.orange600`을 이미 쓰고 있어 실증됨.

### 1-2. 아이콘 CDN (지시서에서 전달받은 실측 — 재조사 안 함)

`https://static.toss.im/icons/svg/{name}.svg` — HEAD 실측으로 존재 확정된 28개만 쓴다(지시서 목록). 이번 설계가 실제로 쓰는 이름은 5-절 매핑표의 9개뿐이며 전부 그 28개 안에 있다. **목록 밖 이름 사용 금지** — `name`이 `string` 타입이라 컴파일러가 오타를 못 잡는다.

### 1-3. 원문 `og:image` — 한국 소스 2곳 실측 완료 (이 설계에서 직접 확인)

| 소스 | 기사 페이지 og:image | 비고 |
|---|---|---|
| 연합뉴스 (`yna.co.kr/view/...`) | ✅ `<meta property="og:image" data-test-img="AAAA-2" content="https://img9.yna.co.kr/photo/...jpg">` | **property와 content 사이에 다른 속성이 끼어 있다** — 추출 정규식이 이걸 견뎌야 함. 브라우저 UA로 차단 없음 |
| 한국경제 (`hankyung.com/article/...`) | ✅ `<meta property="og:image" content="https://img.hankyung.com/photo/...jpg" />` | 차단 없음 |

→ RSS에 이미지가 없는 한국 소스 2곳 모두 원문 페이지가 og:image를 준다. (c)안의 최대 리스크(차단·부재)가 해소됐다.
### 1-3-1. ⚠️ 로고 필터는 「후속」이 아니라 **필수**다 (부모 세션 추가 실측)

각 소스의 최신 기사 5건씩, 총 10건의 og:image 를 실제로 받아 비교했다. 결과가 설계 초안의 예상보다 나쁘다:

| 소스 | 표본 | 실제 기사 이미지 | **로고 이미지** |
|---|---|---|---|
| 연합뉴스 | 5건 | 2건 (`img9.yna.co.kr/photo/...`) | **3건** (`r.yna.co.kr/global/home/v01/img/yonhapnews_logo_1200x800_kr01.jpg`) |
| 한국경제 | 5건 | 3건 (`img.hankyung.com/photo/...`) | **2건** (`static.hankyung.com/img/logo/logo-news-sns.png?v=20201130`) |

「일부」가 아니라 **절반(5/10)** 이다. 필터 없이 넣으면 브리핑 카드 절반에 **똑같은 언론사 로고**가 붙는다 — 썸네일을 넣은 의미가 사라질 뿐 아니라, 없느니만 못한 화면이 된다.

**필터 규칙(3-3절 `og.ts` 에 포함할 것)**: 추출한 URL에 부분 문자열 `logo` 가 있으면 **null 로 취급**한다. 위 두 케이스(`yonhapnews_logo_`, `/img/logo/`)를 한 조건으로 잡고, 실제 기사 이미지 경로(`/photo/`)와 충돌하지 않는다. 오탐하더라도 결과는 「이미지 없음」이고 프런트가 영역을 접으므로 최악이 현상 유지다.

⚠️ 초안이 제안한 `/photo/cms/` 제외는 **하지 마라** — 연합뉴스 실측 표본에서 `/photo/cms/` 는 (오래된 자료사진이긴 해도) 기사에 실제로 딸린 사진이었다. 로고와는 다른 문제이고, 자료사진은 없는 것보다 낫다.

### 1-4. CSP·내비게이션 바 (지시서에서 전달받은 실측 — 재조사 안 함)

- `AppsInTossConfig`에 네트워크·도메인·CSP 항목이 **없고**, 빌드 산출물에도 CSP meta가 없다 → 외부 이미지 도메인 허용 여부는 우리가 제어할 수 없다. "허용" 가정 + `onError` 폴백 필수(10절).
- `navigationBar?: { withBackButton?, withHomeButton?, withTitle?, transparentBackground?, theme?, initialAccessoryButton? }` 필드가 존재한다 — 이전 설계의 미검증 가정 1번(네이티브 back 존재)이 뒷받침됨. 6절에서 명시 설정을 제안.
- `initialAccessoryButton` + `addAccessoryButton`은 web-framework 번들에서 **`_partner` 네임스페이스**에 있다(직접 grep 확인: `src/apis/_partner/addAccessoryButton/`). 파트너 전용 API일 가능성 + 목 모드에서 이벤트(`tdsEvent.navigationAccessoryEvent`) 테스트 불가 → **기각**, 설정 진입은 화면 안 `IconButton` 유지.

---

## 2. 썸네일 판단 — (a)+(c) 하이브리드 채택

### 2-1. 대안 비교

| 안 | 평가 |
|---|---|
| (a) RSS에 있는 것만, 없으면 생략 | BBC·Ars·ZDNet만 커버. 브리핑 다수를 차지하는 연합뉴스·한국경제가 전부 이미지 없음 → "뉴스 앱인데 이미지가 없다"는 지적이 사실상 그대로 남는다. 단독 채택 불가 |
| (b) 없으면 대체 시각 요소(주제색 블록+아이콘 등) | 가짜 이미지. 기사 5~6건 중 절반이 똑같은 색 블록이면 오히려 더 성의 없어 보인다. 정보 전달 기여 0. 기각 |
| **(c) 원문 fetch → og:image 추출 (채택, 캡 있음)** | 1-3절 실측으로 리스크 해소: 한국 소스 2곳 모두 og:image 제공·차단 없음. 비용은 하루 1회 collect 잡에서 이미지 없는 **신규** 기사만(upsert `ignoreDuplicates`가 신규만 돌려줌) + 상한·시간 예산으로 바운드. 실패해도 null로 남고 프런트가 접는다 — 모든 층에 폴백 존재 |
| (d) 썸네일 포기, 다른 밀도 수단 | 지적의 1번이 "이미지가 한 장도 없다"였다. 요구 회피. 기각 |

**채택**: RSS 파싱(공짜인 것 먼저) + og:image 백필(한국 소스 커버) + **프런트는 이미지 없으면 영역을 접는 레이아웃**(마지막 방어선).

### 2-2. "들쭉날쭉" 문제는 레이아웃으로 푼다

이미지가 일부만 있어 보기 싫은 것은 **카드 상단 대형 히어로 이미지** 패턴의 문제다. 채택 레이아웃은 **제목 오른쪽 72×72 소형 썸네일**(네이버 뉴스·토스 뉴스 탭과 같은 문법) — 이 패턴에서는 썸네일 부재가 "빈 자리"가 아니라 "제목이 전체 폭을 쓰는 행"으로 보여, 혼재가 자연스럽다. og 백필로 커버리지가 높아진 뒤에도 이 성질은 CSP 차단·로드 실패 시의 안전망이 된다.

---

## 3. 백엔드 설계

### 3-1. 마이그레이션 — `0005_article_image.sql`

⚠️ 지시서는 "새 파일은 0004_"라 했지만 **`0004_cron.sql`이 이미 존재한다**(실측). 다음 번호는 0005다.

```sql
alter table articles add column image_url text;
```

인덱스 불필요(백필 조회는 이번 실행의 신규 id 목록으로 함), GRANT 불필요(0001의 테이블 단위 GRANT가 새 컬럼을 포함).

### 3-2. `_shared/rss.ts` — 이미지 추출 (TDD)

`FeedItem`에 `imageUrl: string | null` 추가. 추출 우선순위(실측한 3개 경로, 소스별 표는 지시서 참조):

1. `media:thumbnail`의 `@url` (BBC·Ars) — 파서 설정이 `attributeNamePrefix: '@'`이므로 `it['media:thumbnail']['@url']`. 배열일 수 있으니 `asArray` 후 첫 항목.
2. `media:content`의 `@url` — `@type`이 `image/`로 시작하거나 `@medium === 'image'`이거나 url 확장자가 이미지(jpg·jpeg·png·webp·gif)인 항목만 (Ars의 media:content는 이미지지만, 팟캐스트류 피드는 오디오를 넣으므로 타입 검사 필수).
3. `content:encoded` 또는 `description` 원문(HTML)의 첫 `<img ... src="...">` (ZDNet) — ⚠️ 현재 `fromRss`는 `stripHtml` **후의** 텍스트만 쓰므로, 이미지 추출은 strip **전** 원문에서 한다.

공통 후처리: `new URL(src, item.url)`로 상대경로를 절대화하고, 프로토콜이 `http:`/`https:`가 아니면(예: `data:`) 버린다. Atom(`fromAtom`)도 3번 경로(content 원문의 img)만 적용 — HN은 이미지가 없어 null이 정상.

**테스트 먼저** (`test/rss.test.ts`에 추가 — 기존 케이스는 안 건드림):
- media:thumbnail이 있으면 그 url (실패를 먼저 본다: 필드 추가 전엔 `imageUrl` undefined)
- media:thumbnail 없고 media:content(type=image/jpeg)만 → 그 url / media:content가 audio면 null
- description의 `<img src>` 상대경로 → item link 기준 절대화
- 아무 것도 없으면 null
- `data:image/...` src는 버린다

### 3-3. `_shared/og.ts` — og:image 추출기 (신설, 순수 함수, TDD)

```ts
/** HTML에서 og:image URL을 뽑는다. 없으면 null. */
export function extractOgImage(html: string): string | null
```

정규식은 **속성 순서·중간 낀 속성을 견뎌야 한다** (1-3절 연합뉴스 실측: `property="og:image" data-test-img="..." content="..."`). 접근:
`<meta\s[^>]*>` 태그를 순회하며, 태그 안에 `(property|name)\s*=\s*["']og:image["']`가 있고(`og:image:width` 오매칭 방지 — 닫는 따옴표까지 매칭하므로 자동 배제) `content\s*=\s*["']([^"']+)["']`가 있으면 그 값. `&amp;` → `&` 정도만 디코드. http(s) 검증은 rss.ts와 동일 헬퍼.

**로고 필터(필수 — 1-3-1절 실측 근거)**: 추출한 URL에 부분 문자열 `logo` 가 있으면 **null 을 돌려준다.** 표본 10건 중 5건이 언론사 로고였기 때문에, 이 필터가 없으면 브리핑 카드 절반에 같은 로고가 붙는다. 검사는 대소문자 무시(`toLowerCase().includes('logo')`).

**테스트 먼저** (`test/og.test.ts` 신설):
- 표준형 (한국경제 실측 형태)
- property와 content 사이 다른 속성 (연합뉴스 실측 형태 그대로)
- content가 property보다 앞에 오는 역순
- `og:image:width`만 있고 og:image 없음 → null
- **로고 URL 2종은 null** — 실측값을 그대로 픽스처에 박을 것:
  - `https://r.yna.co.kr/global/home/v01/img/yonhapnews_logo_1200x800_kr01.jpg`
  - `https://static.hankyung.com/img/logo/logo-news-sns.png?v=20201130`
- **실제 기사 이미지는 통과** (필터가 과하게 먹지 않는지 반대 방향 확인):
  - `https://img9.yna.co.kr/photo/etc/af/2026/08/23/PAF20260823178201009_P4.jpg`
  - `https://img.hankyung.com/photo/202608/AA.45423395.1.jpg`
- 없음 → null / `&amp;` 디코드

### 3-4. `collect/index.ts` — 배선 + og 백필

1. `rows` 매핑에 `image_url: i.imageUrl` 추가, upsert `.select('id')` → `.select('id,url,image_url')`.
2. 소스 루프에서 **이번 실행에 새로 들어갔고 image_url이 null인** 행을 `ogTargets: {id, url}[]`로 모은다 (`ignoreDuplicates: true`의 반환이 신규 행만이라 재시도 누적이 없다).
3. 루프 종료 후 백필:

```ts
// ponytail: 상한 120건·시간 예산 60초·동시 6 — 하루 1회 잡이라 남는 건 null로 두고 프런트가 접는다.
// 커버리지가 부족하면 전용 백필 잡 분리가 승격 경로.
const OG_MAX = 120, OG_BUDGET_MS = 60_000, OG_CONCURRENCY = 6;
```

- `ogTargets`를 `published_at` 최신순으로 정렬(최신 기사가 브리핑 후보) 후 앞 120건만.
- 6개씩 `Promise.allSettled` 청크: `fetch(url, { headers: { 'user-agent': <브라우저형 UA> }, signal: AbortSignal.timeout(8_000) })` → `extractOgImage` → 성공 시 개별 `update articles set image_url`. 브라우저형 UA는 1-3절 실측에서 통과 확인된 값(`Mozilla/5.0 (Windows NT 10.0; Win64; x64)` 계열)을 쓴다 — 수집용 커스텀 UA는 뉴스 사이트에서 차단 가능성이 더 높다.
- 청크 사이에 시간 예산 검사, 초과 시 중단.
- 응답 JSON에 `ogFetched`(성공 건수) 추가 — 운영 관측용.

index.ts는 기존 컨벤션대로 단위 테스트 없음(순수 로직은 전부 og.ts·rss.ts로 빠졌다).

### 3-5. `app/index.ts` — 브리핑 응답에 topics·imageUrl

`handleBriefing`의 select에 `topics,image_url` 추가, 카드 매핑에:

```ts
topics: r.topics ?? [],
imageUrl: r.image_url ?? null,
```

`createWelcomeBriefing`·deliver·scoring은 손대지 않는다(이미지와 무관).

---

## 4. 화면별 변경 (before → after)

### 4-1. Briefing — 기사 카드 (핵심)

**before**: 제목(t4) / 요약(t5) / [출처 ↔ 원문 보기]. 이미지·주제·시각 없음.

**after**:

```tsx
<article style={{ padding: '20px 24px 0' }}>
  {/* ① 주제 배지 행 — 카드의 "왜 골라졌나" */}
  {badges.length > 0 && (
    <>
      <div style={{ display: 'flex', gap: 4 }}>
        {badges.map((t) => (
          <Badge key={t} size="small" variant="weak" color="blue">{TOPIC_LABELS[t]}</Badge>
        ))}
      </div>
      <Spacing size={8} />
    </>
  )}
  {/* ② 제목 + 오른쪽 72px 썸네일 (없으면 제목이 전체 폭) */}
  <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <Paragraph typography="t4" fontWeight="bold" ellipsisAfterLines={3}>{c.title}</Paragraph>
    </div>
    {c.imageUrl && !broken.has(c.articleId) && (
      <Asset.Image
        src={c.imageUrl}
        frameShape={{ width: 72, height: 72, radius: 14 }}
        objectFit="cover"
        loading="lazy"
        alt=""
        onError={() => markBroken(c.articleId)}
      />
    )}
  </div>
  <Spacing size={8} />
  <Paragraph typography="t5" color={adaptive.grey700}>{c.summaryKo}</Paragraph>
  <Spacing size={12} />
  {/* ③ 메타: 출처 · 상대 시각 ↔ 원문 보기 */}
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <Paragraph typography="st11" color={adaptive.grey500}>
      {`${c.sourceName} · ${formatAgo(c.publishedAt)}`}
    </Paragraph>
    <TextButton size="small" variant="arrow" onClick={() => Device.openURL(c.url)}>원문 보기</TextButton>
  </div>
  <Spacing size={20} />
  {i < cards.length - 1 && <Border variant="padding24" />}
</article>
```

- `badges = (c.topics ?? []).filter((t) => TOPIC_LABELS[t]).slice(0, 2)` — **`?? []` 필수**: 오프라인 캐시(`lastBriefing`)에 구 스키마 카드가 남아 있을 수 있다. `c.imageUrl`도 optional 접근으로 방어. `Card` 타입은 `topics: string[]; imageUrl: string | null`로 선언하되 렌더는 방어적으로.
- `broken`: `useState(() => new Set<number>())` — `onError` 시 id 추가해 영역을 접는다(CSP 차단·404 모두 이 경로). 리렌더를 위해 새 Set으로 교체.
- `formatAgo(iso)`: 브리핑 시각 기준 상대 표기 — 1시간 미만 "방금 전", 24시간 미만 "N시간 전", 그 외 "N일 전". Briefing.tsx 안 한 함수(~8줄), 공용화 안 함.
- `Asset.Image`를 `<img>` 대신 쓰는 근거: img attr을 전부 통과시키면서(`loading`·`onError` — d.ts 확인) `backgroundColor` 기본값(`adaptive.grey100`)이 로드 전 회색 플레이스홀더를 공짜로 주고, TDS 준수가 심사 기준이다. 커스텀 `frameShape`로 72px 지정 가능(1-1절).

**기타 Briefing 변경**:
- Top right: `TextButton "설정"` → `IconButton name="icon-setting-mono" aria-label="설정" color={adaptive.grey700}` (paddingRight 24 래퍼는 유지 — 기존 실측 주석 보존).
- 배너(오프라인·어제): 텍스트 앞에 아이콘 — `<div style={{ display:'flex', gap:8, alignItems:'flex-start' }}><Asset.Icon name={icon} color={adaptive.grey600} style={{ width:18, height:18, flexShrink:0, marginTop:1 }} /><Paragraph .../></div>`. 오프라인=`icon-info-mono`, 어제=`icon-clock-mono`. `Banner` props에 `icon` 추가.
- 빈 상태: `🥛`(t1) → `<Asset.Icon name="icon-sunrise-mono" color={adaptive.orange500} style={{ width:56, height:56 }} />` — "내일 아침 배달" 컨셉 그대로.
- 끝 마감: `🥛`(t3) → `<Asset.Icon name="icon-check-circle-mono" color={adaptive.orange600} style={{ width:32, height:32 }} />`. 문구·면책 유지.

### 4-2. Intro — 가치 3줄 이모지 → 아이콘

**before**: `left={<Paragraph typography="t4">🥛</Paragraph>}` 등 OS 이모지 3개.

**after**: `VALUES`를 `{ icon, bg, fg, text }`로 바꾸고:

```tsx
left={<ListRow.AssetIcon variant="fill" size="medium" name={v.icon} backgroundColor={v.bg} color={v.fg} />}
```

| 줄 | icon | bg / fg |
|---|---|---|
| 나이·직업·관심사에 맞춘 기사 5~6건 | `icon-user-mono` | `adaptive.blue50` / `adaptive.blue500` |
| 해외 매체도 한국어 요약으로 배달돼요 | `icon-earth-mono` | `adaptive.teal50` / `adaptive.teal500` |
| 다 보면 끝나는 하루치 묶음이에요 | `icon-check-circle-mono` | `adaptive.orange50` / `adaptive.orange500` |

`variant="fill"`의 기본 shape·여백은 목 모드에서 눈으로 확인하고, fill 배경이 어색하면 `variant` 생략+`color`만으로 폴백(1줄 되돌림). key는 emoji 대신 icon 이름.

### 4-3. Settings — 행 아이콘

두 ListRow에 `left` 추가:

```tsx
left={<ListRow.AssetIcon name="icon-alarm-mono" color={adaptive.grey600} />}   // 매일 아침 알림 받기
left={<ListRow.AssetIcon name="icon-clock-mono" color={adaptive.grey600} />}   // 받을 시간
```

관심 주제 섹션은 칩이 이미 시각 요소라 그대로.

### 4-4. Onboarding — 변경 없음

칩 3섹션이 화면을 이미 채우고 있고 선택 상태가 곧 색이다. 억지로 아이콘을 넣지 않는다(정보 기여 없음).

---

## 5. 아이콘 매핑표 (전부 검증된 28개 안)

| 자리 | 이름 | 컴포넌트 | 색 |
|---|---|---|---|
| 인트로 가치 1 (맞춤) | `icon-user-mono` | ListRow.AssetIcon fill | blue50/blue500 |
| 인트로 가치 2 (해외→한국어) | `icon-earth-mono` | ListRow.AssetIcon fill | teal50/teal500 |
| 인트로 가치 3 (하루치 완결) | `icon-check-circle-mono` | ListRow.AssetIcon fill | orange50/orange500 |
| 브리핑 설정 진입 | `icon-setting-mono` | IconButton (aria-label="설정") | grey700 |
| 브리핑 오프라인 배너 | `icon-info-mono` | Asset.Icon 18px | grey600 |
| 브리핑 어제 배너 | `icon-clock-mono` | Asset.Icon 18px | grey600 |
| 브리핑 빈 상태 | `icon-sunrise-mono` | Asset.Icon 56px | orange500 |
| 브리핑 끝 마감 | `icon-check-circle-mono` | Asset.Icon 32px | orange600 |
| 설정 · 알림 받기 | `icon-alarm-mono` | ListRow.AssetIcon | grey600 |
| 설정 · 받을 시간 | `icon-clock-mono` | ListRow.AssetIcon | grey600 |

새 이름이 필요해지면 반드시 HEAD 실측 후 사용(지시서 절차).

---

## 6. `apps-in-toss.config.ts` — navigationBar 명시

```ts
navigationBar: {
  withBackButton: true,   // 이전 설계가 "네이티브 back 존재"를 가정하고 화면 내 back을 지웠다 — 기본값 의존을 명시로 바꾼다
  withTitle: false,       // 화면이 자체 Top 타이틀을 그린다 — 중복 방지
},
```

- `theme`은 **설정하지 않는다** — 명시하면 시스템 다크모드 추종을 잃을 수 있고, 기본 동작이 무엇이든 TDS adaptive 화면과 함께 자동 대응될 가능성이 높은 쪽은 미설정이다(미검증, 10절).
- `initialAccessoryButton` 미사용 — 1-4절 기각 근거.

---

## 7. 목 데이터·스크린샷

### 7-1. mock.ts

- `CARDS` 5건에 `topics`(각 1~2개, 기존 제목과 어울리게: 금리→`['economy']`, 전세→`['realestate','policy']`, AI도구→`['tech','ai']`, 주4일제→`['career']`, 수면→`['health']`)와 `imageUrl` 추가.
- 이미지는 **4건 채움 + 1건 null**(혼재 레이아웃이 정상 동작함을 스크린샷 자체가 증명하게).
- URL은 `https://picsum.photos/seed/brief{n}/240/240` — 시드로 결정적, 파일 다운로드·번들 오염 없음. prod 부재 검증은 기존 방식대로 `dist/`에서 `picsum` grep 0건(+ 양성 대조: `src/mock.ts`에서 1건).

### 7-2. 심사 스크린샷 3장 (이전 설계 6-2절 절차 + 추가 1단계)

절차는 이전 설계 그대로(chrome-devtools MCP, `emulate 318x524x2` → navigate → 촬영 → 크기 검증 636×1048). **추가**: 각 촬영 직전 dev 전용 AIT 패널 제거 —

```js
document.querySelectorAll('.ait-panel-root').forEach((el) => el.remove());
```

(`evaluate_script`로 실행. 이번 작업에서 실제로 제목을 가린 전력이 있다.)

썸네일이 원격(picsum)이라 촬영 전 이미지 로드 완료를 눈으로 확인(스냅샷에 img 로드 여부가 안 보이면 스크린샷을 찍어 회색 플레이스홀더가 아닌지 확인).

---

## 8. 구현 태스크 분해 (순서대로)

백엔드 먼저 — 프런트의 `Card` 타입이 백엔드 계약을 따르고, 목은 그 타입을 따르기 때문. 각 태스크의 "확인"이 Red/Green 게이트다.

**백엔드** (각 태스크 후 `node --test test/*.test.ts` 전체 통과 확인 — 기존 71개 + 신규):

1. **마이그레이션** — `supabase/migrations/0005_article_image.sql`. 확인: 파일 생성 + (로컬 supabase 사용 시) 적용.
2. **rss.ts 이미지 추출 (TDD)** — 3-2절 테스트를 먼저 써서 실패(Red)를 보고 → `FeedItem.imageUrl` 구현(Green). 확인: 신규 테스트 통과 + 기존 rss 테스트 무손상.
3. **og.ts (TDD)** — `test/og.test.ts` 먼저(연합뉴스 실측 태그 형태 그대로 픽스처에 포함) → `extractOgImage` 구현. 확인: 테스트 통과.
4. **collect 배선 + 백필** — 3-4절. 확인: `tsc`/deno check 상당(레포 관례를 따름) + 테스트 전체 통과. 실배포 후 응답 JSON의 `ogFetched`로 실측(이 설계 범위 밖, plan에 후속 확인 항목으로).
5. **app/index.ts** — 3-5절 select·매핑 추가. 확인: 테스트 전체 통과(approuting 테스트 무손상).

**프런트** (각 태스크 후 `cd app && npx tsc -b` 통과, 목 모드 실측):

6. **타입·목** — `api.ts` `Card`에 `topics`·`imageUrl` 추가, `mock.ts` 7-1절. 확인: `npm run dev:mock` `/`에서 기존 화면 회귀 없음(아직 렌더 안 바뀜).
7. **Briefing 카드 리디자인** — 4-1절 (배지·썸네일·formatAgo·broken 폴백·캐시 방어). 확인: `/` 실측 — 이미지 4건 표시·1건 접힘, 배지 라벨, 상대 시각. 존재하지 않는 imageUrl을 목에 잠깐 넣어 `onError` 접힘도 실측(Red에 해당).
8. **Briefing 아이콘** — 설정 IconButton·배너·빈 상태·끝 마감. 확인: `/`(끝 마감), `/?screen=onboarding`용 아님에 주의 — 빈 상태는 목의 onboarding 분기 응답(cards=null)을 `/`에서 억지로 보긴 어려우므로 목에 `?screen=empty` 분기 1줄 추가(`{ onboarded: true, date: null, isToday: false, nextHour: 7, cards: null }`). 배너는 `?screen=` 분기로 `isToday: false` 케이스(`?screen=yesterday`) 1줄 추가해 실측.
9. **Intro·Settings 아이콘** — 4-2·4-3절. 확인: `/?screen=intro`·설정 진입 실측. fill 스타일 어색하면 4-2절 폴백.
10. **config** — 6절 navigationBar. 확인: `tsc` 통과(런타임 확인은 실기기 전용 — 미검증 가정 유지).
11. **빌드 게이트** — `npm run build`(tsc -b && vite build && ait build) 통과 + `dist/`에서 `picsum` grep 0건(양성 대조 포함).
12. **스크린샷 3장 재촬영** — 7-2절. 확인: 크기 636×1048 실측 + 패널 부재 눈 확인.
13. plan.md ✅ / changeLog.md 갱신은 PR 절차에서 한 세트로.

---

## 9. 기각한 대안 요약

- **(b) 대체 시각 요소 / (d) 썸네일 포기** — 2-1절.
- **og 백필을 전용 Edge Function + cron으로 분리** — 함수·크론 마이그레이션·배포가 늘어난다. collect가 하루 1회고 소스 루프가 ~수십 초라 60초 예산을 얹어도 한도 안. 커버리지가 부족해지면 그때 분리(ponytail 주석으로 승격 경로 명시).
- **이미지 로드 실패 시 대체 블록 표시** — 접는 것이 (b) 기각과 일관.
- **`<img>` 직접 사용** — Asset.Image가 img attr 전부 + 플레이스홀더 배경 + TDS 준수를 공짜로 준다(4-1절).
- **설정 진입을 내비바 accessory button으로** — `_partner` API·목 테스트 불가(1-4절).
- **발행 시각을 절대 표기("오전 6:10")로** — 후보 창이 3일이라 날짜 없는 절대 시각은 오해를 만든다. 상대 표기 채택.
- **연합뉴스·한국경제만 골라 백필(소스 플래그)** — 스키마 변경이 필요한데, "image_url null인 신규 기사 전부"가 같은 결과를 스키마 변경 없이 준다(TechCrunch·HN 기사도 og:image가 있으면 덤으로 얻는다).
- **온보딩 화면 추가 장식** — 4-4절, 정보 기여 없음.

---

## 10. 리스크 · 미검증 가정 (정직 신고)

1. **[미검증] 앱인토스 웹뷰가 외부 이미지 도메인(ichef.bbci.co.uk, img9.yna.co.kr, img.hankyung.com 등)을 허용한다** — 설정으로 제어 불가(1-4절), 실기기 전용 확인. 틀려도 `onError` 접힘으로 화면은 텍스트 레이아웃으로 정확히 돌아간다(최악 = 현재 상태와 동일).
2. **[미검증] `navigationBar` 기본값·`theme` 미설정 동작** — d.ts로 알 수 없음. `withBackButton: true` 명시로 back은 보장, theme은 실기기에서 다크모드 확인 후 필요 시 조정.
3. **[해결됨] 언론사 로고가 og:image 로 오는 문제** — 1-3-1절 추가 실측에서 표본 10건 중 **5건**이 로고였다. `og.ts` 의 `logo` 부분 문자열 필터로 처리한다(필수 구현). 남는 리스크는 오래된 자료사진이 붙는 경우인데, 이건 기사에 실제로 딸린 사진이라 그대로 둔다.
4. **[리스크] og 백필 120건이 collect 실행 한도를 압박** — 시간 예산 60초 + 청크 중단으로 바운드했지만 Supabase 한도는 배포 환경에서 실측. `ogFetched`가 지속 0이면 여기를 의심.
5. **[미검증] `ListRow.AssetIcon variant="fill"`·`Asset.Image` 커스텀 frameShape의 정확한 시각** — d.ts로 형태는 확인했으나 렌더 결과는 목 모드에서 눈으로 확정(각 1줄 폴백 준비됨).
6. **[리스크] 오프라인 캐시의 구 스키마 카드** — `topics`/`imageUrl` 부재 → 렌더 방어(`?? []`)로 처리(4-1절). 정상 경로에서 새 응답이 캐시를 곧 덮는다.
