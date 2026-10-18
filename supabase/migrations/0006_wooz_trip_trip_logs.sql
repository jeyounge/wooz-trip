-- ============================================================
-- wooz-trip — 여행 기록 (실제로 쓴 돈 · 다녀온 뒤 한마디)
-- 한 번만 실행 (다시 실행해도 안전).
--
-- trips.days 에 넣지 않고 따로 둔다: 공개 루트는 누구나 days 를 읽을 수 있어서,
-- 작성자가 "보여주기"를 켰을 때만 남이 읽을 수 있게 하려고.
--
-- slots  : { "<슬롯 id>": { "placeId": 12, "cost": 32000, "rating": "good|ok|bad", "note": "한마디" } }
-- extras : [ { "label": "항공권", "amount": 240000 } ]   장소에 안 붙는 지출 (항공·렌터카·숙소 등)
-- rating : 여행 전체 만족도 1~5, comment : 여행 전체 한마디
-- is_public : 공개 루트(S06)·공유 링크에 같이 보여줄지 (작성자가 고름)
-- ============================================================

create table if not exists wooz_trip_trip_logs (
  trip_id     uuid primary key references wooz_trip_trips(id) on delete cascade,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  slots       jsonb not null default '{}'::jsonb,
  extras      jsonb not null default '[]'::jsonb,
  rating      smallint check (rating between 1 and 5),
  comment     text,
  is_public   boolean not null default false,
  created_ts  timestamptz not null default now(),
  updated_ts  timestamptz not null default now()
);

drop trigger if exists wooz_trip_trip_logs_touch on wooz_trip_trip_logs;
create trigger wooz_trip_trip_logs_touch before update on wooz_trip_trip_logs
  for each row execute function wooz_trip_touch_updated();

alter table wooz_trip_trip_logs enable row level security;

-- 읽기: 본인, 또는 작성자가 보여주기를 켠 공개 루트
drop policy if exists wooz_trip_trip_logs_read on wooz_trip_trip_logs;
create policy wooz_trip_trip_logs_read on wooz_trip_trip_logs
  for select to anon, authenticated
  using (
    owner_id = auth.uid()
    or (is_public and exists (select 1 from wooz_trip_trips t where t.id = trip_id and t.visibility = 'public'))
  );

-- 쓰기: 내 여행에만
drop policy if exists wooz_trip_trip_logs_insert on wooz_trip_trip_logs;
create policy wooz_trip_trip_logs_insert on wooz_trip_trip_logs
  for insert to authenticated
  with check (owner_id = auth.uid() and exists (select 1 from wooz_trip_trips t where t.id = trip_id and t.owner_id = auth.uid()));

drop policy if exists wooz_trip_trip_logs_update on wooz_trip_trip_logs;
create policy wooz_trip_trip_logs_update on wooz_trip_trip_logs
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and exists (select 1 from wooz_trip_trips t where t.id = trip_id and t.owner_id = auth.uid()));

drop policy if exists wooz_trip_trip_logs_delete on wooz_trip_trip_logs;
create policy wooz_trip_trip_logs_delete on wooz_trip_trip_logs
  for delete to authenticated using (owner_id = auth.uid());
