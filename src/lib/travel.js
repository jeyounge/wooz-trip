/**
 * travel.js — 이동시간 조회 창구 (순수 함수, 화면·서버 공용)
 *
 * 순서: 서버가 wooz_trip_travel_cache(카카오모빌리티 길찾기 결과)에서 그 루트 구간을 읽어 `known` 으로 넘긴다
 *       → makeTravelFn(known) 이 구간이 있으면 길찾기 시간, 없으면 직선거리 추정치(geo.estimateCarMinutes).
 * 캐시 채우기(API 호출)는 서버 전용 travelCache.js 가 한다.
 */
import { estimateCarMinutes, hasCoord } from './geo.js';
import { computeDay } from './trip.js';

/** 좌표 → 캐시 키 "33.5070,126.4930" (소수 넷째 자리 ≈ 10m) */
export const pointKey = (p) => `${Number(p.lat).toFixed(4)},${Number(p.lng).toFixed(4)}`;
export const pairKey = (a, b) => `${pointKey(a)}>${pointKey(b)}`;

/** 길찾기 분 → 화면 분 (추정치와 같게 5분 단위 올림, 최소 5분) */
export const roundTravel = (min) => Math.max(5, Math.ceil(min / 5) * 5);

/**
 * @param known { [pairKey]: minutes } 길찾기로 알게 된 구간
 * @returns (from, to) => 분 | null
 */
export function makeTravelFn(known) {
  if (!known || !Object.keys(known).length) return estimateCarMinutes;
  return (a, b) => {
    const est = estimateCarMinutes(a, b);
    if (est === null || est === 0) return est; // 좌표 없음 · 같은 곳
    const m = known[pairKey(a, b)];
    return m == null ? est : roundTravel(m);
  };
}

/** 예전 이름 (후보 정렬 등에서 씀): 추정치 */
export function travelMinutes(from, to) {
  return estimateCarMinutes(from, to);
}

/** 루트에서 실제로 이동하는 구간들 [{ from, to, key }] (타임라인 계산과 같은 순서·규칙) */
export function tripLegs(trip, placeMap) {
  const legs = new Map();
  const record = (a, b) => {
    const est = estimateCarMinutes(a, b);
    if (est && hasCoord(a) && hasCoord(b)) legs.set(pairKey(a, b), { from: a, to: b, key: pairKey(a, b) });
    return est;
  };
  for (const d of trip?.days || []) computeDay(d, placeMap, trip, record);
  return [...legs.values()];
}
