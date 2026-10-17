import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * 서버 전용 관리자 클라이언트 (service_role, RLS 우회).
 * next/headers에 의존하지 않아 Server Action/Route + node 스크립트 양쪽에서 사용 가능.
 * ⚠️ 수집 파이프라인(스크래퍼/시드) 전용. 클라이언트 노출 절대 금지.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}
