// 한국관광공사 TourAPI 에서 전국 장소를 시·도별로 받아 data/raw/tourapi/<지역>/ 에 저장한다.
// LLM 호출 없음 (규칙 기반). 다음 단계: build.mjs → import.mjs
//
// 사용법 (.env.local 에 TOURAPI_SERVICE_KEY — 공공데이터포털 일반 인증키)
//   node scripts/tourapi/collect.mjs auto              매일 실행용: 우선순위대로 목록·상세·공통·무장애를 한도 안에서 받는다
//   node scripts/tourapi/collect.mjs status            지역별 진행 상황
//   node scripts/tourapi/collect.mjs probe [--area jeju]  응답 필드 확인
//   node scripts/tourapi/collect.mjs list --area incheon  한 지역 목록만 다시 받기
//
// 규칙
//  - 지역 순서는 src/lib/areas.js (제주 → 인천 → 경기 → 나머지). 앞 지역을 다 받아야 다음 지역으로 간다.
//  - 목록은 7일마다 다시 받고, 목록의 수정일(modifiedtime)이 바뀐 장소만 상세를 다시 받는다.
//  - 개발 계정은 API 별 하루 1,000회 → 기본 950회에서 멈춘다 (TOURAPI_DAILY_LIMIT 로 조정, 운영계정이면 올린다).
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { AREAS, areaBySlug } from '../../src/lib/areas.js';

const ROOT = new URL('../../', import.meta.url);
const RAW = new URL('data/raw/tourapi/', ROOT);
const BASE = 'https://apis.data.go.kr/B551011/KorService2';
const WITH = 'https://apis.data.go.kr/B551011/KorWithService2';
const TYPES = [12, 14, 39, 28]; // 관광지 → 문화시설 → 음식점 → 레포츠
const DAILY_LIMIT = Number(process.env.TOURAPI_DAILY_LIMIT || 950);
const RELIST_DAYS = 7;

try {
  process.loadEnvFile(new URL('.env.local', ROOT));
} catch {
  // 이미 환경변수가 있으면 그대로
}
const decodeKey = (k) => (k.includes('%') ? decodeURIComponent(k) : k).trim();
const KEY = decodeKey(process.env.TOURAPI_SERVICE_KEY || '');
const WITH_KEY = decodeKey(process.env.TOURAPI_WITH_SERVICE_KEY || '') || KEY;

const args = process.argv.slice(2);
const cmd = args[0] || 'status';
const argOf = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

mkdirSync(RAW, { recursive: true });
const at = (...p) => new URL(p.join('/'), RAW);
const readJson = (url, fallback) => (existsSync(url) ? JSON.parse(readFileSync(url, 'utf8')) : fallback);
const writeJson = (url, v) => writeFileSync(url, JSON.stringify(v, null, 1));
const firstLine = (s) => String(s).split(/\r?\n/)[0];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 예전 제주 전용 폴더 구조 → data/raw/tourapi/jeju/ 로 옮기기 (한 번만) ──
if (existsSync(at('list-12.json'))) {
  mkdirSync(at('jeju'), { recursive: true });
  for (const f of readdirSync(RAW)) {
    if (/^list-\d+\.json$|^withtour-ids\.json$|^intro$|^withtour$/.test(f)) renameSync(at(f), at('jeju', f));
  }
  const items = TYPES.flatMap((t) => readJson(at('jeju', `list-${t}.json`), []));
  const fetched = {};
  const has = (dir, id) => existsSync(at('jeju', dir, `${id}.json`));
  for (const it of items) {
    const id = String(it.contentid);
    fetched[id] = {};
    if (has('intro', id)) fetched[id].intro = it.modifiedtime || '';
    if (has('withtour', id)) fetched[id].with = it.modifiedtime || '';
  }
  writeJson(at('jeju', 'fetched.json'), fetched);
  writeJson(at('jeju', 'state.json'), { listedAt: new Date().toISOString() });
  console.log('예전 제주 수집 파일을 data/raw/tourapi/jeju/ 로 옮겼어요');
}

// ── 호출 횟수 (API 별, 한국 날짜별) ──
const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const usage = readJson(at('usage.json'), {});
const used = (api) => usage[today]?.[api] || 0;
const canCall = (api) => used(api) < DAILY_LIMIT;
function count(api) {
  usage[today] = usage[today] || {};
  usage[today][api] = used(api) + 1;
  writeJson(at('usage.json'), usage);
}

class QuotaError extends Error {
  constructor(api) {
    super(`오늘 ${api === 'with' ? '무장애' : '국문'} API 한도(${DAILY_LIMIT}회)에 닿았어요`);
    this.api = api;
  }
}
class FatalError extends Error {}

