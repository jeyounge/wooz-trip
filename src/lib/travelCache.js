/**
 * travelCache.js — 이동시간 캐시 (서버 전용)
 *
 * 1. readTravel(legs): wooz_trip_travel_cache 에서 구간 시간 읽기 (API 호출 없음, 화면 열 때)
 * 2. fillTravel(legs): 캐시에 없는 구간만 카카오모빌리티 길찾기로 받아 저장 (응답 뒤 after() 로 돌린다)
 *    - 하루 호출 상한 TRAVEL_DAILY_LIMIT (기본 9,000, 무료 10,000건/일) — 그날 저장한 줄 수로 센다
 *    - 키는 서버 환경변수 KAKAO_REST_API_KEY 만 쓴다. 브라우저로 보내지 않는다
 * 0009 SQL 전이면 테이블이 없어서 조용히 빈 결과 → 화면은 추정치로 그대로 보인다.
 */
import { createAdminClient } from './supabase/admin.js';
import { TABLES } from './tables.js';
import { tripLegs } from './travel.js';

const TABLE = TABLES.travelCache;
const STALE_DAYS = 180; // 도로가 바뀔 수 있어 반년 지난 값은 다시 받는다
const CONCURRENCY = 4;
const PER_CALL_MAX = 40; // 한 번에 채우는 구간 수 (루트 하나 = 보통 10~25 구간)

const dailyLimit = () => Number(process.env.TRAVEL_DAILY_LIMIT) || 9000;
const restKey = () => String(process.env.KAKAO_REST_API_KEY || '').trim().replace(/^["']|["']$/g, '');
const splitKey = (k) => k.split('>');

/** 구간들 → { pairKey: minutes } (반년 안에 받은 것만) */
export async function readTravel(legs) {
  if (!legs?.length) return {};
  try {
    const db = createAdminClient();
    const since = new Date(Date.now() - STALE_DAYS * 86400000).toISOString();
    const froms = [...new Set(legs.map((l) => splitKey(l.key)[0]))];
    const want = new Set(legs.map((l) => l.key));
    const out = {};
    for (let i = 0; i < froms.length; i += 100) {
      const { data, error } = await db
        .from(TABLE)
        .select('from_key, to_key, minutes')
        .eq('mode', 'car')
        .gte('fetched_ts', since)
        .in('from_key', froms.slice(i, i + 100));
      if (error) return out; // 테이블 없음(0009 전) 등 → 추정치
      for (const r of data || []) {
        const k = `${r.from_key}>${r.to_key}`;
        if (want.has(k)) out[k] = r.minutes;
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** 카카오모빌리티 자동차 길찾기 한 구간 → { minutes, distance_m } | null */
async function fetchDirections(from, to, key) {
  const url = `https://apis-navi.kakaomobility.com/v1/directions?origin=${from.lng},${from.lat}&destination=${to.lng},${to.lat}&priority=RECOMMEND&summary=true`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` }, signal: ctrl.signal, cache: 'no-store' });
    if (r.status === 429) return { stop: true };
    if (!r.ok) return null;
    const j = await r.json();
    const rt = j?.routes?.[0];
    if (!rt || rt.result_code !== 0 || !rt.summary) return null; // 길 없음(섬·배 구간), 너무 가까움 등 → 추정치
    return { minutes: Math.max(1, Math.ceil(rt.summary.duration / 60)), distance_m: rt.summary.distance };
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

/**
 * 캐시에 없는 구간만 길찾기로 받아 저장. 실패한 구간은 저장하지 않는다 (다음에 다시, 그동안은 추정치).
 * @returns 새로 받은 구간 { pairKey: minutes }
 */
export async function fillTravel(legs, known = null) {
  const key = restKey();
  if (!key || !legs?.length) return {};
  try {
    const have = known || (await readTravel(legs));
    const missing = legs.filter((l) => have[l.key] == null).slice(0, PER_CALL_MAX);
    if (!missing.length) return {};
    const db = createAdminClient();
    const used = await usedToday(db);
    if (used === null) return {}; // 테이블 없음
    const room = Math.min(missing.length, dailyLimit() - used);
    if (room <= 0) return {};

    const rows = [];
    let stop = false;
    const queue = missing.slice(0, room);
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (queue.length && !stop) {
          const leg = queue.shift();
          const res = await fetchDirections(leg.from, leg.to, key);
          if (res?.stop) stop = true;
          else if (res) {
            const [from_key, to_key] = splitKey(leg.key);
            rows.push({ from_key, to_key, mode: 'car', minutes: res.minutes, distance_m: res.distance_m, source: 'kakao', fetched_ts: new Date().toISOString() });
          }
        }
      })
    );
    if (!rows.length) return {};
    const { error } = await db.from(TABLE).upsert(rows, { onConflict: 'from_key,to_key,mode' });
    return error ? {} : Object.fromEntries(rows.map((r) => [`${r.from_key}>${r.to_key}`, r.minutes]));
  } catch {
    return {};
  }
}

/** 루트 화면용: 이 루트 구간의 길찾기 시간 { pairKey: minutes } + 없는 구간 목록 */
export async function loadTripTravel(trip, placeMap) {
  const legs = tripLegs(trip, placeMap);
  const known = await readTravel(legs);
  const missing = legs.filter((l) => known[l.key] == null);
  return { known, missing };
}

/** 저장 직후용: 캐시 읽고 없는 구간을 바로 받아서 합친 결과 (편집 화면이 곧바로 실제 시간을 보게) */
export async function syncTripTravel(trip, placeMap) {
  const { known, missing } = await loadTripTravel(trip, placeMap);
  if (!missing.length) return known;
  return { ...known, ...(await fillTravel(missing, known)) };
}

