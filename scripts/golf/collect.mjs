// 골프장 수집 → Supabase wooz_trip_places (category = golf, 후보로 넣음)
// 출처: 행정안전부_생활_골프장 조회서비스 (data.go.kr 15154978, 이용허락범위 제한 없음, 일간 갱신)
//  - 전국 골프장업 인허가 600여 곳이라 한 번에 7회 정도 호출로 전부 받는다 (개발계정 하루 1만 회).
//  - 좌표는 EPSG:5174(Bessel 중부원점 TM) → WGS84 위경도로 바꾼다.
//  - 한 골프장이 회원제·대중형·9홀로 따로 등록돼 있어서, 이름이 같거나 300m 안에 있는 등록은 한 곳으로 묶는다.
//  - 좌표가 없는 등록은 같은 골프장의 다른 등록 좌표를 쓰고, 그것도 없으면 뺀다.
//  - 영업 중인 곳만 넣는다. 이미 넣은 곳이 폐업·휴업으로 바뀌면 제외(excluded)로 돌린다.
//  - 영업시간·요금·예약 정보는 이 데이터에 없다.
// 실행: node scripts/golf/collect.mjs [--dry]   (--dry = DB 에 안 넣고 data/raw/golf/ 에만 저장)
// 필요: .env.local 의 TOURAPI_SERVICE_KEY (같은 공공데이터포털 인증키), 0007 SQL
import { mkdirSync, writeFileSync } from 'node:fs';
import proj4 from 'proj4';
import { createClient } from '@supabase/supabase-js';
import { regionOf } from '../../src/lib/tourapi/transform.js';

const ROOT = new URL('../../', import.meta.url);
const OUT = new URL('data/raw/golf/', ROOT);
const API = 'https://apis.data.go.kr/1741000/golf_courses/info';
const PAGE = 100;
const dry = process.argv.includes('--dry');

try {
  process.loadEnvFile(new URL('.env.local', ROOT));
} catch {
  // 이미 환경변수가 있으면 그대로
}
const rawKey = process.env.TOURAPI_SERVICE_KEY || '';
const KEY = (() => {
  try {
    return decodeURIComponent(rawKey);
  } catch {
    return rawKey;
  }
})();
if (!KEY) {
  console.error('.env.local 에 TOURAPI_SERVICE_KEY 를 넣어 주세요 (공공데이터포털 일반 인증키)');
  process.exit(1);
}

// 보정계수 없는 Bessel 중부원점 TM (EPSG:5174) + 한국 측지계 → WGS84 변환 계수
const EPSG5174 =
  '+proj=tmerc +lat_0=38 +lon_0=127.0028902777778 +k=1 +x_0=200000 +y_0=500000 +ellps=bessel +units=m +no_defs ' +
  '+towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43';
const toWgs = proj4(EPSG5174, 'EPSG:4326');

// 주소 첫 단어 → 법정동 시도 코드 (src/lib/areas.js 와 같은 코드)
const SIDO = {
  서울특별시: '11', 부산광역시: '26', 대구광역시: '27', 인천광역시: '28', 광주광역시: '29', 대전광역시: '30', 울산광역시: '31',
  세종특별자치시: '36', 경기도: '41', 강원특별자치도: '51', 강원도: '51', 충청북도: '43', 충청남도: '44',
  전북특별자치도: '52', 전라북도: '52', 전라남도: '46', 전남광주통합특별시: '46', 경상북도: '47', 경상남도: '48', 제주특별자치도: '50',
};
const SLUG = { 11: 'seoul', 26: 'busan', 27: 'daegu', 28: 'incheon', 29: 'gwangju', 30: 'daejeon', 31: 'ulsan', 36: 'sejong', 41: 'gyeonggi', 51: 'gangwon', 43: 'chungbuk', 44: 'chungnam', 52: 'jeonbuk', 46: 'jeonnam', 47: 'gyeongbuk', 48: 'gyeongnam', 50: 'jeju' };

async function fetchPage(pageNo) {
  const q = new URLSearchParams({ serviceKey: KEY, pageNo: String(pageNo), numOfRows: String(PAGE), type: 'json' });
  const res = await fetch(`${API}?${q}`);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`응답이 JSON 이 아니에요 (${res.status}): ${text.slice(0, 200)}`);
  }
  const head = json.response?.header;
  if (head?.resultCode !== '0') throw new Error(`API 오류 ${head?.resultCode}: ${head?.resultMsg}`);
  const body = json.response.body;
  const items = body.items?.item || [];
  return { items: Array.isArray(items) ? items : [items], total: Number(body.totalCount || 0) };
}

const extId = (it) => `golf-${it.OPN_ATMY_GRP_CD}-${it.MNG_NO}`;
const addrOf = (it) => (it.ROAD_NM_ADDR || it.LOTNO_ADDR || '').replace(/\s+/g, ' ').trim();

/** 화면에 보일 이름: 법인명·괄호(회원제·홀 수) 뺀 것 */
function cleanName(name) {
  let n = name.trim();
  n = n.replace(/^\(주\)\S*\s+(?=\S)/, '').replace(/^\S*\(주\)\s+(?=\S)/, '').replace(/^\(주\)/, '');
  n = n.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  return n || name.trim();
}
/** 묶기용 이름 열쇠: 골프장 꼬리말·띄어쓰기 뺀 것 */
const nameKey = (name) =>
  cleanName(name)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/(컨트리클럽|골프클럽|골프앤리조트|골프&리조트|골프리조트|골프장|리조트|cc|gc)$/g, '')
    .replace(/제주$/, '');

