// TourAPI 원본(data/raw/tourapi) → 장소 후보 검수 파일 + SQL
//   data/tourapi-review.json                       변환 결과 + 운영자가 볼 것(flags) 요약
//   supabase/data/tourapi_places_N.sql             후보로 넣는 SQL (400곳씩 나눔, 순서대로 실행)
// 실행: node scripts/tourapi/build.mjs   (npm run tour:build)
//
// 규칙
//  - 모두 status = 'candidate' 로 넣는다. 승인은 /admin 에서 사람이 한다.
//  - 이미 승인·제외한 장소는 다시 실행해도 내용을 덮어쓰지 않는다 (source_data 만 새로 고침).
//  - 가족 여행과 거리가 먼 곳(골프·유흥·숙박 등)은 넣지 않는다.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { toPlace } from '../../src/lib/tourapi/transform.js';

const ROOT = new URL('../../', import.meta.url);
const RAW = process.env.TOURAPI_RAW ? new URL(`file:///${process.env.TOURAPI_RAW.replace(/\\/g, '/').replace(/\/?$/, '/')}`) : new URL('data/raw/tourapi/', ROOT);
const OUT_DIR = new URL('supabase/data/', ROOT);
const CHUNK = 400;

const readJson = (url, fallback) => (existsSync(url) ? JSON.parse(readFileSync(url, 'utf8')) : fallback);
const codes = readJson(new URL('codes.json', RAW), {});
const items = [12, 14, 39, 28].flatMap((t) => readJson(new URL(`list-${t}.json`, RAW), []));
if (!items.length) {
  console.error(`목록이 없어요 (${RAW.pathname}). 먼저 node scripts/tourapi/collect.mjs list`);
  process.exit(1);
}

const SKIP = /골프|카지노|노래(?:방|연습장)|단란|유흥|나이트|호프|주점|포차|이자카야|와인바|칵테일|bar\b|펍|성인|모텔|호텔|리조트|게스트하우스|펜션|폐업|휴업|임시휴관|사격|당구/i;

const rows = [];
const skipped = { type: 0, coord: 0, keyword: 0, dup: 0 };
const seen = new Set();
for (const item of items) {
  const id = String(item.contentid);
  if (seen.has(id)) {
    skipped.dup++;
    continue;
  }
  seen.add(id);
  const intro = readJson(new URL(`intro/${id}.json`, RAW), {});
  const withTour = readJson(new URL(`withtour/${id}.json`, RAW), {});
  const r = toPlace(item, intro, withTour, codes);
  if (!r) {
    skipped[[12, 14, 28, 39].includes(Number(item.contenttypeid)) ? 'coord' : 'type']++;
    continue;
  }
  if (SKIP.test(`${r.row.name} ${r.row.sub_category}`)) {
    skipped.keyword++;
    continue;
  }
  rows.push(r.row);
}

// ── 요약 ──
const by = (f) => rows.reduce((m, r) => ((m[f(r)] = (m[f(r)] || 0) + 1), m), {});
const flagCount = rows.reduce((m, r) => {
  for (const f of r.source_data.flags) m[f] = (m[f] || 0) + 1;
  return m;
}, {});
const summary = {
  at: new Date().toISOString(),
  total: rows.length,
  skipped,
  byCategory: by((r) => r.category),
  byRegion: by((r) => r.region),
  withHours: rows.filter((r) => r.opening_hours).length,
  withKidTags: rows.filter((r) => r.kid_tags.some((t) => t !== 'parking' && t !== 'regular_closed')).length,
  flags: flagCount,
};
writeFileSync(new URL('data/tourapi-review.json', ROOT), JSON.stringify({ summary, rows }, null, 1));

// ── SQL ──
const q = (s) => (s === null || s === undefined ? 'null' : `'${String(s).replaceAll("'", "''")}'`);
const arr = (a, type) => `'{${a.map((x) => (type === 'text' ? `"${String(x).replaceAll('"', '')}"` : x)).join(',')}}'::${type}[]`;
const json = (v) => (v === null || v === undefined ? 'null' : `${q(JSON.stringify(v))}::jsonb`);
const KEEP_IF_REVIEWED = ['name', 'category', 'sub_category', 'address', 'lat', 'lng', 'region', 'phone', 'opening_hours', 'regular_closed_days', 'kid_tags', 'indoor', 'external_links'];

const header = (i, n) => `-- ============================================================
-- wooz-trip — TourAPI 장소 후보 ${i}/${n} (생성: node scripts/tourapi/build.mjs, 직접 고치지 않는다)
-- 출처: 한국관광공사 TourAPI. 모두 후보(candidate)로 들어가고 /admin 에서 승인한다.
-- 같은 장소는 덮어쓴다. 이미 승인·제외한 장소는 source_data 만 새로 고친다 → 여러 번 실행해도 안전.
-- ============================================================
alter table wooz_trip_places add column if not exists source_data jsonb;  -- 원문 영업시간·휴무 등 (운영자 참고)
`;

mkdirSync(OUT_DIR, { recursive: true });
for (const f of readdirSync(OUT_DIR)) if (/^tourapi_places_\d+\.sql$/.test(f)) rmSync(new URL(f, OUT_DIR));
const chunks = [];
for (let i = 0; i < rows.length; i += CHUNK) chunks.push(rows.slice(i, i + CHUNK));
chunks.forEach((chunk, ci) => {
  const values = chunk
    .map(
      (r) =>
        `  (${q(r.name)}, ${q(r.category)}, ${q(r.sub_category)}, ${q(r.address)}, ${r.lat}, ${r.lng}, ${q(r.region)}, ${q(r.phone)}, 'tourapi', ${q(r.source_external_id)}, ${json(r.opening_hours)}, ${arr(r.regular_closed_days, 'smallint')}, ${arr(r.kid_tags, 'text')}, ${r.indoor}, 'candidate', ${json(r.external_links)}, false, ${json(r.source_data)})`
    )
    .join(',\n');
  const sql = `${header(ci + 1, chunks.length)}
insert into wooz_trip_places
  (name, category, sub_category, address, lat, lng, region, phone, source_provider, source_external_id,
   opening_hours, regular_closed_days, kid_tags, indoor, status, external_links, is_sample, source_data)
values
${values}
on conflict (source_provider, source_external_id) do update set
  source_data = excluded.source_data,
${KEEP_IF_REVIEWED.map((c) => `  ${c} = case when wooz_trip_places.status = 'candidate' then excluded.${c} else wooz_trip_places.${c} end`).join(',\n')};
`;
  writeFileSync(new URL(`tourapi_places_${ci + 1}.sql`, OUT_DIR), sql);
});

console.log(`후보 ${rows.length}곳 → supabase/data/tourapi_places_1..${chunks.length}.sql`);
console.log('제외:', JSON.stringify(skipped));
console.log('종류:', JSON.stringify(summary.byCategory), '· 지역:', JSON.stringify(summary.byRegion));
console.log(`영업시간 바꿈 ${summary.withHours}곳 · 아이 태그(주차 외) ${summary.withKidTags}곳`);
console.log('확인 필요:', JSON.stringify(flagCount), '→ data/tourapi-review.json');
