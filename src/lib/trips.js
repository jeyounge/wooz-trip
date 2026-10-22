/**
 * trips.js — 루트 조회 (서버 전용)
 * 읽기 권한은 RLS 가 판단한다: 본인 루트 + 공개 루트.
 * 가족 공유 링크(share_id)는 service_role 로 share_id 정확히 일치할 때만 조회한다.
 */
import { createClient } from './supabase/server.js';
import { createAdminClient } from './supabase/admin.js';
import { TABLES } from './tables.js';
import { getPlaceMap, getKidTags } from './places.js';
import { usedPlaceIds } from './trip.js';
import { tripRole } from './members.js';

export const TRIP_COLUMNS =
  'id, owner_id, title, region, start_date, end_date, arrival_time, departure_time, companion_type, kids_ages, stay_name, stay_lat, stay_lng, days, author_name, author_tip, visibility, share_id, copied_from, copy_count, ai_route_id, published_ts, created_ts, updated_ts';

export async function getTrip(id) {
  if (!isUuid(id)) return null;
  const s = await createClient();
  const { data, error } = await s.from(TABLES.trips).select(TRIP_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function getMyTrips(userId) {
  const s = await createClient();
  const { data, error } = await s
    .from(TABLES.trips)
    .select('id, title, region, start_date, end_date, companion_type, visibility, days, updated_ts')
    .eq('owner_id', userId)
    .order('updated_ts', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getPublicRoutes({ companion, region, limit = 20 } = {}) {
  const s = await createClient();
  let q = s
    .from(TABLES.trips)
    .select('id, title, region, start_date, end_date, companion_type, kids_ages, days, copy_count, author_name, published_ts')
    .eq('visibility', 'public')
    .order('copy_count', { ascending: false })
    .order('published_ts', { ascending: false })
    .limit(limit);
  if (companion) q = q.eq('companion_type', companion);
  if (region) q = q.eq('region', region);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getTripByShareId(shareId) {
  if (!/^[A-Za-z0-9_-]{8,32}$/.test(shareId || '')) return null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from(TABLES.trips)
    .select(TRIP_COLUMNS)
    .eq('share_id', shareId)
    .in('visibility', ['shared', 'public'])
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** 루트 + 쓰인 장소 + 태그 라벨을 한 번에 */
export async function loadTripBundle(trip) {
  const [placeMap, tags] = await Promise.all([getPlaceMap(usedPlaceIds(trip.days)), getKidTags()]);
  return { placeMap, tagLabels: Object.fromEntries(tags.map((t) => [t.id, t.label])), tags };
}

/** 공유 링크용 placeMap 은 RLS(approved)와 같은 조건으로 service_role 조회 */
export async function loadPlaceMapAdmin(ids) {
  if (!ids.length) return {};
  const admin = createAdminClient();
  const { data } = await admin.from(TABLES.places).select('*').in('id', ids).eq('status', 'approved');
  return Object.fromEntries((data || []).map((p) => [p.id, p]));
}

export function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v || '');
}

/**
 * 여행 기록 (쓴 돈·한마디). 읽기는 RLS: 본인, 또는 작성자가 보여주기를 켠 공개 루트.
 * 테이블이 아직 없으면(0006 실행 전) null — 화면은 기록 없이 그대로 보인다.
 */
export async function getTripLog(tripId) {
  if (!isUuid(tripId)) return null;
  const s = await createClient();
  const { data, error } = await s.from(TABLES.tripLogs).select('*').eq('trip_id', tripId).maybeSingle();
  if (error) return null;
  return data;
}

/**
 * 루트 결과·루트 짜기 화면용: 작성자·같이 고치는 멤버는 { trip, role }, 남의 공개 루트는 { trip, role: null }.
 * 멤버 여부는 서버가 확인하므로 service_role 로 읽는다 (0008 실행 전에도 작성자는 그대로 열린다).
 */
export async function getTripForUser(id, userId) {
  if (!isUuid(id)) return null;
  const { data: trip, error } = await createAdminClient().from(TABLES.trips).select(TRIP_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!trip) return null;
  const role = await tripRole(trip, userId);
  if (role) return { trip, role };
  return trip.visibility === 'public' ? { trip, role: null } : null;
}

/** 멤버가 여는 여행의 기록 (기록 RLS 는 작성자만 읽을 수 있어서) */
export async function getTripLogAdmin(tripId) {
  if (!isUuid(tripId)) return null;
  const { data, error } = await createAdminClient().from(TABLES.tripLogs).select('*').eq('trip_id', tripId).maybeSingle();
  if (error) return null;
  return data;
}

/** 가족 공유 링크용: 작성자가 보여주기를 켰을 때만 */
export async function getPublicTripLogAdmin(tripId) {
  if (!isUuid(tripId)) return null;
  const { data, error } = await createAdminClient().from(TABLES.tripLogs).select('*').eq('trip_id', tripId).eq('is_public', true).maybeSingle();
  if (error) return null;
  return data;
}
