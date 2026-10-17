import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import RouteCard from '@/components/RouteCard';
import { IconSearch } from '@/components/Icons';
import { EmptyCard, ErrorCard } from '@/components/ui';
import { COMPANIONS, SERVICE_NAME } from '@/lib/config';
import { getPublicRoutes } from '@/lib/trips';
import { usedPlaceIds } from '@/lib/trip';

export const dynamic = 'force-dynamic';

/** S01 홈 */
export default async function HomePage({ searchParams }) {
  const sp = await searchParams;
  const kind = COMPANIONS.some((c) => c.id === sp?.c) ? sp.c : 'kids';
  let routes = [];
  let error = null;
  try {
    routes = await getPublicRoutes({ companion: kind, limit: 6 });
  } catch (e) {
    error = e.message;
  }

  return (
    <>
      <header className="flex items-center justify-between px-5 pt-5 pb-1">
        <div className="font-display text-[22px] text-cta">{SERVICE_NAME}</div>
        <Link href="/routes" aria-label="루트 찾기" className="icon-btn">
          <IconSearch />
        </Link>
      </header>

      <main className="flex flex-1 flex-col gap-[22px] px-5 pt-3 pb-4">
        <section className="relative flex flex-col gap-3.5 overflow-hidden rounded-[28px] bg-accent px-[22px] pt-6 pb-[22px]">
          <svg width="150" height="150" viewBox="0 0 150 150" aria-hidden="true" className="absolute -right-[30px] -top-[34px]">
            <circle cx="75" cy="75" r="44" fill="#FFE08A" />
            <circle cx="75" cy="75" r="26" fill="#FFF3C9" />
          </svg>
          <svg width="100%" height="60" viewBox="0 0 390 60" preserveAspectRatio="none" aria-hidden="true" className="absolute bottom-0 left-0">
            <path d="M0 30 Q 40 10 80 30 T 160 30 T 240 30 T 320 30 T 400 30 V60 H0 Z" fill="#F7B92A" />
          </svg>
          <h1 className="relative m-0 h-display text-[30px] leading-tight">
            아이랑 제주,
            <br />
            어디부터 가볼까?
          </h1>
          <p className="relative m-0 text-[15px] leading-normal text-[#4E3A2C]">
            가고 싶은 곳만 골라 두면 낮잠·밥 시간에 맞춰 동선을 그려 줄게요.
          </p>
          <Link href="/trips/new" className="btn-cta relative">
            우리 가족 여행 짜기
          </Link>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="m-0 h-display text-xl">이런 가족이 다녀왔어요</h2>
          <div className="grid grid-cols-4 gap-2">
            {COMPANIONS.map((k) => {
              const on = k.id === kind;
              return (
                <Link
                  key={k.id}
                  href={k.id === 'kids' ? '/' : `/?c=${k.id}`}
                  scroll={false}
                  aria-current={on ? 'true' : undefined}
                  className={`flex h-[76px] flex-col items-center justify-center gap-1.5 rounded-[20px] bg-surface ${
                    on ? 'border-2 border-ink' : 'border-2 border-transparent shadow-soft'
                  }`}
                >
                  <span className="h-[26px] w-[26px] rounded-full" style={{ background: k.color }} />
                  <span className="text-[13px]">{k.label}</span>
                </Link>
              );
            })}
          </div>

          {error ? (
            <ErrorCard message={error} />
          ) : routes.length ? (
            routes.map((r, i) => <RouteCard key={r.id} route={r} index={i} placeCount={usedPlaceIds(r.days).length} />)
          ) : (
            <EmptyCard
              title="아직 공개된 루트가 없어요"
              desc="우리 가족 루트를 먼저 짜서 자랑해 보세요. 다른 가족이 그대로 따라갈 수 있어요."
            />
          )}
        </section>
      </main>
      <BottomNav />
    </>
  );
}
