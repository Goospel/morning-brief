# 백엔드 파이프라인 구현 계획

> **에이전트 작업자용:** 필수 서브스킬 — `superpowers:subagent-driven-development`(권장) 또는 `superpowers:executing-plans`로 태스크 단위 실행. 스텝은 체크박스(`- [ ]`)로 추적한다.

**목표:** 매일 새벽 RSS를 수집하고 Claude Batch API로 한글 요약을 붙인 뒤, 사용자별 점수 계산으로 오늘의 브리핑을 `briefings` 테이블에 확정하는 백엔드 파이프라인을 만든다.

**아키텍처:** Supabase Edge Function 4개(수집 / 요약 제출 / 요약 수집 / 배달)를 pg_cron이 시각에 맞춰 호출한다. 순수 로직(RSS 파싱·요약 응답 파싱·점수 계산·KST 변환)은 `_shared/`에 런타임 중립 모듈로 분리해 Node 내장 테스트 러너로 검증한다.

**기술 스택:** Supabase(Postgres + Edge Functions/Deno) · TypeScript · `fast-xml-parser` 5.11.0 · `@anthropic-ai/sdk` 0.120.0 · `@supabase/supabase-js` 2.112.3 · 테스트는 `node --test`(Node 24 내장 타입 스트리핑)

**범위 밖:** 프런트(온보딩·브리핑 화면)와 토스 푸시 발송은 이 계획에 없다. 별도 계획으로 다룬다. 이 계획이 끝나면 `briefings`에 매일 브리핑이 쌓이는 상태가 된다 — 그것만으로 독립적으로 검증 가능하다.

---

## 설계 스펙 대비 변경점 5가지

구현 가능성을 실측하며 스펙에서 바꾼 부분이다. 스펙 문서에도 반영한다.

1. **점수 계산을 SQL에서 TypeScript로 옮긴다.** 스펙은 "순수 SQL 점수 계산"이었으나, 다양성 규칙(한 토픽 2건)과 해외 1건 보장은 SQL로 쓰면 테스트가 pgTAP 통합 테스트로 무거워진다. 후보 좁히기(최근 3일 + 요약 완료)만 SQL로 하고 점수·선정은 순수 함수로 둔다. 후보가 하루 수백 건이라 메모리 부담이 없다.

2. **요약 잡을 2단계로 쪼갠다.** Batch API는 비동기라 제출 후 결과가 몇 분~수 시간 뒤에 나오는데, Edge Function에는 실행 시간 제한이 있다. `summarize-submit`(제출 후 `batch_id` 저장)과 `summarize-collect`(20분마다 완료 확인 후 반영)로 나누고 `summary_batches` 테이블을 추가한다.

3. **RLS는 전면 차단으로 잠근다.** 토스 로그인은 Supabase Auth가 아니라서 `userKey`를 클라이언트가 그대로 보내면 위조된다. 모든 테이블에 RLS를 켜고 **정책을 두지 않아** anon/authenticated를 전부 막는다. 앱은 나중에 전용 Edge Function을 통해서만 접근한다(프런트 계획에서 다룬다).

4. **프롬프트 캐싱을 쓰지 않는다.** 캐시가 걸리는 최소 프리픽스는 약 1,024토큰인데 요약 시스템 프롬프트는 그보다 훨씬 짧다. 짧은 프리픽스는 **조용히 캐시되지 않으므로** `cache_control`을 붙여봐야 착시만 남는다. Batch API의 50% 할인은 그대로 적용된다.

5. **요약 잡 테스트를 응답 파서 단위 테스트로 한정한다.** 스펙은 "LLM을 목킹해 배치 요청 구성과 결과 저장을 검증"이라고 했으나, Edge Function은 Deno 런타임과 `Deno.serve`에 묶여 있어 목킹 하네스를 세우는 비용이 얻는 것보다 크다. 실제로 깨질 수 있는 부분은 **모델 응답을 믿고 파싱하는 지점**이고 그건 `parseSummary`가 순수 함수로 전부 커버한다. 요청 구성과 저장은 Task 14의 실제 한 바퀴 실행으로 확인한다.

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `package.json` | Node 테스트용 의존성과 `test` 스크립트 |
| `deno.json` | Edge Function용 import 맵 (Node와 같은 모듈 지정자를 쓰게 함) |
| `supabase/migrations/0001_schema.sql` | 테이블·인덱스·RLS 잠금 |
| `supabase/migrations/0002_seed_rules.sql` | `profile_rules` 시드 |
| `supabase/migrations/0003_seed_sources.sql` | `sources` 시드 (검증 통과한 피드만) |
| `supabase/migrations/0004_cron.sql` | `invoke_job` 헬퍼 + 크론 4건 |
| `supabase/functions/_shared/kst.ts` | KST 시각·날짜 변환 (순수) |
| `supabase/functions/_shared/rss.ts` | RSS 2.0 / Atom 파싱 (순수) |
| `supabase/functions/_shared/summary.ts` | 요약 응답 JSON 파싱·검증 (순수) |
| `supabase/functions/_shared/scoring.ts` | 점수·선정 규칙 (순수) |
| `supabase/functions/_shared/topics.ts` | 고정 어휘 상수 |
| `supabase/functions/collect/index.ts` | 수집 잡 |
| `supabase/functions/summarize-submit/index.ts` | Batch 제출 잡 |
| `supabase/functions/summarize-collect/index.ts` | Batch 결과 반영 잡 |
| `supabase/functions/deliver/index.ts` | 점수 계산·브리핑 확정 잡 |
| `test/*.test.ts` | 순수 모듈 테스트 |
| `scripts/verify-feeds.mjs` | 후보 피드 URL 실제 검증 |

`_shared/`의 모듈은 표준 웹 API와 `fast-xml-parser`만 쓴다. Deno에서도 Node에서도 그대로 import된다.

---

### Task 1: 프로젝트 스캐폴딩

**Files:**
- Create: `package.json`
- Create: `deno.json`
- Modify: `.gitignore`
- Create: `supabase/config.toml` (CLI가 생성)

- [ ] **Step 0: 작업 브랜치 생성**

main 직접 편집은 훅이 막는다. 리모트를 당긴 뒤 `origin/main`에서 바로 뗀다.

```bash
git fetch origin
git checkout -b feat/backend-pipeline origin/main
```

기대: `Switched to a new branch 'feat/backend-pipeline'`

- [ ] **Step 1: Supabase 프로젝트 초기화**

```bash
npx --yes supabase@latest init
```

기대 출력: `Finished supabase init.` — `supabase/config.toml`이 생긴다.

- [ ] **Step 2: `package.json` 작성**

```json
{
  "name": "morning-brief",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "verify-feeds": "node scripts/verify-feeds.mjs"
  },
  "dependencies": {
    "fast-xml-parser": "5.11.0"
  }
}
```

- [ ] **Step 3: `deno.json` 작성**

Edge Function은 Deno에서 돈다. import 맵을 두면 `_shared/` 모듈이 Node와 **같은 지정자**를 쓸 수 있다.

```json
{
  "imports": {
    "fast-xml-parser": "npm:fast-xml-parser@5.11.0",
    "@supabase/supabase-js": "npm:@supabase/supabase-js@2.112.3",
    "@anthropic-ai/sdk": "npm:@anthropic-ai/sdk@0.120.0"
  }
}
```

- [ ] **Step 4: `.gitignore`에 추가**

기존 내용 아래에 덧붙인다:

```
supabase/.temp/
supabase/.branches/
```

- [ ] **Step 5: 의존성 설치와 확인**

```bash
npm install
```

기대: `node_modules/fast-xml-parser`가 생긴다.

