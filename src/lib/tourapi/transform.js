/**
 * tourapi/transform.js — 한국관광공사 TourAPI 응답 → wooz_trip_places 행 (순수 함수, 테스트 대상)
 *
 * TourAPI 는 영업시간·휴무를 사람이 쓴 글로 준다 ("09:00~18:00 (입장마감 17:00)", "매주 월요일").
 * 흔한 모양은 여기서 바꾸고, 못 바꾼 것은 flags 에 남겨 운영자(또는 Claude 정리 단계)가 본다.
 * 응답 필드 이름이 서비스 버전마다 조금씩 달라서 여러 이름을 함께 본다 (pick).
 *
 * 저장하지 않는 것: 사진(firstimage), 리뷰. 소개글(overview)은 운영자 참고용으로 source_data 에만 둔다.
 */

export const CONTENT_TYPES = {
  12: { label: '관광지', category: 'sight' },
  14: { label: '문화시설', category: 'sight', indoor: true },
  28: { label: '레포츠', category: 'sight' },
  39: { label: '음식점', category: 'food' },
};

const CAFE_CAT3 = 'A05020900'; // 카페/전통찻집

/** 여러 후보 필드 중 처음으로 값이 있는 것 */
export function pick(obj, ...keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v);
  }
  return '';
}

/** HTML 태그·엔티티 정리 */
export function cleanText(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

// ─────────────────────────────────────────────
// 지역: 주소의 읍·면·동으로 나눈다 (없으면 좌표)
//  서쪽 = 애월·한림·한경·대정, 동쪽 = 조천·구좌·우도·성산·표선,
//  서귀포 = 서귀포시 동 지역 + 안덕·남원, 제주시 = 제주시 동 지역 (+ 추자)
// ─────────────────────────────────────────────
const WEST = ['애월', '한림', '한경', '대정'];
const EAST = ['조천', '구좌', '우도', '성산', '표선'];
const SOUTH_TOWNS = ['안덕', '남원'];

export function regionOf(address, lat, lng) {
  const a = String(address || '');
  if (WEST.some((t) => a.includes(t + '읍') || a.includes(t + '면'))) return 'jeju-west';
  if (EAST.some((t) => a.includes(t + '읍') || a.includes(t + '면'))) return 'jeju-east';
  if (SOUTH_TOWNS.some((t) => a.includes(t + '읍') || a.includes(t + '면'))) return 'jeju-south';
  if (a.includes('서귀포시')) return 'jeju-south';
  if (a.includes('제주시')) return 'jeju-city';
  // 주소가 없으면 좌표로 대략
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < 33.3) return lng > 126.75 ? 'jeju-east' : lng < 126.3 ? 'jeju-west' : 'jeju-south';
  if (lng < 126.42) return 'jeju-west';
  if (lng > 126.66) return 'jeju-east';
  return lat > 33.44 ? 'jeju-city' : 'jeju-south';
}

// ─────────────────────────────────────────────
// 영업시간
// ─────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');

/** "9:00", "09시", "9시 30분", "21:00" → "HH:MM" */
function normTime(h, m) {
  const hh = Number(h);
  const mm = Number(m || 0);
  if (!Number.isFinite(hh) || hh > 24 || mm > 59) return null;
  return `${pad(hh === 24 ? 24 : hh)}:${pad(mm)}`;
}

const T = String.raw`(\d{1,2})\s*(?::|시)\s*(\d{2})?\s*분?`;
const RANGE = new RegExp(`${T}\\s*(?:~|∼|-|–|부터)\\s*(?:익일\\s*)?${T}`, 'g');

function ranges(text) {
  const out = [];
  for (const m of text.matchAll(RANGE)) {
    const open = normTime(m[1], m[2]);
    let close = normTime(m[3], m[4]);
    if (!open || !close) continue;
    if (close === '24:00') close = '23:59';
    out.push({ open, close, index: m.index, raw: m[0] });
  }
  return out;
}

function lastOrderOf(text) {
  const m = text.match(new RegExp(`(?:라스트\\s*오더|L\\.?\\s*O\\.?|주문\\s*마감|입장\\s*마감|매표\\s*마감|발권\\s*마감|운행\\s*마감|탑승\\s*마감)[^0-9]{0,6}${T}`, 'i'));
  return m ? normTime(m[1], m[2]) : null;
}

