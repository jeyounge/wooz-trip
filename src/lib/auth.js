import { redirect } from 'next/navigation';
import { createClient } from './supabase/server.js';

/** 현재 로그인 유저 (없으면 null). 계정은 z-labs 서비스들과 공용이다. */
export async function getCurrentUser() {
  const s = await createClient();
  const { data: { user } } = await s.auth.getUser();
  return user;
}

/** 관리자 여부: ADMIN_EMAIL 과 일치 */
export function isAdmin(user) {
  return !!user && !!process.env.ADMIN_EMAIL && user.email === process.env.ADMIN_EMAIL;
}

/** 로그인이 필요한 페이지에서 호출. 비로그인이면 /login 으로 보낸다. */
export async function requireUser(nextPath = '/') {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return user;
}
