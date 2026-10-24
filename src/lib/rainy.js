/**
 * rainy.js — 비 오는 날 대안 (순수 함수)
 *
 * 루트의 야외 볼거리마다, 차로 RAINY_MAX_MIN 분 안에 있는 실내 볼거리 1곳을 고른다.
 * - 그날 정기휴무가 아니고, 그 시각에 열려 있는 곳만
 * - 루트에 이미 있는 곳은 빼고, 같은 대안이 여러 번 나오지 않게 한다
 * - 아이 동반이면 아이 태그가 있는 곳을 조금 앞에 둔다
 */
import { checkVisit, toMin } from './hours.js';
import { estimateCarMinutes, hasCoord } from './geo.js';
import { usedPlaceIds } from './trip.js';

export const RAINY_MAX_MIN = 25;
export const rainyKey = (date, placeId) => `${date}|${placeId}`;
const HIDDEN = new Set(['regular_closed']);

/** 비가 오면 바꿀 만한 야외 장소인지 */
export function isOutdoorSight(place) {
  return !!place && place.category === 'sight' && !place.indoor && hasCoord(place);
}

/**
 * @param trip  { days, companion_type }
 * @param placeMap 루트에 쓰인 장소 { id: place }
 * @param pool  그 시·도의 승인 장소 목록
 * @returns { [rainyKey(date, placeId)]: { id, name, sub_category, minutes, kidTags, external_links } }
 *   (슬롯 순서를 바꿔도 맞게 날짜+장소로 찾는다)
 */
export function rainyAlternatives(trip, placeMap, pool, travelFn = estimateCarMinutes) {
  const used = new Set(usedPlaceIds(trip.days));
  const indoor = (pool || []).filter((p) => p.indoor && p.category === 'sight' && hasCoord(p) && !used.has(p.id));
  if (!indoor.length) return {};
  const kids = trip.companion_type === 'kids';
  const picked = new Map(); // 대안 id → 쓴 횟수
  const out = {};
  for (const d of trip.days || []) {
    for (const s of d.slots || []) {
      const p = placeMap[s.placeId];
      if (!isOutdoorSight(p)) continue;
      const at = toMin(s.time);
      const stay = Math.min(s.stayMinutes || 60, 60);
      let best = null;
      for (const c of indoor) {
        const m = travelFn(p, c);
        if (m === null || m > RAINY_MAX_MIN) continue;
        const v = checkVisit(c, d.date, at, stay);
        if (!v.ok || v.level === 'warn') continue;
        const tags = (c.kid_tags || []).filter((t) => !HIDDEN.has(t));
        const score = m + (picked.get(c.id) || 0) * 20 - (kids && tags.length ? 5 : 0);
        if (!best || score < best.score || (score === best.score && c.id < best.c.id)) best = { c, m, score, tags };
      }
      if (!best) continue;
      picked.set(best.c.id, (picked.get(best.c.id) || 0) + 1);
      out[rainyKey(d.date, s.placeId)] = {
        id: best.c.id,
        name: best.c.name,
        sub_category: best.c.sub_category || null,
        minutes: best.m,
        kidTags: best.tags,
        external_links: best.c.external_links || null,
      };
    }
  }
  return out;
}