/**
 * 영업시간 글 → opening_hours ({ all, "0".."6" }) + flags
 * - 평일/주말이 따로 있으면 all = 평일, "0"·"6" = 주말
 * - 하절기/동절기, 브레이크타임, 요일별로 복잡한 경우는 flag 를 남긴다
 */
export function parseHours(raw) {
  const text = cleanText(raw);
  const flags = [];
  if (!text) return { hours: null, flags: ['hours_missing'] };
  if (/24\s*시간/.test(text)) return { hours: null, flags: [] }; // 늘 열림 (null = 시간 제한 없음)

  const rs = ranges(text);
  if (!rs.length) {
    // "상시 개방", "연중 개방", "자유 관람" = 시간 제한 없음
    if (/상시|연중\s*개방|자유\s*(?:관람|이용|입장)|제한\s*없음|항시/.test(text)) return { hours: null, flags: [] };
    return { hours: null, flags: ['hours_check'] };
  }

  if (/하절기|동절기|여름|겨울|성수기|비수기|\d{1,2}\s*월\s*~|\d{1,2}\s*~\s*\d{1,2}\s*월/.test(text)) flags.push('hours_seasonal');
  if (/브레이크|break|휴게\s*시간|정비\s*시간|점심\s*시간/i.test(text)) flags.push('hours_break');

  const lo = lastOrderOf(text);
  // 브레이크·마감 시각이 범위로 잡힌 경우를 빼고 가장 긴 범위를 기본으로
  const main = rs.filter((r) => !/브레이크|break|휴게|정비|점심/i.test(text.slice(Math.max(0, r.index - 12), r.index)));
  const base = (main.length ? main : rs).reduce((a, b) => (span(b) > span(a) ? b : a));

  const make = (r) => {
    const h = { open: r.open, close: r.close };
    if (lo && lo > r.open && lo <= r.close) h.lastOrder = lo;
    return h;
  };
  const hours = { all: make(base) };

  // 요일별: "화요일~금요일 09:00~19:00 / 토요일~월요일 09:00~21:00", "월요일 11:00~15:00"
  const byDay = dayRangeHours(text);
  if (byDay) {
    const keyOf = (x) => `${x.open}-${x.close}`;
    const tally = {};
    for (const x of Object.values(byDay)) tally[keyOf(x)] = (tally[keyOf(x)] || 0) + 1;
    const commonKey = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
    const common = Object.values(byDay).find((x) => keyOf(x) === commonKey);
    hours.all = make(common);
    for (const [d, x] of Object.entries(byDay)) if (keyOf(x) !== commonKey) hours[d] = make(x);
    if (span(common) < 60) flags.push('hours_check');
    return { hours, flags };
  }

  // 평일 / 주말
  const wk = text.match(new RegExp(`평일[^0-9]{0,8}${T}\\s*(?:~|-|∼)\\s*${T}`));
  const we = text.match(new RegExp(`(?:주말|토[·,/\\s]*일|토요일[·,/\\s]*일요일)[^0-9]{0,10}${T}\\s*(?:~|-|∼)\\s*${T}`));
  if (wk && we) {
    const w1 = { open: normTime(wk[1], wk[2]), close: normTime(wk[3], wk[4]) };
    const w2 = { open: normTime(we[1], we[2]), close: normTime(we[3], we[4]) };
    if (w1.open && w1.close && w2.open && w2.close) {
      hours.all = make(w1);
      hours['0'] = make(w2);
      hours['6'] = make(w2);
    }
  } else if (rs.length > 1 && !flags.includes('hours_break') && !flags.includes('hours_seasonal') && !lo) {
    flags.push('hours_check'); // 범위가 여러 개인데 뜻을 모르겠음
  }
  if (span(base) < 60) flags.push('hours_check');
  return { hours, flags };
}

const DAY_ORDER = ['월', '화', '수', '목', '금', '토', '일'];
const DAY_NUM = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
const DAY = '([월화수목금토일])(?:요일)?';
const DAY_RANGE_RE = new RegExp(
  `${DAY}\\s*(?:~|-|∼)\\s*${DAY}\\s*[:：]?\\s*${T}\\s*(?:~|-|∼)\\s*${T}|([월화수목금토일])요일\\s*[:：]?\\s*${T}\\s*(?:~|-|∼)\\s*${T}`,
  'g'
);

