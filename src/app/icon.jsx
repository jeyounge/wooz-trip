import { ImageResponse } from 'next/og';
import { AppIconImage } from '@/lib/og/AppIcon';

// 홈 화면·탭 아이콘. /icon/192, /icon/512 (manifest 에서 씀)
export function generateImageMetadata() {
  return [
    { id: '192', size: { width: 192, height: 192 }, contentType: 'image/png' },
    { id: '512', size: { width: 512, height: 512 }, contentType: 'image/png' },
  ];
}

export default async function Icon({ id }) {
  const px = Number(await id) || 192;
  return new ImageResponse(<AppIconImage px={px} />, { width: px, height: px });
}
