import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import RouteCard from '@/components/RouteCard';
import { EmptyCard, ErrorCard, TopBar } from '@/components/ui';
import { COMPANIONS, REGIONS } from '@/lib/config';
import { getPublicRoutes } from '@/lib/trips';
import { usedPlaceIds } from '@/lib/trip';

export const dynamic = 'force-dynamic';

/** 둘러보기: 공개 루트 목록 (동행 유형·지역 필터) */
export default async function RoutesPage({ searchParams }) {
  const sp = await searchParams;
  const companion = COMPANIONS.some((c) => c.id === sp?.c) ? sp.c : '';
  const region = REGIONS.some((r) => r.id === sp?.r) ? sp.r : '';

  // S02 "따라가기"에서 넘어온 내 여행 정보는 상세 → 복사 시트까지 그대로 넘긴다
  const setup = new URLSearchParams();
  for (const k of ['start', 'arr', 'dep', 'stay', 'mode', 'area']) if (typeof sp?.[k] === 'string' && sp[k]) setup.set(k, sp[k]);
  const fromSetup = setup.toString();

  const href = (patch) => {
    const q = new URLSearchParams(setup);
    const c = patch.c ?? companion;
    const r = patch.r ?? region;
    if (c) q.set('c', c);
    if (r) q.set('r', r);
    const s = q.toString();
    return s ? `/routes?${s}` : '/routes';
  };

  let routes = [];
  let error = null;
  try {
    routes = await getPublicRoutes({ companion, region, limit: 40 });
  } catch (e) {
    error = e.message;
  }

  const chip = (on) => `pill flex items-center whitespace-nowrap ${on ? 'pill-on' : ''}`;

  return (
    <>
      <TopBar back={fromSetup ? '/trips/new' : undefined} title="둘러보기" sub="다른 가족이 다녀온 루트를 그대로 가져올 수 있어요" />
      <main className="flex flex-1 flex-col gap-3 px-5 pt-2 pb-4">
        {fromSetup && (
          <div className="rounded-2xl bg-accent px-3.5 py-2.5 text-[13px]">마음에 드는 루트를 고르면 입력한 날짜로 가져올 수 있어요.</div>
        )}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <Link href={href({ c: '' })} className={chip(!companion)} scroll={false}>
            전체
          </Link>
          {COMPANIONS.map((c) => (
            <Link key={c.id} href={href({ c: c.id })} className={chip(companion === c.id)} scroll={false}>
              {c.label}
            </Link>
          ))}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <Link href={href({ r: '' })} className={chip(!region)} scroll={false}>
            제주 전체
          </Link>
          {REGIONS.map((r) => (
            <Link key={r.id} href={href({ r: r.id })} className={chip(region === r.id)} scroll={false}>
              {r.short}
            </Link>
          ))}
        </div>

        {error ? (
          <ErrorCard message={error} />
        ) : routes.length ? (
          routes.map((r, i) => <RouteCard key={r.id} route={r} index={i} placeCount={usedPlaceIds(r.days).length} query={fromSetup} />)
        ) : (
          <EmptyCard
            title="조건에 맞는 공개 루트가 없어요"
            desc="필터를 바꾸거나, 우리 가족 루트를 직접 짜서 첫 루트로 자랑해 보세요."
            action={
              <Link href="/trips/new" className="btn-cta mt-2 w-full">
                우리 가족 여행 짜기
              </Link>
            }
          />
        )}
      </main>
      <BottomNav />
    </>
  );
}
