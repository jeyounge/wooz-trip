import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getTripForUser, loadTripBundle } from '@/lib/trips';
import { daysRev } from '@/lib/rev';
import { ErrorCard, TopBar } from '@/components/ui';
import { travelForPage } from '@/lib/travelPage';
import SlotEditor from './SlotEditor';

export const dynamic = 'force-dynamic';

/** S03 루트 짜기 */
export default async function EditTripPage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser(`/trips/${id}/edit`);

  let trip;
  let role;
  let bundle;
  let travel = {};
  try {
    const found = await getTripForUser(id, user.id);
    if (!found?.role) notFound(); // 작성자·같이 고치는 멤버만
    ({ trip, role } = found);
    bundle = await loadTripBundle(trip);
    travel = await travelForPage(trip, bundle.placeMap);
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
    <SlotEditor
      trip={trip}
      rev={daysRev(trip.days)}
      role={role}
      initialPlaces={bundle.placeMap}
      initialTravel={travel}
      tags={bundle.tags}
      fromAi={sp?.ai === '1'}
      initialDay={Math.max(0, Math.min(trip.days.length - 1, parseInt(sp?.day, 10) || 0))}
    />
  );
}
