import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getTrip, loadTripBundle } from '@/lib/trips';
import { ErrorCard, TopBar } from '@/components/ui';
import SlotEditor from './SlotEditor';

export const dynamic = 'force-dynamic';

/** S03 루트 짜기 */
export default async function EditTripPage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser(`/trips/${id}/edit`);

  let trip;
  let bundle;
  try {
    trip = await getTrip(id);
    if (!trip || trip.owner_id !== user.id) notFound();
    bundle = await loadTripBundle(trip);
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
      initialPlaces={bundle.placeMap}
      tags={bundle.tags}
      fromAi={sp?.ai === '1'}
      initialDay={Math.max(0, Math.min(trip.days.length - 1, parseInt(sp?.day, 10) || 0))}
    />
  );
}
