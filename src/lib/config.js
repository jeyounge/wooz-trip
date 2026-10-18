/**
 * config.js — 서비스 전역 설정 (서비스명, 지역, 동행 유형, 슬롯, 기능 플래그)
 * 화면 문구에 쓰는 고정 목록은 여기서만 관리한다.
 * 아이 태그 목록은 DB(wooz_trip_kid_tags)에서 관리한다.
 */

// 서비스명은 미정. 정해지면 .env 의 NEXT_PUBLIC_SERVICE_NAME 한 곳만 바꾼다.
export const SERVICE_NAME = process.env.NEXT_PUBLIC_SERVICE_NAME || '우즈트립';

export const REGIONS = [
  { id: 'jeju-west', label: '서쪽 (애월·협재)', short: '서쪽' },
  { id: 'jeju-east', label: '동쪽', short: '동쪽' },
  { id: 'jeju-south', label: '서귀포', short: '서귀포' },
  { id: 'jeju-city', label: '제주시', short: '제주시' },
];

export const COMPANIONS = [
  { id: 'kids', label: '아이들과', color: '#FFC93C' },
  { id: 'parents', label: '부모님과', color: '#BFE6D5' },
  { id: 'couple', label: '연인과', color: '#FFC6B8' },
  { id: 'friends', label: '친구끼리', color: '#D9E4FF' },
];

export const CATEGORIES = {
  food: '식당',
  sight: '볼거리',
  cafe: '카페',
  stay: '숙소',
};

/** 슬롯 종류 → 라벨, 기본 머무는 시간(분), 후보 카테고리 */
export const SLOT_TYPES = {
  am: { label: '오전', stay: 120, categories: ['sight'], emptyName: '오전에 놀 곳' },
  lunch: { label: '점심', stay: 60, categories: ['food'], emptyName: '점심 먹을 곳' },
  pm: { label: '오후', stay: 120, categories: ['sight'], emptyName: '오후에 놀 곳' },
  cafe: { label: '카페', stay: 60, categories: ['cafe'], emptyName: '카페' },
  dinner: { label: '저녁', stay: 90, categories: ['food'], emptyName: '저녁 먹을 곳' },
  extra: { label: '추가', stay: 60, categories: ['sight', 'cafe', 'food'], emptyName: '간식·놀이터 등' },
  fixed: { label: '고정', stay: 0, categories: [], emptyName: '' },
};

/** 제주공항 (공항은 고정 슬롯 위치로만 쓴다) */
export const AIRPORT = { name: '제주공항', lat: 33.5066, lng: 126.4929 };

/**
 * 어떻게 가요? fly = 비행기(공항 도착·출발), car = 차(출발 지역에서 출발·도착).
 * 제주 권역은 기본 비행기, 인천·경기를 열면 그 권역은 기본 차 (REGION_ZONE 참고).
 */
export const TRAVEL_MODES = [
  { id: 'fly', label: '비행기' },
  { id: 'car', label: '차' },
];
/** 권역(REGIONS.id) → 출발 지역 묶음. 지역을 새로 열면 여기에 추가한다 */
export const REGION_ZONE = { 'jeju-west': 'jeju', 'jeju-east': 'jeju', 'jeju-south': 'jeju', 'jeju-city': 'jeju' };
export const ZONE_DEFAULT_MODE = { jeju: 'fly', capital: 'car' };

/**
 * 차로 갈 때 출발 지역 (대표 좌표 하나씩, 이동시간 추정용). 집 주소는 받지 않는다 (2026-10-18 결정).
 * zone: 이 출발 지역을 보여줄 권역 묶음
 */
export const DEPART_AREAS = [
  { id: 'jeju-downtown', label: '제주시내', zone: 'jeju', lat: 33.4996, lng: 126.5312 },
  { id: 'seogwipo-downtown', label: '서귀포시내', zone: 'jeju', lat: 33.2541, lng: 126.56 },
  { id: 'jeju-port', label: '제주항 (배로 차 가져옴)', zone: 'jeju', lat: 33.5195, lng: 126.5434 },
  { id: 'seoul-gangnam', label: '서울 강남', zone: 'capital', lat: 37.4979, lng: 127.0276 },
  { id: 'seoul-gangbuk', label: '서울 강북·도심', zone: 'capital', lat: 37.5663, lng: 126.9779 },
  { id: 'seoul-west', label: '서울 서부', zone: 'capital', lat: 37.5571, lng: 126.9245 },
  { id: 'seoul-east', label: '서울 동부', zone: 'capital', lat: 37.5384, lng: 127.0822 },
  { id: 'suwon', label: '수원', zone: 'capital', lat: 37.2659, lng: 127.0 },
  { id: 'seongnam', label: '성남·분당', zone: 'capital', lat: 37.385, lng: 127.1233 },
  { id: 'yongin', label: '용인', zone: 'capital', lat: 37.2411, lng: 127.1776 },
  { id: 'goyang', label: '고양·일산', zone: 'capital', lat: 37.6597, lng: 126.7732 },
  { id: 'bucheon', label: '부천', zone: 'capital', lat: 37.5034, lng: 126.766 },
  { id: 'anyang', label: '안양·군포', zone: 'capital', lat: 37.3897, lng: 126.951 },
  { id: 'uijeongbu', label: '의정부', zone: 'capital', lat: 37.7381, lng: 127.0337 },
  { id: 'incheon', label: '인천', zone: 'capital', lat: 37.4563, lng: 126.7052 },
];
export const departArea = (id) => DEPART_AREAS.find((a) => a.id === id) || null;
export const zoneOf = (region) => REGION_ZONE[region] || 'capital';
export const departAreasFor = (region) => DEPART_AREAS.filter((a) => a.zone === zoneOf(region));
export const defaultMode = (region) => ZONE_DEFAULT_MODE[zoneOf(region)] || 'car';

export const DAY_LABELS = ['첫째 날', '둘째 날', '셋째 날', '넷째 날', '다섯째 날', '여섯째 날', '일곱째 날'];
export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 일자 색 + 선 모양 (색만으로 구분하지 않는다) */
export const DAY_STYLES = [
  { color: 'var(--c-day1)', hex: '#D2492F', dash: null, kakao: 'solid' },
  { color: 'var(--c-day2)', hex: '#2E8A6A', dash: '2 10', kakao: 'shortdot' },
  { color: 'var(--c-day3)', hex: '#3B5BA5', dash: '14 8', kakao: 'dash' },
];
export const dayStyle = (i) => DAY_STYLES[i % DAY_STYLES.length];

/** 여행 최대 일수 (MVP) */
export const MAX_TRIP_DAYS = 7;

export const FEATURES = {
  // "내 일정으로 복사"의 프리미엄 잠금. MVP는 무료로 열어 둔다.
  copyRequiresPremium: false,
};

/** 아이 낮잠 시간대 (분 단위, 13:00~15:00) */
export const NAP_WINDOW = [13 * 60, 15 * 60];
