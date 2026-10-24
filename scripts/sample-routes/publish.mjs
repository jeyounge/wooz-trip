// 운영자 추천 루트(routes.mjs)를 공개 루트로 넣는다. 둘러보기·홈 「인기 루트」에 보인다.
//
//   node scripts/sample-routes/publish.mjs            시험: 루트를 만들고 검사 결과만 보여 줌
//   node scripts/sample-routes/publish.mjs --apply    실제로 넣기 (이전에 넣은 추천 루트는 지우고 다시 넣음)
//
// - 볼거리는 routes.mjs 에서 고른 것만. 식당·카페는 승인된 제주 장소 중에서 코드가 고른다
//   (그 날짜에 쉬지 않고, 그 시각에 영업하고, 앞 장소에서 25분 안쪽, 여러 루트에 고르게 퍼지게)
// - 아이 동반: 아기의자·유아 메뉴·좌식·키즈존 우선, 후기에서 노키즈존 언급이 있는 곳은 뺌
// - 검사: 서비스 타임라인과 같은 함수(computeDay)로 휴무·영업시간·늦음 경고가 하나라도 있으면 넣지 않는다
// - 작성자는 운영자 계정(ADMIN_EMAIL 첫 번째), 이름은 서비스명 → 공개 화면에 「추천 루트」로 표시된다
import { createClient } from '@supabase/supabase-js';
import { SERVICE_NAME, SLOT_TYPES, AIRPORT } from '../../src/lib/config.js';
import { buildDays, computeDay, rowWarning, newSlotId } from '../../src/lib/trip.js';
import { addDays, checkVisit, isClosedOn, toMin, WEEKDAY_NAMES as WEEKDAYS } from '../../src/lib/hours.js';
import { estimateCarMinutes } from '../../src/lib/geo.js';
import { SAMPLE_ROUTES } from './routes.mjs';

const ROOT = new URL('../../', import.meta.url);
try {
  process.loadEnvFile(new URL('.env.local', ROOT));
} catch {
  // 이미 환경변수가 있으면 그대로
}
const apply = process.argv.includes('--apply');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ── 승인된 제주 장소 ──
const places = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from('wooz_trip_places')
    .select('id, name, category, sub_category, region, lat, lng, opening_hours, regular_closed_days, kid_tags, indoor, status, review_facts')
    .eq('status', 'approved')
    .like('region', 'jeju-%')
    .order('id')
    .range(from, from + 999);
  if (error) throw error;
  places.push(...data);
  if (data.length < 1000) break;
}
const byId = Object.fromEntries(places.map((p) => [p.id, p]));
console.log(`승인된 제주 장소 ${places.length}곳`);

const mins = (a, b) => estimateCarMinutes(a, b) ?? 999;
const shortName = (n) => n.replace(/\s*[[(（【].*?[\])）】]/g, '').trim();
const hasBatchim = (w) => {
  const c = w.trim().slice(-1).charCodeAt(0);
  return c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 !== 0 : /[0-9lmnr]$/i.test(w.trim());
};
const ieyo = (w) => `${w}${hasBatchim(w) ? '이에요' : '예요'}`;
const FOOD_KIND = { 한식: '한식당', 서양식: '양식당', 일식: '일식당', 중식: '중식당', 이색음식점: '이색 음식점', 해산물: '해산물 식당', 흑돼지: '흑돼지 식당', 국수: '국숫집' };
const TAG_TEXT = { baby_chair: '아기의자가 있어요', kids_menu: '유아 메뉴가 있어요', floor_seat: '좌식 자리가 있어요', kids_zone: '키즈존이 있어요', stroller: '유모차로 다닐 수 있어요', nursing: '수유실이 있어요', parking: '주차할 수 있어요' };
const TAG_ORDER = { kids: ['baby_chair', 'kids_menu', 'floor_seat', 'kids_zone', 'stroller', 'nursing', 'parking'], parents: ['parking', 'stroller', 'floor_seat'], couple: ['parking'], friends: ['parking'] };
const tagLines = (p, comp) => TAG_ORDER[comp].filter((t) => (p.kid_tags || []).includes(t)).slice(0, 2).map((t) => TAG_TEXT[t]);
const away = (prev, p) => (mins(prev, p) <= 1 ? `${shortName(prev.name)} 바로 옆` : `${shortName(prev.name)}에서 차로 약 ${mins(prev, p)}분`);
const clip = (s) => (s.length <= 160 ? s : s.slice(0, 157) + '…');

