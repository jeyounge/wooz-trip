'use server';
/**
 * 루트 관련 서버 동작 (Node.js 서버리스에서 실행).
 * 모든 쓰기는 로그인 사용자의 쿠키 세션 + RLS(owner_id = auth.uid()) 로 보호된다.
 * 응답 형식: { ok: true, ... } | { ok: false, message }
 */
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { TABLES } from '@/lib/tables';
import { getCurrentUser } from '@/lib/auth';
import { COMPANIONS, MAX_TRIP_DAYS, REGIONS, SLOT_TYPES, TRAVEL_MODES, departArea, departAreasFor } from '@/lib/config';
import { buildDays, redateDays, setTripEnds, tripDepartArea, tripMode, usedPlaceIds } from '@/lib/trip';
import { addDays, dayCount } from '@/lib/hours';
import { getApprovedPlaces, getPlaceMap } from '@/lib/places';
import { cleanLocation } from '@/lib/location';
import { buildFillTasks, validatePicks, applyPicks, finalCheck } from '@/lib/ai/fill';
import { chooseRoute } from '@/lib/ai/routes';
import { bumpPickCount, getActiveAiRoutes } from '@/lib/ai/store';
import { EVENTS, logEvent } from '@/lib/events';
import { isUuid, TRIP_COLUMNS } from '@/lib/trips';
import { sanitizeLog } from '@/lib/triplog';

const fail = (message) => ({ ok: false, message });
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

async function authed() {
  const user = await getCurrentUser();
  if (!user) return { user: null, db: null };
  return { user, db: await createClient() };
}

async function loadOwnTrip(db, user, id) {
  if (!isUuid(id)) return null;
  const { data } = await db.from(TABLES.trips).select(TRIP_COLUMNS).eq('id', id).eq('owner_id', user.id).maybeSingle();
  return data;
}

const FIXED_KINDS = ['airport_arrive', 'airport_depart', 'home_start', 'home_end', 'stay_start', 'stay_end'];

/** 이동 방식·출발 지역 확인 → { mode, departAreaId } | { error } */
function travelOf(region, mode, departAreaId) {
  const m = TRAVEL_MODES.some((x) => x.id === mode) ? mode : 'fly';
  if (m === 'fly') return { mode: 'fly', departAreaId: null };
  if (!departAreasFor(region).some((a) => a.id === departAreaId)) return { error: '어디서 출발하는지 골라 주세요' };
  return { mode: 'car', departAreaId };
}

/** 클라이언트가 보낸 days 를 허용된 모양으로만 정리 */
function sanitizeDays(days, startDate) {
  if (!Array.isArray(days) || !days.length || days.length > MAX_TRIP_DAYS) throw new Error('일자 형식 오류');
  return days.map((d, i) => ({
    date: addDays(startDate, i),
    slots: (Array.isArray(d.slots) ? d.slots : []).slice(0, 20).map((s) => {
      if (!TIME.test(s.time || '')) throw new Error('시각 형식 오류');
      const slotType = SLOT_TYPES[s.slotType] ? s.slotType : 'extra';
      const out = {
        id: String(s.id || '').slice(0, 40) || `s${Math.random().toString(36).slice(2, 10)}`,
        time: s.time,
        slotType,
        placeId: s.fixed ? null : Number.isInteger(s.placeId) ? s.placeId : null,
        memo: String(s.memo || '').slice(0, 200),
        stayMinutes: Math.min(600, Math.max(0, parseInt(s.stayMinutes, 10) || 0)),
      };
      if (s.aiReason && out.placeId) out.aiReason = String(s.aiReason).slice(0, 200);
      // 직접 넣은 일정 (해변에서 놀기, OO 근처 사진 등). 위치는 있어도 되고 없어도 된다
      if (!s.fixed && !out.placeId && s.custom) {
        const c = cleanLocation(s.custom);
        if (c) out.custom = c;
      }
      if (s.fixed) {
        out.fixed = {
          kind: FIXED_KINDS.includes(s.fixed.kind) ? s.fixed.kind : 'stay_end',
          name: String(s.fixed.name || '').slice(0, 60),
          note: String(s.fixed.note || '').slice(0, 80),
        };
        if (out.fixed.kind.startsWith('home') && departArea(s.fixed.area)) out.fixed.area = s.fixed.area;
      }
      return out;
    }),
  }));
}

