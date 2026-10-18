// 블로그 후기에서 장소 사실(아기의자·주차·유아 메뉴 …)을 규칙으로 뽑아 근거와 함께 저장한다. LLM 호출 없음.
//
//  1) 찾기: 카카오(다음) 블로그 검색 API — "장소명 + 지역" (네이버 검색 페이지는 robots.txt 가 금지라 쓰지 않는다)
//  2) 읽기: 검색된 글 페이지를 robots.txt 가 허용할 때만, 3초에 1건씩. 차단(403·429·캡차)되면 그날은 멈춘다. 우회하지 않는다.
//  3) 뽑기: src/lib/blogfacts/rules.js 사전으로 태그별 있음/없음 → 여러 글 집계 (2개 이상 일치해야 인정)
//  4) 저장: data/raw/blog/<지역>/<장소ID>.json — 글 주소·날짜·판정만 (본문·작성자는 저장하지 않음)
//
// 실행:
//   node scripts/blogfacts/run.mjs --area jeju --limit 10 --sample   시험: 종류를 섞어 10곳
//   node scripts/blogfacts/run.mjs --area jeju --limit 50             승인 장소 → 후보 순으로 50곳 (DB 에서 승인 목록을 읽음)
//   node scripts/blogfacts/run.mjs status
// 읽는 글 수 한도: 한 번 실행에 BLOG_RUN_POSTS (기본 300), 하루 합계 BLOG_DAILY_POSTS (기본 900).
//   하루 3번(00:10·08:10·16:10) 나눠 돌려서 한 번에 몰리지 않게 한다. 같은 장소는 90일마다 다시 확인.
//   네이버가 막으면 그날 남은 실행도 모두 쉰다 (usage.json 에 기록).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { AREAS, areaBySlug } from '../../src/lib/areas.js';
import { aggregate, analyzePost, FACT_RULES, factsInSentence, htmlToSentences } from '../../src/lib/blogfacts/rules.js';

const ROOT = new URL('../../', import.meta.url);
const OUT = new URL('data/raw/blog/', ROOT);
const UA = 'WoozTripFactBot/0.1 (family travel place facts; respects robots.txt)';
const POST_GAP_MS = 3000;
const POSTS_PER_PLACE = 8;
const RECHECK_DAYS = 90;
const DAILY_POSTS = Number(process.env.BLOG_DAILY_POSTS || 900);
const RUN_POSTS = Number(process.env.BLOG_RUN_POSTS || 300);
let postsThisRun = 0;

try {
  process.loadEnvFile(new URL('.env.local', ROOT));
} catch {
  // 이미 환경변수가 있으면 그대로
}
const KAKAO = (process.env.KAKAO_REST_API_KEY || '').trim();
const args = process.argv.slice(2);
const argOf = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const cmd = args[0] && !args[0].startsWith('--') ? args[0] : 'run';
const area = areaBySlug(argOf('--area') || 'jeju') || AREAS[0];
const limit = Number(argOf('--limit') || 20);

