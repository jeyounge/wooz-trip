/**
 * trip.js — 루트(일자·슬롯) 생성과 타임라인 계산 (순수 함수)
 *
 * trip.days (jsonb) 형식:
 * [{ date: '2026-11-06',
 *    slots: [{ id, time: '12:00', slotType: 'lunch', placeId: 12|null,
 *              memo: '', stayMinutes: 60, aiReason?: '',
 *              fixed?: { kind: 'airport_arrive'|'airport_depart'|'home_start'|'home_end'|'stay_start'|'stay_end', name, note, area? } }] }]
 *   home_* = 차로 가는 여행의 출발 지역 (area = config.DEPART_AREAS id)
 *
 * 화면은 저장된 days + 장소 데이터로 매번 타임라인·경고를 다시 계산한다.
 * (복사한 루트도 내 날짜 기준으로 휴무·이동시간이 자동으로 다시 계산된다)
 */
import { AIRPORT, NAP_WINDOW, SLOT_TYPES, departArea } from './config.js';
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

const fixedSlot = (time, kind, name, note = '', extra = {}) =>
  slot(time, 'fixed', { stayMinutes: 0, fixed: { kind, name, note, ...extra } });

/** 칸이 채워졌는지: 우리 DB 장소(placeId) 또는 직접 넣은 일정(custom: { name, address?, lat?, lng? }) */
export const isFilled = (s) => !!(s.placeId || s.custom);
/** 고정 칸이 아니고 아무것도 안 들어간 칸 */
export const isEmptySlot = (s) => !s.fixed && !isFilled(s);
/** 칸 이름: 장소 이름 / 직접 넣은 일정 이름 / 고정 칸 이름 */
export function slotTitle(s, placeMap) {
  if (s.placeId) return placeMap?.[s.placeId]?.name || '삭제된 장소';
  if (s.custom) return s.custom.name;
  return s.fixed?.name || '';
}

/** 이 여행이 차로 가는 여행인지 (첫 고정 칸으로 판단, DB 컬럼 없음) */
export function tripMode(trip) {
  const first = trip?.days?.[0]?.slots?.find((s) => s.fixed);
  return first?.fixed?.kind === 'home_start' ? 'car' : 'fly';
}
/** 차로 가는 여행의 출발 지역 id */
export function tripDepartArea(trip) {
  return trip?.days?.[0]?.slots?.find((s) => s.fixed?.kind === 'home_start')?.fixed?.area || null;
}

const RENTAL_MIN = 40; // 공항 도착 → 렌터카 수령
const AIRPORT_EARLY_MIN = 120; // 비행기 출발 2시간 전 공항
const DRIVE_START_MIN = 30; // 차로 출발 → 첫 장소까지 최소 (실제 이동시간은 타임라인에서 다시 계산)
const DRIVE_HOME_MIN = 60; // 마지막 장소 → 집까지 여유

/** 여행 첫 칸 + 그 뒤 슬롯을 시작할 수 있는 시각(분) */
function startSlot(mode, arr, areaId) {
  if (mode === 'car') {
    const area = departArea(areaId);
    return { slot: fixedSlot(toHHMM(arr), 'home_start', `${area?.label || '집'} 출발`, '차로 출발', { area: area?.id || null }), from: arr + DRIVE_START_MIN };
  }
  return { slot: fixedSlot(toHHMM(arr), 'airport_arrive', `${AIRPORT.name} 도착`, `렌터카 수령 ${RENTAL_MIN}분`), from: arr + RENTAL_MIN };
}
/** 여행 끝 칸 + 그 전에 슬롯을 끝내야 하는 시각(분) */
function endSlot(mode, dep, areaId) {
  if (mode === 'car') {
    const area = departArea(areaId);
    return { slot: fixedSlot(toHHMM(dep), 'home_end', `${area?.label || '집'} 도착`, '집으로', { area: area?.id || null }), until: dep - DRIVE_HOME_MIN };
  }
  const until = dep - AIRPORT_EARLY_MIN;
  return { slot: fixedSlot(toHHMM(until), 'airport_depart', AIRPORT.name, `${toHHMM(dep)} 출발 · 렌터카 반납`), until };
}

/**
 * 첫날 첫 칸·마지막 날 끝 칸만 이동 방식에 맞게 바꾼다 (공개 루트 복사용).
 * 중간 슬롯·장소는 그대로 둔다. 시각이 안 맞는 슬롯은 타임라인 경고로 알려 준다.
 */
export function setTripEnds(days, { mode = 'fly', arrivalTime, departureTime, departAreaId = null }) {
  const n = days.length;
  const arr = toMin(arrivalTime) ?? toMin('10:00');
  const dep = toMin(departureTime) ?? toMin('18:00');
  const isStart = (s) => s.fixed?.kind === 'airport_arrive' || s.fixed?.kind === 'home_start';
  const isEnd = (s) => s.fixed?.kind === 'airport_depart' || s.fixed?.kind === 'home_end';
  return days.map((d, i) => {
    let slots = d.slots.map((s) => ({ ...s }));
    if (i === 0) {
      const st = startSlot(mode, arr, departAreaId);
      slots = slots.map((s) => (isStart(s) ? { ...st.slot, id: s.id } : s));
      // 도착 전 슬롯: 빈 칸은 빼고, 장소가 든 칸은 도착 뒤로 민다
      const from = roundUp(st.from, 30);
      slots = slots.filter((s) => s.fixed || isFilled(s) || toMin(s.time) >= from);
      for (const s of slots) if (!s.fixed && toMin(s.time) < from) s.time = toHHMM(from);
    }
    if (i === n - 1) {
      const end = endSlot(mode, dep, departAreaId);
      slots = slots.map((s) => (isEnd(s) ? { ...end.slot, id: s.id } : s));
      // 끝난 뒤 빈 칸은 뺀다 (장소가 든 칸은 남겨서 타임라인이 늦는다고 알려 준다)
      slots = slots.filter((s) => s.fixed || isFilled(s) || toMin(s.time) + (s.stayMinutes || 0) <= end.until + 30);
    }
    slots.sort((a, b) => toMin(a.time) - toMin(b.time) || (a.fixed ? -1 : 1));
    dedupeTimes(slots);
    return { ...d, slots };
  });
}

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
 * - 비행기(fly): 첫날 공항 도착(+렌터카 40분) 이후, 마지막 날 출발 2시간 전 공항 도착 고정
 * - 차(car): 첫날 출발 지역에서 출발(arrivalTime = 출발 시각), 마지막 날 출발 지역 도착(departureTime = 집 도착 시각)
 * - 사이 날은 숙소 출발/도착 고정 슬롯. 하루짜리(당일치기)는 숙소 칸이 없다
 */