- [ ] **Step 6: 커밋**

```bash
git add package.json package-lock.json deno.json .gitignore supabase/config.toml
git commit -m "chore: Supabase 프로젝트 스캐폴딩"
```

---

### Task 2: 스키마 마이그레이션

**Files:**
- Create: `supabase/migrations/0001_schema.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- 프로필: 토스 userKey 가 PK. 생일은 연도만 보관한다(최소수집).
create table profiles (
  user_key    text primary key,
  gender      text,
  birth_year  int,
  household   text not null check (household in ('single','married','with_kids')),
  job_field   text not null,
  topics      text[] not null default '{}',
  push_hour   int not null default 7 check (push_hour between 0 and 23),
  push_on     boolean not null default true,
  created_at  timestamptz not null default now()
);

create table sources (
  id       bigint generated always as identity primary key,
  name     text not null,
  feed_url text not null unique,
  lang     text not null check (lang in ('ko','en')),
  topics   text[] not null default '{}',
  enabled  boolean not null default true
);

-- url UNIQUE 하나가 중복 수집과 중복 요약을 동시에 막는다.
create table articles (
  id            bigint generated always as identity primary key,
  source_id     bigint not null references sources(id) on delete cascade,
  url           text not null unique,
  title         text not null,
  published_at  timestamptz not null,
  lang          text not null,
  raw_excerpt   text,
  summary_ko    text,
  topics        text[] not null default '{}',
  summarized_at timestamptz,
  created_at    timestamptz not null default now()
);

-- 배달 잡이 후보를 좁힐 때 쓰는 인덱스
create index articles_ready_idx on articles (published_at desc) where summary_ko is not null;
-- 요약 제출 잡이 미요약 건을 찾을 때 쓰는 인덱스
create index articles_pending_idx on articles (published_at desc) where summary_ko is null;

-- Batch API 는 비동기라 제출과 수거가 분리된다.
create table summary_batches (
  id           bigint generated always as identity primary key,
  batch_id     text not null unique,
  article_ids  bigint[] not null,
  status       text not null default 'submitted'
               check (status in ('submitted','done','failed')),
  submitted_at timestamptz not null default now(),
  completed_at timestamptz
);

-- 복합 PK 가 하루 두 번 배달을 막는다.
create table briefings (
  user_key    text not null references profiles(user_key) on delete cascade,
  date        date not null,
  article_ids bigint[] not null,
  sent_at     timestamptz,
  opened_at   timestamptz,
  primary key (user_key, date)
);

-- 프로필 속성 -> topic 가중치. 코드 배포 없이 SQL 로 튜닝한다.
create table profile_rules (
  id        bigint generated always as identity primary key,
  attribute text not null check (attribute in ('gender','age_band','household','job_field')),
  value     text not null,
  topic     text not null,
  weight    numeric not null,
  unique (attribute, value, topic)
);

-- RLS 전면 차단: 정책을 두지 않으면 anon/authenticated 는 전부 거부된다.
-- service_role 만 통과한다. 앱은 전용 Edge Function 을 거쳐서만 접근한다.
alter table profiles        enable row level security;
alter table sources         enable row level security;
alter table articles        enable row level security;
alter table summary_batches enable row level security;
alter table briefings       enable row level security;
alter table profile_rules   enable row level security;
```

- [ ] **Step 2: 로컬 DB에 적용해 검증**

Docker가 떠 있어야 한다.

```bash
npx supabase start
npx supabase db reset
```

기대 출력: 마이그레이션이 오류 없이 적용되고 `Finished supabase db reset.`

- [ ] **Step 3: 테이블 생성과 RLS 상태 확인**

컨테이너 이름을 먼저 잡는다 (프로젝트 디렉터리명에서 오므로 환경마다 다르다):

```bash
DB=$(docker ps --format '{{.Names}}' | grep supabase_db | head -1) && echo "$DB"
```

테이블 6개와 RLS 활성화를 한 번에 확인한다:

```bash
docker exec -i "$DB" psql -U postgres -c "select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname"
```

기대: `articles`, `briefings`, `profile_rules`, `profiles`, `sources`, `summary_batches` 6행이 나오고 `relrowsecurity`가 전부 `t`.

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/0001_schema.sql
git commit -m "feat: 스키마 마이그레이션 (6테이블 + RLS 전면 차단)"
```

---

### Task 3: KST 변환 헬퍼 (TDD)

배달 잡은 "지금이 KST 몇 시인가"와 "오늘 날짜(KST)"가 필요하다. 서버는 UTC로 돈다.

**Files:**
- Create: `supabase/functions/_shared/kst.ts`
- Test: `test/kst.test.ts`

- [x] **Step 1: 실패하는 테스트 작성**

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kstHour, kstDateString } from '../supabase/functions/_shared/kst.ts';

test('kstHour: UTC 22시는 KST 다음날 7시', () => {
  assert.equal(kstHour(new Date('2026-08-22T22:00:00Z')), 7);
});

test('kstHour: UTC 자정은 KST 9시', () => {
  assert.equal(kstHour(new Date('2026-08-22T00:00:00Z')), 9);
});

test('kstHour: UTC 15시는 KST 자정(0시)', () => {
  assert.equal(kstHour(new Date('2026-08-22T15:00:00Z')), 0);
});

test('kstDateString: UTC 22시는 KST 기준 다음 날짜', () => {
  assert.equal(kstDateString(new Date('2026-08-22T22:00:00Z')), '2026-08-23');
});

test('kstDateString: UTC 14시는 KST 기준 같은 날짜', () => {
  assert.equal(kstDateString(new Date('2026-08-22T14:00:00Z')), '2026-08-22');
});
```

- [x] **Step 2: 테스트 실행해 실패 확인**

```bash
npm test
```

기대: 모듈을 찾을 수 없다는 에러로 FAIL.

- [x] **Step 3: 구현**

```typescript
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** UTC 시각을 KST 기준 시(0~23)로 변환한다. */
export function kstHour(now: Date): number {
  return new Date(now.getTime() + KST_OFFSET_MS).getUTCHours();
}

/** UTC 시각을 KST 기준 YYYY-MM-DD 문자열로 변환한다. */
export function kstDateString(now: Date): string {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}
```

한국은 서머타임이 없어 고정 +9 오프셋이 항상 맞다. `Intl`을 쓸 이유가 없다.

- [x] **Step 4: 테스트 실행해 통과 확인**

```bash
npm test
```

기대: 5개 PASS.

- [x] **Step 5: 커밋**

```bash
git add supabase/functions/_shared/kst.ts test/kst.test.ts
git commit -m "feat: KST 시각 변환 헬퍼"
```

---

### Task 4: RSS/Atom 파서 (TDD)

**Files:**
- Create: `supabase/functions/_shared/rss.ts`
- Test: `test/rss.test.ts`
- Create: `test/fixtures/rss.xml`, `test/fixtures/atom.xml`, `test/fixtures/single-item.xml`

- [x] **Step 1: 픽스처 3개 작성**

`test/fixtures/rss.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Example News</title>
    <item>
      <title>첫 번째 기사</title>
      <link>https://example.com/a</link>
      <pubDate>Fri, 21 Aug 2026 10:00:00 +0900</pubDate>
      <description>&lt;p&gt;본문 &lt;b&gt;발췌&lt;/b&gt;입니다.&lt;/p&gt;</description>
    </item>
    <item>
      <title>날짜가 없는 기사</title>
      <link>https://example.com/b</link>
      <description>버려져야 한다</description>
    </item>
    <item>
      <title>두 번째 기사</title>
      <link>https://example.com/c</link>
      <pubDate>Thu, 20 Aug 2026 08:30:00 +0900</pubDate>
      <description>두 번째 발췌</description>
    </item>
  </channel>
</rss>
```