function sightReason(p, comp, prev, note) {
  const out = [];
  if (note) out.push(note + '.');
  else if (p.indoor) out.push('실내라 날씨 걱정이 덜해요.');
  const tl = tagLines(p, comp);
  if (tl.length) out.push(tl.join(' · ') + '.');
  if (prev) out.push(`${away(prev, p)}이에요.`);
  return clip(out.join(' '));
}
function eatReason(p, comp, prev) {
  const kind = p.category === 'cafe' ? '카페' : FOOD_KIND[p.sub_category] || '식당';
  const out = [`${away(prev, p)} 거리의 ${ieyo(kind)}.`];
  const tl = tagLines(p, comp);
  if (tl.length) out.push(tl.join(' · ') + '.');
  return clip(out.join(' '));
}

// ── 식당·카페 고르기 ──
const usage = new Map();
const KID_FOOD = ['baby_chair', 'kids_menu', 'floor_seat', 'kids_zone'];
function bonus(p, comp) {
  const t = p.kid_tags || [];
  if (comp === 'kids') return KID_FOOD.filter((x) => t.includes(x)).length * 12 + (t.includes('parking') ? 2 : 0);
  if (comp === 'parents') return (t.includes('parking') ? 5 : 0) + (t.includes('floor_seat') ? 3 : 0);
  return t.includes('parking') ? 2 : 0;
}
function pickEat({ category, from, date, time, stay, comp, taken, maxMin = 25 }) {
  let best = null;
  let bestScore = Infinity;
  for (const p of places) {
    if (p.category !== category || taken.has(p.id)) continue;
    if (comp === 'kids' && p.review_facts?.nokids?.count > 0) continue;
    if (!p.opening_hours) continue; // 영업시간 모르는 식당은 안 씀
    const m = mins(from, p);
    if (m > maxMin) continue;
    const c = checkVisit(p, date, toMin(time), stay);
    if (c.level !== 'none') continue;
    const s = m + (usage.get(p.id) || 0) * 8 - bonus(p, comp) + (p.id % 7); // id 로 살짝 흔들어 같은 곳만 안 나오게
    if (s < bestScore) {
      best = p;
      bestScore = s;
    }
  }
  return best;
}

// ── 루트 만들기 ──
const ceil30 = (m) => Math.ceil(m / 30) * 30;
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const built = [];
let bad = 0;

