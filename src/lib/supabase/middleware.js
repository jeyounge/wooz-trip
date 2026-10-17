import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

/**
 * @supabase/ssr 표준 세션 갱신. 미들웨어에서 매 요청 쿠키를 최신화한다.
 */
export async function updateSession(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // 세션 토큰 갱신 (서버 컴포넌트에서 만료 세션 방지)
  await supabase.auth.getUser();
  return response;
}
