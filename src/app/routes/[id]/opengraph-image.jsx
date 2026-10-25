import { ImageResponse } from 'next/og';
import { SERVICE_NAME } from '@/lib/config';
import { isEditorRoute, routeShareText } from '@/lib/format';
import { mapDays, usedPlaceIds } from '@/lib/trip';
import { tripLegs, withRoads } from '@/lib/travel';
import { readTravel } from '@/lib/travelCache';
import { getPublicTripAdmin, loadPlaceMapAdmin } from '@/lib/trips';
import { loadDisplayFont } from '@/lib/og/font';
import { OG_SIZE, RouteCardImage } from '@/lib/og/RouteCardImage';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = '여행 루트 동선 미리보기';
export const revalidate = 3600;

/** 공개 루트 공유 미리보기: 제목·요약·장소 칩 + 일자별 동선 그림. 비공개면 서비스 기본 카드 */
export default async function Image({ params }) {
  const { id } = await params;
  const trip = await getPublicTripAdmin(id).catch(() => null);
  let props = { brand: SERVICE_NAME, title: '아이랑 제주, 동선까지 한 번에', summary: '시간대에 장소를 넣으면 동선이 그려져요', chips: [], days: [] };
  if (trip) {
    const ids = usedPlaceIds(trip.days);
    const placeMap = await loadPlaceMapAdmin(ids).catch(() => ({}));
    const names = ids.map((pid) => placeMap[pid]?.name).filter(Boolean);
    props = {
      brand: isEditorRoute(trip) ? `${SERVICE_NAME} 추천 루트` : SERVICE_NAME,
      title: trip.title,
      summary: routeShareText(trip, names).split(' — ')[0],
      chips: names.slice(0, 4).map((n) => (n.length > 10 ? `${n.slice(0, 10)}…` : n)),
      days: withRoads(mapDays(trip.days, placeMap, trip), (await readTravel(tripLegs(trip, placeMap))).paths),
    };
  }
  const text = [props.brand, props.title, props.summary, ...props.chips, '첫째 날둘째 날셋째 날…'].join('');
  return new ImageResponse(<RouteCardImage {...props} />, { ...size, fonts: await loadDisplayFont(text) });
}
