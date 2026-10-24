import { ImageResponse } from 'next/og';
import { SERVICE_NAME } from '@/lib/config';
import { loadDisplayFont } from '@/lib/og/font';
import { OG_SIZE, RouteCardImage } from '@/lib/og/RouteCardImage';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = `${SERVICE_NAME} — 아이랑 제주, 동선까지 한 번에`;

// 오른쪽 그림용 예시 동선 (제주 서쪽 → 남쪽 → 동쪽, 실제 장소 아님)
const DEMO = [
  [[33.51, 126.49], [33.46, 126.33], [33.39, 126.24], [33.3, 126.27]],
  [[33.3, 126.27], [33.24, 126.41], [33.25, 126.56], [33.3, 126.68]],
  [[33.3, 126.68], [33.43, 126.92], [33.52, 126.85], [33.51, 126.53]],
].map((pts) => ({ points: pts.map(([lat, lng]) => ({ lat, lng, kind: 'place' })) }));

export default async function Image() {
  const props = {
    brand: SERVICE_NAME,
    title: '아이랑 제주, 동선까지 한 번에',
    summary: '시간대에 장소를 넣으면 동선이 그려져요',
    chips: ['아이 태그', '휴무 확인', '이동시간'],
    days: DEMO,
  };
  const text = [props.brand, props.title, props.summary, ...props.chips, '첫째 날둘째 날셋째 날'].join('');
  return new ImageResponse(<RouteCardImage {...props} />, { ...size, fonts: await loadDisplayFont(text) });
}
