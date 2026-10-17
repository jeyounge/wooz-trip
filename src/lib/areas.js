/**
 * areas.js — 장소 수집 지역 (시·도). TourAPI 의 법정동 시도 코드(lDongRegnCd)를 쓴다.
 *
 * 수집 우선순위는 이 배열 순서다 (제주 → 인천 → 경기 → 나머지).
 * 서비스 화면에서 고를 수 있는 지역은 config.js 의 REGIONS (지금은 제주 4권역)이고,
 * 다른 시·도는 장소를 모아 두기만 한다 (region = slug, status = candidate).
 */
export const AREAS = [
  { code: '50', slug: 'jeju', name: '제주' },
  { code: '28', slug: 'incheon', name: '인천' },
  { code: '41', slug: 'gyeonggi', name: '경기' },
  { code: '11', slug: 'seoul', name: '서울' },
  { code: '51', slug: 'gangwon', name: '강원' },
  { code: '26', slug: 'busan', name: '부산' },
  { code: '48', slug: 'gyeongnam', name: '경남' },
  { code: '47', slug: 'gyeongbuk', name: '경북' },
  { code: '46', slug: 'jeonnam', name: '전남' },
  { code: '52', slug: 'jeonbuk', name: '전북' },
  { code: '44', slug: 'chungnam', name: '충남' },
  { code: '43', slug: 'chungbuk', name: '충북' },
  { code: '27', slug: 'daegu', name: '대구' },
  { code: '29', slug: 'gwangju', name: '광주' },
  { code: '30', slug: 'daejeon', name: '대전' },
  { code: '31', slug: 'ulsan', name: '울산' },
  { code: '36', slug: 'sejong', name: '세종' },
];

export const areaByCode = (code) => AREAS.find((a) => a.code === String(code)) || null;
export const areaBySlug = (slug) => AREAS.find((a) => a.slug === slug) || null;
