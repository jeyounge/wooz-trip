/**
 * places.js — 장소 조회와 후보 정렬 (서버 전용 조회 + 순수 정렬 함수)
 *
 * MVP는 장소가 300곳 안팎이라 승인된 장소를 한 번에 읽어 와서
 * 거리 계산·필터를 코드에서 한다 (PostGIS 불필요).
 * 장소가 수천 곳으로 늘면 PostGIS + RPC 로 옮긴다.
 */
import { createClient } from './supabase/server.js';
import { TABLES } from './tables.js';
export { rankCandidates } from './candidates.js';

export const PLACE_COLUMNS =
  'id, name, category, sub_category, address, lat, lng, region, phone, opening_hours, regular_closed_days, kid_tags, indoor, intro, status, external_links, source_external_id, is_sample';

/** 승인된 장소 전체 (공개 RLS: status = approved) */
export async function getApprovedPlaces() {
  const s = await createClient();
  const { data, error } = await s.from(TABLES.places).select(PLACE_COLUMNS).eq('status', 'approved');
  if (error) throw new Error(error.message);
  return data || [];
}

/** 특정 ID 장소들 → { id: place } */
export async function getPlaceMap(ids) {
  if (!ids?.length) return {};
  const s = await createClient();
  const { data, error } = await s.from(TABLES.places).select(PLACE_COLUMNS).in('id', ids);
  if (error) throw new Error(error.message);
  return Object.fromEntries((data || []).map((p) => [p.id, p]));
}

/** 아이 태그 목록 (DB 관리) */
export async function getKidTags() {
  const s = await createClient();
  const { data } = await s.from(TABLES.kidTags).select('id, label, filterable, sort_order').eq('active', true).order('sort_order');
  return data || [];
}
