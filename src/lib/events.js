/**
 * events.js — MVP 검증 지표용 이벤트 기록 (서버 전용)
 * 루트 완성률·복사율·공유 수·제보 수를 wooz_trip_events 에서 집계한다.
 * 기록 실패가 사용자 동작을 막지 않도록 오류는 삼킨다.
 */
import { createAdminClient } from './supabase/admin.js';
import { TABLES } from './tables.js';

export const EVENTS = {
  tripCreated: 'trip_created',
  routeDrawn: 'route_drawn', // S03 → S05 "동선 그리기" (루트 완성)
  tripShared: 'trip_shared',
  tripPublished: 'trip_published',
  routeViewed: 'route_viewed', // 공개 루트 열람 (복사율 분모)
  tripCopied: 'trip_copied',
  reportCreated: 'report_created',
  aiFill: 'ai_fill',
  tripReviewed: 'trip_reviewed', // 다녀온 뒤 만족도를 처음 남김
  placeAdded: 'place_added', // 사용자가 카카오 검색으로 장소를 DB 에 새로 넣음
  memberAdded: 'member_added', // 같이 고칠 사람을 넣음
};

export async function logEvent(name, { userId = null, tripId = null, meta = {} } = {}) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
    const admin = createAdminClient();
    await admin.from(TABLES.events).insert({ name, user_id: userId, trip_id: tripId, meta });
  } catch {
    // 지표 기록 실패는 무시
  }
}
