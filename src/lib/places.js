/**
 * places.js — 장소 조회와 후보 정렬 (서버 전용 조회 + 순수 정렬 함수)
 *
 * 승인된 장소를 한 번에 읽어 와서 거리 계산·필터를 코드에서 한다 (PostGIS 불필요).
 * 읽은 목록은 서버에 5분 캐시한다 (승인 장소는 운영자가 고칠 때만 바뀜). 어드민에서 고치면 revalidateTag 로 바로 지운다.
 * 캐시 한 덩어리는 2MB 까지라(Vercel) 장소가 4,000곳쯤 넘으면 지역별로 나눠 캐시하거나 PostGIS + RPC 로 옮긴다.
 */
import { unstable_cache } from 'next/cache';
import { createClient as createPublicClient } from '@supabase/supabase-js';
import { createClient } from './supabase/server.js';
import { TABLES } from './tables.js';
import { createAdminClient } from './supabase/admin.js';
export { rankCandidates } from './candidates.js';

export const PLACE_COLUMNS =
  'id, name, category, sub_category, address, lat, lng, region, phone, opening_hours, regular_closed_days, kid_tags, indoor, intro, status, external_links, source_external_id, is_sample';

export const PLACES_TAG = 'approved-places';

/** 승인된 장소 전체 (공개 RLS: status = approved). 누구에게나 같은 목록이라 쿠키 없는 anon 클라이언트로 읽는다 */
async function fetchApprovedPlaces() {
  const s = createPublicClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  // Supabase 는 한 번에 1,000행까지만 준다 → 나눠서 읽는다
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await s.from(TABLES.places).select(PLACE_COLUMNS).eq('status', 'approved').order('id').range(from, from + 999);
    if (error) throw new Error(error.message);
    all.push(...(data || []));
    if (!data || data.length < 1000) return all;
  }
}

export const getApprovedPlaces = unstable_cache(fetchApprovedPlaces, ['approved-places-v1'], { revalidate: 300, tags: [PLACES_TAG] });

/**
 * 특정 ID 장소들 → { id: place }
 * 사용자가 카카오 검색으로 넣은 후보 장소도 그 여행에서는 보여야 해서 service_role 로 읽는다 (제외된 장소만 뺀다).
 * 루트에 들어 있는 ID 로만 부른다.
 */
export async function getPlaceMap(ids) {
  if (!ids?.length) return {};
  const s = createAdminClient();
  const { data, error } = await s.from(TABLES.places).select(PLACE_COLUMNS).in('id', ids).neq('status', 'excluded');
  if (error) throw new Error(error.message);
  return Object.fromEntries((data || []).map((p) => [p.id, p]));
}

/** 아이 태그 목록 (DB 관리) */
export async function getKidTags() {
  const s = await createClient();
  const { data } = await s.from(TABLES.kidTags).select('id, label, filterable, sort_order').eq('active', true).order('sort_order');
  return data || [];
}