/** 장소 ID 가 실제 장소인지 확인 (승인 장소 + 사용자가 카카오 검색으로 넣은 후보, 제외된 장소는 안 됨) */
async function assertPlacesExist(days) {
  const ids = usedPlaceIds(days);
  if (!ids.length) return;
  const { data } = await createAdminClient().from(TABLES.places).select('id').in('id', ids).neq('status', 'excluded');
  const found = new Set((data || []).map((p) => p.id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) throw new Error('없는 장소가 들어 있어요');
}

/**
 * 숙소 입력 → 컬럼. stay = { name, address?, lat?, lng? } (카카오 검색으로 고르면 좌표가 있다).
 * 예전 방식(stayName 글자만)도 받는다. 좌표가 있어야 숙소가 동선 기준점이 된다.
 */
function stayColumns({ stay, stayName } = {}) {
  const loc = cleanLocation(stay ?? (stayName ? { name: stayName } : null), { maxName: 80 });
  return { stay_name: loc?.name || null, stay_lat: loc?.lat ?? null, stay_lng: loc?.lng ?? null };
}

function makeTitle(region, n) {
  const r = REGIONS.find((x) => x.id === region)?.short || '제주';
  return n === 1 ? `${r} 당일치기` : `${r} ${n - 1}박 ${n}일`;
}

/** S02 → 새 루트 만들기. start = self | ai */
export async function createTrip(input) {
  const { user, db } = await authed();
  if (!user) return fail('로그인이 필요해요');

  const { region, startDate, endDate, arrivalTime, departureTime, companion, kidsAges = [], start, mode, departAreaId } = input || {};
  if (!REGIONS.some((r) => r.id === region)) return fail('지역을 골라 주세요');
  if (!COMPANIONS.some((c) => c.id === companion)) return fail('누구랑 가는지 골라 주세요');
  if (!DATE.test(startDate || '') || !DATE.test(endDate || '')) return fail('날짜를 확인해 주세요');
  const n = dayCount(startDate, endDate);
  if (n < 1) return fail('오는 날이 가는 날보다 빨라요');
  if (n > MAX_TRIP_DAYS) return fail(`여행은 최대 ${MAX_TRIP_DAYS}일까지 짤 수 있어요`);
  const travel = travelOf(region, mode, departAreaId);
  if (travel.error) return fail(travel.error);
  if (!TIME.test(arrivalTime || '') || !TIME.test(departureTime || '')) return fail(travel.mode === 'car' ? '출발·도착 시각을 확인해 주세요' : '비행기 시각을 확인해 주세요');
  if (n === 1 && arrivalTime >= departureTime) return fail(travel.mode === 'car' ? '돌아오는 시각이 출발보다 빨라요' : '제주 출발이 도착보다 빨라요');

  const ages = companion === 'kids' ? kidsAges.map((a) => parseInt(a, 10)).filter((a) => a >= 0 && a <= 13).slice(0, 6) : [];
  const stayCols = n === 1 ? stayColumns() : stayColumns(input);
  const days = buildDays({ startDate, endDate, arrivalTime, departureTime, stayName: stayCols.stay_name || '', ...travel });

  const { data, error } = await db
    .from(TABLES.trips)
    .insert({
      owner_id: user.id,
      title: makeTitle(region, n),
      region,
      start_date: startDate,
      end_date: endDate,
      arrival_time: arrivalTime,
      departure_time: departureTime,
      companion_type: companion,
      kids_ages: ages,
      ...stayCols,
      days,
    })
    .select('id')
    .single();
  if (error) return fail(`저장 실패: ${error.message}`);

  await logEvent(EVENTS.tripCreated, { userId: user.id, tripId: data.id, meta: { start, companion, days: n, mode: travel.mode } });

  let ai = null;
  if (start === 'ai') ai = await aiFill(data.id);
  revalidatePath('/trips');
  return { ok: true, id: data.id, ai };
}

/** S03/S05 → 일자·슬롯 저장 */
export async function saveDays(tripId, days) {
  const { user, db } = await authed();
  if (!user) return fail('로그인이 필요해요');
  const trip = await loadOwnTrip(db, user, tripId);
  if (!trip) return fail('루트를 찾을 수 없어요');
  try {
    const clean = sanitizeDays(days, trip.start_date);
    await assertPlacesExist(clean);
    const { error } = await db.from(TABLES.trips).update({ days: clean }).eq('id', tripId);
    if (error) return fail(error.message);
    return { ok: true, days: clean };
  } catch (e) {
    return fail(e.message);
  }
}

/** 제목·숙소 수정. stay = { name, address?, lat?, lng? } | null (null 이면 숙소 지움) */
export async function updateTripMeta(tripId, { title, stay, stayName }) {
  const { user, db } = await authed();
  if (!user) return fail('로그인이 필요해요');
  const patch = {};
  if (typeof title === 'string' && title.trim()) patch.title = title.trim().slice(0, 60);
  if (stay !== undefined || typeof stayName === 'string') Object.assign(patch, stayColumns({ stay, stayName }));
  const { error } = await db.from(TABLES.trips).update(patch).eq('id', tripId).eq('owner_id', user.id);
  if (error) return fail(error.message);
  revalidatePath(`/trips/${tripId}`);
  return { ok: true, patch };
}

/**
 * AI 빈칸 채우기 / AI 초안
 * LLM API 를 부르지 않는다. 미리 LLM 으로 만들어 둔 루트(wooz_trip_ai_routes)에서 맞는 것을 꺼내
 * 내 날짜 기준으로 휴무·영업시간을 검사해 넣고, 남은 빈칸은 코드 후보로 채운다. (lib/ai/routes.js)
 * "생각하는 중" 연출은 화면(AiThinking)에서 한다.
 */
export async function aiFill(tripId) {
  const { user, db } = await authed();
  if (!user) return fail('로그인이 필요해요');
  const trip = await loadOwnTrip(db, user, tripId);
  if (!trip) return fail('루트를 찾을 수 없어요');

  try {
    const places = await getApprovedPlaces();
    const placeMap = Object.fromEntries(places.map((p) => [p.id, p]));
    // 카카오 검색으로 넣은 후보 장소는 승인 목록에 없다 → 위치·검사용으로만 따로 읽는다
    const extraIds = usedPlaceIds(trip.days).filter((id) => !placeMap[id]);
    const extraPlaces = Object.values(await getPlaceMap(extraIds));
    for (const p of extraPlaces) placeMap[p.id] = p;

    // 1. 미리 만든 루트에서 꺼내기 (테이블이 비었거나 없어도 2단계로 진행)
    let chosen = null;
    try {
      chosen = chooseRoute(await getActiveAiRoutes(trip), trip, places, { excludeId: trip.ai_route_id ?? null });
    } catch (e) {
      console.error('[ai] 루트 조회 실패:', e?.message || e);
    }
    let days = chosen ? applyPicks(trip.days, chosen.picks) : trip.days;

    // 2. 남은 빈칸은 코드 후보 1순위
    const tasks = buildFillTasks({ ...trip, days }, places, { extraPlaces });
    days = applyPicks(days, validatePicks(tasks, []));

    // 3. 다시 검사
    const checked = finalCheck(trip, days, placeMap);
    days = checked.days;
    if (!checked.filled) return { ok: true, filled: 0, days: trip.days, message: '채울 빈칸이 없거나 조건에 맞는 장소가 없어요' };

    const patch = { days };
    if (chosen) patch.ai_route_id = chosen.route.id;
    const { error } = await db.from(TABLES.trips).update(patch).eq('id', tripId);
    if (error) return fail(error.message);

    if (chosen) await bumpPickCount(chosen.route.id);
    await logEvent(EVENTS.aiFill, {
      userId: user.id,
      tripId,
      meta: { filled: checked.filled, route: chosen?.route.code || null, fromRoute: chosen?.picks.length || 0 },
    });
    const usedPlaces = Object.fromEntries(usedPlaceIds(days).map((id) => [id, placeMap[id]]).filter(([, p]) => p));
    return { ok: true, filled: checked.filled, days, places: usedPlaces };
  } catch (e) {
    return fail(`AI 추천 실패: ${e.message}`);
  }
}

/** S03 → S05 "동선 그리기" (루트 완성 지표) */
export async function markRouteDrawn(tripId) {
  const user = await getCurrentUser();
  if (user) await logEvent(EVENTS.routeDrawn, { userId: user.id, tripId });
  return { ok: true };
}

function randomId(len = 12) {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => abc[b % abc.length]).join('');
}