mkdirSync(new URL(`${area.slug}/`, OUT), { recursive: true });
const readJson = (u, f) => (existsSync(u) ? JSON.parse(readFileSync(u, 'utf8')) : f);
const writeJson = (u, v) => writeFileSync(u, JSON.stringify(v, null, 1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const usageFile = new URL('usage.json', OUT);
const usage = readJson(usageFile, {});
const postsToday = () => usage[today]?.posts || 0;
function countPost() {
  postsThisRun++;
  usage[today] = { ...usage[today], posts: postsToday() + 1 };
  writeJson(usageFile, usage);
}
const blockedToday = () => usage[today]?.blocked;
function markBlocked(why) {
  usage[today] = { ...usage[today], blocked: why };
  writeJson(usageFile, usage);
}

class Blocked extends Error {}

// ── robots.txt (호스트별 캐시) ──
const robotsCache = new Map();
async function allowed(url) {
  const u = new URL(url);
  if (!robotsCache.has(u.host)) {
    let rules = [];
    try {
      const res = await fetch(`${u.protocol}//${u.host}/robots.txt`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) });
      if (res.ok) rules = parseRobots(await res.text());
      else if (res.status === 401 || res.status === 403) rules = [{ allow: false, path: '/' }];
    } catch {
      rules = [];
    }
    robotsCache.set(u.host, rules);
  }
  const path = u.pathname + u.search;
  let best = null;
  for (const r of robotsCache.get(u.host)) if (path.startsWith(r.path) && (!best || r.path.length > best.path.length)) best = r;
  return !best || best.allow;
}
/** 우리 봇 이름 그룹이 있으면 그것을, 없으면 * 그룹을 쓴다 */
function parseRobots(text) {
  const groups = [];
  let cur = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const [, k, v] = m;
    if (/^user-agent$/i.test(k)) {
      if (!lastWasAgent) groups.push((cur = { agents: [], rules: [] }));
      cur.agents.push(v.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (cur && /^(dis)?allow$/i.test(k) && v) cur.rules.push({ allow: /^allow$/i.test(k), path: v });
    }
  }
  const mine = groups.find((g) => g.agents.some((a) => a !== '*' && UA.toLowerCase().includes(a)));
  return (mine || groups.find((g) => g.agents.includes('*')) || { rules: [] }).rules;
}

