/**
 * fill.js — AI 빈칸 채우기 파이프라인의 코드 단계 (순수 함수, 테스트 대상)
 *
 * CLAUDE.md 8장 순서를 지킨다.
 *  1. 후보 필터 (코드)   → buildFillTasks
 *  2. 동선 계산 (코드)   → buildFillTasks (앞 장소 기준 이동시간으로 정렬)
 *  3. 선택과 설명 (LLM)  → lib/ai/provider.js (후보 ID 목록 안에서만 고른다)
 *  4. 검증 (코드)        → validatePicks + applyPicks + finalCheck
 */
import { SLOT_TYPES, WEEKDAYS } from '../config.js';
import { rankCandidates } from '../candidates.js';
import { computeDay, slotPoint, usedPlaceIds } from '../trip.js';
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
 * 1·2단계: 빈 슬롯마다 코드로 거른 후보 목록을 만든다.
 * 다음 슬롯의 출발점은 "1순위 후보"로 가정해 이어서 계산한다.
 */
export function buildFillTasks(trip, places, { perSlot = PER_SLOT } = {}) {
  const placeMap = Object.fromEntries(places.map((p) => [p.id, p]));
  const used = new Set(usedPlaceIds(trip.days));
  const tasks = [];

  (trip.days || []).forEach((day, dayIndex) => {
    let from = null;
    day.slots.forEach((s) => {
      if (s.fixed || s.placeId) {
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

/** LLM 에 넘길 최소 정보 (후보 ID 목록 밖의 장소를 만들 수 없게) */
export function tasksForPrompt(tasks, tagLabels = {}) {
  return tasks.map((t) => ({
    slotId: t.slotId,
    day: t.dayIndex + 1,
    weekday: t.weekday,
    time: t.time,
    slot: t.slotLabel,
    candidates: t.candidates.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.sub_category || c.category,
      indoor: !!c.indoor,
      tags: (c.kid_tags || []).map((x) => tagLabels[x] || x),
      driveMinutesFromPrev: c.travel,
    })),
  }));
}

/**
 * 4단계-1: LLM 결과 검증. 후보에 없는 ID, 중복 장소는 버리고
 * 버려진 슬롯은 코드 1순위(아직 안 쓴 것)로 채운다.
 */
export function validatePicks(tasks, picks) {
  const byTask = Object.fromEntries(tasks.map((t) => [t.slotId, t]));
  const taken = new Set();
  const result = [];
  const llm = new Map();
  for (const p of picks || []) {
    if (p && byTask[p.slotId] && !llm.has(p.slotId)) llm.set(p.slotId, p);
  }

  for (const t of tasks) {
    const ids = t.candidates.map((c) => c.id);
    const p = llm.get(t.slotId);
    const pid = p ? Number(p.placeId) : NaN;
    if (p && ids.includes(pid) && !taken.has(pid)) {
      taken.add(pid);
      result.push({ slotId: t.slotId, placeId: pid, reason: String(p.reason || '').slice(0, 160), source: 'llm' });
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
      if (!p || s.placeId || s.fixed) return s;
      return { ...s, placeId: p.placeId, aiReason: p.reason };
    }),
  }));
}

/** 4단계-2: 반영 후 다시 계산해서 휴무·영업시간 충돌이 있는 AI 선택은 비운다 */
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
