import './globals.css';
import { Jua, Gowun_Dodum } from 'next/font/google';
import { SERVICE_NAME, SITE_URL } from '@/lib/config';

// 시안 B 서체: 제목 Jua + 본문 Gowun Dodum (한글 글리프가 커서 preload 는 끈다)
const jua = Jua({ weight: '400', subsets: ['latin'], variable: '--font-display', display: 'swap', preload: false });
const gowun = Gowun_Dodum({ weight: '400', subsets: ['latin'], variable: '--font-body', display: 'swap', preload: false });

const DESCRIPTION = '검증된 제주 장소를 시간대에 넣으면 이동 동선과 타임라인이 자동으로 그려지는 가족 여행 루트 서비스.';

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: `${SERVICE_NAME} | 아이랑 제주, 동선까지 한 번에`,
  description: DESCRIPTION,
  openGraph: { type: 'website', siteName: SERVICE_NAME, locale: 'ko_KR', title: `${SERVICE_NAME} | 아이랑 제주, 동선까지 한 번에`, description: DESCRIPTION },
  twitter: { card: 'summary_large_image' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#FFF7EC',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko" className={`${jua.variable} ${gowun.variable}`}>
      <body>
        {/* 모바일 웹 우선: 데스크톱에서는 가운데 정렬한 모바일 폭 */}
        <div className="mx-auto min-h-dvh w-full max-w-app bg-bg flex flex-col relative">{children}</div>
      </body>
    </html>
  );
}