/** 공통 호출. 응답이 JSON 이 아니면(키 오류 등) 원문 앞부분과 함께 멈춘다 */
async function call(base, op, params = {}) {
  const api = base === WITH ? 'with' : 'kor';
  if (!canCall(api)) throw new QuotaError(api);
  const q = new URLSearchParams({ serviceKey: api === 'with' ? WITH_KEY : KEY, MobileOS: 'ETC', MobileApp: 'wooztrip', _type: 'json', ...params });
  for (let attempt = 1; attempt <= 3; attempt++) {
    let res;
    try {
      res = await fetch(`${base}/${op}?${q}`, { signal: AbortSignal.timeout(20000) });
    } catch (e) {
      if (attempt === 3) throw e;
      await sleep(1500 * attempt);
      continue;
    }
    count(api);
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      if (/LIMITED_NUMBER_OF_SERVICE_REQUESTS/.test(text)) {
        usage[today][api] = DAILY_LIMIT; // 서버 쪽 한도가 먼저 찼으면 오늘은 그만
        writeJson(at('usage.json'), usage);
        throw new QuotaError(api);
      }
      if (/SERVICE_KEY_IS_NOT_REGISTERED|UNREGISTERED|SERVICE ERROR/i.test(text)) throw new FatalError(`인증키 오류 (${op}): ${firstLine(text).slice(0, 200)}`);
      if (attempt === 3) throw new Error(`JSON 이 아닌 응답 (${op}): ${firstLine(text).slice(0, 200)}`);
      await sleep(1500 * attempt);
      continue;
    }
    const header = json?.response?.header;
    if (header && header.resultCode !== '0000') throw new Error(`${op} 오류 ${header.resultCode}: ${header.resultMsg}`);
    await sleep(100);
    const body = json?.response?.body || {};
    const items = body.items?.item;
    return { items: Array.isArray(items) ? items : items ? [items] : [], total: Number(body.totalCount || 0) };
  }
}

// ── 지역 단위 ──
function areaDir(area) {
  for (const d of ['intro', 'common', 'withtour']) mkdirSync(at(area.slug, d), { recursive: true });
  return {
    items: () => TYPES.flatMap((t) => readJson(at(area.slug, `list-${t}.json`), [])),
    state: () => readJson(at(area.slug, 'state.json'), {}),
    setState: (s) => writeJson(at(area.slug, 'state.json'), s),
    fetched: () => readJson(at(area.slug, 'fetched.json'), {}),
    saveFetched: (f) => writeJson(at(area.slug, 'fetched.json'), f),
  };
}

async function listArea(area) {
  const d = areaDir(area);
  const region = { lDongRegnCd: area.code };
  let total = 0;
  for (const t of TYPES) {
    const all = [];
    for (let page = 1; ; page++) {
      const r = await call(BASE, 'areaBasedList2', { ...region, contentTypeId: String(t), numOfRows: '500', pageNo: String(page), arrange: 'C' });
      all.push(...r.items);
      if (!r.items.length || all.length >= r.total) break;
    }
    writeJson(at(area.slug, `list-${t}.json`), all);
    total += all.length;
  }
  // 무장애 정보가 있는 곳 (선택 — 실패해도 계속)
  try {
    const ids = [];
    for (let page = 1; ; page++) {
      const r = await call(WITH, 'areaBasedList2', { ...region, numOfRows: '500', pageNo: String(page) });
      ids.push(...r.items.map((x) => String(x.contentid)));
      if (!r.items.length || ids.length >= r.total) break;
    }
    writeJson(at(area.slug, 'withtour-ids.json'), ids);
  } catch (e) {
    if (e instanceof FatalError) throw e;
    console.log(`  [${area.name}] 무장애 목록 건너뜀: ${firstLine(e.message)}`);
  }
  d.setState({ ...d.state(), listedAt: new Date().toISOString(), total });
  console.log(`[${area.name}] 목록 ${total}건${total === 0 ? ' — 0건이면 지역 코드 확인 필요' : ''}`);
}

/** 상세 종류별로 아직 안 받았거나 수정일이 바뀐 장소를 받는다 */
async function fetchDetails(area, kind) {
  const d = areaDir(area);
  const fetched = d.fetched();
  let items = d.items();
  if (kind === 'with') {
    const ids = new Set(readJson(at(area.slug, 'withtour-ids.json'), []));
    items = items.filter((x) => ids.has(String(x.contentid)));
  }
  const todo = items.filter((x) => fetched[x.contentid]?.[kind] !== (x.modifiedtime || ''));
  if (!todo.length) return 0;
  let n = 0;
  try {
    for (const it of todo) {
      const id = String(it.contentid);
      let r;
      if (kind === 'intro') r = await call(BASE, 'detailIntro2', { contentId: id, contentTypeId: String(it.contenttypeid) });
      if (kind === 'common') r = await call(BASE, 'detailCommon2', { contentId: id });
      if (kind === 'with') r = await call(WITH, 'detailWithTour2', { contentId: id });
      writeJson(at(area.slug, { intro: 'intro', common: 'common', with: 'withtour' }[kind], `${id}.json`), r.items[0] || {});
      fetched[id] = { ...fetched[id], [kind]: it.modifiedtime || '' };
      if (++n % 100 === 0) {
        d.saveFetched(fetched);
        console.log(`  [${area.name}] ${kind} ${n}/${todo.length}…`);
      }
    }
  } finally {
    d.saveFetched(fetched);
    if (n) console.log(`[${area.name}] ${kind} ${n}건 받음 (남은 것 ${todo.length - n})`);
  }
  return n;
}