for (const r of SAMPLE_ROUTES) {
  const n = r.days.length;
  const endDate = addDays(r.start, n - 1);
  const problems = [];
  // 마지막 날: 카페(16~17시) 뒤 공항까지 + 2시간 → 비행기 시각 (19:00~20:30)
  const lastPm = byId[r.days[n - 1].pm] || byId[r.days[n - 1].am];
  const toAirport = lastPm ? mins(lastPm, AIRPORT) + 15 : 30;
  const departure = hhmm(Math.min(Math.max(ceil30(17 * 60 + toAirport + 120), 19 * 60), 20 * 60 + 30));
  const arrival = r.arrival || '09:00';
  const days = buildDays({ startDate: r.start, endDate, arrivalTime: arrival, departureTime: departure, stayName: '숙소', mode: 'fly' });
  const taken = new Set();
  const trip = { companion_type: r.companion, kids_ages: r.kidsAges || [] };

  let finalDeparture = departure;
  days.forEach((day, i) => {
    const plan = r.days[i];
    let prev = null; // 앞 장소
    // 시각 다시 잡기: 앞 장소가 끝나고 이동시간만큼 지난 뒤로 민다 (10분 단위)
    let prevPt = i === 0 ? AIRPORT : null; // 사이 날 숙소는 좌표가 없어서 이동시간 계산 안 함 (서비스 화면과 같음)
    let prevEnd = i === 0 ? toMin(arrival) + 40 : toMin('09:30');
    const ceil10 = (m) => Math.ceil(m / 10) * 10;
    for (const s of day.slots) {
      if (s.fixed) {
        if (s.fixed.kind === 'airport_depart' && prevPt) {
          const t = ceil10(prevEnd + mins(prevPt, AIRPORT) + 10);
          s.time = hhmm(t);
          finalDeparture = hhmm(ceil30(t + 120));
          s.fixed.note = `${finalDeparture} 출발 · 렌터카 반납`;
        }
        if (s.fixed.kind === 'stay_end') s.time = hhmm(Math.max(toMin('20:00'), ceil10(prevEnd)));
        continue;
      }
      let p = null;
      let reason = '';
      const est = hhmm(Math.max(toMin(s.time), ceil10(prevEnd + 15)));
      if (s.slotType === 'am' || s.slotType === 'pm') {
        const id = plan[s.slotType];
        p = id ? byId[id] : null;
        if (id && !p) problems.push(`${i + 1}일차 ${s.slotType}: 장소 ${id} 가 승인된 제주 장소가 아니에요`);
        if (p && taken.has(p.id)) problems.push(`${i + 1}일차: ${p.name} 두 번`);
        if (p) reason = sightReason(p, r.companion, prev, r.notes?.[p.id]);
      } else if (['lunch', 'cafe', 'dinner'].includes(s.slotType) && prev) {
        p = pickEat({ category: s.slotType === 'cafe' ? 'cafe' : 'food', from: prev, date: day.date, time: est, stay: s.stayMinutes, comp: r.companion, taken });
        if (!p) p = pickEat({ category: s.slotType === 'cafe' ? 'cafe' : 'food', from: prev, date: day.date, time: est, stay: s.stayMinutes, comp: r.companion, taken, maxMin: 40 });
        if (p) {
          reason = eatReason(p, r.companion, prev);
          usage.set(p.id, (usage.get(p.id) || 0) + 1);
        } else problems.push(`${i + 1}일차 ${SLOT_TYPES[s.slotType].label}: 맞는 곳이 없어요`);
      }
      if (p) {
        s.placeId = p.id;
        if (reason) s.aiReason = reason;
        taken.add(p.id);
        prev = p;
        const start = Math.max(toMin(s.time), ceil10(prevEnd + (prevPt ? mins(prevPt, p) : 0)));
        s.time = hhmm(start);
        prevEnd = start + (s.stayMinutes || 0);
        prevPt = p;
      }
    }
    // 빈 칸은 뺀다 (공개 루트에 빈칸이 보이지 않게)
    day.slots = day.slots.filter((s) => s.fixed || s.placeId);
  });

  // 서비스와 같은 타임라인 검사
  const warns = [];
  days.forEach((d, i) => {
    for (const row of computeDay(d, byId, trip)) {
      const w = rowWarning(row);
      if (w && (row.check.level === 'warn' || row.lateBy > 0)) warns.push(`${i + 1}일차 ${row.slot.time} ${row.place?.name || row.slot.fixed?.name}: ${w}`);
    }
  });

  // 팁 끝에 데이터에서 뽑은 안내 붙이기: 쉬는 요일, 마지막 장소 → 공항
  const sights = r.days.flatMap((d) => [d.am, d.pm]).filter(Boolean).map((id) => byId[id]).filter(Boolean);
  const closed = sights.filter((p) => p.regular_closed_days?.length).map((p) => `${shortName(p.name)}(${p.regular_closed_days.map((d) => WEEKDAYS[d]).join('·')})`);
  const lastPlace = days[n - 1].slots.filter((s) => s.placeId).map((s) => byId[s.placeId]).pop();
  const extra = [];
  if (closed.length) extra.push(`쉬는 요일: ${closed.join(', ')} — 날짜를 바꾸면 화면에서 다시 알려 줘요.`);
  if (lastPlace) extra.push(`마지막 장소에서 공항까지 차로 약 ${mins(lastPlace, AIRPORT)}분이에요.`);
  const tip = [r.tip, ...extra].join('\n').slice(0, 500);

  const all = [...problems, ...warns];
  if (all.length) bad++;
  const placeCount = days.reduce((a, d) => a + d.slots.filter((s) => s.placeId).length, 0);
  console.log(`\n${all.length ? '✗' : '✓'} ${r.title}  (${r.start}~${endDate} ${WEEKDAYS[new Date(r.start + 'T00:00:00').getDay()]}, ${arrival} 도착 · ${finalDeparture} 출발, ${placeCount}곳)`);
  days.forEach((d, i) => console.log(`   ${i + 1}일차 ${d.slots.map((s) => (s.placeId ? `${s.time} ${shortName(byId[s.placeId].name)}` : s.fixed.kind.startsWith('airport') ? `${s.time} 공항` : '')).filter(Boolean).join(' → ')}`));
  for (const a of all) console.log(`   ! ${a}`);

  built.push({
    title: r.title,
    region: r.region,
    start_date: r.start,
    end_date: endDate,
    arrival_time: arrival,
    departure_time: finalDeparture,
    companion_type: r.companion,
    kids_ages: r.kidsAges || [],
    stay_name: '숙소',
    days: days.map((d) => ({ ...d, slots: d.slots.map((s) => ({ ...s, id: newSlotId() })) })),
    author_name: SERVICE_NAME,
    author_tip: tip,
  });
}

