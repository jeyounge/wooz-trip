// 한국관광공사 TourAPI 에서 제주 장소를 받아 data/raw/tourapi/ 에 저장한다 (DB 에는 아직 안 넣는다)
// 다음 단계: node scripts/tourapi/build.mjs → 검수 파일 + SQL
//
// 사용법 (.env.local 에 TOURAPI_SERVICE_KEY 필요 — 공공데이터포털 "일반 인증키(Decoding)")
//   node scripts/tourapi/collect.mjs probe            종류별로 1건씩 받아 응답 필드를 보여준다 (호출 약 10회)
//   node scripts/tourapi/collect.mjs list             제주 장소 목록 (관광지·문화시설·레포츠·음식점, 호출 약 20회)
//   node scripts/tourapi/collect.mjs detail [--max N] 영업시간·휴무 상세 (장소당 1회, 받은 것은 건너뜀)
//   node scripts/tourapi/collect.mjs withtour [--max N] 유모차·수유실·유아의자 (무장애 정보가 있는 곳만)
//   node scripts/tourapi/collect.mjs status           얼마나 받았는지
//
// 개발 계정은 API 별로 하루 1,000회까지다. 오늘 쓴 횟수를 data/raw/tourapi/usage.json 에 세고
// 한도(기본 950)에 닿으면 멈춘다. 다음 날 같은 명령을 다시 실행하면 이어서 받는다.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url);
const RAW = new URL('data/raw/tourapi/', ROOT);
const BASE = 'https://apis.data.go.kr/B551011/KorService2';
const WITH = 'https://apis.data.go.kr/B551011/KorWithService2';
const TYPES = [12, 14, 28, 39];
// 제주 필터. 기본은 법정동 시도 코드 50. probe 결과가 0건이면 .env.local 에 TOURAPI_REGION=areaCode=39 로 바꾼다
const JEJU = Object.fromEntries([String(process.env.TOURAPI_REGION || 'lDongRegnCd=50').split('=')]);
const DAILY_LIMIT = Number(process.env.TOURAPI_DAILY_LIMIT || 950);

try {
  process.loadEnvFile(new URL('.env.local', ROOT));
} catch {
  // 이미 환경변수가 있으면 그대로
}
// Encoding 키(%가 들어간 것)를 넣어도 동작하게 풀어서 쓴다
const decodeKey = (k) => (k.includes('%') ? decodeURIComponent(k) : k).trim();
const KEY = decodeKey(process.env.TOURAPI_SERVICE_KEY || ''); // 국문 관광정보
const WITH_KEY = decodeKey(process.env.TOURAPI_WITH_SERVICE_KEY || '') || KEY; // 무장애 (따로 받았으면 이 키, 없으면 국문 키)

const args = process.argv.slice(2);
const cmd = args[0] || 'status';
const maxArg = Number(args[args.indexOf('--max') + 1]) || Infinity;

mkdirSync(new URL('intro/', RAW), { recursive: true });
mkdirSync(new URL('withtour/', RAW), { recursive: true });

const file = (name) => new URL(name, RAW);
const readJson = (name, fallback) => (existsSync(file(name)) ? JSON.parse(readFileSync(file(name), 'utf8')) : fallback);
const writeJson = (name, v) => writeFileSync(file(name), JSON.stringify(v, null, 1));

// ── 호출 횟수 (API 별, 날짜별) ──
const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // 한국 날짜
const usage = readJson('usage.json', {});
const used = (api) => usage[today]?.[api] || 0;
function count(api) {
  usage[today] = usage[today] || {};
  usage[today][api] = used(api) + 1;
  writeJson('usage.json', usage);
}

