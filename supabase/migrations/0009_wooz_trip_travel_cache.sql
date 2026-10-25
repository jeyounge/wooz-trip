-- 0009 이동시간 캐시를 좌표 기준으로 다시 만든다 (카카오모빌리티 길찾기, 2026-10-25)
--
-- 0001 의 wooz_trip_travel_cache 는 장소 ID 쌍이라 공항·숙소·출발지·직접 일정 구간을 못 담았다.
-- 그 테이블은 한 번도 쓰지 않아 비어 있다(0건) → 지우고 좌표 키로 새로 만든다.
--   from_key / to_key = "위도,경도" 소수 넷째 자리 (약 10m), 방향 있음 (A→B 와 B→A 는 따로)
--   minutes = 카카오 길찾기 소요시간(분, 올림), distance_m = 도로 거리
-- 접근: RLS 켜고 정책 없음 → 서버(service_role)만 읽고 쓴다.

drop table if exists wooz_trip_travel_cache;

create table wooz_trip_travel_cache (
  from_key    text        not null,
  to_key      text        not null,
  mode        text        not null default 'car',
  minutes     integer     not null,
  distance_m  integer,
  source      text        not null default 'kakao',   -- kakao | tmap
  fetched_ts  timestamptz not null default now(),
  primary key (from_key, to_key, mode)
);

create index if not exists wooz_trip_travel_cache_fetched_idx on wooz_trip_travel_cache (fetched_ts);

alter table wooz_trip_travel_cache enable row level security;
