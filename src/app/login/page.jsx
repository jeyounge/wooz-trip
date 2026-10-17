import { TopBar } from '@/components/ui';
import { SERVICE_NAME } from '@/lib/config';
import LoginForm from './LoginForm';

export const metadata = { title: `로그인 | ${SERVICE_NAME}` };

export default async function LoginPage({ searchParams }) {
  const sp = await searchParams;
  const next = typeof sp?.next === 'string' && sp.next.startsWith('/') && !sp.next.startsWith('//') ? sp.next : '/';
  return (
    <>
      <TopBar back="/" />
      <main className="flex flex-1 flex-col gap-4 px-5 pt-2 pb-8">
        <h1 className="m-0 h-display text-[26px] leading-snug">
          로그인하고
          <br />
          우리 가족 루트를 저장해요
        </h1>
        <p className="m-0 text-sm leading-relaxed text-sub">
          Z-Labs 서비스(로또 Z·토토 Z 등)와 같은 계정을 써요. 이미 가입했다면 그 계정으로 로그인하면 돼요.
        </p>
        <LoginForm next={next} />
      </main>
    </>
  );
}
