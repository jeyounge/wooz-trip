-- ============================================================
-- wooz-trip — 전국 장소 수집용 컬럼 + 자동 반영 함수
-- 한 번만 실행하면 된다 (다시 실행해도 안전).
-- 이후에는 매일 스케줄러(scripts/tourapi/daily.cmd)가 import.mjs 로 이 함수를 불러 후보를 넣는다.
-- ============================================================

alter table wooz_trip_places add column if not exists source_data  jsonb;        -- 출처 원문 (운영자 참고)
alter table wooz_trip_places add column if not exists sido_code    text;         -- 법정동 시도 코드 (50 제주, 28 인천, 41 경기 …)
alter table wooz_trip_places add column if not exists sigungu_code text;         -- 법정동 시군구 코드
alter table wooz_trip_places add column if not exists edited_ts    timestamptz;  -- 운영자가 마지막으로 고친 시각 (자동 반영이 덮어쓰지 않게)

create index if not exists wooz_trip_places_sido_idx on wooz_trip_places (sido_code, status);

-- 예전 데이터(제주 샘플 등)는 제주로 표시
update wooz_trip_places set sido_code = '50' where sido_code is null and region like 'jeju-%';

-- ─────────────────────────────────────────────
-- wooz_trip_upsert_places(rows jsonb) → 넣거나 고친 행 수
--  rows = [{ name, category, ..., source_provider, source_external_id, source_data }, ...]
--  - 새 장소는 후보(candidate)로 넣는다
--  - 이미 있는 장소: 원문(source_data)·지역 코드는 항상 새로 고치고,
--    나머지 내용은 "후보이면서 운영자가 손대지 않은" 장소만 새로 고친다
--    (승인·제외했거나 운영자가 고친 장소는 그대로 둔다)
--  - service_role(서버 스크립트)만 부를 수 있다
-- ─────────────────────────────────────────────
create or replace function wooz_trip_upsert_places(rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  n integer;
begin
  insert into wooz_trip_places as p
    (name, category, sub_category, address, lat, lng, region, phone, source_provider, source_external_id,
     opening_hours, regular_closed_days, kid_tags, indoor, status, external_links, is_sample, source_data,
     sido_code, sigungu_code)
  select r.name, r.category, r.sub_category, r.address, r.lat, r.lng, r.region, r.phone, r.source_provider, r.source_external_id,
         r.opening_hours, coalesce(r.regular_closed_days, '{}'), coalesce(r.kid_tags, '{}'), coalesce(r.indoor, false),
         'candidate', coalesce(r.external_links, '{}'::jsonb), false, r.source_data,
         r.sido_code, r.sigungu_code
  from jsonb_populate_recordset(null::wooz_trip_places, rows) r
  on conflict (source_provider, source_external_id) do update set
    source_data  = excluded.source_data,
    sido_code    = excluded.sido_code,
    sigungu_code = excluded.sigungu_code,
    name                = case when p.status = 'candidate' and p.edited_ts is null then excluded.name                else p.name end,
    category            = case when p.status = 'candidate' and p.edited_ts is null then excluded.category            else p.category end,
    sub_category        = case when p.status = 'candidate' and p.edited_ts is null then excluded.sub_category        else p.sub_category end,
    address             = case when p.status = 'candidate' and p.edited_ts is null then excluded.address             else p.address end,
    lat                 = case when p.status = 'candidate' and p.edited_ts is null then excluded.lat                 else p.lat end,
    lng                 = case when p.status = 'candidate' and p.edited_ts is null then excluded.lng                 else p.lng end,
    region              = case when p.status = 'candidate' and p.edited_ts is null then excluded.region              else p.region end,
    phone               = case when p.status = 'candidate' and p.edited_ts is null then excluded.phone               else p.phone end,
    opening_hours       = case when p.status = 'candidate' and p.edited_ts is null then excluded.opening_hours       else p.opening_hours end,
    regular_closed_days = case when p.status = 'candidate' and p.edited_ts is null then excluded.regular_closed_days else p.regular_closed_days end,
    kid_tags            = case when p.status = 'candidate' and p.edited_ts is null then excluded.kid_tags            else p.kid_tags end,
    indoor              = case when p.status = 'candidate' and p.edited_ts is null then excluded.indoor              else p.indoor end,
    external_links      = case when p.status = 'candidate' and p.edited_ts is null then excluded.external_links
                               else p.external_links || jsonb_strip_nulls(jsonb_build_object('home', excluded.external_links->>'home')) end;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function wooz_trip_upsert_places(jsonb) from public, anon, authenticated;
grant execute on function wooz_trip_upsert_places(jsonb) to service_role;
