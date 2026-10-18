import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getTrip, getTripLog, loadTripBundle } from '@/lib/trips';
import { fromRow } from '@/lib/triplog';
import { ErrorCard, TopBar } from '@/components/ui';
import RouteResult from './RouteResult';

export const dynamic = 'force-dynamic';

/** S05 루트 결과 (본인 루트). 공개 루트는 /routes/:id, 가족 공유는 /s/:shareId */
export default async function TripResultPage({ params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  let trip;
  let bundle;
  let logRow;
  try {
    trip = await getTrip(id);
    if (!trip) notFound();
    [bundle, logRow] = await Promise.all([loadTripBundle(trip), getTripLog(trip.id)]);
  } catch (e) {
    if (e?.digest?.startsWith?.('NEXT_')) throw e;
    return (
      <>
        <TopBar back="/trips" />
        <ErrorCard message={e.message} />
      </>
    );
  }
  const isOwner = !!user && user.id === trip.owner_id;
  if (!isOwner) {
    // 남의 공개 루트면 공개 상세로
    redirect(`/routes/${trip.id}`);
  }
  return <RouteResult trip={trip} placeMap={bundle.placeMap} userEmail={user.email} log={fromRow(logRow)} />;
}
