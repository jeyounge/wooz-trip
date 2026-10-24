/**
 * hours.js — 영업시간·휴무 판단 (순수 함수)
 *
 * place.opening_hours 형식:
 *   { "all": { "open": "10:00", "close": "21:00", "lastOrder": "20:30" },
 *     "6":   { "open": "09:00", "close": "22:00" } }   // 요일(0=일~6=토)별 덮어쓰기
 *   { "always": true } = 상시 개방 (시간 제한 없음)
 *   값이 없으면 "영업시간 정보 없음"으로 보고 경고하지 않는다.
 * place.regular_closed_days: [5]  // 정기휴무 요일 (0=일~6=토)
 */
import { WEEKDAYS } from './config.js';

/** "HH:MM" → 분 */
export function toMin(hhmm) {
  if (!hhmm || typeof hhmm !== 'string') return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/** 분 → "HH:MM" */
export function toHHMM(min) {
  const v = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}

/** "2026-11-06" → 요일 숫자 (현지 날짜 기준, 시간대 영향 없음) */
export function dowOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const WEEKDAY_NAMES = WEEKDAYS;

export function weekdayLabel(dateStr) {
  return WEEKDAYS[dowOf(dateStr)];
}

/** "2026-11-06" → "11.6" */
export function shortDate(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${m}.${d}`;
}

/** 날짜 문자열에 n일 더하기 */
export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** 두 날짜 사이 일수 (끝 포함) */
export function dayCount(start, end) {
  const [y1, m1, d1] = start.split('-').map(Number);
  const [y2, m2, d2] = end.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000) + 1;
}

export function isClosedOn(place, dateStr) {
  const days = place?.regular_closed_days || [];
  return days.includes(dowOf(dateStr));
}

/** 그 날의 영업시간 { open, close, lastOrder } (분 단위) 또는 null */
export function hoursOn(place, dateStr) {
  const oh = place?.opening_hours;
  if (!oh) return null;
  const h = oh[String(dowOf(dateStr))] || oh.all;
  if (!h) return null;
  const open = toMin(h.open);
  let close = toMin(h.close);
  if (open === null || close === null) return null;
  if (close <= open) close += 1440; // 자정 넘김
  const lastOrder = toMin(h.lastOrder);
  return { open, close, lastOrder: lastOrder === null ? null : lastOrder < open ? lastOrder + 1440 : lastOrder };
}

/** 상시 개방 (해변·오름·공원 같은 곳) */
export const isAlwaysOpen = (place) => !!place?.opening_hours?.always;

/** 화면용 영업시간: "10:00–21:00" · "상시 개방" · '' */
export function hoursLabel(place, dateStr) {
  if (isAlwaysOpen(place)) return '상시 개방';
  return dateStr ? hoursText(place, dateStr) : '';
}

/** 영업시간 표시 문구: "10:00–21:00" */
export function hoursText(place, dateStr) {
  const h = hoursOn(place, dateStr);
  if (!h) return '';
  return `${toHHMM(h.open)}–${toHHMM(h.close)}`;
}

/**
 * 방문 가능 여부 판단.
 * @returns {{ ok:boolean, closed:boolean, level:'none'|'info'|'warn', message:string }}
 *  - closed: 정기휴무 → 고를 수 없음
 *  - warn: 영업시간 밖이거나 머물 시간이 크게 부족
 *  - info: 머물 수 있는 시간이 계획보다 짧음 (영업 종료 임박)
 */
export function checkVisit(place, dateStr, arriveMin, stayMin) {
  if (isClosedOn(place, dateStr)) {
    return { ok: false, closed: true, level: 'warn', message: `${weekdayLabel(dateStr)}요일은 쉬는 날이에요` };
  }
  const h = hoursOn(place, dateStr);
  if (!h || arriveMin === null || arriveMin === undefined) {
    return { ok: true, closed: false, level: 'none', message: '' };
  }
  const end = h.lastOrder ?? h.close;
  if (arriveMin < h.open) {
    return { ok: false, closed: false, level: 'warn', message: `${toHHMM(h.open)}에 문을 열어요` };
  }
  if (arriveMin >= end) {
    return { ok: false, closed: false, level: 'warn', message: `영업시간(${hoursText(place, dateStr)})이 끝난 뒤예요` };
  }
  const available = end - arriveMin;
  if (stayMin && available < stayMin) {
    return {
      ok: true,
      closed: false,
      level: 'info',
      message: `도착하면 ${formatAvail(available)} 머물 수 있어요`,
    };
  }
  return { ok: true, closed: false, level: 'none', message: '' };
}

function formatAvail(min) {
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}