class StopError extends Error {}
const firstLine = (s) => String(s).split(/\r?\n/)[0];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 공통 호출. 응답이 JSON 이 아니면(키 오류 등) 원문을 보여주고 멈춘다 */
async function call(base, op, params = {}) {
  const api = base === WITH ? 'with' : 'kor';
  if (used(api) >= DAILY_LIMIT) throw new StopError(`오늘 ${api === 'with' ? '무장애' : '국문'} API 호출 ${used(api)}회 — 한도에 닿아 멈춰요. 내일 다시 실행하면 이어서 받아요.`);
  const q = new URLSearchParams({ serviceKey: base === WITH ? WITH_KEY : KEY, MobileOS: 'ETC', MobileApp: 'wooztrip', _type: 'json', ...params });
  for (let attempt = 1; attempt <= 3; attempt++) {
    let res;
    try {
      res = await fetch(`${base}/${op}?${q}`, { signal: AbortSignal.timeout(20000) });
    } catch (e) {
      if (attempt === 3) throw e;
      await sleep(1000 * attempt);
      continue;
    }
    count(api);
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      if (/LIMITED_NUMBER_OF_SERVICE_REQUESTS/.test(text)) throw new StopError('오늘 호출 한도를 넘었어요. 내일 다시 실행하세요.');
      if (/SERVICE_KEY_IS_NOT_REGISTERED|SERVICE ERROR|UNREGISTERED/i.test(text)) throw new StopError(`인증키 오류: 활용신청 승인/키 값을 확인하세요.\n${text.slice(0, 300)}`);
      if (attempt === 3) throw new StopError(`JSON 이 아닌 응답 (${op}):\n${text.slice(0, 300)}`);
      await sleep(1000 * attempt);
      continue;
    }
    const header = json?.response?.header;
    if (header && header.resultCode !== '0000') throw new StopError(`${op} 오류 ${header.resultCode}: ${header.resultMsg}`);
    await sleep(120);
    const body = json?.response?.body || {};
    const items = body.items?.item;
    return { items: Array.isArray(items) ? items : items ? [items] : [], total: Number(body.totalCount || 0), raw: json };
  }
}

// ── 명령 ──
async function probe() {
  console.log('지역 필터 확인:');
  for (const region of [{ lDongRegnCd: '50' }, { areaCode: '39' }]) {
    try {
      const r = await call(BASE, 'areaBasedList2', { ...region, contentTypeId: '12', numOfRows: '1', pageNo: '1' });
      console.log(' ', JSON.stringify(region), '→ 전체', r.total, '건', r.items[0] ? `예: ${r.items[0].title} (${r.items[0].addr1})` : '');
    } catch (e) {
      console.log(' ', JSON.stringify(region), '→ 실패:', firstLine(e.message));
    }
  }
  console.log('지금 쓰는 필터:', JSON.stringify(JEJU));
  for (const t of TYPES) {
    const r = await call(BASE, 'areaBasedList2', { ...JEJU, contentTypeId: String(t), numOfRows: '1', pageNo: '1' });
    const item = r.items[0];
    console.log(`\n[${t}] 목록 ${r.total}건 · 목록 필드:`, item ? Object.keys(item).join(', ') : '(없음)');
    if (!item) continue;
    const d = await call(BASE, 'detailIntro2', { contentId: item.contentid, contentTypeId: String(t) });
    console.log(`[${t}] 상세 필드:`, JSON.stringify(d.items[0] || {}, null, 0).slice(0, 900));
  }
  // 무장애 API 는 선택 (활용신청 전이면 건너뛴다)
  try {
    const w = await call(WITH, 'areaBasedList2', { ...JEJU, numOfRows: '1', pageNo: '1' });
    console.log('\n무장애 목록', w.total, '건', w.items[0] ? Object.keys(w.items[0]).join(', ') : '');
    if (w.items[0]) {
      const d = await call(WITH, 'detailWithTour2', { contentId: w.items[0].contentid });
      console.log('무장애 상세 필드:', JSON.stringify(d.items[0] || {}).slice(0, 900));
    }
  } catch (e) {
    console.log('\n무장애 API 건너뜀 (활용신청 전이면 정상):', firstLine(e.message));
  }
  writeJson('probe.json', { at: new Date().toISOString() });
}

