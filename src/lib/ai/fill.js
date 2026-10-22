/**
 * fill.js — 빈칸 채우기의 코드 단계 (순수 함수, 테스트 대상)
 *
 * "AI 초안" 순서 (서비스는 LLM API 를 직접 부르지 않는다):
 *  1. 미리 만든 AI 루트에서 맞는 장소를 넣는다       → lib/ai/routes.js
 *  2. 남은 빈칸은 코드 후보 1순위로 채운다            → buildFillTasks + validatePicks
 *  3. 반영 후 휴무·영업시간을 다시 검사해 충돌은 비운다 → applyPicks + finalCheck
 */
import { SLOT_TYPES, WEEKDAYS } from '../config.js';
import { rankCandidates } from '../candidates.js';
import { computeDay, isFilled, slotPoint, usedPlaceIds } from '../trip.js';
import { dowOf } from '../hours.js';

const PER_SLOT = 5;

/** 동행 유형별 후보 점수 (낮을수록 좋음): 기본은 이동시간, 태그가 맞으면 가산 */
function score(c, companion) {
  let s = c.travel ?? 30;
  const tags = c.kid_tags || [];
  if (companion === 'kids') {
    s -= 4 * ['baby_chair', 'kids_menu', 'stroller', 'nursing', 'kids_zone', 'foot_wash'].filter((t) => tags.includes(t)).length;
  }
  if (companion === 'parents') {
    s -= 4 * ['parking', 'floor_seat', 'stroller'].filter((t) => tags.includes(t)).length; // 유모차 가능 = 계단 적음의 대용 신호
  }
  if (c.check.level === 'info') s += 15; // 머물 시간이 빠듯한 곳은 뒤로
  return s;
}

/**
 * 빈 슬롯마다 코드로 거른 후보 목록을 만든다.
 * 다음 슬롯의 출발점은 "1순위 후보"로 가정해 이어서 계산한다.
 */
export function buildFillTasks(trip, places, { perSlot = PER_SLOT, extraPlaces = [] } = {}) {
  // extraPlaces: 사용자가 넣은 후보 장소 (위치 계산에만 쓰고 추천 후보로는 안 쓴다)
  const placeMap = Object.fromEntries([...extraPlaces, ...places].map((p) => [p.id, p]));
  const used = new Set(usedPlaceIds(trip.days));
  const tasks = [];

  (trip.days || []).forEach((day, dayIndex) => {
    let from = null;
    day.slots.forEach((s) => {
      if (s.fixed || isFilled(s)) {
        const pt = slotPoint(s, placeMap, trip);
        if (pt) from = pt;
        return;
      }
      const ranked = rankCandidates(places, {
        date: day.date,
        time: s.time,
        slotType: s.slotType,
        stayMinutes: s.stayMinutes,
        from,
        excludeIds: [...used],
      }).filter((c) => c.check.ok && c.check.level !== 'warn');

      const top = ranked
        .map((c) => ({ c, sc: score(c, trip.companion_type) }))
        .sort((a, b) => a.sc - b.sc)
        .slice(0, perSlot)
        .map(({ c }) => c);

      if (!top.length) return;
      tasks.push({
        slotId: s.id,
        dayIndex,
        date: day.date,
        weekday: WEEKDAYS[dowOf(day.date)],
        time: s.time,
        slotType: s.slotType,
        slotLabel: SLOT_TYPES[s.slotType]?.label || '',
        candidates: top,
      });
      used.add(top[0].id);
      from = { lat: top[0].lat, lng: top[0].lng };
    });
  });
  return tasks;
}

/**
 * 선택 검증. 후보에 없는 ID, 중복 장소는 버리고
 * 버려진 슬롯은 코드 1순위(아직 안 쓴 것)로 채운다. picks 를 비우면 전부 코드 1순위.
 */
export function validatePicks(tasks, picks) {
  const byTask = Object.fromEntries(tasks.map((t) => [t.slotId, t]));
  const taken = new Set();
  const result = [];
  const given = new Map();
  for (const p of picks || []) {
    if (p && byTask[p.slotId] && !given.has(p.slotId)) given.set(p.slotId, p);
  }

  for (const t of tasks) {
    const ids = t.candidates.map((c) => c.id);
    const p = given.get(t.slotId);
    const pid = p ? Number(p.placeId) : NaN;
    if (p && ids.includes(pid) && !taken.has(pid)) {
      taken.add(pid);
      result.push({ slotId: t.slotId, placeId: pid, reason: String(p.reason || '').slice(0, 160), source: 'pick' });
      continue;
    }
    const fb = t.candidates.find((c) => !taken.has(c.id));
    if (fb) {
      taken.add(fb.id);
      result.push({ slotId: t.slotId, placeId: fb.id, reason: ruleReason(fb), source: 'rule' });
    }
  }
  return result;
}

/** 규칙 기반 추천 이유 */
export function ruleReason(c) {
  const parts = [];
  if (c.travel !== null && c.travel !== undefined) parts.push(`앞 장소에서 차로 ${c.travel}분`);
  parts.push('이 시간에 영업해요');
  if (c.indoor) parts.push('실내라 날씨 걱정이 적어요');
  return parts.join(' · ');
}

/** 검증된 선택을 days 에 반영 (빈 슬롯에만) */
export function applyPicks(days, picks) {
  const map = new Map(picks.map((p) => [p.slotId, p]));
  return days.map((d) => ({
    ...d,
    slots: d.slots.map((s) => {
      const p = map.get(s.id);
      if (!p || isFilled(s) || s.fixed) return s;
      return { ...s, placeId: p.placeId, aiReason: p.reason };
    }),
  }));
}

/** 반영 후 다시 계산해서 휴무·영업시간 충돌이 있는 AI 선택은 비운다 */
export function finalCheck(trip, days, placeMap) {
  const aiIds = new Set();
  const cleaned = days.map((d) => {
    const rows = computeDay(d, placeMap, trip);
    const bad = new Set(rows.filter((r) => r.slot.aiReason && (r.check.level === 'warn' || r.check.closed)).map((r) => r.slot.id));
    return {
      ...d,
      slots: d.slots.map((s) => {
        if (bad.has(s.id)) return { ...s, placeId: null, aiReason: undefined };
        if (s.aiReason) aiIds.add(s.id);
        return s;
      }),
    };
  });
  return { days: cleaned, filled: aiIds.size };
}
