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

/** 두 travel({ minutes, paths }) 합치기 */
export const mergeTravel = (a, b) => ({ minutes: { ...a?.minutes, ...b?.minutes }, paths: { ...a?.paths, ...b?.paths } });

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

// ── 도로 경로 (지도 선) ─────────────────────────────────────────

/** Douglas–Peucker 로 점 줄이기 (tol = 도 단위, 0.00015 ≈ 15m) */
export function simplifyPath(pts, tol = 0.00015) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy || 1e-18;
    let best = -1;
    let bestD = 0;
    for (let i = a + 1; i < b; i++) {
      const t = Math.max(0, Math.min(1, ((pts[i][0] - ax) * dx + (pts[i][1] - ay) * dy) / len));
      const ex = ax + t * dx - pts[i][0];
      const ey = ay + t * dy - pts[i][1];
      const d = ex * ex + ey * ey;
      if (d > bestD) [bestD, best] = [d, i];
    }
    if (best > 0 && bestD > tol * tol) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** [[lat,lng],…] → Google polyline 문자열 (소수 다섯째 자리) */
export function encodePath(pts) {
  let out = '';
  let pLat = 0;
  let pLng = 0;
  const enc = (v) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    while (n >= 0x20) {
      out += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    out += String.fromCharCode(n + 63);
  };
  for (const [lat, lng] of pts) {
    const a = Math.round(lat * 1e5);
    const b = Math.round(lng * 1e5);
    enc(a - pLat);
    enc(b - pLng);
    [pLat, pLng] = [a, b];
  }
  return out;
}

/** Google polyline 문자열 → [{lat,lng},…] */
export function decodePath(str) {
  const out = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let shift = 0;
    let res = 0;
    let c;
    do {
      c = str.charCodeAt(i++) - 63;
      res |= (c & 0x1f) << shift;
      shift += 5;
    } while (c >= 0x20);
    return res & 1 ? ~(res >> 1) : res >> 1;
  };
  while (i < str.length) {
    lat += next();
    lng += next();
    out.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return out;
}

/**
 * mapDays 결과에 도로 선(line)을 붙인다. 구간 경로가 있으면 도로 좌표, 없으면 두 점을 곧게.
 * @param paths { [pairKey]: encoded }
 */
export function withRoads(mapData, paths) {
  if (!paths || !Object.keys(paths).length) return mapData;
  return mapData.map((d) => {
    const line = [];
    d.points.forEach((p, i) => {
      if (i === 0) return line.push({ lat: p.lat, lng: p.lng });
      const prev = d.points[i - 1];
      const enc = paths[pairKey(prev, p)];
      if (enc) line.push(...decodePath(enc));
      line.push({ lat: p.lat, lng: p.lng });
    });
    return { ...d, line };
  });
}
