import { redirect } from 'next/navigation';
import { createClient } from './supabase/server.js';

/** 현재 로그인 유저 (없으면 null). 계정은 z-labs 서비스들과 공용이다. */
export async function getCurrentUser() {
  const s = await createClient();
  const { data: { user } } = await s.auth.getUser();
  return user;
}

/** ADMIN_EMAIL (쉼표로 여러 명 가능, 대소문자·공백 무시) */
export function adminEmails() {
  return String(process.env.ADMIN_EMAIL || '')
    .split(',')
    .map((e) => e.trim().replace(/^["']|["']$/g, '').toLowerCase())
    .filter(Boolean);
}

/** 관리자 여부: 로그인 이메일이 ADMIN_EMAIL 중 하나와 같음 */
export function isAdmin(user) {
  return !!user?.email && adminEmails().includes(user.email.toLowerCase());
}

/** 로그인이 필요한 페이지에서 호출. 비로그인이면 /login 으로 보낸다. */
export async function requireUser(nextPath = '/') {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return user;
}
