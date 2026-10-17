-- ============================================================
-- wooz-trip (여행 루트) — 초기 스키마
-- 기존 z-labs 공용 Supabase 프로젝트를 쓴다 → 모든 테이블·함수에 wooz_trip_ 프리픽스.
-- 컨벤션(toto 계승): snake_case · 시각은 timestamptz · *_ts 컬럼명 · RLS 필수.
-- 여러 번 실행해도 안전하도록 if not exists / drop policy if exists 를 쓴다.
-- ============================================================

-- ─────────────────────────────────────────────
-- 공용: updated_ts 자동 갱신
-- ─────────────────────────────────────────────
create or replace function wooz_trip_touch_updated()
returns trigger language plpgsql as $$
begin
  new.updated_ts := now();
  return new;
end $$;

-- ─────────────────────────────────────────────
-- kid_tags: 아이 태그 목록 (코드에 박지 않고 DB로 관리)
-- ─────────────────────────────────────────────
create table if not exists wooz_trip_kid_tags (
  id          text primary key,             -- baby_chair 등
  label       text not null,                -- 아기의자
  filterable  boolean not null default true, -- 장소 선택 필터 칩에 노출
  sort_order  integer not null default 0,
  active      boolean not null default true
);

-- ─────────────────────────────────────────────
-- places: 검수된 장소 DB
-- 위치는 lat/lng 숫자 컬럼. MVP 규모(300곳)는 코드에서 거리 계산 → PostGIS 불필요.
-- 리뷰·사진·별점은 저장하지 않는다 (external_links 로 원본 연결만).
-- ─────────────────────────────────────────────
create table if not exists wooz_trip_places (
  id                   bigint generated always as identity primary key,
  name                 text not null,
  category             text not null check (category in ('food','sight','cafe','stay')),
  sub_category         text,                   -- 고기국수, 해변 등
  address              text,
  lat                  double precision not null,
  lng                  double precision not null,
  region               text not null,          -- jeju-west | jeju-east | jeju-south | jeju-city
  phone                text,
  source_provider      text check (source_provider in ('kakao','naver','tourapi','manual')),
  source_external_id   text,
  opening_hours        jsonb,                  -- {"all":{"open":"10:00","close":"21:00","lastOrder":"20:30"},"6":{...}}
  regular_closed_days  smallint[] not null default '{}',  -- 0=일 … 6=토
  kid_tags             text[] not null default '{}',
  indoor               boolean not null default false,
  intro                text,                   -- 운영자 검수 소개 문장
  status               text not null default 'candidate' check (status in ('candidate','approved','excluded')),
  verified_ts          timestamptz,
  external_links       jsonb not null default '{}'::jsonb,  -- {"map":"https://...","blog":"https://..."}
  is_sample            boolean not null default false,      -- 개발용 가짜 데이터 표시
  created_ts           timestamptz not null default now(),
  updated_ts           timestamptz not null default now(),
  unique (source_provider, source_external_id)
);
create index if not exists wooz_trip_places_status_region_idx on wooz_trip_places (status, region);
create index if not exists wooz_trip_places_kid_tags_idx on wooz_trip_places using gin (kid_tags);
drop trigger if exists wooz_trip_places_touch on wooz_trip_places;
create trigger wooz_trip_places_touch before update on wooz_trip_places
  for each row execute function wooz_trip_touch_updated();

