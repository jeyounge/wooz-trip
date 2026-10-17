/**
 * store.js — 미리 만든 AI 루트 조회 (서버 전용)
 * wooz_trip_ai_routes 는 RLS 정책이 없어 service_role(admin 클라이언트)로만 읽는다.
 */
import { createAdminClient } from '../supabase/admin.js';
import { TABLES } from '../tables.js';

export const AI_ROUTE_COLUMNS = 'id, code, title, region, companion_type, day_count, kid_age_min, kid_age_max, tags, days, is_active';

/** 같은 지역 루트를 먼저, 없으면 전체에서 고르도록 활성 루트를 읽는다 */
export async function getActiveAiRoutes(trip) {
  const db = createAdminClient();
  const base = () => db.from(TABLES.aiRoutes).select(AI_ROUTE_COLUMNS).eq('is_active', true);
  const { data, error } = await base().eq('region', trip.region).limit(500);
  if (error) throw new Error(error.message);
  if (data?.length) return data;
  const all = await base().limit(500);
  if (all.error) throw new Error(all.error.message);
  return all.data || [];
}

/** 꺼내 준 횟수 +1 (지표용, 실패해도 무시) */
export async function bumpPickCount(id) {
  try {
    const db = createAdminClient();
    const { data } = await db.from(TABLES.aiRoutes).select('pick_count').eq('id', id).single();
    if (data) await db.from(TABLES.aiRoutes).update({ pick_count: (data.pick_count || 0) + 1 }).eq('id', id);
  } catch {
    // 지표 기록 실패는 무시
  }
}