`test/fixtures/atom.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Atom</title>
  <entry>
    <title>Atom Entry</title>
    <link rel="alternate" href="https://example.org/x"/>
    <published>2026-08-21T01:00:00Z</published>
    <summary>atom summary text</summary>
  </entry>
  <entry>
    <title>Updated Only</title>
    <link href="https://example.org/y"/>
    <updated>2026-08-20T01:00:00Z</updated>
    <content>content fallback</content>
  </entry>
</feed>
```

`test/fixtures/single-item.xml` — 항목이 하나뿐일 때 XML 파서가 배열이 아닌 객체를 주는 케이스:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Single</title>
    <item>
      <title>외톨이 기사</title>
      <link>https://example.com/only</link>
      <pubDate>Fri, 21 Aug 2026 12:00:00 +0900</pubDate>
      <description>하나뿐</description>
    </item>
  </channel>
</rss>
```

- [x] **Step 2: 실패하는 테스트 작성**

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFeed } from '../supabase/functions/_shared/rss.ts';

const fixture = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');

test('RSS 2.0 을 파싱한다', () => {
  const items = parseFeed(fixture('rss.xml'));
  assert.equal(items.length, 2);
  assert.equal(items[0].url, 'https://example.com/a');
  assert.equal(items[0].title, '첫 번째 기사');
  assert.equal(items[0].publishedAt.toISOString(), '2026-08-21T01:00:00.000Z');
});

test('description 의 HTML 태그를 벗긴다', () => {
  const items = parseFeed(fixture('rss.xml'));
  assert.equal(items[0].excerpt, '본문 발췌 입니다.');
});

test('pubDate 가 없는 항목은 버린다', () => {
  const items = parseFeed(fixture('rss.xml'));
  assert.ok(!items.some((i) => i.url === 'https://example.com/b'));
});

test('Atom 을 파싱한다', () => {
  const items = parseFeed(fixture('atom.xml'));
  assert.equal(items.length, 2);
  assert.equal(items[0].url, 'https://example.org/x');
  assert.equal(items[0].excerpt, 'atom summary text');
});

test('Atom 에서 published 가 없으면 updated 로 대체한다', () => {
  const items = parseFeed(fixture('atom.xml'));
  assert.equal(items[1].publishedAt.toISOString(), '2026-08-20T01:00:00.000Z');
  assert.equal(items[1].excerpt, 'content fallback');
});

test('항목이 하나뿐이어도 배열로 돌려준다', () => {
  const items = parseFeed(fixture('single-item.xml'));
  assert.equal(items.length, 1);
  assert.equal(items[0].url, 'https://example.com/only');
});

test('깨진 XML 은 예외를 던진다', () => {
  assert.throws(() => parseFeed('<rss><channel><item></rss>'), /invalid XML/);
});

test('빈 문자열도 예외를 던진다', () => {
  assert.throws(() => parseFeed(''), /invalid XML/);
});
```

- [x] **Step 3: 테스트 실행해 실패 확인**

```bash
npm test
```

기대: `parseFeed`를 찾을 수 없다는 에러로 FAIL.

- [x] **Step 4: 구현**

```typescript
import { XMLParser, XMLValidator } from 'fast-xml-parser';

export type FeedItem = {
  url: string;
  title: string;
  publishedAt: Date;
  excerpt: string;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  trimValues: true,
});

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

/** CDATA·속성이 섞인 노드에서 텍스트만 뽑는다. */
function text(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return String((v as Record<string, unknown>)['#text'] ?? '');
  return String(v);
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function toDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fromRss(it: Record<string, unknown>): FeedItem | null {
  const url = text(it.link).trim();
  const title = text(it.title).trim();
  const publishedAt = toDate(text(it.pubDate));
  if (!url || !title || !publishedAt) return null;
  return { url, title, publishedAt, excerpt: stripHtml(text(it.description)) };
}

function fromAtom(e: Record<string, unknown>): FeedItem | null {
  const links = asArray(e.link as Record<string, string> | Record<string, string>[]);
  const alt = links.find((l) => !l['@rel'] || l['@rel'] === 'alternate') ?? links[0];
  const url = String(alt?.['@href'] ?? '').trim();
  const title = text(e.title).trim();
  const publishedAt = toDate(text(e.published)) ?? toDate(text(e.updated));
  if (!url || !title || !publishedAt) return null;
  const excerpt = stripHtml(text(e.summary) || text(e.content));
  return { url, title, publishedAt, excerpt };
}

/**
 * RSS 2.0 또는 Atom 피드를 파싱한다.
 * 형식이 깨졌으면 던진다 — 호출자가 소스 단위로 잡아서 나머지 소스를 계속 돌린다.
 */
export function parseFeed(xml: string): FeedItem[] {
  const valid = XMLValidator.validate(xml);
  if (valid !== true) throw new Error(`invalid XML: ${valid.err.msg}`);

  const doc = parser.parse(xml) as Record<string, any>;

  const rssItems = asArray(doc?.rss?.channel?.item);
  if (rssItems.length > 0) {
    return rssItems.map(fromRss).filter((i): i is FeedItem => i !== null);
  }

  const atomEntries = asArray(doc?.feed?.entry);
  return atomEntries.map(fromAtom).filter((i): i is FeedItem => i !== null);
}
```

- [x] **Step 5: 테스트 실행해 통과 확인**

```bash
npm test
```

기대: 13개 PASS (kst 5 + rss 8).

- [x] **Step 6: 커밋**

```bash
git add supabase/functions/_shared/rss.ts test/rss.test.ts test/fixtures
git commit -m "feat: RSS 2.0/Atom 파서"
```

---

### Task 5: 고정 어휘 + 요약 응답 파서 (TDD)

Claude가 JSON을 돌려주지만 신뢰하지 않는다. 파싱 실패나 어휘 밖 태그는 조용히 버린다.

**Files:**
- Create: `supabase/functions/_shared/topics.ts`
- Create: `supabase/functions/_shared/summary.ts`
- Test: `test/summary.test.ts`

- [x] **Step 1: 고정 어휘 상수 작성**

```typescript
export const TOPICS = [
  'economy', 'finance', 'realestate', 'policy',
  'tech', 'ai', 'career', 'health',
  'parenting', 'living', 'culture', 'world',
] as const;

export type Topic = (typeof TOPICS)[number];

export function isTopic(v: string): v is Topic {
  return (TOPICS as readonly string[]).includes(v);
}
```

- [x] **Step 2: 실패하는 테스트 작성**

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSummary } from '../supabase/functions/_shared/summary.ts';

test('정상 JSON 을 파싱한다', () => {
  const r = parseSummary('{"summary":"세 문장 요약.","topics":["tech","ai"]}');
  assert.deepEqual(r, { summary: '세 문장 요약.', topics: ['tech', 'ai'] });
});

test('코드펜스로 감싼 JSON 도 파싱한다', () => {
  const r = parseSummary('```json\n{"summary":"요약","topics":["health"]}\n```');
  assert.deepEqual(r, { summary: '요약', topics: ['health'] });
});

test('어휘 밖 태그는 버린다', () => {
  const r = parseSummary('{"summary":"요약","topics":["tech","sports","ai"]}');
  assert.deepEqual(r?.topics, ['tech', 'ai']);
});

test('중복 태그는 하나로 접는다', () => {
  const r = parseSummary('{"summary":"요약","topics":["ai","ai","tech"]}');
  assert.deepEqual(r?.topics, ['ai', 'tech']);
});

