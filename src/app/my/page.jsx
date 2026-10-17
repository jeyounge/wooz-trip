import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import { TopBar } from '@/components/ui';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { SERVICE_NAME } from '@/lib/config';
import { signOut } from '@/app/actions/auth';

export const dynamic = 'force-dynamic';

/** 마이 */
export default async function MyPage() {
  const user = await getCurrentUser();
  return (
    <>
      <TopBar title="마이" />
      <main className="flex flex-1 flex-col gap-3 px-5 pt-2 pb-4">
        {user ? (
          <>
            <div className="card flex flex-col gap-1 p-5">
              <div className="text-xs text-sub">로그인 계정 (Z-Labs 공용)</div>
              <div className="font-display text-lg break-all">{user.email}</div>
            </div>
            <Link href="/trips" className="card flex h-14 items-center px-5 font-display">
              내 여행
            </Link>
            {isAdmin(user) && (
              <Link href="/admin" className="card flex h-14 items-center px-5 font-display">
                운영자 화면
              </Link>
            )}
            <form action={signOut}>
              <button type="submit" className="btn-outline w-full">
                로그아웃
              </button>
            </form>
          </>
        ) : (
          <div className="card flex flex-col gap-3 p-5">
            <div className="font-display text-lg">로그인하면 루트를 저장하고 공유할 수 있어요</div>
            <Link href="/login?next=/my" className="btn-cta">
              로그인
            </Link>
          </div>
        )}
        <p className="m-0 mt-2 text-xs leading-relaxed text-sub">
          {SERVICE_NAME}는 공식 API·공공데이터와 운영자 검수로 장소 정보를 모아요. 리뷰·사진은 저장하지 않고 원본 링크로만 연결해요. 장소 정보는 실제와 다를 수 있으니 방문 전에 한 번 더 확인해 주세요. 장소 기본 정보 일부는 한국관광공사 TourAPI(공공데이터)를 이용해요.
        </p>
      </main>
      <BottomNav />
    </>
  );
}
