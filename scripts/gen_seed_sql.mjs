// 개발용 가짜 장소 시드 SQL 생성기 → supabase/migrations/0002_wooz_trip_seed.sql
// 실존 업체가 아님을 분명히 하려고 이름에 [샘플] 을 붙이고 is_sample = true 로 넣는다.
// 실행: node scripts/gen_seed_sql.mjs
import { writeFileSync } from 'node:fs';

import { P, TAGS } from '../data/sample-places.mjs';

const q = (s) => (s === null || s === undefined ? 'null' : `'${String(s).replaceAll("'", "''")}'`);
const arr = (a, type) => `'{${a.join(',')}}'::${type}[]`;

let sql = `-- ============================================================
-- wooz-trip — 개발용 시드 (가짜 장소 ${P.length}곳 + 아이 태그)
-- 생성: node scripts/gen_seed_sql.mjs  (직접 고치지 말고 생성기를 고친다)
-- 실존 업체가 아님: 이름에 [샘플], is_sample = true. 실데이터를 넣은 뒤
--   delete from wooz_trip_places where is_sample;  로 지운다.
-- 여러 번 실행해도 중복되지 않는다 (on conflict).
-- ============================================================

insert into wooz_trip_kid_tags (id, label, filterable, sort_order) values
${TAGS.map((t) => `  (${q(t[0])}, ${q(t[1])}, ${t[2]}, ${t[3]})`).join(',\n')}
on conflict (id) do update set label = excluded.label, filterable = excluded.filterable, sort_order = excluded.sort_order;

insert into wooz_trip_places
  (name, category, sub_category, region, lat, lng, opening_hours, regular_closed_days, kid_tags, indoor,
   status, verified_ts, source_provider, source_external_id, external_links, is_sample, intro)
values
`;
sql += P.map((p, i) => {
  const [name, cat, sub, region, lat, lng, hours, closed, tags, indoor = false, status = 'approved'] = p;
  const links = { map: `https://map.kakao.com/?q=${encodeURIComponent(name.replace('[샘플] ', ''))}` };
  const hoursSql = hours ? `${q(JSON.stringify(hours))}::jsonb` : 'null';
  const verified = status === 'approved' ? 'now()' : 'null';
  const ext = q('sample-' + String(i + 1).padStart(2, '0'));
  return `  (${q(name)}, ${q(cat)}, ${q(sub)}, ${q(region)}, ${lat}, ${lng}, ${hoursSql}, ${arr(closed, 'smallint')}, ${arr(tags, 'text')}, ${indoor}, ${q(status)}, ${verified}, 'manual', ${ext}, ${q(JSON.stringify(links))}::jsonb, true, ${q('개발용 샘플 장소예요. 실제 업체가 아니에요.')})`;
}).join(',\n');
sql += `
on conflict (source_provider, source_external_id) do update set
  name = excluded.name, category = excluded.category, sub_category = excluded.sub_category, region = excluded.region,
  lat = excluded.lat, lng = excluded.lng, opening_hours = excluded.opening_hours,
  regular_closed_days = excluded.regular_closed_days, kid_tags = excluded.kid_tags, indoor = excluded.indoor;
`;

writeFileSync(new URL('../supabase/migrations/0002_wooz_trip_seed.sql', import.meta.url), sql);
console.log(`places: ${P.length}`);