test('JSON 이 아니면 null 을 준다', () => {
  assert.equal(parseSummary('죄송하지만 요약할 수 없습니다.'), null);
});

test('summary 가 비면 null 을 준다', () => {
  assert.equal(parseSummary('{"summary":"   ","topics":["tech"]}'), null);
});

test('topics 가 전부 어휘 밖이면 null 을 준다', () => {
  assert.equal(parseSummary('{"summary":"요약","topics":["sports"]}'), null);
});

test('topics 가 배열이 아니면 null 을 준다', () => {
  assert.equal(parseSummary('{"summary":"요약","topics":"tech"}'), null);
});
```

- [x] **Step 3: 테스트 실행해 실패 확인**

```bash
npm test
```

기대: `parseSummary`를 찾을 수 없다는 에러로 FAIL.

- [x] **Step 4: 구현**

```typescript
import { isTopic, type Topic } from './topics.ts';

export type Summary = { summary: string; topics: Topic[] };

/** 모델이 코드펜스로 감싸는 경우가 있어 첫 { 부터 마지막 } 까지만 떼어낸다. */
function extractJson(raw: string): string | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  return raw.slice(start, end + 1);
}

/**
 * 요약 응답을 파싱한다. 조금이라도 어긋나면 null 을 돌려준다 —
 * 호출자는 그 기사를 미요약 상태로 남겨 다음 날 재시도한다.
 */
export function parseSummary(raw: string): Summary | null {
  const json = extractJson(raw);
  if (!json) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const { summary, topics } = parsed as { summary?: unknown; topics?: unknown };

  if (typeof summary !== 'string' || summary.trim() === '') return null;
  if (!Array.isArray(topics)) return null;

  const clean = [...new Set(topics.filter((t): t is string => typeof t === 'string'))]
    .filter(isTopic);
  if (clean.length === 0) return null;

  return { summary: summary.trim(), topics: clean };
}
```

- [x] **Step 5: 테스트 실행해 통과 확인**

```bash
npm test
```

기대: 21개 PASS.

- [x] **Step 6: 커밋**

```bash
git add supabase/functions/_shared/topics.ts supabase/functions/_shared/summary.ts test/summary.test.ts
git commit -m "feat: 고정 어휘 + 요약 응답 파서"
```

---

### Task 6: 점수·선정 (TDD)

이 계획에서 유일하게 규칙이 얽히는 부분이다. 테스트를 촘촘히 쓴다.

**Files:**
- Create: `supabase/functions/_shared/scoring.ts`
- Test: `test/scoring.test.ts`

- [x] **Step 1: 실패하는 테스트 작성**

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ageBand, topicWeights, freshness, selectBriefing,
  type Profile, type Rule, type Candidate,
} from '../supabase/functions/_shared/scoring.ts';

const NOW = new Date('2026-08-22T00:00:00Z');

const profile: Profile = {
  userKey: 'u1',
  gender: 'male',
  birthYear: 1990,
  household: 'married',
  jobField: 'it',
  topics: ['ai'],
};

const rules: Rule[] = [
  { attribute: 'job_field', value: 'it', topic: 'tech', weight: 3 },
  { attribute: 'job_field', value: 'it', topic: 'ai', weight: 2 },
  { attribute: 'age_band', value: '30s', topic: 'finance', weight: 1 },
  { attribute: 'household', value: 'married', topic: 'realestate', weight: 1 },
  { attribute: 'job_field', value: 'medical', topic: 'health', weight: 5 },
];

function candidate(id: number, topics: string[], lang = 'ko', hoursAgo = 1): Candidate {
  return {
    id,
    topics,
    lang,
    publishedAt: new Date(NOW.getTime() - hoursAgo * 3_600_000),
  };
}

test('ageBand: 1990년생은 2026년에 30대', () => {
  assert.equal(ageBand(1990, NOW), '30s');
});

test('ageBand: 경계값 — 40년 차이는 40대', () => {
  assert.equal(ageBand(1986, NOW), '40s');
});

test('ageBand: 생년이 없으면 null', () => {
  assert.equal(ageBand(null, NOW), null);
});

test('topicWeights: 맞는 규칙만 합산한다', () => {
  const w = topicWeights(profile, rules, NOW);
  assert.equal(w.get('tech'), 3);
  assert.equal(w.get('finance'), 1);
  assert.equal(w.get('realestate'), 1);
  assert.equal(w.get('health'), undefined, '직업이 다른 규칙은 안 걸려야 한다');
});

test('topicWeights: 사용자가 직접 고른 토픽에 보너스가 더해진다', () => {
  const w = topicWeights(profile, rules, NOW);
  assert.equal(w.get('ai'), 3.5, '규칙 2 + 사용자 보너스 1.5');
});

test('freshness: 갓 나온 기사가 오래된 기사보다 높다', () => {
  assert.ok(freshness(new Date(NOW.getTime() - 3_600_000), NOW) >
            freshness(new Date(NOW.getTime() - 48 * 3_600_000), NOW));
});

test('freshness: 아주 오래되면 0 아래로 안 내려간다', () => {
  assert.equal(freshness(new Date('2020-01-01T00:00:00Z'), NOW), 0);
});

test('selectBriefing: 점수 높은 순으로 고른다', () => {
  const ids = selectBriefing(profile, rules, [
    candidate(1, ['culture']),
    candidate(2, ['tech']),
    candidate(3, ['ai']),
  ], NOW);
  assert.deepEqual(ids.slice(0, 2), [3, 2], 'ai(3.5) > tech(3) > culture(0)');
});

test('selectBriefing: 기본 6건까지만 고른다', () => {
  const many = Array.from({ length: 20 }, (_, i) => candidate(i + 1, ['tech']));
  assert.equal(selectBriefing(profile, rules, many, NOW).length <= 6, true);
});

test('selectBriefing: 한 토픽은 최대 2건까지만', () => {
  const ids = selectBriefing(profile, rules, [
    candidate(1, ['tech']), candidate(2, ['tech']),
    candidate(3, ['tech']), candidate(4, ['tech']),
    candidate(5, ['culture']), candidate(6, ['living']),
  ], NOW);
  const techCount = ids.filter((id) => id <= 4).length;
  assert.equal(techCount, 2);
});

test('selectBriefing: 해외 기사가 최소 1건 들어간다', () => {
  const ids = selectBriefing(profile, rules, [
    candidate(1, ['tech']), candidate(2, ['ai']),
    candidate(3, ['finance']), candidate(4, ['realestate']),
    candidate(5, ['culture']), candidate(6, ['living']),
    candidate(99, ['world'], 'en', 20),
  ], NOW);
  assert.ok(ids.includes(99), '점수가 낮아도 해외 1건은 보장된다');
});

test('selectBriefing: 해외 후보가 아예 없으면 국내로만 채운다', () => {
  const ids = selectBriefing(profile, rules, [
    candidate(1, ['tech']), candidate(2, ['ai']),
  ], NOW);
  assert.deepEqual(ids.slice().sort((a, b) => a - b), [1, 2]);
});

test('selectBriefing: 후보가 없으면 빈 배열', () => {
  assert.deepEqual(selectBriefing(profile, rules, [], NOW), []);
});

test('selectBriefing: 동점이면 id 순으로 결정론적이다', () => {
  const a = selectBriefing(profile, rules, [
    candidate(7, ['culture']), candidate(3, ['culture']), candidate(5, ['culture']),
  ], NOW);
  const b = selectBriefing(profile, rules, [
    candidate(5, ['culture']), candidate(7, ['culture']), candidate(3, ['culture']),
  ], NOW);
  assert.deepEqual(a, b);
});

test('selectBriefing: 자리가 남으면 해외 기사를 교체가 아니라 추가로 넣는다', () => {
  const ids = selectBriefing(profile, rules, [
    candidate(1, ['tech']),
    candidate(2, ['tech']),
    candidate(99, ['tech'], 'en', 20),
  ], NOW);
  assert.equal(ids.length, 3, '국내 2건이 밀려나면 안 된다');
  assert.ok(ids.includes(1) && ids.includes(2) && ids.includes(99));
});

test('selectBriefing: per-topic 상한에 막힌 해외 기사도 보장으로 들어간다', () => {
  const ids = selectBriefing(profile, rules, [
    candidate(1, ['tech']), candidate(2, ['tech']),
    candidate(3, ['ai']), candidate(4, ['ai']),
    candidate(5, ['finance']), candidate(6, ['realestate']),
    candidate(99, ['tech'], 'en', 20),
  ], NOW);
  assert.ok(ids.includes(99), 'tech 가 이미 2건이어도 해외 보장이 이긴다');
});
```

