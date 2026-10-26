import { ImageResponse } from 'next/og';
import { AppIconImage } from '@/lib/og/AppIcon';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** 아이폰 「홈 화면에 추가」 아이콘 */
export default function AppleIcon() {
  return new ImageResponse(<AppIconImage px={180} />, size);
}