/** 가족 공유 링크 만들기 (읽기 전용 /s/:shareId) */
export async function shareTrip(tripId) {
  const { user, db } = await authed();
  if (!user) return fail('로그인이 필요해요');
  const trip = await loadOwnTrip(db, user, tripId);
  if (!trip) return fail('루트를 찾을 수 없어요');
  const shareId = trip.share_id || randomId();
  const visibility = trip.visibility === 'public' ? 'public' : 'shared';
  const { error } = await db.from(TABLES.trips).update({ share_id: shareId, visibility }).eq('id', tripId);
  if (error) return fail(error.message);
  await logEvent(EVENTS.tripShared, { userId: user.id, tripId });
  return { ok: true, shareId };
}

/** 공개 등록 ("자랑하기") */
export async function publishTrip(tripId, { title, authorName, tip, showLog }) {
  const { user, db } = await authed();
  if (!user) return fail('로그인이 필요해요');
  const trip = await loadOwnTrip(db, user, tripId);
  if (!trip) return fail('루트를 찾을 수 없어요');
  if (!usedPlaceIds(trip.days).length) return fail('장소를 한 곳 이상 넣어야 공개할 수 있어요');
  const { error } = await db
    .from(TABLES.trips)
    .update({
      title: String(title || trip.title).trim().slice(0, 60) || trip.title,
      author_name: String(authorName || '').trim().slice(0, 20) || '익명',
      author_tip: String(tip || '').trim().slice(0, 500) || null,
      visibility: 'public',
      share_id: trip.share_id || randomId(),
      published_ts: trip.published_ts || new Date().toISOString(),
    })
    .eq('id', tripId);
  if (error) return fail(error.message);
  if (typeof showLog === 'boolean') {
    const r = await setLogPublic(db, user, tripId, showLog);
    if (!r.ok) return r;
  }
  await logEvent(EVENTS.tripPublished, { userId: user.id, tripId, meta: { showLog: !!showLog } });
  revalidatePath('/');
  revalidatePath('/routes');
  return { ok: true };
}

