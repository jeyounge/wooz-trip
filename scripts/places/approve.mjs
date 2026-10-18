// 후보 장소를 한 번에 승인한다. 소개 문장이 비어 있으면 관리자 「소개 초안 만들기」와 같은 문장으로 채운다.
//
//   node scripts/places/approve.mjs --area jeju --with-hours          시험: 몇 곳이 승인될지만 보여줌
//   node scripts/places/approve.mjs --area jeju --with-hours --apply  실제 승인
//
//  --with-hours : 영업시간이 들어온 곳만 (승인하면 매일 자동 반영이 더 이상 덮어쓰지 않으므로)
//  샘플 장소, 이미 승인·제외한 곳은 건드리지 않는다.
import { createClient } from '@supabase/supabase-js';
import { areaBySlug } from '../../src/lib/areas.js';
import { introTemplate } from '../../src/lib/intro.js';

const ROOT = new URL('../../', import.meta.url);
try {
  process.loadEnvFile(new URL('.env.local', ROOT));
} catch {
  // 이미 환경변수가 있으면 그대로
}
const args = process.argv.slice(2);
const argOf = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const area = areaBySlug(argOf('--area') || 'jeju');
if (!area) throw new Error('--area 를 확인해 주세요');
const apply = args.includes('--apply');
const withHours = args.includes('--with-hours');

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: tags, error: tagErr } = await db.from('wooz_trip_kid_tags').select('id, label');
if (tagErr) throw tagErr;
const labels = Object.fromEntries(tags.map((t) => [t.id, t.label]));

const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from('wooz_trip_places')
    .select('id, name, category, sub_category, indoor, kid_tags, intro, opening_hours')
    .eq('status', 'candidate')
    .eq('is_sample', false)
    .eq('sido_code', area.code)
    .order('id')
    .range(from, from + 999);
  if (error) throw error;
  rows.push(...data);
  if (data.length < 1000) break;
}
const targets = withHours ? rows.filter((p) => p.opening_hours) : rows;
const count = (k) => targets.filter((p) => p.category === k).length;
console.log(`[${area.name}] 후보 ${rows.length}곳 중 승인 대상 ${targets.length}곳 (볼거리 ${count('sight')} · 식당 ${count('food')} · 카페 ${count('cafe')})`);
if (!apply) {
  console.log('시험 실행이에요. 실제로 승인하려면 --apply 를 붙여 주세요. 예시 소개 문장:');
  for (const p of targets.slice(0, 5)) console.log(`  ${p.name} → ${p.intro || introTemplate(p, labels)}`);
  process.exit(0);
}

// 소개 문장이 같은 장소끼리 묶어서 한 번에 고친다
const verified_ts = new Date().toISOString();
const groups = new Map();
for (const p of targets) {
  const intro = p.intro || introTemplate(p, labels);
  if (!groups.has(intro)) groups.set(intro, []);
  groups.get(intro).push(p.id);
}
let done = 0;
for (const [intro, ids] of groups) {
  for (let i = 0; i < ids.length; i += 200) {
    const part = ids.slice(i, i + 200);
    const { error } = await db.from('wooz_trip_places').update({ status: 'approved', verified_ts, intro }).in('id', part).eq('status', 'candidate');
    if (error) throw error;
    done += part.length;
  }
}
console.log(`승인했어요: ${done}곳`);