- [x] **Step 2: 테스트 실행해 실패 확인**

```bash
npm test
```

기대: `scoring.ts`를 찾을 수 없다는 에러로 FAIL.

- [x] **Step 3: 구현**

```typescript
export type Profile = {
  userKey: string;
  gender: string | null;
  birthYear: number | null;
  household: string;
  jobField: string;
  topics: string[];
};

export type Rule = {
  attribute: string;
  value: string;
  topic: string;
  weight: number;
};

export type Candidate = {
  id: number;
  topics: string[];
  lang: string;
  publishedAt: Date;
};

export const BRIEFING_SIZE = 6;
export const PER_TOPIC_MAX = 2;
const USER_TOPIC_BONUS = 1.5;
const FRESHNESS_MAX = 2;

/** 생년을 연령대 밴드로 바꾼다. profile_rules 의 age_band 값과 대응한다. */
export function ageBand(birthYear: number | null, now: Date): string | null {
  if (!birthYear) return null;
  const age = now.getUTCFullYear() - birthYear;
  if (age < 30) return '20s';
  if (age < 40) return '30s';
  if (age < 50) return '40s';
  return '50s+';
}

export function topicWeights(profile: Profile, rules: Rule[], now: Date): Map<string, number> {
  const attrs = new Map<string, string | null>([
    ['gender', profile.gender],
    ['age_band', ageBand(profile.birthYear, now)],
    ['household', profile.household],
    ['job_field', profile.jobField],
  ]);

  const weights = new Map<string, number>();
  for (const rule of rules) {
    if (attrs.get(rule.attribute) !== rule.value) continue;
    weights.set(rule.topic, (weights.get(rule.topic) ?? 0) + Number(rule.weight));
  }
  for (const topic of profile.topics) {
    weights.set(topic, (weights.get(topic) ?? 0) + USER_TOPIC_BONUS);
  }
  return weights;
}

/** 하루 지날 때마다 1점씩 깎이고 0 에서 멈춘다. */
export function freshness(publishedAt: Date, now: Date): number {
  const days = (now.getTime() - publishedAt.getTime()) / 86_400_000;
  return Math.max(0, FRESHNESS_MAX - days);
}

function score(c: Candidate, weights: Map<string, number>, now: Date): number {
  let s = 0;
  for (const topic of c.topics) s += weights.get(topic) ?? 0;
  return s + freshness(c.publishedAt, now);
}

/**
 * 오늘의 브리핑에 넣을 기사 id 를 고른다.
 * 규칙: 점수 내림차순 -> 한 토픽 최대 2건 -> 최대 size 건 -> 해외 최소 1건 보장.
 * 동점은 id 오름차순으로 깨서 같은 입력이면 늘 같은 결과가 나오게 한다.
 */
export function selectBriefing(
  profile: Profile,
  rules: Rule[],
  candidates: Candidate[],
  now: Date,
  size: number = BRIEFING_SIZE,
): number[] {
  const weights = topicWeights(profile, rules, now);
  const ranked = candidates
    .map((c) => ({ c, s: score(c, weights, now) }))
    .sort((a, b) => b.s - a.s || a.c.id - b.c.id);

  const picked: typeof ranked = [];
  const perTopic = new Map<string, number>();

  for (const r of ranked) {
    if (picked.length >= size) break;
    if (r.c.topics.some((t) => (perTopic.get(t) ?? 0) >= PER_TOPIC_MAX)) continue;
    picked.push(r);
    for (const t of r.c.topics) perTopic.set(t, (perTopic.get(t) ?? 0) + 1);
  }

  // 해외 최소 1건 보장 — 차별점이 점수에 밀려 사라지지 않게 강제한다.
  // 이 규칙은 per-topic 상한보다 우선한다(보장이 상한에 막히면 보장이 아니게 된다).
  if (picked.length > 0 && !picked.some((r) => r.c.lang === 'en')) {
    const bestEn = ranked.find((r) => r.c.lang === 'en');
    if (bestEn) {
      // 자리가 남았으면 국내 기사를 밀어내지 않고 그냥 채운다.
      if (picked.length < size) picked.push(bestEn);
      else picked[picked.length - 1] = bestEn;
    }
  }

  return picked.map((r) => r.c.id);
}
```

- [x] **Step 4: 테스트 실행해 통과 확인**

```bash
npm test
```

기대: 37개 PASS.

- [x] **Step 5: 커밋**

```bash
git add supabase/functions/_shared/scoring.ts test/scoring.test.ts
git commit -m "feat: 개인화 점수·선정 규칙"
```

---

### Task 7: 수집 Edge Function

**Files:**
- Create: `supabase/functions/collect/index.ts`

- [ ] **Step 1: 구현**

```typescript
import { createClient } from '@supabase/supabase-js';
import { parseFeed } from '../_shared/rss.ts';

const MAX_AGE_MS = 3 * 86_400_000;   // 3일보다 오래된 항목은 안 담는다
const EXCERPT_MAX = 2000;

Deno.serve(async () => {
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: sources, error } = await db
    .from('sources').select('id,name,feed_url,lang,topics').eq('enabled', true);
  if (error) return new Response(error.message, { status: 500 });

  const now = Date.now();
  let inserted = 0;
  const failures: string[] = [];

  for (const s of sources ?? []) {
    // 한 소스가 죽어도 나머지는 계속 돈다.
    try {
      const res = await fetch(s.feed_url, {
        headers: { 'user-agent': 'morning-brief/1.0 (+https://github.com/Goospel/morning-brief)' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const rows = parseFeed(await res.text())
        .filter((i) => now - i.publishedAt.getTime() < MAX_AGE_MS)
        .map((i) => ({
          source_id: s.id,
          url: i.url,
          title: i.title,
          published_at: i.publishedAt.toISOString(),
          lang: s.lang,
          raw_excerpt: i.excerpt.slice(0, EXCERPT_MAX),
          topics: s.topics,
        }));

      if (rows.length === 0) continue;

      const { data, error: upsertError } = await db
        .from('articles')
        .upsert(rows, { onConflict: 'url', ignoreDuplicates: true })
        .select('id');
      if (upsertError) throw upsertError;
      inserted += data?.length ?? 0;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failures.push(`${s.name}: ${msg}`);
      console.error(`source ${s.id} ${s.name} failed: ${msg}`);
    }
  }

  return Response.json({ sources: sources?.length ?? 0, inserted, failures });
});
```

- [ ] **Step 2: 로컬에서 실행해 확인**

Task 11의 소스 시드가 아직 없으면 0건이 정상이다. 함수가 뜨는지만 본다.

```bash
npx supabase functions serve collect --no-verify-jwt
```

다른 터미널에서:

```bash
curl -s http://127.0.0.1:54321/functions/v1/collect
```

