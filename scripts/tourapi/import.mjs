// data/build/<지역>.json → Supabase wooz_trip_places (wooz_trip_upsert_places 함수, 0004 필요)
// 지난번에 넣은 내용과 달라진 장소만 보낸다 (data/build/<지역>.imported.json 에 지문 저장).
// 승인·제외된 장소는 덮어쓰지 않지만, 영업시간이 비어 있으면 그 칸만 채운다 (운영자가 고친 곳은 빼고).
// 실행: node scripts/tourapi/import.mjs [--area jeju] [--all]   (--all = 지문 무시하고 전부 다시)
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { AREAS, areaBySlug } from '../../src/lib/areas.js';

const ROOT = new URL('../../', import.meta.url);
const BUILD = new URL('data/build/', ROOT);
const BATCH = 300;
const args = process.argv.slice(2);
const only = args.includes('--area') ? areaBySlug(args[args.indexOf('--area') + 1]) : null;
const force = args.includes('--all');

try {
    process.loadEnvFile(new URL('.env.local', ROOT));
  } catch {
    // 이미 환경변수가 있으면 그대로
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('.env.local 에 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 가 필요해요');
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });
  const readJson = (u, fallback) => (existsSync(u) ? JSON.parse(readFileSync(u, 'utf8')) : fallback);
  const hash = (row) => createHash('sha1').update(JSON.stringify(row)).digest('base64').slice(0, 16);

  class StopImport extends Error {}

  /** 승인·제외 장소 중 영업시간이 빈 곳에 새로 알게 된 영업시간만 넣는다 */
  async function fillHours(area, rows) {
    const byId = new Map(rows.filter((r) => r.opening_hours).map((r) => [r.source_external_id, r.opening_hours]));
    const ids = [...byId.keys()];
    let filled = 0;
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await db
        .from('wooz_trip_places')
        .select('id, source_external_id')
        .eq('source_provider', 'tourapi')
        .neq('status', 'candidate')
        .is('opening_hours', null)
        .is('edited_ts', null)
        .in('source_external_id', ids.slice(i, i + 200));
      if (error) throw new StopImport(`[${area.name}] 영업시간 채우기 조회 실패: ${error.message}`);
      for (const p of data) {
        const { error: e2 } = await db.from('wooz_trip_places').update({ opening_hours: byId.get(p.source_external_id) }).eq('id', p.id);
        if (e2) throw new StopImport(`[${area.name}] 영업시간 채우기 실패: ${e2.message}`);
        filled++;
      }
    }
    if (filled) console.log(`[${area.name}] 승인 장소 영업시간 채움 ${filled}곳`);
  }
  let total = 0;
  try {
  for (const area of only ? [only] : AREAS) {
    const file = new URL(`${area.slug}.json`, BUILD);
    if (!existsSync(file)) continue;
    const { rows } = readJson(file, { rows: [] });
    const doneFile = new URL(`${area.slug}.imported.json`, BUILD);
    const done = force ? {} : readJson(doneFile, {});
    const changed = rows.filter((r) => done[r.source_external_id] !== hash(r));
    if (!changed.length) {
      console.log(`[${area.name}] 바뀐 장소 없음`);
      await fillHours(area, rows);
      continue;
    }
    let sent = 0;
    for (let i = 0; i < changed.length; i += BATCH) {
      const batch = changed.slice(i, i + BATCH);
      const { error } = await db.rpc('wooz_trip_upsert_places', { rows: batch });
      if (error) {
        writeFileSync(doneFile, JSON.stringify(done));
        if (/function .*does not exist|Could not find the function/i.test(error.message)) {
          throw new StopImport('DB 에 wooz_trip_upsert_places 함수가 없어요 → supabase/migrations/0004_wooz_trip_places_import.sql 을 먼저 실행하세요');
        }
        throw new StopImport(`[${area.name}] 넣기 실패 (${sent}곳까지 성공): ${error.message}`);
      }
      for (const r of batch) done[r.source_external_id] = hash(r);
      sent += batch.length;
    }
    writeFileSync(doneFile, JSON.stringify(done));
    total += sent;
    console.log(`[${area.name}] ${sent}곳 반영 (전체 ${rows.length}곳 중 바뀐 것)`);
    await fillHours(area, rows);
  }
  console.log(`DB 반영 ${total}곳`);
} catch (e) {
  if (!(e instanceof StopImport)) throw e;
  console.error(e.message);
  process.exitCode = 2;
}
