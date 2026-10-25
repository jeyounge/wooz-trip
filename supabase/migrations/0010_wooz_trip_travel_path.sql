-- 0010 이동시간 캐시에 도로 경로 추가 (지도에 도로를 따라가는 선, 2026-10-25)
--   path = 카카오모빌리티 길찾기 경로 좌표를 줄여서(약 15m 간격 오차) Google polyline 방식으로 압축한 문자열
--   없으면(이전에 받은 구간) 서버가 다음에 다시 받아 채운다.
alter table wooz_trip_travel_cache add column if not exists path text;
