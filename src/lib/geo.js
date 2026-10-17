/**
 * geo.js — 거리·이동시간 계산 (순수 함수)
 *
 * MVP는 길찾기 API 대신 직선거리 기반 추정치를 쓴다.
 * 나중에 travel_cache + 길찾기 API로 바꿀 때는 lib/travel.js 만 고친다.
 */

const R = 6371000; // 지구 반지름 (m)
const toRad = (d) => (d * Math.PI) / 180;

/** 두 좌표 사이 직선거리 (m) */
export function haversineM(a, b) {
  if (!hasCoord(a) || !hasCoord(b)) return null;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function hasCoord(p) {
  return !!p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)) && p.lat !== null && p.lng !== null;
}

// 추정 계수: 실제 도로는 직선보다 약 1.35배, 제주 평균 차량 속도 약 40km/h, 주차·출발 여유 5분
export const DETOUR = 1.35;
export const CAR_KMH = 40;
export const BUFFER_MIN = 5;

/** 차량 이동시간 추정 (분, 5분 단위 올림). 좌표가 없으면 null */
export function estimateCarMinutes(a, b) {
  const m = haversineM(a, b);
  if (m === null) return null;
  if (m < 150) return 0; // 같은 장소 수준
  const roadKm = (m * DETOUR) / 1000;
  const raw = (roadKm / CAR_KMH) * 60 + BUFFER_MIN;
  return Math.max(5, Math.ceil(raw / 5) * 5);
}

/** 분 → "1시간 20분" */
export function formatDuration(min) {
  if (min === null || min === undefined) return '';
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}

/** 분 → "3:10" (요약 수치용) */
export function formatHM(min) {
  const h = Math.floor(min / 60);
  const m = String(min % 60).padStart(2, '0');
  return `${h}:${m}`;
}