// ── 찾기: 카카오 블로그 검색 ──
async function searchBlogs(place) {
  const words = (place.address || '').split(/\s+/);
  const where = (words[1] || area.name).replace(/(특별자치시|특별자치도|광역시|특별시|시|군|구)$/, '');
  const query = `${place.name.replace(/\([^)]*\)|\[[^\]]*\]/g, '').trim()} ${where}`;
  const res = await fetch(`https://dapi.kakao.com/v2/search/blog?${new URLSearchParams({ query, size: '20', sort: 'accuracy' })}`, {
    headers: { Authorization: `KakaoAK ${KAKAO}` },
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 401) throw new Error('카카오 REST API 키 오류');
  if (!res.ok) throw new Error(`카카오 검색 ${res.status}`);
  const j = await res.json();
  const cutoff = Date.now() - 3 * 365 * 86400000;
  const seen = new Set();
  const docs = (j.documents || []).filter((d) => {
    if (seen.has(d.url) || Date.parse(d.datetime) < cutoff) return false;
    seen.add(d.url);
    return /blog\.naver\.com|tistory\.com|blog\.daum\.net|brunch\.co\.kr/.test(d.url);
  });
  return { query, docs: docs.slice(0, POSTS_PER_PLACE) };
}

// ── 읽기 ──
function readableUrl(url) {
  const m = url.match(/^https?:\/\/blog\.naver\.com\/([^/?#]+)\/(\d+)/);
  return m ? `https://m.blog.naver.com/${m[1]}/${m[2]}` : url;
}
// 차단: 네이버가 막으면 그날 전체를 멈추고, 다른 블로그 호스트가 막으면 그 호스트만 오늘 건너뛴다
const blockedHosts = new Set();
const isNaver = (host) => /(^|\.)naver\.com$/.test(host);
function onBlocked(host, why) {
  if (isNaver(host)) {
    markBlocked(`${host} ${why}`);
    throw new Blocked(`${host} ${why} — 네이버가 막아서 오늘은 멈춰요`);
  }
  blockedHosts.add(host);
  console.log(`    (${host} ${why} — 오늘은 이 블로그만 건너뜀)`);
  return { skipped: 'blocked' };
}

async function fetchPost(url) {
  const target = readableUrl(url);
  const host = new URL(target).host;
  if (blockedHosts.has(host)) return { skipped: 'blocked' };
  if (!(await allowed(target))) return { skipped: 'robots' };
  if (postsToday() >= DAILY_POSTS) throw new Blocked(`오늘 읽기 한도(${DAILY_POSTS}개) 도달`);
  if (postsThisRun >= RUN_POSTS) throw new Blocked(`이번 실행 한도(${RUN_POSTS}개) 도달 — 다음 실행에서 이어서`);
  await sleep(POST_GAP_MS);
  const res = await fetch(target, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
  countPost();
  if (res.status === 403 || res.status === 429) return onBlocked(host, `접근 거부(${res.status})`);
  if (!res.ok) return { skipped: `http ${res.status}` };
  const html = await res.text();
  // 본문이 없고 차단 문구가 있을 때만 차단으로 본다 (티스토리 등은 댓글용 캡차 스크립트를 늘 싣는다)
  const hasBody = /se-main-container|tt_article_useless_p_margin|article-view|entry-content|contents_style|<article/i.test(html);
  if (!hasBody && /자동입력\s*방지|비정상적인\s*(?:접근|트래픽)|captcha/i.test(html.slice(0, 50000))) return onBlocked(host, '차단 페이지');
  const start = html.indexOf('se-main-container');
  const body = start > 0 ? html.slice(start, start + 300000) : html;
  const title = (html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ');
  return { html: body, title };
}

// ── 대상 장소 ──
async function targetPlaces() {
  const build = readJson(new URL(`data/build/${area.slug}.json`, ROOT), { rows: [] }).rows;
  let list = build.map((r) => ({ key: r.source_external_id, name: r.name, address: r.address, category: r.category, status: 'candidate' }));
  // DB 에 승인된 장소가 있으면 먼저 (정확도가 중요한 곳부터)
  if (process.env.SUPABASE_SERVICE_ROLE_KEY && !args.includes('--sample')) {
    try {
      const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
      const data = [];
      for (let from = 0; ; from += 1000) {
        const { data: page } = await db.from('wooz_trip_places').select('source_external_id').eq('status', 'approved').eq('source_provider', 'tourapi').order('id').range(from, from + 999);
        data.push(...(page || []));
        if (!page || page.length < 1000) break;
      }
      const approved = new Set(data.map((p) => p.source_external_id));
      list = [...list.filter((p) => approved.has(p.key)).map((p) => ({ ...p, status: 'approved' })), ...list.filter((p) => !approved.has(p.key))];
    } catch {
      // DB 를 못 읽으면 후보 순서 그대로
    }
  }
  const fresh = (p) => {
    const f = readJson(new URL(`${area.slug}/${p.key}.json`, OUT), null);
    return f && Date.now() - Date.parse(f.checkedAt) < RECHECK_DAYS * 86400000;
  };
  const names = argOf('--names');
  if (names) {
    const want = names.split(',').map((x) => x.trim());
    return list.filter((p) => want.some((w) => p.name.includes(w))).slice(0, limit);
  }
  list = list.filter((p) => !fresh(p));
  // 아이 정보가 후기에 많이 나오는 곳부터: 식당·카페·체험/테마/농장 → 일반 볼거리 → 오름·해변·길 같은 자연
  const priority = (p) => {
    if (p.status === 'approved') return 0;
    if (p.category === 'food' || p.category === 'cafe') return 1;
    if (/테마|체험|농장|목장|키즈|박물관|미술관|아쿠아|동물|공원|가든|파크|월드|랜드/.test(p.name)) return 1;
    if (/오름|해변|해수욕장|해안|도로|올레|길$|봉$|산$|폭포|굴$|포구|등대|비$/.test(p.name)) return 3;
    return 2;
  };
  list = list.map((p, i) => ({ p, i })).sort((a, b) => priority(a.p) - priority(b.p) || a.i - b.i).map((x) => x.p);
  if (args.includes('--sample')) {
    // 시험용: 식당·카페·볼거리를 섞어서
    const by = (c) => list.filter((p) => p.category === c);
    const pickEvery = (arr, n) => arr.filter((_, i) => i % Math.max(1, Math.floor(arr.length / n)) === 0).slice(0, n);
    list = [...pickEvery(by('food'), Math.ceil(limit * 0.4)), ...pickEvery(by('cafe'), Math.ceil(limit * 0.2)), ...pickEvery(by('sight'), limit)];
  }
  return list.slice(0, limit);
}

async function run() {
  if (!KAKAO) throw new Error('.env.local 에 KAKAO_REST_API_KEY 를 넣어 주세요');
  if (blockedToday()) return console.log(`[${area.name}] 오늘은 쉬어요 — 네이버 차단 (${blockedToday()})`);
  if (postsToday() >= DAILY_POSTS) return console.log(`[${area.name}] 오늘 읽기 한도(${DAILY_POSTS}개) 도달`);
  const places = await targetPlaces();
  console.log(`[${area.name}] 대상 ${places.length}곳 · 오늘 읽은 글 ${postsToday()}/${DAILY_POSTS} · 이번 실행 최대 ${RUN_POSTS}개`);
  for (const place of places) {
    let found;
    try {
      found = await searchBlogs(place);
    } catch (e) {
      console.log(`  ${place.name}: 검색 실패 ${e.message}`);
      if (/키 오류/.test(e.message)) return;
      continue;
    }
    const posts = [];
    let skipped = 0;
    try {
      for (const d of found.docs) {
        const r = await fetchPost(d.url);
        if (r.skipped) {
          skipped++;
          continue;
        }
        const a = analyzePost({ title: `${r.title} ${d.title.replace(/<[^>]+>/g, '')}`, html: r.html }, place);
        if (args.includes('--debug') && a.relevant) debugSentences(r.html, d.url); // 화면에만 (저장 안 함)
        posts.push({ url: d.url, date: d.datetime, ...a });
      }
    } catch (e) {
      if (e instanceof Blocked) {
        console.log(`\n${e.message}`);
        if (posts.length) save(place, found.query, posts);
        return;
      }
      throw e;
    }
    const result = save(place, found.query, posts);
    const line = Object.entries(result.tags)
      .map(([t, v]) => `${FACT_RULES[t].label}:${{ yes: '있음', no: '없음', mixed: '엇갈림', weak: '근거1' }[v.verdict]}(${v.pos}/${v.neg})`)
      .join(' · ');
    console.log(
      `  ${place.name} — 글 ${found.docs.length}개 중 관련 ${posts.filter((p) => p.relevant).length}${skipped ? ` (robots 제외 ${skipped})` : ''} | ${line || '뽑힌 정보 없음'}${result.nokids.count ? ` | 노키즈존 언급 ${result.nokids.count}` : ''}`
    );
  }
}

/** 검수용: 판정에 쓰인 문장을 화면에만 보여준다 (저장하지 않음) */
function debugSentences(html, url) {
  for (const sentence of htmlToSentences(html)) {
    const f = factsInSentence(sentence);
    if (Object.keys(f).length) console.log(`      [${Object.entries(f).map(([t, v]) => `${FACT_RULES[t].label}${v > 0 ? '+' : '-'}`).join(',')}] ${sentence.slice(0, 90)}  (${url.slice(-12)})`);
  }
}

function save(place, query, posts) {
  const result = aggregate(posts);
  writeJson(new URL(`${area.slug}/${place.key}.json`, OUT), {
    key: place.key,
    name: place.name,
    checkedAt: new Date().toISOString(),
    query,
    posts: posts.map(({ url, date, relevant, sponsored, nokids, facts }) => ({ url, date, relevant, sponsored, nokids, facts })),
    result,
  });
  return result;
}

function status() {
  const dir = new URL(`${area.slug}/`, OUT);
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  const count = {};
  for (const f of files) {
    const { result } = readJson(new URL(f, dir), {});
    for (const [t, v] of Object.entries(result?.tags || {})) if (v.verdict === 'yes' || v.verdict === 'no') count[`${FACT_RULES[t].label} ${v.verdict === 'yes' ? '있음' : '없음'}`] = (count[`${FACT_RULES[t].label} ${v.verdict === 'yes' ? '있음' : '없음'}`] || 0) + 1;
  }
  console.log(`[${area.name}] 확인한 장소 ${files.length}곳 · 오늘 읽은 글 ${postsToday()}/${DAILY_POSTS}${blockedToday() ? ` · 오늘 차단됨 (${blockedToday()})` : ''}`);
  console.log('인정된 정보:', JSON.stringify(count));
}

await (cmd === 'status' ? status() : run());
