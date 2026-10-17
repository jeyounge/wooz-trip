/**
 * candidates.js — 슬롯 후보 필터·정렬 (순수 함수, 테스트 대상)
 */
import { SLOT_TYPES } from './config.js';
import { checkVisit, toMin } from './hours.js';
import { travelMinutes } from './travel.js';
import { haversineM } from './geo.js';

/**
 * 슬롯 후보 정렬 (순수 함수).
 * @param {object[]} places 승인된 장소
 * @param {{ date, time, slotType, stayMinutes, from: {lat,lng}|null, tags: string[], q: string,
 *           excludeIds: number[], category?: string }} opts
 * @returns 거리순 후보 [{ ...place, travel, distM, check }]
 */
export function rankCandidates(places, opts) {
  const { date, time, slotType, stayMinutes, from, tags = [], q = '', excludeIds = [], category } = opts;
  const cats = category ? [category] : SLOT_TYPES[slotType]?.categories || [];
  const arrive = toMin(time);
  const query = q.trim().toLowerCase();

  return places
    .filter((p) => (cats.length ? cats.includes(p.category) : p.category !== 'stay'))
    .filter((p) => !excludeIds.includes(p.id))
    .filter((p) => tags.every((t) => (p.kid_tags || []).includes(t)))
    .filter((p) => !query || p.name.toLowerCase().includes(query) || (p.sub_category || '').toLowerCase().includes(query))
    .map((p) => {
      const travel = from ? travelMinutes(from, p) : null;
      const distM = from ? haversineM(from, p) : null;
      const check = checkVisit(p, date, arrive, stayMinutes ?? SLOT_TYPES[slotType]?.stay);
      return { ...p, travel, distM, check };
    })
    .sort((a, b) => {
      // 쉬는 날인 곳은 맨 아래, 그 다음 거리순
      if (a.check.closed !== b.check.closed) return a.check.closed ? 1 : -1;
      return (a.distM ?? Infinity) - (b.distM ?? Infinity) || a.name.localeCompare(b.name, 'ko');
    });
}
