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
