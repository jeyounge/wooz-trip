// AI 루트 조립기: 고른 볼거리(pool.mjs) + 승인 장소(data/places-for-llm.json) → data/ai-routes/jeju-real.json
//
//   npm run places:export     먼저 승인 장소 목록을 뽑는다
//   node scripts/ai-routes/build.mjs
//   npm run routes:sql        검사 후 SQL 생성 (docs/ai-routes.md)
//
// 볼거리는 운영자·LLM 이 고른 pool.mjs 안에서만 쓴다. 식당·카페는 승인 장소 중에서 코드가 고른다:
//  - 슬롯 시각에 영업 중인 곳만 (am 10~12 · lunch 12~13 · pm 14~16 · cafe 16~17 · dinner 18~19:30)
//  - 앞 장소에서 가까운 곳 (이동시간은 서비스와 같은 직선거리 추정)
//  - 하루에 정기휴무 있는 곳은 2곳까지, 한 루트에 같은 장소 두 번 안 씀
//  - 아이 동반: 하루 실내 1곳 이상, 식당은 아기의자·유아 메뉴·좌식 우선, 점심 뒤 이동(13~15시)은 조금 길게(차에서 낮잠)
//  - 부모님 동반: 주차·유모차 가능 태그 우선
// 추천 이유는 장소 데이터(종류·태그·실내)와 계산한 이동시간으로만 쓴다. 같은 입력이면 늘 같은 결과(시드 고정).
import { readFileSync, writeFileSync } from 'node:fs';
import { estimateCarMinutes } from '../../src/lib/geo.js';
import { COMPANIONS, REGIONS } from '../../src/lib/config.js';
import { POOL } from './pool.mjs';

const ROOT = new URL('../../', import.meta.url);
const OUT = new URL('data/ai-routes/jeju-real.json', ROOT);
const places = JSON.parse(readFileSync(new URL('data/places-for-llm.json', ROOT), 'utf8')).filter(
  (p) => typeof p.ref === 'number' && p.status === 'approved' && !p.name.startsWith('[샘플]')
);
const byRef = new Map(places.map((p) => [p.ref, p]));

// ── 만들 개수: 지역 4 × 동행 4 × 1~4일 ──
const VARIANTS = {
  kids: { 1: 4, 2: 5, 3: 5, 4: 3 },
  parents: { 1: 3, 2: 3, 3: 3, 4: 2 },
  couple: { 1: 3, 2: 3, 3: 3, 4: 2 },
  friends: { 1: 3, 2: 3, 3: 3, 4: 2 },
};
const COMP_CODE = { kids: 'k', parents: 'p', couple: 'c', friends: 'f' };
const COMP_WORD = { kids: '아이랑', parents: '부모님과', couple: '둘이서', friends: '친구랑' };
const DAY_WORD = { 1: '하루', 2: '1박 2일', 3: '2박 3일', 4: '3박 4일' };
const REGION_CODE = { 'jeju-west': 'west', 'jeju-east': 'east', 'jeju-south': 'south', 'jeju-city': 'city' };
const THEME_WORD = { sea: '바다', nature: '숲·정원', animal: '동물', exp: '체험', museum: '전시', park: '테마파크', history: '역사' };
const THEME_TAG = { sea: 'beach', nature: 'nature', animal: 'animal', exp: 'experience', museum: 'museum', park: 'themepark', history: 'history' };

// ── 시각·영업시간 ──
const SLOT = { am: [600, 720], lunch: [720, 780], pm: [840, 960], cafe: [960, 1020], dinner: [1080, 1170] };
const toMin = (t) => {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
};
function fits(p, slot) {
  const h = p.hours?.all;
  if (!h) return true; // 영업시간 없음 = 늘 열린 곳 (서비스 규칙과 같음)
  const open = toMin(h.open);
  let close = toMin(h.lastOrder || h.close);
  if (close <= open) close += 1440; // 자정 넘어 닫는 곳
  const [s, e] = SLOT[slot];
  return s >= open && e <= close + 15;
}
const mins = (a, b) => estimateCarMinutes(a, b) ?? 999;

