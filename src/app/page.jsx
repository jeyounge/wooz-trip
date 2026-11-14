import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import RouteCard from '@/components/RouteCard';
import { IconSearch } from '@/components/Icons';
import { EmptyCard, ErrorCard } from '@/components/ui';
import HomeQuickStart from '@/components/HomeQuickStart';
import { COMPANIONS, DESTINATIONS, SERVICE_NAME, TRAVEL_MODES, regionsOf } from '@/lib/config';
import { getPublicRoutes } from '@/lib/trips';
import { usedPlaceIds } from '@/lib/trip';

export const dynamic = 'force-dynamic';

/** S01 홈 */
export default async function HomePage({ searchParams }) {
  const sp = await searchParams;
  const kind = COMPANIONS.some((c) => c.id === sp?.c) ? sp.c : 'kids';
  const dest = DESTINATIONS.find((d) => d.open && d.id === sp?.to) || DESTINATIONS.find((d) => d.open);
  // 제주 밖은 차로만 간다
  const mode = dest.id !== 'jeju' ? 'car' : TRAVEL_MODES.some((m) => m.id === sp?.m) ? sp.m : 'fly';
  const who = COMPANIONS.find((c) => c.id === kind);
  let routes = [];
  let error = null;
  try {
    routes = await getPublicRoutes({ companion: kind, regions: regionsOf(dest.id).map((r) => r.id), limit: 6 });
  } catch (e) {
    error = e.message;
  }

  return (
    <>
      <header className="flex items-center justify-between px-5 pt-5 pb-1 lg:hidden">
        <div className="font-display text-[22px] text-cta">{SERVICE_NAME}</div>
        <Link href="/routes" aria-label="루트 찾기" className="icon-btn">
          <IconSearch />
        </Link>
      </header>

      {/* PC: 왼쪽 첫 질문(스크롤해도 고정) · 오른쪽 루트 카드 2열 */}
      <main className="flex flex-1 flex-col gap-[22px] px-5 pt-3 pb-4 lg:mx-auto lg:grid lg:w-full lg:max-w-[1280px] lg:grid-cols-[440px_minmax(0,1fr)] lg:items-start lg:gap-10 lg:px-8 lg:pt-10 lg:pb-16">
        <section className="relative flex flex-col gap-3.5 overflow-hidden rounded-[28px] bg-accent px-[22px] pt-6 pb-[22px] lg:sticky lg:top-24 lg:px-7 lg:pt-8 lg:pb-8">
          <svg width="150" height="150" viewBox="0 0 150 150" aria-hidden="true" className="absolute -right-[30px] -top-[34px]">
            <circle cx="75" cy="75" r="44" fill="#FFE08A" />
            <circle cx="75" cy="75" r="26" fill="#FFF3C9" />
          </svg>
          <svg width="100%" height="60" viewBox="0 0 390 60" preserveAspectRatio="none" aria-hidden="true" className="absolute bottom-0 left-0">
            <path d="M0 30 Q 40 10 80 30 T 160 30 T 240 30 T 320 30 T 400 30 V60 H0 Z" fill="#F7B92A" />
          </svg>
          <HomeQuickStart dest={dest.id} companion={kind} mode={mode} />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="m-0 h-display text-xl lg:text-2xl">{dest.label} · {who.label} 다녀온 루트</h2>

          {error ? (
            <ErrorCard message={error} />
          ) : routes.length ? (
            <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
              {routes.map((r, i) => (
                <RouteCard key={r.id} route={r} index={i} placeCount={usedPlaceIds(r.days).length} />
              ))}
            </div>
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
