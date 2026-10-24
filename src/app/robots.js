import { SITE_URL } from '@/lib/config';

/** 공개 화면만 검색에 열고, 가족 공유 링크·내 여행·관리자는 막는다 */
export default function robots() {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/s/', '/trips/', '/my', '/admin', '/login', '/api/'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
