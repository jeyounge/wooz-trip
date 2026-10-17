/**
 * tables.js — Supabase 테이블 이름 (단일 관리)
 *
 * 기존 z-labs 공용 Supabase 프로젝트를 lotto·goat·toto와 같이 쓴다.
 * 흔한 이름이 겹치지 않도록 모든 테이블에 wooz_trip_ 프리픽스를 붙인다.
 * 테이블 이름은 반드시 이 상수로만 참조한다 (하드코딩 금지).
 *
 * 쿼리 예: supabase.from(TABLES.places)  // → wooz_trip_places
 */
export const TABLE_PREFIX = 'wooz_trip_';

const t = (name) => `${TABLE_PREFIX}${name}`;

export const TABLES = {
  places: t('places'),
  kidTags: t('kid_tags'),
  trips: t('trips'),
  travelCache: t('travel_cache'),
  reports: t('reports'),
  events: t('events'),
  aiRoutes: t('ai_routes'), // 미리 만든 AI 추천 루트
};
