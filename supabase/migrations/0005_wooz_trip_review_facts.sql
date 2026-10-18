-- ============================================================
-- wooz-trip — 블로그 후기에서 뽑은 장소 사실(근거) 저장
-- 한 번만 실행 (다시 실행해도 안전). 이후 매일 스케줄러가 scripts/blogfacts/sync.mjs 로 채운다.
--
-- review_facts 형식 (본문·작성자는 저장하지 않는다. 근거 글 주소·날짜·판정만)
-- { "checkedAt": "...",
--   "tags": { "baby_chair": { "verdict": "yes|no|mixed|weak", "pos": 3, "neg": 0,
--                             "evidence": [{ "url": "...", "date": "2026-05-01", "value": "yes", "sponsored": false }] } },
--   "nokids": { "count": 0, "evidence": [] } }
-- 태그(kid_tags)에 바로 넣지 않는다. 운영자가 /admin 에서 근거를 보고 반영한다.
-- ============================================================

alter table wooz_trip_places add column if not exists review_facts jsonb;

create or replace function wooz_trip_set_review_facts(rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  n integer;
begin
  update wooz_trip_places p
     set review_facts = r.review_facts
    from jsonb_to_recordset(rows) as r(source_provider text, source_external_id text, review_facts jsonb)
   where p.source_provider = r.source_provider
     and p.source_external_id = r.source_external_id;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function wooz_trip_set_review_facts(jsonb) from public, anon, authenticated;
grant execute on function wooz_trip_set_review_facts(jsonb) to service_role;
