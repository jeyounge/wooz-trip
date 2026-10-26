import { SERVICE_NAME } from '@/lib/config';

/** 홈 화면에 추가(PWA). 여행 중에 앱처럼 바로 열 수 있게 */
export default function manifest() {
  return {
    name: `${SERVICE_NAME} · 아이랑 여행 동선`,
    short_name: SERVICE_NAME,
    description: '시간대에 장소를 넣으면 이동 동선과 타임라인이 그려지는 가족 여행 루트',
    start_url: '/trips',
    scope: '/',
    display: 'standalone',
    background_color: '#FFF7EC',
    theme_color: '#FFF7EC',
    lang: 'ko',
    icons: [
      { src: '/icon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
