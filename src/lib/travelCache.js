/**
 * travelCache.js — 이동시간·도로 경로 캐시 (서버 전용)
 *
 * 결과 모양 (화면에 그대로 넘김): travel = { minutes: { [pairKey]: 분 }, paths: { [pairKey]: 압축 경로 } }
 * 1. readTravel(legs): wooz_trip_travel_cache 에서 읽기 (API 호출 없음, 화면 열 때)
 * 2. fillTravel(legs, have): 시간이나 경로가 없는 구간만 카카오모빌리티 길찾기로 받아 저장
 *    - 하루 호출 상한 TRAVEL_DAILY_LIMIT (기본 9,000, 무료 10,000건/일) — 그날 저장한 줄 수로 센다
 *    - 키는 서버 환경변수 KAKAO_REST_API_KEY 만 쓴다. 브라우저로 보내지 않는다
 * 0009 전이면 빈 결과(추정치), 0010 전이면 경로 없이 시간만 (지도는 직선).
 */
import { createAdminClient } from './supabase/admin.js';
import { TABLES } from './tables.js';
import { encodePath, mergeTravel, simplifyPath, tripLegs } from './travel.js';

const TABLE = TABLES.travelCache;
const STALE_DAYS = 180; // 도로가 바뀔 수 있어 반년 지난 값은 다시 받는다
const CONCURRENCY = 4;
const PER_CALL_MAX = 40; // 한 번에 채우는 구간 수 (루트 하나 = 보통 10~25 구간)