/** 공개 취소 (공유 링크는 유지) */
export async function unpublishTrip(tripId) {
  const { user, db } = await authed();
  if (!user) return fail('로그인이 필요해요');
  const { error } = await db.from(TABLES.trips).update({ visibility: 'shared' }).eq('id', tripId).eq('owner_id', user.id);
  if (error) return fail(error.message);
  revalidatePath('/routes');
  return { ok: true };
}

/**
 * 공개 루트를 내 일정으로 복사.
 * 일자 수는 원본과 같고 날짜만 내 시작일로 바꾼다.
 * 휴무·영업시간·이동시간은 화면에서 내 날짜 기준으로 다시 계산된다.
 */
export async function copyRoute(routeId, { startDate, arrivalTime, departureTime, stay: stayInput, stayName, mode, departAreaId }) {
  const { user, db } = await authed();
  if (!user) return fail('로그인이 필요해요');
  if (!isUuid(routeId)) return fail('루트를 찾을 수 없어요');
  if (!DATE.test(startDate || '')) return fail('가는 날을 골라 주세요');

  const { data: src } = await db.from(TABLES.trips).select(TRIP_COLUMNS).eq('id', routeId).eq('visibility', 'public').maybeSingle();
  if (!src) return fail('공개된 루트가 아니에요');

  const n = src.days.length;
  const arr = TIME.test(arrivalTime || '') ? arrivalTime : src.arrival_time;
  const dep = TIME.test(departureTime || '') ? departureTime : src.departure_time;
  // 이동 방식은 고르지 않으면 원본을 따른다. 첫 칸·끝 칸을 내 비행기·출발 시각에 맞춘다
  const travel = travelOf(src.region, mode || tripMode(src), departAreaId || tripDepartArea(src));
  if (travel.error) return fail(travel.error);
  const days = setTripEnds(redateDays(src.days, startDate), { mode: travel.mode, arrivalTime: arr, departureTime: dep, departAreaId: travel.departAreaId });
  const stayCols = n === 1 ? stayColumns() : stayColumns({ stay: stayInput, stayName });
  const stay = stayCols.stay_name || '';
  if (stay) for (const d of days) for (const s of d.slots) if (s.fixed?.kind?.startsWith('stay')) s.fixed[s.fixed.kind === 'stay_end' ? 'name' : 'note'] = stay;

  const { data, error } = await db
    .from(TABLES.trips)
    .insert({
      owner_id: user.id,
      title: src.title,
      region: src.region,
      start_date: startDate,
      end_date: addDays(startDate, n - 1),
      arrival_time: arr,
      departure_time: dep,
      companion_type: src.companion_type,
      kids_ages: src.kids_ages,
      ...stayCols,
      days,
      copied_from: src.id,
    })
    .select('id')
    .single();
  if (error) return fail(`복사 실패: ${error.message}`);

  // 복사 수는 원본 소유자만 고칠 수 있어서 service_role 로 올린다
  try {
    const admin = createAdminClient();
    await admin.from(TABLES.trips).update({ copy_count: (src.copy_count || 0) + 1 }).eq('id', src.id);
  } catch {
    // 복사 수 집계 실패는 무시
  }
  await logEvent(EVENTS.tripCopied, { userId: user.id, tripId: data.id, meta: { from: src.id } });
  revalidatePath('/trips');
  return { ok: true, id: data.id };
}