export function buildDays({ startDate, endDate, arrivalTime, departureTime, stayName, mode = 'fly', departAreaId = null }) {
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
      const st = startSlot(mode, arr, departAreaId);
      slots.push(st.slot);
      from = st.from;
    } else {
      slots.push(fixedSlot('09:30', 'stay_start', isLast ? '체크아웃' : '숙소 출발', stay));
    }
    const end = isLast ? endSlot(mode, dep, departAreaId) : null;
    if (end) until = end.until;

    for (const [t, type] of DAY_TEMPLATE) {
      const m = toMin(t);
      // 슬롯 시작이 가능 구간 안이고, 머무를 시간이 확보될 때만 넣는다
      if (m + 30 >= from && m + SLOT_TYPES[type].stay <= until + 30) {
        slots.push(slot(toHHMM(Math.max(m, roundUp(from, 30))), type));
      }
    }
    dedupeTimes(slots);

    if (end) {
      slots.push(end.slot);
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

/** 슬롯의 위치 (장소 / 직접 넣은 일정 / 공항 / 출발지 / 숙소) */
export function slotPoint(s, placeMap, trip) {
  if (s.placeId && placeMap[s.placeId]) {
    const p = placeMap[s.placeId];
    return { lat: p.lat, lng: p.lng };
  }
  if (s.custom) return hasCoord(s.custom) ? { lat: s.custom.lat, lng: s.custom.lng } : null;
  if (s.fixed?.kind === 'airport_arrive' || s.fixed?.kind === 'airport_depart') {
    return { lat: AIRPORT.lat, lng: AIRPORT.lng };
  }
  if (s.fixed?.kind === 'home_start' || s.fixed?.kind === 'home_end') {
    const a = departArea(s.fixed.area);
    return a ? { lat: a.lat, lng: a.lng } : null;
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
        // from: 길찾기 링크용 출발 위치·이름
        travel = { minutes, nap: withKids && overlapsNap(prev.endMin, minutes), from: { ...prev.point, name: prev.name } };
        const arrive = prev.endMin + minutes;
        if (start !== null && arrive > start + 10) lateBy = arrive - start;
      }
    }

    const check = place ? checkVisit(place, day.date, start, s.stayMinutes) : { ok: true, closed: false, level: 'none', message: '' };
    out.push({ slot: s, place, point, travelFromPrev: travel, check, lateBy });

    if (point) {
      prev = { point, endMin: (start ?? 0) + (s.stayMinutes || 0), name: slotTitle(s, placeMap) };
    } else if (!s.fixed && !s.placeId) {
      // 빈 슬롯·위치 없는 직접 일정: 앞 위치에서 이어서 계산하고, 직접 일정은 머무는 시간만큼 뒤로 민다
      const end = s.custom ? (start ?? 0) + (s.stayMinutes || 0) : start ?? 0;
      prev = prev ? { ...prev, endMin: Math.max(prev.endMin, end) } : null;
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
      if (r.place || r.slot.custom) places++;
      if (r.travelFromPrev) travel += r.travelFromPrev.minutes;
      if (isEmptySlot(r.slot)) empty++;
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
  if (!day.slots.some((s) => s.custom || (s.placeId && placeMap[s.placeId]))) return '';
  return day.slots
    .map((s) =>
      s.placeId
        ? placeMap[s.placeId]?.name
        : s.custom
        ? s.custom.name
        : s.fixed?.kind?.startsWith('airport')
        ? '공항'
        : s.fixed?.kind?.startsWith('home')
        ? departArea(s.fixed.area)?.label || '집'
        : null
    )
    .filter(Boolean)
    .join(' → ');
}

/** 지도용 점 목록: 일자별 [{ lat, lng, n, kind, label }] (장소만 번호를 매긴다) */
export function mapDays(days, placeMap, trip) {
  return (days || []).map((d) => {
    let n = 0;
    const points = [];
    for (const s of d.slots) {
      const pt = slotPoint(s, placeMap, trip);
      // 번호는 목록과 맞추려고 위치 없는 직접 일정에도 매긴다 (지도에는 안 찍힘)
      const num = (s.placeId && placeMap[s.placeId]) || s.custom ? ++n : null;
      if (!pt) continue;
      if (num) points.push({ ...pt, n: num, kind: 'place', label: slotTitle(s, placeMap) });
      else points.push({ ...pt, kind: s.fixed?.kind?.startsWith('airport') ? 'airport' : s.fixed?.kind?.startsWith('home') ? 'home' : 'stay', label: s.fixed?.name });
    }
    return { date: d.date, points };
  });
}

/** 루트에 쓰인 장소 ID 목록 */
export function usedPlaceIds(days) {
  const ids = new Set();
  for (const d of days || []) for (const s of d.slots) if (s.placeId) ids.add(s.placeId);
  return [...ids];
}
