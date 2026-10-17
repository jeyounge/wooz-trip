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
