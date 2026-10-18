// AI 루트 SQL 생성기: data/ai-routes/*.json → supabase/migrations/0003_wooz_trip_ai_routes.sql
// 루트 만드는 법은 docs/ai-routes.md 참고.
// 실행: node scripts/gen_ai_routes_sql.mjs   (npm run routes:sql)
//
// 검사하는 것 (하나라도 틀리면 SQL 을 만들지 않는다)
//  - code 형식·중복, 지역·동행 유형·슬롯 종류 값
//  - 장소 참조가 실제 장소 목록에 있는지 (샘플 장소 + data/places-for-llm.json)
//  - 한 루트 안에서 같은 장소 두 번, 후보(candidate)·제외 장소 사용
// 경고만 하는 것: 슬롯 종류와 장소 카테고리가 안 맞음, 기본 시각에 영업시간 밖
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { COMPANIONS, REGIONS, SLOT_TYPES } from '../src/lib/config.js';
import { SAMPLE_PLACES } from '../data/sample-places.mjs';

const ROOT = new URL('../', import.meta.url);
const DIR = new URL('data/ai-routes/', ROOT);
const OUT = new URL('supabase/migrations/0003_wooz_trip_ai_routes.sql', ROOT);
const EXPORT = new URL('data/places-for-llm.json', ROOT);

const SLOT_TIME = { am: '10:00', lunch: '12:00', pm: '14:00', cafe: '16:00', dinner: '18:00', extra: '15:00' };

// 장소 목록: 샘플 + (있으면) DB 에서 내보낸 실제 장소
const known = new Map();
for (const p of SAMPLE_PLACES) known.set(p.ref, p);
if (existsSync(EXPORT)) {
  for (const p of JSON.parse(readFileSync(EXPORT, 'utf8'))) {
    known.set(String(p.ref), p);
    if (p.id !== undefined) known.set(String(p.id), p);
  }
}

const toMin = (t) => {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
};
function outsideHours(place, slot) {
  const h = place.hours?.all;
  if (!h) return false;
  const start = toMin(SLOT_TIME[slot] || '12:00');
  const end = start + (SLOT_TYPES[slot]?.stay || 60);
  const open = toMin(h.open);
  let close = toMin(h.lastOrder || h.close);
  if (close <= open) close += 1440; // 자정 넘어 닫는 곳 (src/lib/hours.js 와 같게)
  return start < open || end > close + 15;
}

const errors = [];
const warns = [];
const routes = [];
const codes = new Set();
const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.json')).sort() : [];

for (const file of files) {
  let list;
  try {
    list = JSON.parse(readFileSync(new URL(file, DIR), 'utf8'));
  } catch (e) {
    errors.push(`${file}: JSON 형식 오류 — ${e.message}`);
    continue;
  }
  if (!Array.isArray(list)) list = [list];

  list.forEach((r, ri) => {
    const at = `${file} #${ri + 1}${r?.code ? ` (${r.code})` : ''}`;
    const err = (m) => errors.push(`${at}: ${m}`);
    const warn = (m) => warns.push(`${at}: ${m}`);

    if (!/^[a-z0-9][a-z0-9-]{2,60}$/.test(r.code || '')) return err('code 는 영문 소문자·숫자·- 3~60자');
    if (codes.has(r.code)) return err('code 중복');
    codes.add(r.code);
    if (!r.title) err('title 없음');
    if (!REGIONS.some((x) => x.id === r.region)) err(`region 값 오류: ${r.region}`);
    if (!COMPANIONS.some((x) => x.id === r.companion)) err(`companion 값 오류: ${r.companion}`);
    if (!Array.isArray(r.days) || r.days.length < 1 || r.days.length > 7) return err('days 는 1~7일');

    const used = new Set();
    const days = r.days.map((day, di) =>
      (Array.isArray(day) ? day : day?.slots || []).map((s, si) => {
        const where = `${di + 1}일차 ${si + 1}번째`;
        if (!SLOT_TYPES[s.slot] || s.slot === 'fixed') err(`${where}: slot 값 오류 (${s.slot})`);
        const ref = s.place;
        const place = known.get(String(ref));
        if (!place) err(`${where}: 모르는 장소 ${ref}`);
        else {
          if (place.status && place.status !== 'approved') err(`${where}: 승인 안 된 장소 ${ref}`);
          if (used.has(String(ref))) err(`${where}: 같은 장소 두 번 ${ref}`);
          const cats = SLOT_TYPES[s.slot]?.categories || [];
          if (cats.length && !cats.includes(place.category)) warn(`${where}: ${s.slot} 슬롯에 ${place.category} 장소 (${place.name})`);
          if (outsideHours(place, s.slot)) warn(`${where}: 기본 시각(${SLOT_TIME[s.slot]})에 영업시간 밖일 수 있음 (${place.name})`);
        }
        used.add(String(ref));
        const reason = String(s.reason || '').trim();
        if (!reason) err(`${where}: reason 없음`);
        if (reason.length > 160) err(`${where}: reason 160자 넘음`);
        return { slot: s.slot, place: typeof ref === 'number' ? ref : String(ref), reason };
      })
    );
    if (days.some((d) => !d.length)) warn('장소가 하나도 없는 일자가 있음');

    const ages = Array.isArray(r.kidAges) ? r.kidAges : null;
    routes.push({
      code: r.code,
      title: String(r.title || '').slice(0, 80),
      summary: r.summary ? String(r.summary).slice(0, 200) : null,
      region: r.region,
      companion: r.companion,
      dayCount: days.length,
      ageMin: ages ? ages[0] : null,
      ageMax: ages ? ages[1] : null,
      tags: (r.tags || []).map(String),
      days: days.map((slots) => ({ slots })),
      source: r.source || 'llm',
    });
  });
}