/** 요일 범위별 시간 → { "0".."6": {open, close} } (두 요일 이상 잡힐 때만) */
function dayRangeHours(text) {
  const out = {};
  for (const m of text.matchAll(DAY_RANGE_RE)) {
    let days;
    let t;
    if (m[1]) {
      const a = DAY_ORDER.indexOf(m[1]);
      const b = DAY_ORDER.indexOf(m[2]);
      days = [];
      for (let i = a; days.length < 7; i = (i + 1) % 7) {
        days.push(DAY_ORDER[i]);
        if (i === b) break;
      }
      t = [m[3], m[4], m[5], m[6]];
    } else {
      days = [m[7]];
      t = [m[8], m[9], m[10], m[11]];
    }
    const open = normTime(t[0], t[1]);
    let close = normTime(t[2], t[3]);
    if (!open || !close) continue;
    if (close === '24:00') close = '23:59';
    for (const d of days) out[DAY_NUM[d]] = { open, close };
  }
  return Object.keys(out).length >= 2 ? out : null;
}

function span(r) {
  const m = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  return m(r.close) - m(r.open);
}

// ─────────────────────────────────────────────
// 정기휴무
// ─────────────────────────────────────────────
const DAYS = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };

/**
 * 휴무 글 → 매주 쉬는 요일 [0..6] + flags
 * "매주 월요일" → [1], "월·화요일 휴무" → [1,2], "연중무휴" → []
 * "매월 첫째 주 월요일", "부정기" 처럼 매주가 아닌 것은 요일로 넣지 않고 flag
 */
export function parseClosedDays(raw) {
  const text = cleanText(raw);
  if (!text || /연중\s*무휴|휴무\s*(?:일\s*)?없음|없음|무휴/.test(text)) return { days: [], flags: [] };
  const flags = [];
  if (/첫째|둘째|셋째|넷째|마지막|격주|\d\s*,\s*\d\s*주|째\s*주|번째/.test(text)) flags.push('closed_monthly');
  if (/부정기|비정기|변동|인스타|공지|문의/.test(text)) flags.push('closed_irregular');

  // 월 n째 주 같은 문장은 요일을 매주 휴무로 오해하지 않게 지운다
  const weekly = text.replace(/(?:매월|매달)?\s*(?:첫째|둘째|셋째|넷째|마지막|\d\s*번째|격주)[^,/\n]*/g, '');
  const days = new Set();
  // "월요일", "월·화요일", "토,일" (요일 글자가 구분자로 이어진 목록). "1월 1일" 같은 날짜는 걸리지 않는다
  for (const m of weekly.matchAll(/([일월화수목금토])요일/g)) days.add(DAYS[m[1]]);
  for (const m of weekly.matchAll(/(?<!\d\s?)[일월화수목금토](?:\s*[,·/、]\s*[일월화수목금토])+/g)) {
    for (const ch of m[0]) if (ch in DAYS) days.add(DAYS[ch]);
  }
  if (!days.size && !flags.length && !/설|추석|명절|1월\s*1일/.test(text)) flags.push('closed_check');
  return { days: [...days].sort(), flags };
}

// ─────────────────────────────────────────────
// 아이 태그 (공식 데이터로 알 수 있는 것만. 나머지는 운영자 확인)
// ─────────────────────────────────────────────
const no = (s) => /불가|없음|미보유|미운영|미설치|X\b|×|^0$/.test(s);
const yes = (s) => !!s && (s === '1' || /가능|있음|보유|대여|구비|운영|무료|유료|O\b|○/.test(s)) && !no(s);
// 무장애 항목은 "아기의자 9개"처럼 내용만 적혀 있어서, 비어 있지 않고 '없음'이 아니면 있음으로 본다
const has = (s) => !!s && !no(s);

export function kidTagsOf(intro = {}, withTour = {}) {
  const tags = new Set();
  if (yes(pick(intro, 'parking', 'parkingfood', 'parkingculture', 'parkingleports', 'parkingshopping'))) tags.add('parking');
  if (yes(pick(intro, 'chkbabycarriage', 'chkbabycarriageculture', 'chkbabycarriageleports', 'chkbabycarriageshopping'))) tags.add('stroller');
  if (yes(pick(intro, 'kidsfacility'))) tags.add('kids_zone');
  if (has(cleanText(pick(withTour, 'stroller')))) tags.add('stroller');
  if (has(cleanText(pick(withTour, 'lactationroom')))) tags.add('nursing');
  if (has(cleanText(pick(withTour, 'babysparechair')))) tags.add('baby_chair');
  return [...tags];
}

