// data/raw/blog/<지역>/*.json (후기 근거) → wooz_trip_places.review_facts (0005 필요)
// 지난번과 달라진 장소만 보낸다. 실행: node scripts/blogfacts/sync.mjs [--all]
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { AREAS } from '../../src/lib/areas.js';

const ROOT = new URL('../../', import.meta.url);
const OUT = new URL('data/raw/blog/', ROOT);
const force = process.argv.includes('--all');
try {
  process.loadEnvFile(new URL('.env.local', ROOT));
} catch {
  // 이미 환경변수가 있으면 그대로
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const readJson = (u, f) => (existsSync(u) ? JSON.parse(readFileSync(u, 'utf8')) : f);
const hash = (v) => createHash('sha1').update(JSON.stringify(v)).digest('base64').slice(0, 16);

const doneFile = new URL('synced.json', OUT);
const done = force ? {} : readJson(doneFile, {});
const rows = [];
for (const area of AREAS) {
  const dir = new URL(`${area.slug}/`, OUT);
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const j = readJson(new URL(f, dir), null);
    if (!j?.key) continue;
    const review_facts = { checkedAt: j.checkedAt, tags: j.result.tags, nokids: j.result.nokids };
    if (done[j.key] === hash(review_facts)) continue;
    rows.push({ source_provider: 'tourapi', source_external_id: j.key, review_facts });
  }
}

let sent = 0;
for (let i = 0; i < rows.length; i += 300) {
  const batch = rows.slice(i, i + 300);
  const { error } = await db.rpc('wooz_trip_set_review_facts', { rows: batch });
  if (error) {
    console.error(
      /does not exist|Could not find the function/i.test(error.message)
        ? 'DB 에 wooz_trip_set_review_facts 함수가 없어요 → supabase/migrations/0005_wooz_trip_review_facts.sql 을 먼저 실행하세요'
        : `후기 근거 반영 실패: ${error.message}`
    );
    process.exitCode = 2;
    break;
  }
  for (const r of batch) done[r.source_external_id] = hash(r.review_facts);
  sent += batch.length;
}
writeFileSync(doneFile, JSON.stringify(done));
console.log(`후기 근거 DB 반영 ${sent}곳 (보낼 것 ${rows.length})`);
