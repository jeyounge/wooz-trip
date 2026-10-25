import { cache } from 'react';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getTrip, getTripLog, loadRainy, loadTripBundle } from '@/lib/trips';
import { fromRow } from '@/lib/triplog';
import { summarize, usedPlaceIds } from '@/lib/trip';
import { ErrorCard, TopBar } from '@/components/ui';
import { SERVICE_NAME } from '@/lib/config';
import { isEditorRoute, routeShareText } from '@/lib/format';
import { makeTravelFn } from '@/lib/travel';
import { travelForPage } from '@/lib/travelPage';
import RouteDetail from './RouteDetail';

export const dynamic = 'force-dynamic';

// 메타데이터와 화면이 같은 요청에서 루트를 한 번만 읽게
const loadTrip = cache(getTrip);
const loadBundle = cache(loadTripBundle);

/** 카톡·검색 미리보기: 제목, "제주 · 2박 3일 · 아이들과 · 12곳 — 장소…", 동선 그림(opengraph-image) */
export async function generateMetadata({ params }) {
  const { id } = await params;
  const trip = await loadTrip(id).catch(() => null);
  if (!trip) return { title: `루트를 찾을 수 없어요 | ${SERVICE_NAME}`, robots: { index: false } };
  const { placeMap } = await loadBundle(trip).catch(() => ({ placeMap: {} }));
  const names = usedPlaceIds(trip.days).map((pid) => placeMap[pid]?.name).filter(Boolean);
  const title = `${trip.title} | ${SERVICE_NAME}`;
  const description = `${isEditorRoute(trip) ? `${SERVICE_NAME} 추천 루트 · ` : ''}${routeShareText(trip, names)}`;
  return {
    title,
    description,
    alternates: { canonical: `/routes/${trip.id}` },
    openGraph: { type: 'article', title: trip.title, description, url: `/routes/${trip.id}` },
    twitter: { card: 'summary_large_image', title: trip.title, description },
    robots: trip.visibility === 'public' ? undefined : { index: false },
  };
}

/** S06 공개 루트 상세 */
export default async function RouteDetailPage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  let trip;
  let bundle;
  let user;
  let logRow;
  let rainy = {};
  let travel = {};
  try {
    [trip, user] = await Promise.all([loadTrip(id), getCurrentUser()]);
    if (!trip || (trip.visibility !== 'public' && trip.owner_id !== user?.id)) notFound();
    [bundle, logRow] = await Promise.all([loadBundle(trip), getTripLog(trip.id)]);
    [rainy, travel] = await Promise.all([loadRainy(trip, bundle.placeMap), travelForPage(trip, bundle.placeMap)]);
  } catch (e) {
    if (e?.digest?.startsWith?.('NEXT_')) throw e;
    return (
      <>
        <TopBar back="/routes" />
        <ErrorCard message={e.message} />
      </>
    );
  }
  const sum = summarize(trip, bundle.placeMap, makeTravelFn(travel.minutes));
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
    mode: typeof sp?.mode === 'string' ? sp.mode : '',
    area: typeof sp?.area === 'string' ? sp.area : '',
    slat: typeof sp?.slat === 'string' ? sp.slat : '',
    slng: typeof sp?.slng === 'string' ? sp.slng : '',
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
      rainy={rainy}
      travel={travel}
    />
  );
}
