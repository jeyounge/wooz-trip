/**
 * trip.js — 루트(일자·슬롯) 생성과 타임라인 계산 (순수 함수)
 *
 * trip.days (jsonb) 형식:
 * [{ date: '2026-11-06',
 *    slots: [{ id, time: '12:00', slotType: 'lunch', placeId: 12|null,
 *              memo: '', stayMinutes: 60, aiReason?: '',
 *              fixed?: { kind: 'airport_arrive'|'airport_depart'|'stay_start'|'stay_end', name, note } }] }]
 *
 * 화면은 저장된 days + 장소 데이터로 매번 타임라인·경고를 다시 계산한다.
 * (복사한 루트도 내 날짜 기준으로 휴무·이동시간이 자동으로 다시 계산된다)
 */
import { AIRPORT, NAP_WINDOW, SLOT_TYPES } from './config.js';
import { estimateCarMinutes, hasCoord } from './geo.js';
import { addDays, checkVisit, dayCount, toHHMM, toMin } from './hours.js';

let seq = 0;
export function newSlotId() {
  seq = (seq + 1) % 100000;
  return `s${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

const slot = (time, slotType, extra = {}) => ({
  id: newSlotId(),
  time,
  slotType,
  placeId: null,
  memo: '',
  stayMinutes: SLOT_TYPES[slotType]?.stay ?? 60,
  ...extra,
});

const fixedSlot = (time, kind, name, note = '') =>
  slot(time, 'fixed', { stayMinutes: 0, fixed: { kind, name, note } });

/** 기본 슬롯 틀: 오전 → 점심 → 오후 → 카페 → 저녁 */
const DAY_TEMPLATE = [
  ['10:00', 'am'],
  ['12:00', 'lunch'],
  ['14:00', 'pm'],
  ['16:00', 'cafe'],
  ['18:00', 'dinner'],
];

/**
 * 여행 정보로 빈 일자·슬롯을 만든다.
 * - 첫날: 공항 도착(+렌터카 40분) 이후 슬롯만
 * - 마지막 날: 출발 2시간 전 공항 도착 고정, 그 전 슬롯만
 * - 숙소 출발/도착 고정 슬롯
 */
export function buildDays({ startDate, endDate, arrivalTime, departureTime, stayName }) {
  const n = Math.max(1, dayCount(startDate, endDate));
  const stay = stayName?.trim() || '숙소';
  const arr = toMin(arrivalTime) ?? toMin('10:00');
  const dep = toMin(departureTime) ?? toMin('18:00');
  const days = [];

  for (let i = 0; i < n; i++) {
    const date = addDays(startDate, i);
    const isFirst = i === 0;
    const isLast = i === n - 1;
    const slots = [];
    let from = toMin('09:30');
    let until = toMin('20:00');

    if (isFirst) {
      slots.push(fixedSlot(toHHMM(arr), 'airport_arrive', `${AIRPORT.name} 도착`, '렌터카 수령 40분'));
      from = arr + 40;
    } else {
      slots.push(fixedSlot('09:30', 'stay_start', isLast ? '체크아웃' : '숙소 출발', stay));
    }
    if (isLast) until = dep - 120;

    for (const [t, type] of DAY_TEMPLATE) {
      const m = toMin(t);
      // 슬롯 시작이 가능 구간 안이고, 머무를 시간이 확보될 때만 넣는다
      if (m + 30 >= from && m + SLOT_TYPES[type].stay <= until + 30) {
        slots.push(slot(toHHMM(Math.max(m, roundUp(from, 30))), type));
      }
    }
    dedupeTimes(slots);

    if (isLast) {
      slots.push(fixedSlot(toHHMM(until), 'airport_depart', AIRPORT.name, `${toHHMM(dep)} 출발 · 렌터카 반납`));
    } else {
      slots.push(fixedSlot('20:00', 'stay_end', stay, '오늘 끝!'));
    }
    days.push({ date, slots });
  }
  return days;
}

function roundUp(min, step) {
  return Math.ceil(min / step) * step;
}

/** 같은 시각이 겹치면 뒤 슬롯을 밀어낸다 */
function dedupeTimes(slots) {
  for (let i = 1; i < slots.length; i++) {
    const prev = toMin(slots[i - 1].time);
    const cur = toMin(slots[i].time);
    if (cur <= prev) slots[i].time = toHHMM(prev + Math.max(60, slots[i - 1].stayMinutes || 60));
  }
}

/** 날짜가 바뀐 복사본: 일자 순서는 유지하고 날짜만 새 시작일부터 다시 매긴다 */
export function redateDays(days, newStartDate) {
  return days.map((d, i) => ({
    date: addDays(newStartDate, i),
    slots: d.slots.map((s) => ({ ...s, id: newSlotId(), aiReason: undefined })),
  }));
}

/** 슬롯의 위치 (장소 / 공항 / 숙소) */
export function slotPoint(s, placeMap, trip) {
  if (s.placeId && placeMap[s.placeId]) {
    const p = placeMap[s.placeId];
    return { lat: p.lat, lng: p.lng };
  }
  if (s.fixed?.kind === 'airport_arrive' || s.fixed?.kind === 'airport_depart') {
    return { lat: AIRPORT.lat, lng: AIRPORT.lng };
  }
  if ((s.fixed?.kind === 'stay_start' || s.fixed?.kind === 'stay_end') && hasCoord({ lat: trip?.stay_lat, lng: trip?.stay_lng })) {
    return { lat: trip.stay_lat, lng: trip.stay_lng };
  }
  return null;
}

/** 이동 구간이 낮잠 시간대와 겹치는지 */
export function overlapsNap(startMin, minutes) {
  const end = startMin + minutes;
  return startMin < NAP_WINDOW[1] && end > NAP_WINDOW[0];
}

/**
 * 하루 타임라인 계산.
 * @returns {Array<{ slot, place, point, travelFromPrev:{minutes,nap}|null, check, lateBy }>}
 */
export function computeDay(day, placeMap, trip, travelFn = estimateCarMinutes) {
  const out = [];
  let prev = null; // { point, endMin }
  const withKids = trip?.companion_type === 'kids';

  for (const s of day.slots) {
    const place = s.placeId ? placeMap[s.placeId] || null : null;
    const point = slotPoint(s, placeMap, trip);
    const start = toMin(s.time);
    let travel = null;
    let lateBy = 0;

    if (point && prev?.point) {
      const minutes = travelFn(prev.point, point);
      if (minutes !== null) {
        travel = { minutes, nap: withKids && overlapsNap(prev.endMin, minutes) };
        const arrive = prev.endMin + minutes;
        if (start !== null && arrive > start + 10) lateBy = arrive - start;
      }
    }

    const check = place ? checkVisit(place, day.date, start, s.stayMinutes) : { ok: true, closed: false, level: 'none', message: '' };
    out.push({ slot: s, place, point, travelFromPrev: travel, check, lateBy });

    if (point) {
      prev = { point, endMin: (start ?? 0) + (s.stayMinutes || 0) };
    } else if (s.placeId === null && !s.fixed) {
      // 빈 슬롯은 위치가 없으므로 이동 계산을 이어가지 않는다
      prev = prev ? { ...prev, endMin: Math.max(prev.endMin, start ?? 0) } : null;
    }
  }
  return out;
}

/** 전체 루트 요약: 장소 수, 총 이동, 빈 슬롯, 경고 */
export function summarize(trip, placeMap, travelFn) {
  let places = 0;
  let travel = 0;
  let empty = 0;
  let warns = 0;
  const perDay = (trip.days || []).map((d) => {
    const rows = computeDay(d, placeMap, trip, travelFn);
    for (const r of rows) {
      if (r.place) places++;
      if (r.travelFromPrev) travel += r.travelFromPrev.minutes;
      if (!r.slot.fixed && !r.slot.placeId) empty++;
      if (r.check.level === 'warn' || r.lateBy > 0) warns++;
    }
    return rows;
  });
  return { places, travel, empty, warns, perDay };
}

/** 경고 문구 (슬롯 카드용) */
export function rowWarning(r) {
  if (r.check.level === 'warn') return r.check.message + (r.check.closed ? '. 바꿀까요?' : '');
  if (r.lateBy > 0) return `앞 일정에서 오면 약 ${r.lateBy}분 늦어요`;
  if (r.check.level === 'info') return r.check.message;
  return '';
}

/** 하루 요약 문구: "공항 → 협재 모래놀이 → 카페 → 저녁" */
export function daySummary(day, placeMap) {
  return day.slots
    .map((s) => (s.placeId ? placeMap[s.placeId]?.name : s.fixed?.kind?.startsWith('airport') ? '공항' : null))
    .filter(Boolean)
    .join(' → ');
}

/** 루트에 쓰인 장소 ID 목록 */
export function usedPlaceIds(days) {
  const ids = new Set();
  for (const d of days || []) for (const s of d.slots) if (s.placeId) ids.add(s.placeId);
  return [...ids];
}