for (const w of warns) console.warn('경고 ·', w);
if (errors.length) {
  for (const e of errors) console.error('오류 ·', e);
  console.error(`\n오류 ${errors.length}건 — SQL 을 만들지 않았어요.`);
  process.exit(1);
}

const q = (s) => (s === null || s === undefined ? 'null' : `'${String(s).replaceAll("'", "''")}'`);
const num = (n) => (n === null || n === undefined ? 'null' : Number(n));
const arr = (a) => `'{${a.map((x) => `"${x.replaceAll('"', '')}"`).join(',')}}'::text[]`;

// 테이블 정의(0001 과 같은 내용)를 앞에 붙여서, 0001 을 예전에 실행한 DB 에서도 이 파일 하나로 끝나게 한다
const init = readFileSync(new URL('supabase/migrations/0001_wooz_trip_init.sql', ROOT), 'utf8');
const a = init.indexOf('-- 이미 만든 테이블에 나중에 추가된 컬럼');
const b = init.indexOf('for each row execute function wooz_trip_touch_updated();', init.indexOf('wooz_trip_ai_routes_touch'));
if (a < 0 || b < 0) {
  console.error('0001 에서 ai_routes 테이블 정의를 찾지 못했어요');
  process.exit(1);
}
const schema = init.slice(a, b + 'for each row execute function wooz_trip_touch_updated();'.length);

let sql = `-- ============================================================
-- wooz-trip — 미리 만든 AI 루트 ${routes.length}개 (+ 테이블이 없으면 만든다)
-- 생성: node scripts/gen_ai_routes_sql.mjs  (직접 고치지 말고 data/ai-routes/*.json 을 고친다)
-- 같은 code 는 덮어쓴다 → 여러 번 실행해도 안전. 꺼 둔 루트(is_active)는 그대로 둔다.
-- ============================================================

${schema}
alter table wooz_trip_ai_routes enable row level security;
`;
if (routes.length) {
  sql += `
insert into wooz_trip_ai_routes
  (code, title, summary, region, companion_type, day_count, kid_age_min, kid_age_max, tags, days, source)
values
${routes
  .map(
    (r) =>
      `  (${q(r.code)}, ${q(r.title)}, ${q(r.summary)}, ${q(r.region)}, ${q(r.companion)}, ${r.dayCount}, ${num(r.ageMin)}, ${num(r.ageMax)}, ${arr(r.tags)}, ${q(JSON.stringify(r.days))}::jsonb, ${q(r.source)})`
  )
  .join(',\n')}
on conflict (code) do update set
  title = excluded.title, summary = excluded.summary, region = excluded.region,
  companion_type = excluded.companion_type, day_count = excluded.day_count,
  kid_age_min = excluded.kid_age_min, kid_age_max = excluded.kid_age_max,
  tags = excluded.tags, days = excluded.days, source = excluded.source;
`;
}
writeFileSync(OUT, sql);
console.log(`루트 ${routes.length}개 (파일 ${files.length}개, 경고 ${warns.length}건) → supabase/migrations/0003_wooz_trip_ai_routes.sql`);
