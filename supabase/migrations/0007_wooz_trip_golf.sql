-- ============================================================
-- wooz-trip — 골프장 (2026-10-19)
-- 장소 종류에 golf, 출처에 mois(행정안전부 인허가 데이터)를 더한다.
-- 한 번만 실행하면 된다 (다시 실행해도 안전).
-- 이후 scripts/golf/collect.mjs 가 골프장을 후보로 넣는다 (매일 daily.cmd).
-- ============================================================

alter table wooz_trip_places drop constraint if exists wooz_trip_places_category_check;
alter table wooz_trip_places add constraint wooz_trip_places_category_check
  check (category in ('food','sight','cafe','stay','golf'));

alter table wooz_trip_places drop constraint if exists wooz_trip_places_source_provider_check;
alter table wooz_trip_places add constraint wooz_trip_places_source_provider_check
  check (source_provider in ('kakao','naver','tourapi','manual','mois'));