async function list() {
  for (const t of TYPES) {
    const all = [];
    for (let page = 1; ; page++) {
      const r = await call(BASE, 'areaBasedList2', { ...JEJU, contentTypeId: String(t), numOfRows: '500', pageNo: String(page), arrange: 'C' });
      all.push(...r.items);
      if (!r.items.length || all.length >= r.total) break;
    }
    writeJson(`list-${t}.json`, all);
    console.log(`[${t}] ${all.length}건 저장`);
  }
  // 분류 이름 (cat3 → "카페/전통찻집" 등). 실패해도 계속
  try {
    const names = readJson('codes.json', {});
    for (const cat1 of ['A01', 'A02', 'A03', 'A05']) {
      const c2 = await call(BASE, 'categoryCode2', { cat1, numOfRows: '100' });
      for (const x of c2.items) {
        names[x.code] = x.name;
        const c3 = await call(BASE, 'categoryCode2', { cat1, cat2: x.code, numOfRows: '100' });
        for (const y of c3.items) names[y.code] = y.name;
      }
    }
    writeJson('codes.json', names);
    console.log(`분류 이름 ${Object.keys(names).length}개 저장`);
  } catch (e) {
    if (/한도/.test(e.message)) throw e;
    console.warn('분류 이름은 건너뜀:', firstLine(e.message));
  }
  // 무장애 정보가 있는 장소 ID 목록
  // (선택) 무장애 API 활용신청 전이면 건너뛰고, 나중에 list 를 다시 실행하면 채워진다
  try {
    const ids = [];
    for (let page = 1; ; page++) {
      const r = await call(WITH, 'areaBasedList2', { ...JEJU, numOfRows: '500', pageNo: String(page) });
      ids.push(...r.items.map((x) => String(x.contentid)));
      if (!r.items.length || ids.length >= r.total) break;
    }
    writeJson('withtour-ids.json', ids);
    console.log(`무장애 정보 있는 곳 ${ids.length}건`);
  } catch (e) {
    console.log('무장애 API 건너뜀 (활용신청 전이면 정상):', firstLine(e.message));
  }
}

function listed() {
  // 가족 여행에 쓸 가능성이 높은 순서: 관광지 → 문화시설 → 음식점 → 레포츠
  return [12, 14, 39, 28].flatMap((t) => readJson(`list-${t}.json`, []));
}

async function detail() {
  const items = listed();
  if (!items.length) throw new StopError('먼저 list 를 실행하세요');
  const have = new Set(readdirSync(new URL('intro/', RAW)).map((f) => f.replace('.json', '')));
  const todo = items.filter((x) => !have.has(String(x.contentid)));
  console.log(`상세: 받은 것 ${have.size} · 남은 것 ${todo.length}`);
  let n = 0;
  for (const it of todo) {
    if (n >= maxArg) break;
    const r = await call(BASE, 'detailIntro2', { contentId: String(it.contentid), contentTypeId: String(it.contenttypeid) });
    writeJson(`intro/${it.contentid}.json`, r.items[0] || {});
    if (++n % 50 === 0) console.log(`  ${n}건…`);
  }
  console.log(`상세 ${n}건 받음`);
}

async function withtour() {
  const ids = readJson('withtour-ids.json', []);
  const mine = new Set(listed().map((x) => String(x.contentid)));
  const have = new Set(readdirSync(new URL('withtour/', RAW)).map((f) => f.replace('.json', '')));
  const todo = ids.filter((id) => mine.has(id) && !have.has(id));
  console.log(`무장애: 받은 것 ${have.size} · 남은 것 ${todo.length}`);
  let n = 0;
  for (const id of todo) {
    if (n >= maxArg) break;
    const r = await call(WITH, 'detailWithTour2', { contentId: id });
    writeJson(`withtour/${id}.json`, r.items[0] || {});
    n++;
  }
  console.log(`무장애 상세 ${n}건 받음`);
}

function status() {
  const items = listed();
  const intro = readdirSync(new URL('intro/', RAW)).length;
  const wt = readdirSync(new URL('withtour/', RAW)).length;
  console.log(`목록 ${items.length}건 · 상세 ${intro}건 · 무장애 상세 ${wt}건`);
  console.log(`오늘(${today}) 호출: 국문 ${used('kor')}회, 무장애 ${used('with')}회 (한도 ${DAILY_LIMIT})`);
}

const run = { probe, list, detail, withtour, status }[cmd];
if (!run) {
  console.error('명령: probe | list | detail | withtour | status');
  process.exit(1);
}
if (cmd !== 'status' && !KEY) {
  console.error('.env.local 에 TOURAPI_SERVICE_KEY 를 넣어 주세요 (공공데이터포털 일반 인증키)');
  process.exit(1);
}
try {
  await run();
  if (cmd !== 'status') status();
} catch (e) {
  if (e instanceof StopError) {
    console.error('\n' + e.message);
    status();
    process.exit(2);
  }
  throw e;
}