기대: `{"sources":0,"inserted":0,"failures":[]}` 형태의 JSON.

- [ ] **Step 3: 커밋**

```bash
git add supabase/functions/collect/index.ts
git commit -m "feat: RSS 수집 Edge Function"
```

---

### Task 8: 요약 제출 Edge Function

**Files:**
- Create: `supabase/functions/summarize-submit/index.ts`

- [ ] **Step 1: 구현**

```typescript
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { TOPICS } from '../_shared/topics.ts';

const BATCH_MAX = 500;

const SYSTEM = `당신은 한국어 뉴스 요약가다. 입력된 기사(한국어 또는 영어)를 읽고 JSON만 출력한다.

출력 형식:
{"summary": "한국어 요약", "topics": ["태그", ...]}

규칙:
- 요약은 한국어 3~5문장. 영어 기사도 한국어로 옮겨 요약한다.
- 원문 문장을 그대로 옮기지 말고 자기 말로 요약한다.
- topics 는 다음 목록에서만 1~3개 고른다: ${TOPICS.join(', ')}
- JSON 외의 텍스트는 출력하지 않는다.`;

Deno.serve(async () => {
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: pending, error } = await db
    .from('articles')
    .select('id,title,raw_excerpt')
    .is('summary_ko', null)
    .order('published_at', { ascending: false })
    .limit(BATCH_MAX);
  if (error) return new Response(error.message, { status: 500 });
  if (!pending || pending.length === 0) return Response.json({ submitted: 0 });

  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

  const batch = await anthropic.messages.batches.create({
    requests: pending.map((a) => ({
      custom_id: String(a.id),
      params: {
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        system: SYSTEM,
        messages: [{
          role: 'user' as const,
          content: `제목: ${a.title}\n\n본문 발췌:\n${a.raw_excerpt ?? '(발췌 없음)'}`,
        }],
      },
    })),
  });

  const { error: insertError } = await db.from('summary_batches').insert({
    batch_id: batch.id,
    article_ids: pending.map((a) => a.id),
  });
  if (insertError) return new Response(insertError.message, { status: 500 });

  return Response.json({ submitted: pending.length, batch_id: batch.id });
});
```

- [ ] **Step 2: 커밋**

```bash
git add supabase/functions/summarize-submit/index.ts
git commit -m "feat: Claude Batch API 요약 제출 잡"
```

---

### Task 9: 요약 수집 Edge Function

**Files:**
- Create: `supabase/functions/summarize-collect/index.ts`

- [ ] **Step 1: 구현**

```typescript
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { parseSummary } from '../_shared/summary.ts';

Deno.serve(async () => {
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: open, error } = await db
    .from('summary_batches').select('id,batch_id').eq('status', 'submitted');
  if (error) return new Response(error.message, { status: 500 });

  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });
  let updated = 0;
  let stillRunning = 0;

  for (const b of open ?? []) {
    const info = await anthropic.messages.batches.retrieve(b.batch_id);
    if (info.processing_status !== 'ended') {
      stillRunning++;
      continue;
    }

    const now = new Date().toISOString();
    // 결과는 순서가 보장되지 않는다 — custom_id 로만 짝을 짓는다.
    for await (const entry of await anthropic.messages.batches.results(b.batch_id)) {
      if (entry.result.type !== 'succeeded') continue;

      const block = entry.result.message.content.find((c) => c.type === 'text');
      if (!block || block.type !== 'text') continue;

      const parsed = parseSummary(block.text);
      if (!parsed) continue;   // 파싱 실패는 미요약으로 남겨 다음 날 재시도한다

      const { error: updateError } = await db.from('articles').update({
        summary_ko: parsed.summary,
        topics: parsed.topics,
        summarized_at: now,
      }).eq('id', Number(entry.custom_id));
      if (!updateError) updated++;
    }

    await db.from('summary_batches')
      .update({ status: 'done', completed_at: now })
      .eq('id', b.id);
  }

  return Response.json({ updated, stillRunning });
});
```

- [ ] **Step 2: 커밋**

```bash
git add supabase/functions/summarize-collect/index.ts
git commit -m "feat: Batch 결과 수거·반영 잡"
```

---

### Task 10: 배달 Edge Function

**Files:**
- Create: `supabase/functions/deliver/index.ts`

- [ ] **Step 1: 구현**

```typescript
import { createClient } from '@supabase/supabase-js';
import { kstHour, kstDateString } from '../_shared/kst.ts';
import { selectBriefing, type Candidate, type Profile, type Rule } from '../_shared/scoring.ts';

const CANDIDATE_WINDOW_MS = 3 * 86_400_000;   // 후보는 최근 3일치
const DEDUPE_DAYS = 7;                         // 최근 7일에 보낸 건 다시 안 보낸다

Deno.serve(async () => {
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const now = new Date();
  const hour = kstHour(now);
  const today = kstDateString(now);

  const { data: profiles, error } = await db
    .from('profiles')
    .select('user_key,gender,birth_year,household,job_field,topics')
    .eq('push_on', true)
    .eq('push_hour', hour);
  if (error) return new Response(error.message, { status: 500 });
  if (!profiles || profiles.length === 0) return Response.json({ hour, delivered: 0 });

  const { data: rules } = await db
    .from('profile_rules').select('attribute,value,topic,weight');

  const { data: articles } = await db
    .from('articles')
    .select('id,topics,lang,published_at')
    .not('summary_ko', 'is', null)
    .gte('published_at', new Date(now.getTime() - CANDIDATE_WINDOW_MS).toISOString());

  const pool: Candidate[] = (articles ?? []).map((a) => ({
    id: a.id,
    topics: a.topics ?? [],
    lang: a.lang,
    publishedAt: new Date(a.published_at),
  }));

  const since = kstDateString(new Date(now.getTime() - DEDUPE_DAYS * 86_400_000));
  let delivered = 0;

  for (const p of profiles) {
    const { data: recent } = await db
      .from('briefings').select('article_ids').eq('user_key', p.user_key).gte('date', since);
    const seen = new Set((recent ?? []).flatMap((r) => r.article_ids as number[]));

    const profile: Profile = {
      userKey: p.user_key,
      gender: p.gender,
      birthYear: p.birth_year,
      household: p.household,
      jobField: p.job_field,
      topics: p.topics ?? [],
    };

    const ids = selectBriefing(
      profile,
      (rules ?? []) as Rule[],
      pool.filter((c) => !seen.has(c.id)),
      now,
    );
    if (ids.length === 0) continue;

    // 복합 PK 덕분에 같은 날 두 번 돌아도 덮어쓰지 않는다.
    const { error: upsertError } = await db.from('briefings').upsert(
      { user_key: p.user_key, date: today, article_ids: ids },
      { onConflict: 'user_key,date', ignoreDuplicates: true },
    );
    if (!upsertError) delivered++;
  }

  return Response.json({ hour, date: today, targets: profiles.length, delivered });
});
```

- [ ] **Step 2: 커밋**

```bash
git add supabase/functions/deliver/index.ts
git commit -m "feat: 브리핑 배달 잡 (점수 계산 + briefings 확정)"
```

---

### Task 11: 소스 시드 (검증 후 등록)

피드 URL은 **실제로 열어보기 전엔 살아 있는지 알 수 없다.** 후보를 스크립트로 검증하고 통과한 것만 시드에 넣는다.

**Files:**
- Create: `scripts/verify-feeds.mjs`
- Create: `supabase/migrations/0003_seed_sources.sql`

- [ ] **Step 1: 검증 스크립트 작성**

