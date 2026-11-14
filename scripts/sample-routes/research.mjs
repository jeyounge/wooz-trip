// 추천 루트 만들기 전 조사: 카카오 블로그 검색 API 결과(제목·요약)에서
// 볼거리 풀(pool-<지역>.mjs)의 장소 이름이 같은 글에 함께 나오는 횟수를 센다.
// 블로그 본문은 열지 않는다. 검색 결과 요약만 쓰고, 규칙(이름 일치)으로만 센다.
//   node scripts/sample-routes/research.mjs                 경기 남부 → data/sample-routes/gyeonggi-research.json
//   node scripts/sample-routes/research.mjs --dest incheon  인천 → data/sample-routes/incheon-research.json
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';

const argAt = process.argv.indexOf('--dest');
const AREA = (argAt > 0 ? process.argv[argAt + 1] : 'gyeonggi-south').split('-')[0];
const { LINES } = await import(`../ai-routes/pool-${AREA}.mjs`);

const ROOT = new URL('../../', import.meta.url);
try {
  process.loadEnvFile(new URL('.env.local', ROOT));
} catch {}
const KAKAO = (process.env.KAKAO_REST_API_KEY || '').trim();
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const refs = LINES.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => Number(l.split('|')[0]));
const { data: places, error } = await db.from('wooz_trip_places').select('id, name, region, lat, lng, indoor').in('id', refs);
if (error) throw error;
const clean = (s) => s.replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/g, ' ');
// 이름 일치용 핵심 이름: 괄호·지점명 빼고, 띄어쓰기 없이
const key = (n) => n.replace(/\s*[[(（【].*?[\])）】]/g, '').replace(/\s+/g, '');
const named = places.map((p) => ({ ...p, k: key(p.name) })).filter((p) => p.k.length >= 3);

// 검색어 앞말: 시·동네 이름 15개 × 동행·일정 5개
const CITIES = {
  gyeonggi: ['수원', '화성', '용인', '이천', '성남', '분당', '판교', '안양', '의왕', '군포', '과천', '안산', '시흥', '오산', '광명'],
  incheon: ['인천', '송도', '월미도', '차이나타운', '개항장', '소래포구', '강화도', '석모도', '영종도', '을왕리', '무의도', '영흥도', '청라', '부평', '계양'],
}[AREA];
const WHO = ['아이와', '부모님과', '데이트', '당일치기 코스', '1박2일 코스'];
const queries = CITIES.flatMap((c) => WHO.map((w) => `${c} ${w}`));

const docs = new Map();
for (const q of queries) {
  for (const page of [1, 2]) {
    const res = await fetch(`https://dapi.kakao.com/v2/search/blog?${new URLSearchParams({ query: q, size: '50', page: String(page), sort: 'accuracy' })}`, {
      headers: { Authorization: `KakaoAK ${KAKAO}` },
    });
    if (!res.ok) throw new Error(`카카오 검색 ${res.status}`);
    const j = await res.json();
    for (const d of j.documents) docs.set(d.url, { q, text: clean(d.title + ' ' + d.contents).replace(/\s+/g, '') });
    if (j.meta.is_end) break;
    await new Promise((r) => setTimeout(r, 300));
  }
}
const count = new Map();
const pair = new Map();
const byQuery = {};
for (const { q, text } of docs.values()) {
  const hit = named.filter((p) => text.includes(p.k)).map((p) => p.id);
  for (const id of hit) {
    count.set(id, (count.get(id) || 0) + 1);
    (byQuery[q] ||= {})[id] = (byQuery[q][id] || 0) + 1;
  }
  for (let i = 0; i < hit.length; i++) for (let j = i + 1; j < hit.length; j++) {
    const k2 = [hit[i], hit[j]].sort((a, b) => a - b).join('-');
    pair.set(k2, (pair.get(k2) || 0) + 1);
  }
}
const byId = Object.fromEntries(places.map((p) => [p.id, p]));
const top = [...count].sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ id, n, name: byId[id].name, region: byId[id].region }));
const pairs = [...pair].sort((a, b) => b[1] - a[1]).slice(0, 150).map(([k2, n]) => ({ n, a: byId[k2.split('-')[0]].name, b: byId[k2.split('-')[1]].name, ids: k2 }));
writeFileSync(new URL(`data/sample-routes/${AREA}-research.json`, ROOT), JSON.stringify({ at: new Date().toISOString(), posts: docs.size, top, pairs }, null, 1));
console.log(`글 ${docs.size}개`);
for (const t of top) console.log(`${t.n}\t${t.id}\t${t.region}\t${t.name}`);
console.log('---- 함께 나온 쌍');
for (const p of pairs.slice(0, 80)) console.log(`${p.n}\t${p.a} + ${p.b}`);
console.log('---- 풀에 있지만 안 나온 곳');
for (const p of places) if (!count.has(p.id)) console.log(`${p.id}\t${p.region}\t${p.name}`);
