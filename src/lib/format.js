/** format.js — 화면 문구 조립 (순수 함수) */
import { CATEGORIES, COMPANIONS, REGIONS, SLOT_TYPES } from './config.js';
import { hoursText, isClosedOn, shortDate, weekdayLabel, WEEKDAY_NAMES } from './hours.js';

export function companionText(trip) {
  if (trip.companion_type === 'kids' && trip.kids_ages?.length) {
    return `${trip.kids_ages.map((a) => `${a}살`).join(' · ')}이랑`;
  }
  return COMPANIONS.find((c) => c.id === trip.companion_type)?.label || '';
}

/** "7살 · 3살이랑 · 11.6 – 11.8" */
export function tripSubtitle(trip) {
  const parts = [companionText(trip)];
  parts.push(trip.start_date === trip.end_date ? shortDate(trip.start_date) : `${shortDate(trip.start_date)} – ${shortDate(trip.end_date)}`);
  return parts.filter(Boolean).join(' · ');
}

export function regionShort(id) {
  return REGIONS.find((r) => r.id === id)?.short || '제주';
}

export function nightsText(n) {
  return n <= 1 ? '당일' : `${n - 1}박 ${n}일`;
}

/** 장소 한 줄 설명: "고기국수 · 21:00까지" / "흑돼지 · 금요일 정기휴무" */
export function placeMeta(place, date) {
  const kind = place.sub_category || CATEGORIES[place.category] || '';
  if (date && isClosedOn(place, date)) return `${kind} · ${weekdayLabel(date)}요일 정기휴무`;
  const h = date ? hoursText(place, date) : '';
  if (h) return `${kind} · ${h.split('–')[1]}까지`;
  if ((place.regular_closed_days || []).length) {
    return `${kind} · ${place.regular_closed_days.map((d) => WEEKDAY_NAMES[d]).join('·')} 휴무`;
  }
  return kind;
}

export function slotLabel(s) {
  return SLOT_TYPES[s.slotType]?.label || '';
}

/** 외부 링크: 사진·리뷰는 저장하지 않고 원본으로만 연결 */
export function mapLink(place) {
  return place.external_links?.map || `https://map.kakao.com/?q=${encodeURIComponent(place.name)}`;
}
export function blogLink(place) {
  return place.external_links?.blog || `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(`제주 ${place.name}`)}`;
}