```javascript
// 후보 피드를 실제로 받아 파싱까지 되는지 확인한다.
// 통과한 줄만 골라 0003_seed_sources.sql 에 옮긴다.
import { XMLValidator } from 'fast-xml-parser';

const CANDIDATES = [
  // name, feed_url, lang, topics
  ['BBC World',        'http://feeds.bbci.co.uk/news/world/rss.xml',        'en', ['world']],
  ['BBC Technology',   'http://feeds.bbci.co.uk/news/technology/rss.xml',   'en', ['tech']],
  ['BBC Business',     'http://feeds.bbci.co.uk/news/business/rss.xml',     'en', ['economy']],
  ['TechCrunch',       'https://techcrunch.com/feed/',                      'en', ['tech', 'ai']],
  ['Ars Technica',     'https://feeds.arstechnica.com/arstechnica/index',   'en', ['tech']],
  ['Hacker News',      'https://hnrss.org/frontpage',                       'en', ['tech']],
  ['한겨레',            'https://www.hani.co.kr/rss/',                       'ko', ['policy']],
  ['연합뉴스',          'https://www.yna.co.kr/rss/news.xml',                'ko', ['policy']],
  ['한국경제',          'https://www.hankyung.com/feed/economy',             'ko', ['economy']],
  ['ZDNet Korea',      'https://feeds.feedburner.com/zdkorea',              'ko', ['tech']],
];

const ok = [];
for (const [name, url, lang, topics] of CANDIDATES) {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'morning-brief/1.0' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const valid = XMLValidator.validate(xml);
    if (valid !== true) throw new Error(`invalid XML: ${valid.err.msg}`);
    const items = (xml.match(/<item[\s>]/g)?.length ?? 0) + (xml.match(/<entry[\s>]/g)?.length ?? 0);
    if (items === 0) throw new Error('항목 0건');
    console.log(`  OK   ${name} (${items}건)`);
    ok.push([name, url, lang, topics]);
  } catch (e) {
    console.log(`  FAIL ${name} — ${e.message}`);
  }
}

console.log(`\n통과 ${ok.length}/${CANDIDATES.length}. 아래를 0003_seed_sources.sql 에 넣는다:\n`);
console.log('insert into sources (name, feed_url, lang, topics) values');
console.log(ok.map(([n, u, l, t]) =>
  `  (${q(n)}, ${q(u)}, ${q(l)}, array[${t.map(q).join(', ')}])`).join(',\n') + ';');

function q(s) { return `'${String(s).replace(/'/g, "''")}'`; }
```

- [ ] **Step 2: 검증 실행**

```bash
npm run verify-feeds
```

기대: 각 후보에 `OK` 또는 `FAIL`이 찍히고, 마지막에 붙여넣을 SQL이 출력된다. **FAIL한 것은 시드에 넣지 않는다** — 죽은 URL을 시드에 넣으면 수집 잡이 매일 조용히 실패한다.

- [ ] **Step 3: 통과분으로 마이그레이션 작성**

Step 2 출력의 `insert into sources ...` 블록을 그대로 `supabase/migrations/0003_seed_sources.sql`에 붙여넣는다. 파일 첫 줄에 주석을 단다:

```sql
-- verify-feeds 를 통과한 피드만 등록한다.
-- 소스를 늘릴 때도 npm run verify-feeds 를 먼저 돌린다.
```

- [ ] **Step 4: 적용 확인**

```bash
npx supabase db reset
docker exec -i $(docker ps --format '{{.Names}}' | grep supabase_db | head -1) psql -U postgres -c "select count(*), lang from sources group by lang"
```

기대: `ko`와 `en`이 각각 1건 이상.

- [ ] **Step 5: 커밋**

```bash
git add scripts/verify-feeds.mjs supabase/migrations/0003_seed_sources.sql
git commit -m "feat: 피드 검증 스크립트 + 소스 시드"
```

---

### Task 12: 규칙 시드

**Files:**
- Create: `supabase/migrations/0002_seed_rules.sql`

- [ ] **Step 1: 마이그레이션 작성**

```sql
-- 프로필 속성 -> topic 가중치 초기값.
-- 튜닝은 코드 배포 없이 이 테이블을 갱신해서 한다.
insert into profile_rules (attribute, value, topic, weight) values
  -- 직업 분야
  ('job_field', 'it',            'tech',       3),
  ('job_field', 'it',            'ai',         3),
  ('job_field', 'it',            'career',     1),
  ('job_field', 'finance',       'finance',    3),
  ('job_field', 'finance',       'economy',    3),
  ('job_field', 'finance',       'policy',     1),
  ('job_field', 'medical',       'health',     3),
  ('job_field', 'medical',       'policy',     1),
  ('job_field', 'edu',           'parenting',  3),
  ('job_field', 'edu',           'policy',     2),
  ('job_field', 'public',        'policy',     3),
  ('job_field', 'public',        'economy',    1),
  ('job_field', 'manufacturing', 'economy',    2),
  ('job_field', 'manufacturing', 'world',      2),
  ('job_field', 'service',       'living',     2),
  ('job_field', 'service',       'economy',    1),
  ('job_field', 'etc',           'living',     1),

  -- 연령대
  ('age_band',  '20s',           'career',     2),
  ('age_band',  '20s',           'culture',    2),
  ('age_band',  '30s',           'finance',    2),
  ('age_band',  '30s',           'realestate', 2),
  ('age_band',  '40s',           'realestate', 2),
  ('age_band',  '40s',           'health',     1),
  ('age_band',  '50s+',          'health',     3),
  ('age_band',  '50s+',          'policy',     1),

  -- 가구 형태
  ('household', 'single',        'living',     2),
  ('household', 'single',        'culture',    1),
  ('household', 'married',       'realestate', 2),
  ('household', 'married',       'finance',    1),
  ('household', 'with_kids',     'parenting',  3),
  ('household', 'with_kids',     'health',     1);
```

성별 규칙은 넣지 않는다 — 성별로 관심사를 가르는 건 근거가 약하고 오히려 편향을 만든다. `gender` 속성 자체는 스키마에 남겨 두되 규칙은 비워 둔다.

- [ ] **Step 2: 적용 확인**

```bash
npx supabase db reset
docker exec -i $(docker ps --format '{{.Names}}' | grep supabase_db | head -1) psql -U postgres -c "select attribute, count(*) from profile_rules group by attribute"
```

기대: `job_field` 17, `age_band` 8, `household` 6.

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/0002_seed_rules.sql
git commit -m "feat: 프로필 규칙 시드"
```

---

### Task 13: 크론 등록

**Files:**
- Create: `supabase/migrations/0004_cron.sql`

- [ ] **Step 1: 마이그레이션 작성**

시크릿을 SQL에 하드코딩하지 않고 Vault에서 읽는다.

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Vault 에 넣어 둔 값을 읽어 Edge Function 을 호출한다.
-- 사전 준비(1회):
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1', 'functions_base_url');
--   select vault.create_secret('<service_role_key>', 'service_role_key');
create or replace function public.invoke_job(job text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  base text;
  key  text;
begin
  select decrypted_secret into base from vault.decrypted_secrets where name = 'functions_base_url';
  select decrypted_secret into key  from vault.decrypted_secrets where name = 'service_role_key';
  if base is null or key is null then
    raise exception 'vault secrets missing: functions_base_url / service_role_key';
  end if;

  perform net.http_post(
    url     := base || '/' || job,
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || key,
                 'Content-Type',  'application/json'
               ),
    body    := '{}'::jsonb
  );
end;
$$;