function point(it) {
  const x = Number(it.CRD_INFO_X);
  const y = Number(it.CRD_INFO_Y);
  if (!x || !y) return null;
  const [lng, lat] = toWgs.forward([x, y]);
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}
function meters(a, b) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 같은 시도 안에서 이름 열쇠가 같거나 300m 안이면 한 골프장으로 묶는다 */
function groupCourses(items) {
  const list = items.map((it) => ({ it, sido: SIDO[addrOf(it).split(' ')[0]] || null, key: nameKey(it.BPLC_NM), pt: point(it) }));
  const parent = list.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (a.sido !== b.sido) continue;
      if (a.key === b.key || (a.pt && b.pt && meters(a.pt, b.pt) < 300)) parent[find(j)] = find(i);
    }
  }
  const groups = new Map();
  list.forEach((x, i) => {
    const g = find(i);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(x);
  });
  return [...groups.values()];
}

function toRow(group) {
  const withPt = group.filter((x) => x.pt && x.sido).sort((a, b) => extId(a.it).localeCompare(extId(b.it)));
  if (!withPt.length) return null;
  const main = withPt[0];
  const sido = main.sido;
  const address = addrOf(main.it);
  const names = group.map((x) => cleanName(x.it.BPLC_NM)).sort((a, b) => a.length - b.length || a.localeCompare(b));
  const phone = group.map((x) => x.it.TELNO).find(Boolean) || null;
  return {
    name: names[0],
    category: 'golf',
    sub_category: '골프장',
    address,
    ...main.pt,
    region: sido === '50' ? regionOf(address, main.pt.lat, main.pt.lng) : SLUG[sido],
    phone,
    source_provider: 'mois',
    // 묶음 안에서 좌표 있는 첫 등록의 관리번호 (관리번호는 지자체마다 겹쳐서 지자체 코드와 묶는다)
    source_external_id: extId(main.it),
    opening_hours: null,
    regular_closed_days: [],
    kid_tags: [],
    indoor: false,
    external_links: {},
    source_data: {
      provider: '행정안전부 생활_골프장 조회서비스',
      registrations: group.map((x) => ({
        id: extId(x.it),
        name: x.it.BPLC_NM,
        kind: x.it.DTIL_TPBIZ_NM || null,
        status: x.it.SALS_STTS_NM,
        permitDate: x.it.LCPMT_YMD || null,
        updatedAt: x.it.LAST_MDFCN_PNT || null,
      })),
    },
    sido_code: sido,
    sigungu_code: null,
  };
}

const all = [];
let total = Infinity;
for (let page = 1; (page - 1) * PAGE < total; page++) {
  const r = await fetchPage(page);
  total = r.total;
  all.push(...r.items);
  if (!r.items.length) break;
}
mkdirSync(OUT, { recursive: true });
writeFileSync(new URL('courses.json', OUT), JSON.stringify({ fetchedAt: new Date().toISOString(), total, items: all }));

const isOpen = (it) => it.SALS_STTS_CD === '01';
const groups = groupCourses(all.filter(isOpen));
const open = groups.map(toRow).filter(Boolean);
const noPoint = groups.filter((g) => !toRow(g)).map((g) => g[0].it.BPLC_NM + ' | ' + addrOf(g[0].it));
// 폐업·휴업 등록이 대표 등록인 곳만 제외로 돌린다 (같은 골프장의 다른 등록이 영업 중이면 영업으로 본다)
const openIds = new Set(open.map((r) => r.source_external_id));
const closedIds = all.filter((it) => !isOpen(it)).map(extId).filter((id) => !openIds.has(id));
const jeju = open.filter((r) => r.sido_code === '50');
console.log(
  `[골프장] 전국 등록 ${all.length}건 받음 → 영업 중 골프장 ${open.length}곳 (제주 ${jeju.length}곳) · 좌표 없어 뺀 곳 ${noPoint.length} · 폐업·휴업 등록 ${closedIds.length}건`,
);
const jejuMissing = noPoint.filter((x) => x.includes('제주특별자치도'));
if (jejuMissing.length) console.log(`  제주 좌표 없음: ${jejuMissing.join(' / ')}`);
if (dry) {
  for (const r of jeju) console.log(`  ${r.name} | ${r.region} | ${r.lat},${r.lng} | ${r.source_data.registrations.map((x) => x.name).join(' + ')}`);
  process.exit(0);
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { error } = await db.rpc('wooz_trip_upsert_places', { rows: open });
if (error) {
  if (/violates check constraint/i.test(error.message)) {
    console.error('DB 가 골프장을 아직 못 받아요 → supabase/migrations/0007_wooz_trip_golf.sql 을 먼저 실행하세요');
  } else {
    console.error(`[골프장] 넣기 실패: ${error.message}`);
  }
  process.exit(1);
}
// 폐업·휴업으로 바뀐 곳은 제외로 (승인돼 있어도 내린다)
for (let i = 0; i < closedIds.length; i += 200) {
  const { error: e2 } = await db
    .from('wooz_trip_places')
    .update({ status: 'excluded' })
    .eq('source_provider', 'mois')
    .in('source_external_id', closedIds.slice(i, i + 200))
    .neq('status', 'excluded');
  if (e2) console.error(`[골프장] 폐업 표시 실패: ${e2.message}`);
}
console.log(`[골프장] DB 반영 ${open.length}곳 (새 곳은 후보, 관리자 화면에서 승인)`);
