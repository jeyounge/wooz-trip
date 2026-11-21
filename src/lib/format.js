/** format.js — 화면 문구 조립 (순수 함수) */
import { CATEGORIES, COMPANIONS, REGIONS, SLOT_TYPES, SERVICE_NAME, regionName } from './config.js';
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
  const head = [regionName(trip.region), nightsText(trip.days?.length || 1), companionText(trip), placeNames.length && `${placeNames.length}곳`]
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

// 세부 종류가 큰 종류와 같은 말이면 큰 종류로 보여 준다 ("음식점" → "식당")
const PLAIN_SUB = new Set(['음식점', '관광지', '기타', '카페/전통찻집', '문화시설']);

// 뭉뚱그린 분류("관광지"·"음식점")일 때 이름 속 단어로 종류를 짐작한다 (앞에 있을수록 먼저)
const NAME_KIND = {
  sight: [
    [/박물관/, '박물관'], [/미술관|갤러리/, '미술관'], [/과학관/, '과학관'], [/기념관/, '기념관'], [/기념비|기념탑/, '기념비'], [/전시관|전시장/, '전시관'],
    [/체험관|체험장|체험마을/, '체험'], [/아쿠아리움|수족관/, '아쿠아리움'], [/동물원|동물농장|목장/, '동물·목장'],
    [/식물원|수목원|정원|가든/, '정원·수목원'], [/테마파크|랜드|월드|놀이공원|놀이동산/, '테마파크'], [/해수욕장|해변|비치/, '해변'],
    [/오름/, '오름'], [/폭포/, '폭포'], [/전망대/, '전망대'], [/공원/, '공원'], [/시장/, '시장'], [/도서관/, '도서관'],
    [/(?<!화)성당|교회/, '성당·교회'], [/사$|사찰|선원|정사$/, '사찰'], [/생가|향교|서원|고택|유적/, '유적지'], [/섬$|도$/, '섬'],
  ],
  food: [
    [/고기국수|국수/, '국수'], [/흑돼지|돼지|삼겹|고깃|갈비|숯불|구이/, '고기'], [/횟집|회센터|물회|수산|활어/, '회'],
    [/해장국|국밥|곰탕|순대/, '국밥'], [/칼국수|수제비/, '칼국수'], [/냉면|막국수|밀면/, '냉면'], [/갈치|고등어|생선/, '생선요리'],
    [/전복|보말|해물|조개|해산물/, '해물'], [/초밥|스시|오마카세|라멘|돈가스|돈까스|우동|이자카야/, '일식'],
    [/짬뽕|짜장|중화|반점|마라/, '중식'], [/파스타|피자|스테이크|브런치|버거|비스트로/, '양식'], [/치킨/, '치킨'],
    [/분식|김밥|떡볶이/, '분식'], [/베이커리|빵/, '베이커리'], [/한정식|백반|밥상|식당/, '한식'],
  ],
  cafe: [[/베이커리|빵/, '베이커리 카페'], [/전통찻집|찻집|다원|티하우스/, '찻집'], [/디저트|케이크|젤라또/, '디저트 카페']],
};

/** 장소 종류 한 마디: "한식" · "박물관" · "해수욕장" (세부가 없거나 뭉뚱그린 말이면 이름으로 짐작, 그래도 없으면 "식당"·"볼거리") */
export function placeKind(place) {
  const sub = String(place?.sub_category || '').trim();
  if (sub && !PLAIN_SUB.has(sub)) return sub;
  const name = String(place?.name || '').replace(/\s+/g, '');
  const hit = (NAME_KIND[place?.category] || []).find(([re]) => re.test(name));
  if (hit) return hit[1];
  return CATEGORIES[place?.category] || sub || '';
}

/** 주소에서 동네만: "제주시 애월읍" · "수원시 팔달구" */
export function placeArea(address) {
  return String(address || '')
    .replace(/^(제주특별자치도|제주도|경기도|인천광역시|인천)\s*/, '')
    .split(/\s+/)
    .slice(0, 2)
    .join(' ');
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
  return place.external_links?.blog || `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(`${blogPrefix(place)} ${place.name}`)}`;
}

/** 블로그 검색 앞말: 제주는 「제주」, 그 밖은 주소의 시·군 (「용인시」) */
function blogPrefix(place) {
  if (String(place.region || '').startsWith('jeju')) return '제주';
  return String(place.address || '').trim().split(/s+/)[1] || '';
}
