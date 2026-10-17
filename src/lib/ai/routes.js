/**
 * routes.js — 미리 만들어 둔 AI 루트(wooz_trip_ai_routes)를 사용자 여행에 맞춰 꺼내 쓰기 (순수 함수, 테스트 대상)
 *
 * 서비스는 LLM API 를 직접 부르지 않는다. 루트는 운영자가 LLM 으로 미리 만들어 DB 에 넣어 두고
 * (data/ai-routes → scripts/gen_ai_routes_sql.mjs), "AI 초안" 버튼은 아래 순서로 동작한다.
 *  1. chooseRoute   : 지역·동행·일수·아이 나이가 가장 잘 맞는 루트를 고른다 (비슷하면 무작위, 직전에 쓴 루트는 피한다)
 *  2. planFromRoute : 루트의 장소를 일자·슬롯 종류에 맞춰 사용자의 빈 슬롯에 대응시킨다
 *  3. 검증          : 사용자 날짜·시각 기준으로 휴무·영업시간을 검사해 안 맞는 장소는 버린다
 *  남은 빈칸은 fill.js 의 규칙 기반 후보로 채우고, finalCheck 로 한 번 더 검사한다.
 */
import { SLOT_TYPES } from '../config.js';
import { checkVisit, dayCount, toMin } from '../hours.js';
import { usedPlaceIds } from '../trip.js';

/** 장소 참조(숫자 id 또는 source_external_id 문자열) → 장소 */
export function placeIndex(places) {
  const byId = new Map();
  const byRef = new Map();
  for (const p of places) {
    byId.set(p.id, p);
    if (p.source_external_id) byRef.set(String(p.source_external_id), p);
  }
  return (ref) => {
    if (ref === null || ref === undefined || ref === '') return null;
    if (typeof ref === 'number') return byId.get(ref) || null;
    const s = String(ref);
    if (/^\d+$/.test(s) && byId.has(Number(s))) return byId.get(Number(s));
    return byRef.get(s) || null;
  };
}

function tripDayCount(trip) {
  return trip.days?.length || Math.max(1, dayCount(trip.start_date, trip.end_date));
}

/** 루트가 이 여행에 얼마나 맞는지 (높을수록 좋음) */
export function scoreRoute(route, trip) {
  let s = 0;
  if (route.region === trip.region) s += 40;
  if (route.companion_type === trip.companion_type) s += 30;

  const n = tripDayCount(trip);
  const d = route.day_count || route.days?.length || 1;
  if (d === n) s += 20;
  else if (d > n) s += 12; // 앞쪽 일자만 쓴다
  else s += Math.max(0, 12 - 4 * (n - d)); // 모자란 일자는 규칙 기반으로 채운다

  const ages = trip.kids_ages || [];
  if (trip.companion_type === 'kids' && ages.length && (route.kid_age_min !== null || route.kid_age_max !== null)) {
    const lo = route.kid_age_min ?? 0;
    const hi = route.kid_age_max ?? 99;
    if (ages.some((a) => a >= lo && a <= hi)) s += 8;
  }
  return s;
}

/** 루트의 한 일자 → 사용자의 그날 빈 슬롯에 장소 대응 */
function matchDay(routeDay, userDay, resolve, used) {
  const pool = (routeDay?.slots || [])
    .map((rs, i) => ({ i, slot: rs.slot, place: resolve(rs.place), reason: rs.reason || '' }))
    .filter((x) => x.place);
  const taken = new Set();
  const out = [];

  for (const s of userDay.slots) {
    if (s.fixed || s.placeId) continue;
    const okCats = SLOT_TYPES[s.slotType]?.categories || [];
    // 같은 슬롯 종류 우선, 없으면 카테고리가 맞는 슬롯
    const hit =
      pool.find((x) => !taken.has(x.i) && x.slot === s.slotType && !used.has(x.place.id)) ||
      pool.find((x) => !taken.has(x.i) && okCats.includes(x.place.category) && !used.has(x.place.id));
    if (!hit) continue;
    taken.add(hit.i);

    const check = checkVisit(hit.place, userDay.date, toMin(s.time), s.stayMinutes);
    if (!check.ok || check.closed || check.level === 'warn') continue; // 그날 휴무·영업시간 밖이면 버린다
    used.add(hit.place.id);
    out.push({ slotId: s.id, placeId: hit.place.id, reason: String(hit.reason).slice(0, 160), source: 'route' });
  }
  return out;
}

/**
 * 2·3단계: 고른 루트를 사용자 일자에 대응시킨 검증된 선택 목록.
 * @returns {Array<{slotId, placeId, reason, source:'route'}>}
 */
export function planFromRoute(route, trip, places) {
  const resolve = placeIndex(places);
  const used = new Set(usedPlaceIds(trip.days));
  const picks = [];
  (trip.days || []).forEach((day, i) => {
    picks.push(...matchDay(route.days?.[i], day, resolve, used));
  });
  return picks;
}

/**
 * 1단계: 맞는 루트 고르기.
 * 점수 + 실제로 넣을 수 있는 장소 수로 줄 세우고, 1등과 비슷한 것들 중에서 무작위로 고른다
 * (같은 조건이어도 누를 때마다 조금씩 다른 초안이 나오게).
 * @returns {{ route, picks } | null}
 */
export function chooseRoute(routes, trip, places, { excludeId = null, random = Math.random } = {}) {
  const active = (routes || []).filter((r) => r.is_active !== false && Array.isArray(r.days) && r.days.length);
  if (!active.length) return null;

  const ranked = active
    .map((route) => {
      const picks = planFromRoute(route, trip, places);
      return { route, picks, score: scoreRoute(route, trip) + 3 * picks.length };
    })
    .filter((x) => x.picks.length > 0)
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) return null;

  const best = ranked[0].score;
  let near = ranked.filter((x) => x.score >= best - 6);
  if (near.length > 1 && excludeId !== null) near = near.filter((x) => x.route.id !== excludeId);
  const pick = near[Math.floor(random() * near.length)] || ranked[0];
  return { route: pick.route, picks: pick.picks };
}