-- 크론은 UTC 로 돈다. KST = UTC + 9.
select cron.schedule('collect',           '0 18 * * *',   $$select public.invoke_job('collect')$$);
select cron.schedule('summarize-submit',  '0 19 * * *',   $$select public.invoke_job('summarize-submit')$$);
select cron.schedule('summarize-collect', '*/20 * * * *', $$select public.invoke_job('summarize-collect')$$);
select cron.schedule('deliver',           '0 * * * *',    $$select public.invoke_job('deliver')$$);
```

KST 03:00 = UTC 18:00(전날), KST 04:00 = UTC 19:00(전날). 배달은 매시 정각에 돌며 함수 안에서 `push_hour`로 대상자를 거른다.

- [ ] **Step 2: 로컬 적용 확인**

```bash
npx supabase db reset
docker exec -i $(docker ps --format '{{.Names}}' | grep supabase_db | head -1) psql -U postgres -c "select jobname, schedule from cron.job order by jobname"
```

기대: 4건이 보인다. 로컬에는 Vault 시크릿이 없으므로 실제 호출은 실패하는 게 정상이다 — 등록 자체만 확인한다.

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/0004_cron.sql
git commit -m "feat: pg_cron 스케줄 4건 + Vault 기반 호출 헬퍼"
```

---

### Task 14: 통합 확인 + 문서 sweep

**Files:**
- Modify: `plan.md`
- Modify: `changeLog.md`
- Modify: `docs/superpowers/specs/2026-08-22-personal-briefing-design.md`

- [ ] **Step 1: 전체 테스트 실행**

```bash
npm test
```

기대: 35개 PASS, 0 FAIL.

- [ ] **Step 2: 수집 → 요약 → 배달을 로컬에서 한 바퀴 돌린다**

`.env.local`에 `ANTHROPIC_API_KEY`를 넣고:

```bash
npx supabase functions serve --env-file .env.local --no-verify-jwt
```

다른 터미널에서 순서대로:

```bash
curl -s http://127.0.0.1:54321/functions/v1/collect
curl -s http://127.0.0.1:54321/functions/v1/summarize-submit
```

Batch가 끝날 때까지 기다린 뒤(수 분~수 시간):

```bash
curl -s http://127.0.0.1:54321/functions/v1/summarize-collect
```

테스트 프로필을 넣고 배달을 확인한다:

```bash
docker exec -i $(docker ps --format '{{.Names}}' | grep supabase_db | head -1) psql -U postgres -c "insert into profiles (user_key, gender, birth_year, household, job_field, topics, push_hour) values ('test-user', null, 1990, 'married', 'it', array['ai'], extract(hour from (now() at time zone 'Asia/Seoul'))::int)"
curl -s http://127.0.0.1:54321/functions/v1/deliver
docker exec -i $(docker ps --format '{{.Names}}' | grep supabase_db | head -1) psql -U postgres -c "select user_key, date, array_length(article_ids,1) as n from briefings"
```

기대: `n`이 1 이상. 이 숫자가 이 계획의 최종 성공 기준이다.

- [ ] **Step 3: 설계 스펙에 변경점 5가지 반영**

`docs/superpowers/specs/2026-08-22-personal-briefing-design.md`를 고친다:
- 3절 아키텍처: 요약 잡을 `summarize-submit` / `summarize-collect` 2단계로 수정
- 4절 데이터 모델: `summary_batches` 테이블 추가, RLS 전면 차단 명시
- 5절: "순수 SQL 점수 계산" → "SQL 로 후보를 좁히고 점수·선정은 TypeScript 순수 함수"
- 6절: "프롬프트 캐싱으로 추가 절감" 문장 삭제 (최소 프리픽스 미달로 캐시가 안 걸린다)
- 9절: 요약 잡 테스트를 "LLM 목킹" → "응답 파서 단위 테스트 + 실제 한 바퀴 실행"으로 수정

- [ ] **Step 4: plan.md 갱신**

Phase 2~5의 체크박스를 완료(`[x]`)로 바꾸고, Phase 6(프런트)을 🔜로 올린다.

- [ ] **Step 5: changeLog.md 갱신**

맨 위에 항목을 추가한다:

```markdown
## 2026-08-22 · 백엔드 파이프라인 (수집·요약·배달)

**의도**: 브리핑이 매일 자동으로 쌓이는 상태를 만든다. 프런트가 붙기 전에 데이터가 먼저 있어야 한다.

**결과**: Edge Function 4개(수집 / 요약 제출 / 요약 수거 / 배달)와 pg_cron 스케줄을 붙였다. 순수 로직은 런타임 중립 모듈로 떼어 `node --test`로 검증했다 — 테스트 프레임워크를 하나도 추가하지 않았다.

구현하며 스펙에서 바꾼 것 넷: 요약 잡 2단계 분할(Batch 비동기 + 함수 실행시간 제한), 점수 계산을 SQL에서 TS로(테스트 용이성), RLS 전면 차단(토스 로그인이 Supabase Auth가 아니라 userKey를 신뢰할 수 없다), 프롬프트 캐싱 제거(시스템 프롬프트가 최소 캐시 프리픽스에 못 미쳐 조용히 캐시되지 않는다).
```

- [ ] **Step 6: 커밋과 PR**

한글 커밋 메시지는 인라인 `-m`이 CP949로 깨지므로 파일 경유로 넣는다.

```bash
cat > .commit-msg-tmp <<'EOF'
문서: 백엔드 파이프라인 완료 반영 + 스펙 변경점 5건
EOF
git add plan.md changeLog.md docs/superpowers/specs/2026-08-22-personal-briefing-design.md
git commit -F .commit-msg-tmp
rm .commit-msg-tmp
git push -u origin feat/backend-pipeline
```

PR 본문도 파일 경유로 만든다. `<실제 출력>` 자리에는 **직접 돌린 명령의 실제 출력**을 넣는다 — 짐작해서 쓰지 않는다.

```bash
cat > /tmp/pr-body.md <<'EOF'
## 무엇을

수집 → 요약 → 배달 백엔드 파이프라인. Edge Function 4개 + pg_cron 스케줄 4건.

## 검증

- `npm test` — <실제 출력: pass N / fail N>
- 로컬 한 바퀴 실행 후 `briefings` 행 수 — <실제 출력>
- 소스 시드는 `npm run verify-feeds` 통과분만 등록 — <통과 N / 후보 M>

## 스펙에서 바꾼 것 5건

계획 문서 상단 「설계 스펙 대비 변경점」 참조. 스펙 문서에도 반영했다.
EOF
gh pr create --base main --title "백엔드 파이프라인: 수집·요약·배달" --body-file /tmp/pr-body.md
rm /tmp/pr-body.md
```

- [ ] **Step 7: 머지 확인 요청**

PR을 올린 뒤 **머지 여부를 사용자에게 묻고 멈춘다.** 선제 머지하지 않는다.

---

## 주의점

- **Batch 결과는 순서가 보장되지 않는다.** 반드시 `custom_id`로 짝을 짓는다. 배열 인덱스로 맞추면 조용히 엉뚱한 기사에 요약이 붙는다.
- **한 소스의 실패가 전체를 멈추면 안 된다.** 수집 잡의 `try/catch`를 루프 **안**에 둔다.
- **요약 실패는 재시도 큐를 만들지 않는다.** `summary_ko`를 NULL로 남기면 다음 날 제출 잡이 자동으로 다시 집는다. 이게 재시도 로직이다.
- **`npx supabase db reset`은 로컬 DB를 통째로 지운다.** 로컬 개발 DB에서만 쓴다.
- **로컬 Docker 컨테이너 이름**은 프로젝트 디렉터리명에서 온다. `supabase_db_morning-brief`가 아닐 수 있으니 `docker ps --format '{{.Names}}' | grep supabase_db`로 확인한다.
