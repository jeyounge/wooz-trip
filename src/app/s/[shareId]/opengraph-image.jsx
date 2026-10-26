import { ImageResponse } from 'next/og';
import { SERVICE_NAME } from '@/lib/config';
import { routeShareText } from '@/lib/format';
import { mapDays, usedPlaceIds } from '@/lib/trip';
import { tripLegs, withRoads } from '@/lib/travel';
import { readTravel } from '@/lib/travelCache';
import { getTripByShareId, loadPlaceMapAdmin } from '@/lib/trips';
import { loadDisplayFont } from '@/lib/og/font';
import { OG_SIZE, RouteCardImage } from '@/lib/og/RouteCardImage';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = '가족 여행 동선 미리보기';
export const revalidate = 600;

/** 가족 공유 링크 미리보기 (카카오톡 카드·단톡방 링크): 제목·요약·장소 칩 + 일자별 동선 그림 */
export default async function Image({ params }) {
  const { shareId } = await params;
  const trip = await getTripByShareId(shareId).catch(() => null);
  let props = { brand: SERVICE_NAME, title: '가족 여행 동선', summary: '시간대에 장소를 넣으면 동선이 그려져요', chips: [], days: [] };
  if (trip) {
    const ids = usedPlaceIds(trip.days);
    const placeMap = await loadPlaceMapAdmin(ids).catch(() => ({}));
    const names = ids.map((pid) => placeMap[pid]?.name).filter(Boolean);
    props = {
      brand: SERVICE_NAME,
      title: trip.title,
      summary: routeShareText(trip, names).split(' — ')[0],
      chips: names.slice(0, 4).map((n) => (n.length > 10 ? `${n.slice(0, 10)}…` : n)),
      days: withRoads(mapDays(trip.days, placeMap, trip), (await readTravel(tripLegs(trip, placeMap))).paths),
    };
  }
  const text = [props.brand, props.title, props.summary, ...props.chips, '첫째 날둘째 날셋째 날…'].join('');
  return new ImageResponse(<RouteCardImage {...props} />, { ...size, fonts: await loadDisplayFont(text) });
}