// ── 시드 고정 난수 ──
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── 문장 ──
const hasBatchim = (word) => {
  const c = word.trim().slice(-1).charCodeAt(0);
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 !== 0;
  return /[0-9lmnr]$/i.test(word.trim()); // 숫자·영문은 대충
};
const ieyo = (w) => `${w}${hasBatchim(w) ? '이에요' : '예요'}`;
const shortName = (n) => n.replace(/\s*[[(（【].*?[\])）】]/g, '').trim();
const FOOD_KIND = { 음식점: '식당', 한식: '한식당', 서양식: '양식당', 일식: '일식당', 중식: '중식당', 이색음식점: '이색 음식점', 해산물: '해산물 식당', 흑돼지: '흑돼지 식당', 국수: '국숫집' };
const TAG_TEXT = {
  stroller: '유모차로 다닐 수 있어요',
  nursing: '수유실이 있어요',
  kids_zone: '키즈존이 있어요',
  parking: '주차할 수 있어요',
  baby_chair: '아기의자가 있어요',
  kids_menu: '유아 메뉴가 있어요',
  floor_seat: '좌식 자리가 있어요',
  foot_wash: '발 씻는 곳이 있어요',
};
const TAG_ORDER = {
  kids: ['baby_chair', 'kids_menu', 'floor_seat', 'kids_zone', 'stroller', 'nursing', 'foot_wash', 'parking'],
  parents: ['parking', 'stroller', 'floor_seat'],
  couple: ['parking'],
  friends: ['parking'],
};
const tagLines = (p, comp, n = 2) => TAG_ORDER[comp].filter((t) => (p.tags || []).includes(t)).slice(0, n).map((t) => TAG_TEXT[t]);
const away = (prev, p) => {
  const m = mins(prev, p);
  return m === 0 ? `${shortName(prev.name)} 바로 옆` : `${shortName(prev.name)}에서 차로 약 ${m}분`;
};
const clip = (s) => (s.length <= 160 ? s : s.slice(0, 157) + '…');

function sightReason(p, comp, prev, slot) {
  const info = POOL.get(p.ref);
  const out = [ieyo(info.note) + '.'];
  if (p.indoor) out.push('실내라 날씨 걱정이 덜해요.');
  const tl = tagLines(p, comp);
  if (tl.length) out.push(tl.join(' · ') + '.');
  if (prev) {
    const m = mins(prev, p);
    if (comp === 'kids' && slot === 'pm' && m >= 20) out.push(`점심 뒤 차로 약 ${m}분이라 아이가 차에서 쉬어 가기 좋아요.`);
    else out.push(`${away(prev, p)}이에요.`);
  }
  return clip(out.join(' '));
}
function eatReason(p, comp, prev) {
  const kind = p.category === 'cafe' ? '카페' : FOOD_KIND[p.sub] || p.sub || '식당';
  const out = [prev ? (mins(prev, p) === 0 ? `${shortName(prev.name)} 바로 옆 ${ieyo(kind)}.` : `${away(prev, p)} 거리의 ${ieyo(kind)}.`) : ieyo(kind) + '.'];
  const tl = tagLines(p, comp);
  if (tl.length) out.push(tl.join(' · ') + '.');
  return clip(out.join(' '));
}