// 휴무 검사는 isClosedOn 으로 한 번 더 (computeDay 와 같지만 확실히)
for (const t of built) for (const d of t.days) for (const s of d.slots) if (s.placeId && isClosedOn(byId[s.placeId], d.date)) throw new Error(`${t.title}: ${byId[s.placeId].name} 휴무`);

console.log(`\n루트 ${built.length}개, 문제 있는 루트 ${bad}개`);
if (!apply) {
  console.log('시험 실행이에요. 넣으려면 --apply');
  process.exit(0);
}
if (bad) {
  console.log('문제 있는 루트가 있어서 넣지 않았어요.');
  process.exit(1);
}

// 운영자 계정
const adminEmail = (process.env.ADMIN_EMAIL || '').split(',')[0].trim().toLowerCase();
const { data: users, error: uErr } = await db.auth.admin.listUsers({ perPage: 1000 });
if (uErr) throw uErr;
const owner = users.users.find((u) => u.email?.toLowerCase() === adminEmail);
if (!owner) throw new Error('ADMIN_EMAIL 계정을 찾을 수 없어요');

// 이전에 넣은 추천 루트 지우기 (운영자 계정 + 서비스명 작성자)
const del = await db.from('wooz_trip_trips').delete().eq('owner_id', owner.id).eq('author_name', SERVICE_NAME).eq('visibility', 'public').select('id');
if (del.error) throw del.error;
console.log(`이전 추천 루트 ${del.data.length}개 지움`);

const now = Date.now();
const rows = built.map((t, i) => ({
  ...t,
  owner_id: owner.id,
  visibility: 'public',
  share_id: Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 6),
  // 목록 순서: routes.mjs 순서대로 위에 보이게 (같은 따라감 수일 때 최근 공개순)
  published_ts: new Date(now - i * 60000).toISOString(),
}));
const ins = await db.from('wooz_trip_trips').insert(rows).select('id, title');
if (ins.error) throw ins.error;
console.log(`추천 루트 ${ins.data.length}개 넣음`);
