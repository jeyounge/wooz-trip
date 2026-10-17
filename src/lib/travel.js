/**
 * travel.js — 이동시간 조회 창구
 *
 * 지금은 직선거리 기반 추정치(geo.estimateCarMinutes)만 쓴다.
 * 길찾기 API를 붙일 때 순서: wooz_trip_travel_cache 조회 → 없으면 API 호출 → 캐시에 저장.
 * 화면·AI 코드는 이 함수만 부르므로 여기만 바꾸면 된다.
 */
import { estimateCarMinutes } from './geo.js';

export function travelMinutes(from, to) {
  return estimateCarMinutes(from, to);
}
