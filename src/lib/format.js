/** format.js — 화면 문구 조립 (순수 함수) */
import { CATEGORIES, COMPANIONS, REGIONS, SLOT_TYPES, SERVICE_NAME } from './config.js';
import { hoursText, isAlwaysOpen, isClosedOn, shortDate, weekdayLabel, WEEKDAY_NAMES } from './hours.js';

/** 운영자가 후기를 참고해 짠 추천 루트인지 (작성자 이름 = 서비스명, 일반 사용자는 이 이름을 못 씀) */
export const isEditorRoute = (trip) => trip?.author_name === SERVICE_NAME;

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

/**
 * 공유 미리보기 문구: "제주 · 2박 3일 · 7살이랑 · 12곳 — 비자림, 세화해변, …"
 * placeNames 는 루트에 들어간 순서대로
 */
export function routeShareText(trip, placeNames = []) {
  const r = regionShort(trip.region);
  const head = [r.startsWith('제주') ? r : `제주 ${r}`, nightsText(trip.days?.length || 1), companionText(trip), placeNames.length && `${placeNames.length}곳`]
    .filter(Boolean)
    .join(' · ');
  const names = placeNames.slice(0, 5).join(', ');
  return names ? `${head} — ${names}${placeNames.length > 5 ? ' 외' : ''}` : head;
}

/** 장소 한 줄 설명: "고기국수 · 21:00까지" / "흑돼지 · 금요일 정기휴무" */
export function placeMeta(place, date) {
  const kind = place.sub_category || CATEGORIES[place.category] || '';
  if (date && isClosedOn(place, date)) return `${kind} · ${weekdayLabel(date)}요일 정기휴무`;
  if (isAlwaysOpen(place)) return `${kind} · 상시 개방`;
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
/**
 * 카카오맵 길찾기 링크 (앱이 있으면 앱, 없으면 웹). API 호출 없음.
 * @param {{name, lat, lng}} from @param {{name, lat, lng}} to
 */
export function routeLink(from, to) {
  const pt = (p) => `${encodeURIComponent(String(p.name || '여기').replace(/,/g, ' '))},${p.lat},${p.lng}`;
  return from ? `https://map.kakao.com/link/from/${pt(from)}/to/${pt(to)}` : `https://map.kakao.com/link/to/${pt(to)}`;
}

export function blogLink(place) {
  return place.external_links?.blog || `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(`제주 ${place.name}`)}`;
}