// ── 고르기 ──
const usage = new Map(); // 여러 루트에 고르게 퍼지도록
const used = (p) => usage.get(p.ref) || 0;
const KID_FOOD = ['baby_chair', 'kids_menu', 'floor_seat', 'kids_zone'];
function foodBonus(p, comp) {
  const t = p.tags || [];
  if (comp === 'kids') return KID_FOOD.filter((x) => t.includes(x)).length * 12 + (t.includes('parking') ? 2 : 0);
  if (comp === 'parents') return (t.includes('parking') ? 5 : 0) + (t.includes('floor_seat') ? 3 : 0);
  return t.includes('parking') ? 1 : 0;
}
// 비슷한 활동은 한 루트에 한 번 (감귤 체험 두 번, 승마 두 번 같은 것)
const KIND_WORDS = [['감귤', '감귤'], ['승마', '승마'], ['카트', '카트'], ['카약', '카약'], ['잠수함', '배'], ['유람선', '배'], ['요트', '배'], ['보트', '배'], ['테디베어', '곰인형'], ['곰인형', '곰인형'], ['초콜릿', '초콜릿'], ['미디어아트', '미디어아트']];
const kindKey = (note) => `note:${KIND_WORDS.find(([w]) => note.includes(w))?.[1] || note}`;
const isIndoor = (p) => p.indoor || POOL.get(p.ref)?.themes.includes('in');
const closedCount = (list) => list.filter((p) => p.closed?.length).length;

function best(cands, score, rand) {
  let top = null;
  let topScore = Infinity;
  for (const c of cands) {
    const s = score(c) + rand() * 8;
    if (s < topScore) {
      top = c;
      topScore = s;
    }
  }
  return top;
}

function sightOk(p, comp, allowOlder, slot, taken) {
  const info = POOL.get(p.ref);
  return info && info.comp.has(COMP_CODE[comp]) && (allowOlder || !info.older) && !taken.has(p.ref) && !taken.has(kindKey(info.note)) && fits(p, slot);
}

function buildDay({ region, comp, allowOlder, taken, rand, prevEnd }) {
  const sights = places.filter((p) => p.category === 'sight');
  const day = [];
  const add = (slot, p, reason) => {
    taken.add(p.ref);
    if (POOL.get(p.ref)) taken.add(kindKey(POOL.get(p.ref).note));
    usage.set(p.ref, used(p) + 1);
    day.push({ slot, p, reason });
  };
  const inDay = () => day.map((d) => d.p);
  const closedOk = (p) => !p.closed?.length || closedCount(inDay()) < 2;

  // 오전: 지역 안 볼거리 (전날 저녁 장소에서 너무 멀지 않게)
  const am = best(
    sights.filter((p) => sightOk(p, comp, allowOlder, 'am', taken)),
    (p) => (p.region === region ? 0 : 30) + used(p) * 10 + (prevEnd ? Math.max(0, mins(prevEnd, p) - 30) : 0),
    rand
  );
  if (!am) return null;
  add('am', am, sightReason(am, comp, null, 'am'));

  const food = places.filter((p) => p.category === 'food');
  const lunch = best(
    food.filter((p) => !taken.has(p.ref) && fits(p, 'lunch') && closedOk(p) && mins(am, p) <= 25),
    (p) => mins(am, p) + used(p) * 6 - foodBonus(p, comp),
    rand
  );
  if (lunch) add('lunch', lunch, eatReason(lunch, comp, am));
  const from = lunch || am;

  // 오후: 아이 동반이면 오전이 실외일 때 실내 우선, 점심 뒤 이동은 15~35분이 좋다
  const amInfo = POOL.get(am.ref);
  const pmCands = sights.filter((p) => sightOk(p, comp, allowOlder, 'pm', taken) && closedOk(p) && mins(from, p) <= 35);
  const needIndoor = comp === 'kids' && !isIndoor(am) && pmCands.some(isIndoor);
  const pm = best(
    needIndoor ? pmCands.filter(isIndoor) : pmCands,
    (p) => {
      const m = mins(from, p);
      const travel = comp === 'kids' ? Math.abs(m - 22) * 0.6 : m * 0.6;
      const same = POOL.get(p.ref).themes[0] === amInfo.themes[0] ? 8 : 0;
      return travel + same + used(p) * 10 + (p.region === region ? 0 : 6);
    },
    rand
  );
  if (!pm) return null;
  add('pm', pm, sightReason(pm, comp, from, 'pm'));

  const cafes = places.filter((p) => p.category === 'cafe');
  const cafe = best(
    cafes.filter((p) => !taken.has(p.ref) && fits(p, 'cafe') && closedOk(p) && mins(pm, p) <= 20),
    (p) => mins(pm, p) + used(p) * 6 - foodBonus(p, comp),
    rand
  );
  if (cafe) add('cafe', cafe, eatReason(cafe, comp, pm));
  const last = cafe || pm;

  const dinner = best(
    food.filter((p) => !taken.has(p.ref) && fits(p, 'dinner') && closedOk(p) && mins(last, p) <= 25),
    (p) => mins(last, p) + used(p) * 6 - foodBonus(p, comp),
    rand
  );
  if (dinner) add('dinner', dinner, eatReason(dinner, comp, last));
  return day;
}

