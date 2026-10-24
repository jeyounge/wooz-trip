import { SITE_URL } from '@/lib/config';
import { listPublicTripIds } from '@/lib/trips';

export const revalidate = 3600;

/** 검색용 주소 목록: 홈, 둘러보기, 공개 루트. 가족 공유 링크(/s/...)와 내 여행은 넣지 않는다 */
export default async function sitemap() {
  const routes = await listPublicTripIds().catch(() => []);
  return [
    { url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/routes`, changeFrequency: 'daily', priority: 0.8 },
    ...routes.map((r) => ({ url: `${SITE_URL}/routes/${r.id}`, lastModified: r.updated_ts ? new Date(r.updated_ts) : undefined, changeFrequency: 'weekly', priority: 0.6 })),
  ];
}
