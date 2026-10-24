import { notFound } from 'next/navigation';
import { getPublicTripLogAdmin, getTripByShareId, loadPlaceMapAdmin, loadRainy } from '@/lib/trips';
import { fromRow } from '@/lib/triplog';
import { usedPlaceIds } from '@/lib/trip';
import { ErrorCard } from '@/components/ui';
import { SERVICE_NAME } from '@/lib/config';
import SharedRoute from './SharedRoute';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `가족 여행 동선 | ${SERVICE_NAME}`,
  robots: { index: false }, // 가족 공유 링크는 검색에 노출하지 않는다
};

/** 가족 공유 링크로 보는 읽기 전용 루트 (로그인 불필요) */
export default async function SharedRoutePage({ params }) {
  const { shareId } = await params;
  try {
    const trip = await getTripByShareId(shareId);
    if (!trip) notFound();
    const [placeMap, logRow] = await Promise.all([loadPlaceMapAdmin(usedPlaceIds(trip.days)), getPublicTripLogAdmin(trip.id)]);
    const rainy = await loadRainy(trip, placeMap);
    // 공유 화면에는 소유자 정보를 넘기지 않는다
    const { owner_id: _o, share_id: _s, ...safe } = trip;
    return <SharedRoute trip={safe} placeMap={placeMap} log={logRow ? fromRow(logRow) : null} rainy={rainy} />;
  } catch (e) {
    if (e?.digest?.startsWith?.('NEXT_')) throw e;
    return <ErrorCard message={e.message} />;
  }
}