async function ensureCodes() {
  if (existsSync(at('codes.json'))) return;
  const names = {};
  for (const cat1 of ['A01', 'A02', 'A03', 'A05']) {
    const c2 = await call(BASE, 'categoryCode2', { cat1, numOfRows: '100' });
    for (const x of c2.items) {
      names[x.code] = x.name;
      const c3 = await call(BASE, 'categoryCode2', { cat1, cat2: x.code, numOfRows: '100' });
      for (const y of c3.items) names[y.code] = y.name;
    }
  }
  writeJson(at('codes.json'), names);
}

// ── 명령 ──
/** 매일 실행: 지역 우선순위대로, 한도가 남는 만큼 */
async function auto() {
  const out = { kor: false, with: false };
  const guard = async (api, fn) => {
    if (out[api]) return;
    try {
      await fn();
    } catch (e) {
      if (e instanceof QuotaError) out[e.api] = true;
      else throw e;
    }
  };
  await guard('kor', ensureCodes);
  for (const area of AREAS) {
    if (out.kor && out.with) break;
    const d = areaDir(area);
    const s = d.state();
    const stale = !s.listedAt || Date.now() - Date.parse(s.listedAt) > RELIST_DAYS * 86400000;
    if (stale) await guard('kor', () => listArea(area));
    if (!d.state().listedAt) continue; // 목록도 못 받았으면 다음 날
    await guard('kor', () => fetchDetails(area, 'intro'));
    await guard('kor', () => fetchDetails(area, 'common'));
    await guard('with', () => fetchDetails(area, 'with'));
    // 앞 지역 상세가 남았으면 다음 지역으로 넘어가지 않는다 (국문 한도가 남았을 때만 넘어감)
    if (out.kor) break;
  }
  if (out.kor) console.log('국문 API 오늘 한도 도달 — 내일 이어서 받아요');
}

async function probe() {
  const area = areaBySlug(argOf('--area') || 'jeju') || AREAS[0];
  for (const t of TYPES) {
    const r = await call(BASE, 'areaBasedList2', { lDongRegnCd: area.code, contentTypeId: String(t), numOfRows: '1', pageNo: '1' });
    const item = r.items[0];
    console.log(`\n[${area.name} ${t}] 목록 ${r.total}건`, item ? `예: ${item.title} (${item.addr1})` : '');
    if (!item) continue;
    const c = await call(BASE, 'detailCommon2', { contentId: item.contentid });
    console.log('공통 필드:', JSON.stringify(c.items[0] || {}).slice(0, 700));
  }
}

function status() {
  console.log(`오늘(${today}) 호출: 국문 ${used('kor')}회 · 무장애 ${used('with')}회 (한도 ${DAILY_LIMIT})\n`);
  for (const area of AREAS) {
    if (!existsSync(at(area.slug, 'state.json'))) continue;
    const d = areaDir(area);
    const items = d.items();
    const f = d.fetched();
    const n = (k) => items.filter((x) => f[x.contentid]?.[k] === (x.modifiedtime || '')).length;
    const withIds = readJson(at(area.slug, 'withtour-ids.json'), []);
    console.log(
      `${area.name.padEnd(3)} 목록 ${items.length} · 상세 ${n('intro')} · 공통 ${n('common')} · 무장애 ${n('with')}/${withIds.length} · 목록 받은 날 ${(d.state().listedAt || '').slice(0, 10)}`
    );
  }
}

const run = {
  auto,
  probe,
  status,
  list: async () => {
    const area = areaBySlug(argOf('--area') || '');
    if (!area) throw new FatalError(`--area 를 지정하세요: ${AREAS.map((a) => a.slug).join(', ')}`);
    await listArea(area);
  },
}[cmd];
if (!run) {
  console.error('명령: auto | status | probe [--area 지역] | list --area 지역');
  process.exit(1);
}
if (cmd !== 'status' && !KEY) {
  console.error('.env.local 에 TOURAPI_SERVICE_KEY 를 넣어 주세요 (공공데이터포털 일반 인증키)');
  process.exit(1);
}
try {
  await run();
  if (cmd !== 'status') {
    console.log('');
    status();
  }
} catch (e) {
  if (e instanceof QuotaError) {
    console.error(e.message + ' — 내일 다시 실행하면 이어서 받아요');
    process.exit(0);
  }
  if (e instanceof FatalError) {
    console.error(e.message);
    process.exit(2);
  }
  throw e;
}
