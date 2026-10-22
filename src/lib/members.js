/**
 * members.js — 같이 고치기 멤버 (서버 전용, 0008)
 * 멤버 목록·멤버 여부는 service_role 로 읽는다 (RLS 는 "내가 멤버인 줄"만 보여준다).
 * 테이블이 아직 없으면(0008 실행 전) 멤버 없음으로 본다 — 화면은 혼자 고치는 여행처럼 보인다.
 */
import { createAdminClient } from './supabase/admin.js';
import { TABLES } from './tables.js';

export const MAX_MEMBERS = 10;
export const MEMBERS_MISSING = '같이 고치기 준비 중이에요 (운영자: 0008 SQL 실행 필요)';

/** 이 여행에서 내 역할: 'owner' | 'member' | null */
export async function tripRole(trip, userId) {
  if (!trip || !userId) return null;
  if (trip.owner_id === userId) return 'owner';
  return (await isMember(trip.id, userId)) ? 'member' : null;
}

export async function isMember(tripId, userId) {
  const { data, error } = await createAdminClient()
    .from(TABLES.tripMembers)
    .select('user_id')
    .eq('trip_id', tripId)
    .eq('user_id', userId)
    .maybeSingle();
  return !error && !!data;
}

/** 작성자 화면용 멤버 목록 [{ userId, email, createdTs }] */
export async function getMembers(tripId) {
  const { data, error } = await createAdminClient()
    .from(TABLES.tripMembers)
    .select('user_id, email, created_ts')
    .eq('trip_id', tripId)
    .order('created_ts');
  if (error) return null; // null = 테이블 없음
  return data.map((m) => ({ userId: m.user_id, email: m.email, createdTs: m.created_ts }));
}

/** 내가 멤버로 들어간 여행 (내 여행 목록의 「같이 고치는 여행」) */
export async function getSharedWithMe(userId) {
  const admin = createAdminClient();
  const { data: rows, error } = await admin.from(TABLES.tripMembers).select('trip_id').eq('user_id', userId);
  if (error || !rows?.length) return [];
  const { data } = await admin
    .from(TABLES.trips)
    .select('id, title, region, start_date, end_date, companion_type, visibility, days, updated_ts')
    .in(
      'id',
      rows.map((r) => r.trip_id)
    )
    .order('updated_ts', { ascending: false });
  return data || [];
}