const dailyLimit = () => Number(process.env.TRAVEL_DAILY_LIMIT) || 9000;
const restKey = () => String(process.env.KAKAO_REST_API_KEY || '').trim().replace(/^["']|["']$/g, '');
const splitKey = (k) => k.split('>');
export const emptyTravel = () => ({ minutes: {}, paths: {} });

let pathColumn = null; // 0010(path 칸) 실행 여부 — 한 번 알면 기억

async function selectRows(db, froms, since) {
  const q = (cols) => db.from(TABLE).select(cols).eq('mode', 'car').gte('fetched_ts', since).in('from_key', froms);
  if (pathColumn !== false) {
    const r = await q('from_key, to_key, minutes, path');
    if (!r.error) {
      pathColumn = true;
      return r.data || [];
    }
    if (!/path/.test(r.error.message || '')) return null; // 테이블 없음 등
    pathColumn = false;
  }
  const r = await q('from_key, to_key, minutes');
  return r.error ? null : r.data || [];
}

/** 구간들 → { minutes, paths } (반년 안에 받은 것만) */
export async function readTravel(legs) {
  const out = emptyTravel();
  if (!legs?.length) return out;
  try {
    const db = createAdminClient();
    const since = new Date(Date.now() - STALE_DAYS * 86400000).toISOString();
    const froms = [...new Set(legs.map((l) => splitKey(l.key)[0]))];
    const want = new Set(legs.map((l) => l.key));
    for (let i = 0; i < froms.length; i += 100) {
      const rows = await selectRows(db, froms.slice(i, i + 100), since);
      if (!rows) return out;
      for (const r of rows) {
        const k = `${r.from_key}>${r.to_key}`;
        if (!want.has(k)) continue;
        out.minutes[k] = r.minutes;
        if (r.path) out.paths[k] = r.path;
      }
    }
    return out;
  } catch {
    return out;
  }
}

/** 카카오모빌리티 자동차 길찾기 한 구간 → { minutes, distance_m, path } | { stop } | null */
async function fetchDirections(from, to, key) {
  const url = `https://apis-navi.kakaomobility.com/v1/directions?origin=${from.lng},${from.lat}&destination=${to.lng},${to.lat}&priority=RECOMMEND`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` }, signal: ctrl.signal, cache: 'no-store' });
    if (r.status === 429) return { stop: true };
    if (!r.ok) return null;
    const j = await r.json();
    const rt = j?.routes?.[0];
    if (!rt || rt.result_code !== 0 || !rt.summary) return null; // 길 없음(섬·배 구간), 너무 가까움, 통제 등 → 추정치
    const pts = [];
    for (const sec of rt.sections || []) {
      for (const road of sec.roads || []) {
        const v = road.vertexes || [];
        for (let i = 0; i + 1 < v.length; i += 2) {
          const p = [v[i + 1], v[i]]; // [lat, lng]
          const last = pts[pts.length - 1];
          if (!last || last[0] !== p[0] || last[1] !== p[1]) pts.push(p);
        }
      }
    }
    return {
      minutes: Math.max(1, Math.ceil(rt.summary.duration / 60)),
      distance_m: rt.summary.distance,
      path: pts.length > 1 ? encodePath(simplifyPath(pts)) : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 오늘(한국 시각) 받은 구간 수 */
async function usedToday(db) {
  const kstMidnight = new Date(Date.now() + 9 * 3600000);
  kstMidnight.setUTCHours(0, 0, 0, 0);
  const since = new Date(kstMidnight.getTime() - 9 * 3600000).toISOString();
  const { count, error } = await db.from(TABLE).select('*', { count: 'exact', head: true }).gte('fetched_ts', since);
  return error ? null : count || 0;
}

/** 이 구간을 (다시) 받아야 하나: 시간이 없거나, 경로 칸이 있는데 경로가 없을 때 */
const needs = (have, k) => have.minutes[k] == null || (pathColumn === true && !have.paths[k]);

/**
 * 받아야 하는 구간만 길찾기로 받아 저장. 실패한 구간은 저장하지 않는다 (다음에 다시, 그동안은 추정치).
 * @returns 새로 받은 { minutes, paths }
 */
export async function fillTravel(legs, have = null) {
  const got = emptyTravel();
  const key = restKey();
  if (!key || !legs?.length) return got;
  try {
    const known = have || (await readTravel(legs));
    const todo = legs.filter((l) => needs(known, l.key)).slice(0, PER_CALL_MAX);
    if (!todo.length) return got;
    const db = createAdminClient();
    const used = await usedToday(db);
    if (used === null) return got; // 테이블 없음
    const room = Math.min(todo.length, dailyLimit() - used);
    if (room <= 0) return got;

    const rows = [];
    let stop = false;
    const queue = todo.slice(0, room);
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (queue.length && !stop) {
          const leg = queue.shift();
          const res = await fetchDirections(leg.from, leg.to, key);
          if (res?.stop) stop = true;
          else if (res) {
            const [from_key, to_key] = splitKey(leg.key);
            const row = { from_key, to_key, mode: 'car', minutes: res.minutes, distance_m: res.distance_m, source: 'kakao', fetched_ts: new Date().toISOString() };
            if (pathColumn === true && res.path) row.path = res.path;
            rows.push(row);
          }
        }
      })
    );
    if (!rows.length) return got;
    const { error } = await db.from(TABLE).upsert(rows, { onConflict: 'from_key,to_key,mode' });
    if (error) return got;
    for (const r of rows) {
      const k = `${r.from_key}>${r.to_key}`;
      got.minutes[k] = r.minutes;
      if (r.path) got.paths[k] = r.path;
    }
    return got;
  } catch {
    return got;
  }
}

/** 루트 화면용: 이 루트 구간의 { travel, missing } */
export async function loadTripTravel(trip, placeMap) {
  const legs = tripLegs(trip, placeMap);
  const travel = await readTravel(legs);
  const missing = legs.filter((l) => needs(travel, l.key));
  return { travel, missing };
}

/** 저장 직후용: 캐시 읽고 없는 구간을 바로 받아서 합친 결과 (편집 화면이 곧바로 실제 시간을 보게) */
export async function syncTripTravel(trip, placeMap) {
  const { travel, missing } = await loadTripTravel(trip, placeMap);
  if (!missing.length) return travel;
  return mergeTravel(travel, await fillTravel(missing, travel));
}
