import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getTrip, getTripLog, loadTripBundle } from '@/lib/trips';
import { fromRow } from '@/lib/triplog';
import { summarize, usedPlaceIds } from '@/lib/trip';
import { ErrorCard, TopBar } from '@/components/ui';
import RouteDetail from './RouteDetail';

export const dynamic = 'force-dynamic';

/** S06 공개 루트 상세 */
export default async function RouteDetailPage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  let trip;
  let bundle;
  let user;
  let logRow;
  try {
    [trip, user] = await Promise.all([getTrip(id), getCurrentUser()]);
    if (!trip || (trip.visibility !== 'public' && trip.owner_id !== user?.id)) notFound();
    [bundle, logRow] = await Promise.all([loadTripBundle(trip), getTripLog(trip.id)]);
  } catch (e) {
    if (e?.digest?.startsWith?.('NEXT_')) throw e;
    return (
      <>
        <TopBar back="/routes" />
        <ErrorCard message={e.message} />
      </>
    );
  }
  const sum = summarize(trip, bundle.placeMap);
  const places = usedPlaceIds(trip.days)
    .map((pid) => bundle.placeMap[pid])
    .filter(Boolean)
    .map((p) => ({ id: p.id, name: p.name }));

  // 둘러보기 전에 S02 에서 넣은 내 여행 정보 (복사 시트 기본값)
  const setup = {
    start: typeof sp?.start === 'string' ? sp.start : '',
    arr: typeof sp?.arr === 'string' ? sp.arr : '',
    dep: typeof sp?.dep === 'string' ? sp.dep : '',
    stay: typeof sp?.stay === 'string' ? sp.stay : '',
  };

  return (
    <RouteDetail
      trip={trip}
      placeMap={bundle.placeMap}
      tags={bundle.tags}
      stats={{ places: sum.places, travel: sum.travel }}
      places={places}
      isLoggedIn={!!user}
      isOwner={user?.id === trip.owner_id}
      setup={setup}
      log={logRow?.is_public ? fromRow(logRow) : null}
    />
  );
}