const routes = [];
let seed = 20261018;
for (const region of REGIONS.map((r) => r.id)) {
  const short = REGIONS.find((r) => r.id === region).short;
  for (const { id: comp } of COMPANIONS) {
    for (const dayCount of [1, 2, 3, 4]) {
      const n = VARIANTS[comp][dayCount];
      for (let v = 0; v < n; v++) {
        const rand = rng(seed++);
        // 아이 루트는 홀수 번째만 큰 아이용(카트·승마 등)을 허용
        const allowOlder = comp !== 'kids' || v % 2 === 1;
        const taken = new Set();
        const days = [];
        let prevEnd = null;
        for (let d = 0; d < dayCount; d++) {
          const day = buildDay({ region, comp, allowOlder, taken, rand, prevEnd });
          if (!day) break;
          days.push(day);
          prevEnd = day[day.length - 1].p;
        }
        if (days.length < dayCount) {
          console.warn(`건너뜀: ${region} ${comp} ${dayCount}일 #${v + 1} (맞는 장소 부족)`);
          continue;
        }
        const sightsUsed = days.flatMap((d) => d.filter((x) => x.slot === 'am' || x.slot === 'pm').map((x) => x.p));
        const themeCount = {};
        for (const p of sightsUsed) for (const t of POOL.get(p.ref).themes) if (THEME_WORD[t]) themeCount[t] = (themeCount[t] || 0) + 1;
        const topThemes = Object.entries(themeCount)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2)
          .map(([t]) => t);
        const olderUsed = sightsUsed.some((p) => POOL.get(p.ref).older);
        const indoorUsed = sightsUsed.some(isIndoor);
        const title = `${short} ${COMP_WORD[comp]} ${DAY_WORD[dayCount]} · ${topThemes.map((t) => THEME_WORD[t]).join('·')}`;
        routes.push({
          code: `${REGION_CODE[region]}-${comp}-${dayCount}d-${String(v + 1).padStart(3, '0')}`,
          title: title.slice(0, 80),
          summary: days
            .map((d, i) => `${dayCount > 1 ? `${i + 1}일차 ` : ''}${d.filter((x) => x.slot === 'am' || x.slot === 'pm').map((x) => shortName(x.p.name)).join(' → ')}`)
            .join(' / ')
            .slice(0, 200),
          region,
          companion: comp,
          ...(comp === 'kids' ? { kidAges: olderUsed ? [7, 13] : [0, 12] } : {}),
          tags: [...new Set([...topThemes.map((t) => THEME_TAG[t]), ...(indoorUsed ? ['indoor'] : [])])],
          source: 'llm-pool+rules',
          days: days.map((d) => d.map(({ slot, p, reason }) => ({ slot, place: p.ref, reason }))),
        });
      }
    }
  }
}

writeFileSync(OUT, JSON.stringify(routes, null, 1));
const slots = routes.flatMap((r) => r.days.flat());
console.log(`루트 ${routes.length}개 → data/ai-routes/jeju-real.json (슬롯 ${slots.length}개, 쓴 장소 ${new Set(slots.map((s) => s.place)).size}곳)`);
