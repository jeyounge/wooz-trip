// TourAPI 원본(data/raw/tourapi/<지역>) → 장소 후보 (LLM 호출 없음)
//   data/build/<지역>.json   import.mjs 가 DB 에 넣을 행 + 요약
//   (--sql) supabase/data/<지역>_N.sql   SQL Editor 로 직접 넣고 싶을 때 (400곳씩)
// 실행: node scripts/tourapi/build.mjs [--area jeju] [--sql]   (지역을 빼면 받은 지역 전부)
//
// 규칙: 모두 후보(candidate). 가족 여행과 거리가 먼 곳(골프·유흥·숙박·폐업 등)은 뺀다.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { AREAS, areaBySlug } from '../../src/lib/areas.js';
import { toPlace } from '../../src/lib/tourapi/transform.js';

const ROOT = new URL('../../', import.meta.url);
const RAW = new URL('data/raw/tourapi/', ROOT);
const BUILD = new URL('data/build/', ROOT);
const SQL_DIR = new URL('supabase/data/', ROOT);
const CHUNK = 400;
const args = process.argv.slice(2);
const only = args.includes('--area') ? areaBySlug(args[args.indexOf('--area') + 1]) : null;
const wantSql = args.includes('--sql');

const readJson = (url, fallback) => (existsSync(url) ? JSON.parse(readFileSync(url, 'utf8')) : fallback);
const codes = readJson(new URL('codes.json', RAW), {});
const SKIP = /골프|카지노|노래(?:방|연습장)|단란|유흥|나이트|호프|주점|포차|이자카야|와인바|칵테일|bar\b|펍|성인|모텔|호텔|리조트|게스트하우스|펜션|폐업|휴업|임시휴관|사격|당구/i;

mkdirSync(BUILD, { recursive: true });
const areas = (only ? [only] : AREAS).filter((a) => existsSync(new URL(`${a.slug}/state.json`, RAW)));
if (!areas.length) {
  console.error('받은 지역이 없어요. 먼저 node scripts/tourapi/collect.mjs auto');
  process.exit(1);
}

for (const area of areas) {
  const dir = new URL(`${area.slug}/`, RAW);
  const items = [12, 14, 39, 28].flatMap((t) => readJson(new URL(`list-${t}.json`, dir), []));
  const rows = [];
  const skipped = { coord: 0, keyword: 0, dup: 0 };
  const seen = new Set();
  for (const item of items) {
    const id = String(item.contentid);
    if (seen.has(id)) {
      skipped.dup++;
      continue;
    }
    seen.add(id);
    const part = (d) => readJson(new URL(`${d}/${id}.json`, dir), {});
    const r = toPlace(item, part('intro'), part('withtour'), codes, { common: part('common'), area });
    if (!r) {
      skipped.coord++;
      continue;
    }
    if (SKIP.test(`${r.row.name} ${r.row.sub_category}`)) {
      skipped.keyword++;
      continue;
    }
    rows.push(r.row);
  }

  const tally = (f) => rows.reduce((m, r) => ((m[f(r)] = (m[f(r)] || 0) + 1), m), {});
  const flags = rows.reduce((m, r) => {
    for (const f of r.source_data.flags) m[f] = (m[f] || 0) + 1;
    return m;
  }, {});
  const summary = {
    area: area.slug,
    at: new Date().toISOString(),
    total: rows.length,
    skipped,
    byCategory: tally((r) => r.category),
    byRegion: tally((r) => r.region),
    withHours: rows.filter((r) => r.opening_hours).length,
    withHome: rows.filter((r) => r.external_links.home).length,
    withKidTags: rows.filter((r) => r.kid_tags.some((t) => !['parking', 'regular_closed'].includes(t))).length,
    flags,
  };
  writeFileSync(new URL(`${area.slug}.json`, BUILD), JSON.stringify({ summary, rows }));
  console.log(
    `[${area.name}] 후보 ${rows.length}곳 · 영업시간 ${summary.withHours} · 홈페이지 ${summary.withHome} · 아이 태그 ${summary.withKidTags} · 제외 ${skipped.keyword + skipped.coord}`
  );
  if (wantSql) writeSql(area, rows);
}

function writeSql(area, rows) {
  const q = (s) => (s === null || s === undefined ? 'null' : `'${String(s).replaceAll("'", "''")}'`);
  mkdirSync(SQL_DIR, { recursive: true });
  for (const f of readdirSync(SQL_DIR)) if (f.startsWith(`${area.slug}_`) && f.endsWith('.sql')) rmSync(new URL(f, SQL_DIR));
  const n = Math.ceil(rows.length / CHUNK);
  for (let i = 0; i < n; i++) {
    const chunk = rows.slice(i * CHUNK, (i + 1) * CHUNK);
    const sql = `-- wooz-trip — TourAPI ${area.name} 장소 후보 ${i + 1}/${n} (생성: build.mjs --sql). 0004 를 먼저 실행해야 한다.
-- 같은 장소는 덮어쓰고, 승인·제외·관리자가 고친 장소는 원문(source_data)만 새로 고친다.
select wooz_trip_upsert_places(${q(JSON.stringify(chunk))}::jsonb);
`;
    writeFileSync(new URL(`${area.slug}_${i + 1}.sql`, SQL_DIR), sql);
  }
  console.log(`  → supabase/data/${area.slug}_1..${n}.sql`);
}