export async function deleteTrip(tripId) {
  const { user, db } = await authed();
  if (!user) return fail('로그인이 필요해요');
  const { error } = await db.from(TABLES.trips).delete().eq('id', tripId).eq('owner_id', user.id);
  if (error) return fail(error.message);
  revalidatePath('/trips');
  return { ok: true };
}

/** 공개 루트 열람 기록 (복사율 분모) */
export async function logRouteView(routeId) {
  const user = await getCurrentUser();
  await logEvent(EVENTS.routeViewed, { userId: user?.id || null, tripId: routeId });
  return { ok: true };
}

/** 장소 정보 제보 */
export async function createReport({ placeId, tripId, type, message, tags }) {
  const { user, db } = await authed();
  if (!user) return fail('로그인하면 제보할 수 있어요');
  if (!['closed', 'info', 'tag'].includes(type)) return fail('제보 종류를 골라 주세요');
  const pid = parseInt(placeId, 10);
  if (!pid) return fail('장소를 골라 주세요');
  const { error } = await db.from(TABLES.reports).insert({
    place_id: pid,
    trip_id: isUuid(tripId) ? tripId : null,
    user_id: user.id,
    type,
    message: String(message || '').slice(0, 500) || null,
    payload: type === 'tag' ? { tags: (tags || []).slice(0, 10) } : {},
  });
  if (error) return fail(error.message);
  await logEvent(EVENTS.reportCreated, { userId: user.id, meta: { placeId: pid, type } });
  return { ok: true };
}

const LOG_MISSING = '기록 기능 준비 중이에요 (운영자: 0006 SQL 실행 필요)';

/** 쓴 돈·다녀온 뒤 한마디 저장 (내 여행만). 공개 여부(isPublic)는 자랑하기 시트에서만 바꾼다 */
export async function saveTripLog(tripId, input) {
  const { user, db } = await authed();
  if (!user) return fail('로그인이 필요해요');
  const trip = await loadOwnTrip(db, user, tripId);
  if (!trip) return fail('루트를 찾을 수 없어요');
  const log = sanitizeLog(input, trip.days);
  const { data: before, error: readErr } = await db.from(TABLES.tripLogs).select('rating, is_public').eq('trip_id', tripId).maybeSingle();
  if (readErr) return fail(LOG_MISSING);
  const { error } = await db.from(TABLES.tripLogs).upsert(
    { trip_id: tripId, owner_id: user.id, slots: log.slots, extras: log.extras, rating: log.rating, comment: log.comment || null, is_public: before?.is_public ?? false },
    { onConflict: 'trip_id' }
  );
  if (error) return fail(error.message);
  if (log.rating && !before?.rating) await logEvent(EVENTS.tripReviewed, { userId: user.id, tripId, meta: { rating: log.rating } });
  return { ok: true, log: { ...log, isPublic: before?.is_public ?? false } };
}

async function setLogPublic(db, user, tripId, isPublic) {
  const { data: row, error: readErr } = await db.from(TABLES.tripLogs).select('trip_id').eq('trip_id', tripId).maybeSingle();
  if (readErr) return isPublic ? fail(LOG_MISSING) : { ok: true };
  const { error } = row
    ? await db.from(TABLES.tripLogs).update({ is_public: isPublic }).eq('trip_id', tripId)
    : isPublic
      ? await db.from(TABLES.tripLogs).insert({ trip_id: tripId, owner_id: user.id, is_public: true })
      : { error: null };
  return error ? fail(error.message) : { ok: true };
}
