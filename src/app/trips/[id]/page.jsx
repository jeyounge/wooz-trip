import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getTripForUser, getTripLog, getTripLogAdmin, loadRainy, loadTripBundle } from '@/lib/trips';
import { getMembers } from '@/lib/members';
import { daysRev } from '@/lib/rev';
import { fromRow } from '@/lib/triplog';
import { ErrorCard, TopBar } from '@/components/ui';
import { travelForPage } from '@/lib/travelPage';
import RouteResult from './RouteResult';

export const dynamic = 'force-dynamic';

/** S05 루트 결과 (본인 루트 · 같이 고치는 루트). 공개 루트는 /routes/:id, 가족 공유는 /s/:shareId */
export default async function TripResultPage({ params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  let trip;
  let role;
  let bundle;
  let logRow;
  let members = null;
  let rainy = {};
  let travel = {};
  try {
    const found = await getTripForUser(id, user?.id);
    if (!found) notFound();
    ({ trip, role } = found);
    // 남의 공개 루트면 공개 상세로
    if (!role) redirect(`/routes/${trip.id}`);
    [bundle, logRow, members] = await Promise.all([
      loadTripBundle(trip),
      role === 'owner' ? getTripLog(trip.id) : getTripLogAdmin(trip.id),
      role === 'owner' ? getMembers(trip.id) : null,
    ]);
    [rainy, travel] = await Promise.all([loadRainy(trip, bundle.placeMap), travelForPage(trip, bundle.placeMap)]);
  } catch (e) {
    if (e?.digest?.startsWith?.('NEXT_')) throw e;
    return (
      <>
        <TopBar back="/trips" />
        <ErrorCard message={e.message} />
      </>
    );
  }
  return (
    <RouteResult
      trip={trip}
      rev={daysRev(trip.days)}
      role={role}
      members={members}
      userId={user.id}
      placeMap={bundle.placeMap}
      userEmail={user.email}
      log={fromRow(logRow)}
      rainy={rainy}
      travel={travel}
    />
  );
}