// ─────────────────────────────────────────────
// 한 장소 변환
// ─────────────────────────────────────────────
/**
 * @param {object} item     areaBasedList2 항목
 * @param {object} intro    detailIntro2 항목 (없으면 {})
 * @param {object} withTour detailWithTour2 항목 (없으면 {})
 * @param {object} codeNames 분류 코드 → 이름 (cat3 등)
 * @returns {{ row, flags } | null}  관광 대상이 아니면 null
 */
export function toPlace(item, intro = {}, withTour = {}, codeNames = {}) {
  const typeId = Number(pick(item, 'contenttypeid', 'contentTypeId'));
  const type = CONTENT_TYPES[typeId];
  if (!type) return null;

  const lat = parseFloat(pick(item, 'mapy'));
  const lng = parseFloat(pick(item, 'mapx'));
  const flags = [];
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 33 || lat > 34 || lng < 126 || lng > 127.1) return null; // 제주 밖·좌표 없음

  const name = cleanText(pick(item, 'title')).slice(0, 80);
  const address = cleanText([pick(item, 'addr1'), pick(item, 'addr2')].filter(Boolean).join(' ')).slice(0, 120);
  const cat3 = pick(item, 'cat3');
  const subName = codeNames[cat3] || codeNames[pick(item, 'lclsSystm3')] || '';
  const isCafe = typeId === 39 && (cat3 === CAFE_CAT3 || /카페|커피|찻집|베이커리|디저트/.test(subName + ' ' + name));
  const category = isCafe ? 'cafe' : type.category;

  const hoursRaw = pick(intro, 'opentimefood', 'usetime', 'usetimeculture', 'usetimeleports', 'opentime');
  const closedRaw = pick(intro, 'restdatefood', 'restdate', 'restdateculture', 'restdateleports');
  const h = parseHours(hoursRaw);
  const c = parseClosedDays(closedRaw);
  flags.push(...h.flags, ...c.flags);
  if (!Object.keys(intro).length) flags.push('no_detail');

  const region = regionOf(address, lat, lng);
  if (!region) flags.push('region_check');
  const kid = kidTagsOf(intro, withTour);
  if (c.days.length) kid.push('regular_closed');

  const contentId = pick(item, 'contentid', 'contentId');
  const row = {
    name,
    category,
    sub_category: (subName || type.label).slice(0, 30),
    address: address || null,
    lat,
    lng,
    region: region || 'jeju-city',
    phone: cleanText(pick(item, 'tel') || pick(intro, 'infocenterfood', 'infocenter', 'infocenterculture', 'infocenterleports')).slice(0, 30) || null,
    source_provider: 'tourapi',
    source_external_id: contentId,
    opening_hours: h.hours,
    regular_closed_days: c.days,
    kid_tags: kid,
    indoor: !!type.indoor || (typeId === 12 && /실내|전시|박물관|미술관|아쿠아|체험관/.test(subName + name)),
    status: 'candidate',
    external_links: { map: `https://map.kakao.com/?q=${encodeURIComponent(name)}` },
    is_sample: false,
    source_data: {
      typeId,
      type: type.label,
      cat3: cat3 || null,
      hoursText: cleanText(hoursRaw) || null,
      closedText: cleanText(closedRaw) || null,
      kidsText: { 0: '없음', 1: '있음' }[pick(intro, 'kidsfacility')] ?? (cleanText(pick(intro, 'kidsfacility')) || null),
      strollerText: cleanText(pick(intro, 'chkbabycarriage', 'chkbabycarriageculture', 'chkbabycarriageleports') || pick(withTour, 'stroller')) || null,
      nursingText: cleanText(pick(withTour, 'lactationroom')) || null,
      babyChairText: cleanText(pick(withTour, 'babysparechair')) || null,
      parkingText: cleanText(pick(intro, 'parking', 'parkingfood', 'parkingculture', 'parkingleports')) || null,
      menuText: cleanText(pick(intro, 'firstmenu', 'treatmenu')).slice(0, 120) || null,
      ageText: cleanText(pick(intro, 'expagerange', 'expagerangeleports')) || null,
      modified: pick(item, 'modifiedtime') || null,
      flags: [...new Set(flags)],
    },
  };
  return { row, flags: row.source_data.flags };
}