-- ─────────────────────────────────────────────
-- trips: 사용자 루트. 일자·슬롯은 days jsonb 하나로 저장
-- (드래그 순서 변경·복사가 단순해진다. 장소 ID 검증은 서버 코드에서)
-- id 는 uuid → URL 로 남의 루트를 순서대로 넘겨볼 수 없다.
-- ─────────────────────────────────────────────
create table if not exists wooz_trip_trips (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  title           text not null,
  region          text not null,
  start_date      date not null,
  end_date        date not null,
  arrival_time    text,               -- 'HH:MM' 제주 현지 시각
  departure_time  text,
  companion_type  text not null check (companion_type in ('kids','parents','couple','friends')),
  kids_ages       smallint[] not null default '{}',
  stay_name       text,
  stay_lat        double precision,
  stay_lng        double precision,
  days            jsonb not null default '[]'::jsonb,
  author_name     text,               -- 공개 등록 시 보여줄 이름
  author_tip      text,               -- 공개 등록 시 작성자 팁
  visibility      text not null default 'private' check (visibility in ('private','shared','public')),
  share_id        text unique,        -- 가족 공유 링크 /s/:share_id
  copied_from     uuid references wooz_trip_trips(id) on delete set null,
  copy_count      integer not null default 0,
  ai_route_id     bigint,             -- 마지막으로 꺼내 쓴 AI 루트 (다시 누르면 다른 루트를 고르려고)
  published_ts    timestamptz,
  created_ts      timestamptz not null default now(),
  updated_ts      timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists wooz_trip_trips_owner_idx on wooz_trip_trips (owner_id, updated_ts desc);
create index if not exists wooz_trip_trips_public_idx on wooz_trip_trips (visibility, companion_type, copy_count desc);
drop trigger if exists wooz_trip_trips_touch on wooz_trip_trips;
create trigger wooz_trip_trips_touch before update on wooz_trip_trips
  for each row execute function wooz_trip_touch_updated();

-- 이미 만든 테이블에 나중에 추가된 컬럼 (다시 실행해도 안전)
alter table wooz_trip_trips add column if not exists ai_route_id bigint;

-- ─────────────────────────────────────────────
-- ai_routes: 미리 LLM으로 만들어 둔 추천 루트 (서비스에서는 API 키 없이 꺼내 쓴다)
--  "AI 초안" 버튼 → 지역·동행·일수가 맞는 루트를 골라 빈 슬롯에 넣고,
--  사용자 날짜 기준으로 휴무·영업시간을 다시 검사한다 (src/lib/ai/routes.js)
--  days 형식: [{ "slots": [{ "slot":"am", "place":"sample-11" | 12, "reason":"..." }] }]
--    place 는 장소 id(숫자) 또는 source_external_id(문자열)
--  데이터는 data/ai-routes/*.json → node scripts/gen_ai_routes_sql.mjs 로 만든 SQL 로 넣는다
-- ─────────────────────────────────────────────
create table if not exists wooz_trip_ai_routes (
  id              bigint generated always as identity primary key,
  code            text not null unique,          -- 사람이 읽는 고유 이름 (west-kids-3d-a). 다시 넣으면 덮어쓴다
  title           text not null,
  summary         text,
  region          text not null,
  companion_type  text not null check (companion_type in ('kids','parents','couple','friends')),
  day_count       smallint not null check (day_count between 1 and 7),
  kid_age_min     smallint,
  kid_age_max     smallint,
  tags            text[] not null default '{}',  -- indoor, beach, rainy 등 자유 태그
  days            jsonb not null,
  is_active       boolean not null default true,
  pick_count      integer not null default 0,    -- 사용자에게 꺼내 준 횟수
  source          text not null default 'llm',
  created_ts      timestamptz not null default now(),
  updated_ts      timestamptz not null default now()
);
create index if not exists wooz_trip_ai_routes_match_idx on wooz_trip_ai_routes (is_active, region, companion_type, day_count);
drop trigger if exists wooz_trip_ai_routes_touch on wooz_trip_ai_routes;
create trigger wooz_trip_ai_routes_touch before update on wooz_trip_ai_routes
  for each row execute function wooz_trip_touch_updated();

-- ─────────────────────────────────────────────
-- travel_cache: 장소 쌍별 이동시간 캐시 (길찾기 API 붙일 때 사용)
-- ─────────────────────────────────────────────
create table if not exists wooz_trip_travel_cache (
  id             bigint generated always as identity primary key,
  from_place_id  bigint not null references wooz_trip_places(id) on delete cascade,
  to_place_id    bigint not null references wooz_trip_places(id) on delete cascade,
  mode           text not null default 'car',
  minutes        integer not null,
  distance_m     integer,
  source         text not null default 'estimate',   -- estimate | kakao | tmap
  fetched_ts     timestamptz not null default now(),
  unique (from_place_id, to_place_id, mode)
);

-- ─────────────────────────────────────────────
-- reports: 사용자 제보 (휴무·정보 변경·아이 태그)
-- ─────────────────────────────────────────────
create table if not exists wooz_trip_reports (
  id           bigint generated always as identity primary key,
  place_id     bigint not null references wooz_trip_places(id) on delete cascade,
  trip_id      uuid references wooz_trip_trips(id) on delete set null,
  user_id      uuid not null references auth.users(id) on delete cascade,
  type         text not null check (type in ('closed','info','tag')),
  payload      jsonb not null default '{}'::jsonb,  -- {"tags":["baby_chair"]} 등
  message      text,
  status       text not null default 'pending' check (status in ('pending','applied','rejected')),
  created_ts   timestamptz not null default now(),
  resolved_ts  timestamptz
);
create index if not exists wooz_trip_reports_status_idx on wooz_trip_reports (status, created_ts desc);

-- ─────────────────────────────────────────────
-- events: MVP 지표 (루트 완성률·복사율·공유 수·제보 수)
-- ─────────────────────────────────────────────
create table if not exists wooz_trip_events (
  id          bigint generated always as identity primary key,
  name        text not null,
  user_id     uuid,
  trip_id     uuid,
  meta        jsonb not null default '{}'::jsonb,
  created_ts  timestamptz not null default now()
);
create index if not exists wooz_trip_events_name_idx on wooz_trip_events (name, created_ts desc);

-- ============================================================
-- RLS
--  - kid_tags / places(approved): 누구나 읽기, 쓰기는 service_role(관리자 서버 코드)만
--  - trips: 본인 것 읽기·쓰기 + 공개(public) 루트는 누구나 읽기
--           가족 공유(shared) 링크는 서버가 service_role 로 share_id 조회 (목록 노출 방지)
--  - reports: 로그인 사용자가 본인 명의로만 작성, 본인 것만 읽기
--  - travel_cache / events / ai_routes: 정책 없음 → service_role 만 접근
-- ============================================================
alter table wooz_trip_kid_tags     enable row level security;
alter table wooz_trip_places       enable row level security;
alter table wooz_trip_trips        enable row level security;
alter table wooz_trip_travel_cache enable row level security;
alter table wooz_trip_reports      enable row level security;
alter table wooz_trip_events       enable row level security;
alter table wooz_trip_ai_routes    enable row level security;

drop policy if exists wooz_trip_kid_tags_read on wooz_trip_kid_tags;
create policy wooz_trip_kid_tags_read on wooz_trip_kid_tags
  for select to anon, authenticated using (true);

drop policy if exists wooz_trip_places_read on wooz_trip_places;
create policy wooz_trip_places_read on wooz_trip_places
  for select to anon, authenticated using (status = 'approved');

drop policy if exists wooz_trip_trips_read on wooz_trip_trips;
create policy wooz_trip_trips_read on wooz_trip_trips
  for select to anon, authenticated
  using (visibility = 'public' or owner_id = auth.uid());

drop policy if exists wooz_trip_trips_insert on wooz_trip_trips;
create policy wooz_trip_trips_insert on wooz_trip_trips
  for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists wooz_trip_trips_update on wooz_trip_trips;
create policy wooz_trip_trips_update on wooz_trip_trips
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists wooz_trip_trips_delete on wooz_trip_trips;
create policy wooz_trip_trips_delete on wooz_trip_trips
  for delete to authenticated using (owner_id = auth.uid());

drop policy if exists wooz_trip_reports_insert on wooz_trip_reports;
create policy wooz_trip_reports_insert on wooz_trip_reports
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists wooz_trip_reports_read_own on wooz_trip_reports;
create policy wooz_trip_reports_read_own on wooz_trip_reports
  for select to authenticated using (user_id = auth.uid());
