-- ============================================================
-- wooz-trip — 같이 고치기 (여행 멤버)
-- 한 번만 실행 (다시 실행해도 안전).
--
-- 작성자가 가입한 이메일(=서비스 ID)을 넣으면 그 사람도 이 여행의 일정을 고칠 수 있다.
-- 멤버는 일정(칸·장소·순서·메모)과 쓴 돈 기록만 고친다.
-- 여행 정보·공유·공개·삭제·멤버 관리는 작성자만.
--
-- 쓰기는 전부 서버(service_role)가 권한을 확인한 뒤에 한다.
-- 그래서 trips 의 update 정책은 바꾸지 않는다 (멤버가 브라우저에서 직접 공개·삭제를 못 하게).
-- ============================================================

create table if not exists wooz_trip_trip_members (
  trip_id     uuid not null references wooz_trip_trips(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  email       text not null,            -- 작성자가 넣은 이메일 (멤버 목록 표시용)
  added_by    uuid references auth.users(id) on delete set null,
  created_ts  timestamptz not null default now(),
  primary key (trip_id, user_id)
);
create index if not exists wooz_trip_trip_members_user_idx on wooz_trip_trip_members (user_id);

alter table wooz_trip_trip_members enable row level security;

-- 읽기: 내가 멤버인 줄만 (작성자의 멤버 목록은 서버가 service_role 로 읽는다.
-- 여기서 trips 를 참조하면 아래 trips 정책과 서로 물고 돌아서 무한 재귀가 된다)
drop policy if exists wooz_trip_trip_members_read on wooz_trip_trip_members;
create policy wooz_trip_trip_members_read on wooz_trip_trip_members
  for select to authenticated using (user_id = auth.uid());

-- 여행 읽기: 공개 · 본인 · 멤버
drop policy if exists wooz_trip_trips_read on wooz_trip_trips;
create policy wooz_trip_trips_read on wooz_trip_trips
  for select to anon, authenticated
  using (
    visibility = 'public'
    or owner_id = auth.uid()
    or exists (
      select 1 from wooz_trip_trip_members m
      where m.trip_id = wooz_trip_trips.id and m.user_id = auth.uid()
    )
  );

-- 이메일 → 계정 ID (서버 전용. 브라우저에서 가입 여부를 찔러 보지 못하게 service_role 만 실행)
create or replace function wooz_trip_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) limit 1
$$;

revoke all on function wooz_trip_user_id_by_email(text) from public, anon, authenticated;
grant execute on function wooz_trip_user_id_by_email(text) to service_role;
