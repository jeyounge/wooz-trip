// 승인된 장소 목록을 LLM 에 줄 수 있게 내보낸다 → data/places-for-llm.json
// 루트를 만들 때 LLM 에 이 파일을 주고 "이 목록의 ref 만 써라"고 한다 (docs/ai-routes.md).
// gen_ai_routes_sql.mjs 도 이 파일로 장소 참조를 검사한다.
// 실행: node scripts/export_places_for_llm.mjs   (npm run places:export, .env.local 의 service_role 키 사용)
import { writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

try {
  process.loadEnvFile(new URL('../.env.local', import.meta.url));
} catch {
  // 환경변수가 이미 있으면 그대로 쓴다
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('.env.local 에 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 가 필요해요');
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });
// Supabase 는 한 번에 1,000행까지만 준다 → 나눠서 읽는다
const data = [];
for (let from = 0; ; from += 1000) {
  const { data: page, error } = await db
    .from('wooz_trip_places')
    .select('id, name, category, sub_category, region, lat, lng, opening_hours, regular_closed_days, kid_tags, indoor, status')
    .eq('status', 'approved')
    .order('region')
    .order('id')
    .range(from, from + 999);
  if (error) {
    console.error('조회 실패:', error.message);
    process.exit(1);
  }
  data.push(...page);
  if (page.length < 1000) break;
}

const out = data.map((p) => ({
  ref: p.id, // 루트 파일의 place 에 이 숫자를 쓴다
  name: p.name,
  category: p.category,
  sub: p.sub_category,
  region: p.region,
  lat: p.lat,
  lng: p.lng,
  hours: p.opening_hours,
  closed: p.regular_closed_days,
  tags: p.kid_tags,
  indoor: p.indoor,
  status: p.status,
}));
writeFileSync(new URL('../data/places-for-llm.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(`장소 ${out.length}곳 → data/places-for-llm.json`);
