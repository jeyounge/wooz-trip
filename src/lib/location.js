/**
 * location.js — 카카오 검색 결과 정리, 숙소·직접 넣은 일정의 위치 검증 (순수 함수, 테스트 대상)
 *
 * 카카오 로컬 API 결과는 우리 장소 DB 에 후보(candidate)로 저장한다 (2026-10-22 사용자 결정).
 * 숙소 위치와 직접 넣은 일정 위치는 여행(trips) 안에만 저장한다.
 */
import { AREAS } from './areas.js';
import { regionOf } from './tourapi/transform.js';

/** 한국 안 좌표인지 (대충의 경계 상자) */
export function inKorea(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat > 33 && lat < 38.7 && lng > 124.5 && lng < 131;
}

const round6 = (n) => Math.round(n * 1e6) / 1e6;

/**
 * 위치 값 정리 → { name, address?, lat?, lng?, kakaoId? } | null
 * 이름은 꼭 있어야 하고, 좌표는 둘 다 있고 한국 안일 때만 남긴다.
 */
export function cleanLocation(v, { maxName = 40 } = {}) {
  if (!v || typeof v !== 'object') return null;
  const name = String(v.name || '').trim().slice(0, maxName);
  if (!name) return null;
  const out = { name };
  const address = String(v.address || '').trim().slice(0, 120);
  if (address) out.address = address;
  const lat = Number(v.lat);
  const lng = Number(v.lng);
  if (v.lat !== null && v.lat !== undefined && v.lat !== '' && inKorea(lat, lng)) {
    out.lat = round6(lat);
    out.lng = round6(lng);
  }
  if (/^\d{1,20}$/.test(String(v.kakaoId || ''))) out.kakaoId = String(v.kakaoId);
  return out;
}

/** 카카오 장소 분류 → 우리 카테고리 */
export function categoryOfKakao(doc) {
  const code = doc?.category_group_code || '';
  const name = doc?.category_name || '';
  if (name.includes('골프장')) return 'golf';
  if (code === 'FD6') return 'food';
  if (code === 'CE7') return 'cafe';
  if (code === 'AD5') return 'stay';
  return 'sight';
}

/** 카카오 키워드 검색 결과 한 건 → 화면용 */
export function normalizeKakaoDoc(doc) {
  const lat = Number(doc?.y);
  const lng = Number(doc?.x);
  if (!doc?.id || !doc?.place_name || !inKorea(lat, lng)) return null;
  const parts = String(doc.category_name || '').split('>').map((s) => s.trim()).filter(Boolean);
  return {
    kakaoId: String(doc.id),
    name: String(doc.place_name).slice(0, 80),
    address: doc.road_address_name || doc.address_name || '',
    lat: round6(lat),
    lng: round6(lng),
    category: categoryOfKakao(doc),
    kind: parts[parts.length - 1] || doc.category_group_name || '',
    phone: doc.phone || '',
    url: String(doc.place_url || '').replace(/^http:/, 'https:'),
  };
}

/** 카카오 주소 검색 결과 한 건 → 화면용 (장소가 아니라 주소라서 kakaoId 가 없다) */
export function normalizeKakaoAddress(doc) {
  const lat = Number(doc?.y);
  const lng = Number(doc?.x);
  if (!doc?.address_name || !inKorea(lat, lng)) return null;
  const name = doc.road_address?.building_name || doc.address_name;
  return { kakaoId: null, name: String(name).slice(0, 80), address: doc.address_name, lat: round6(lat), lng: round6(lng), category: null, kind: '주소', phone: '', url: '' };
}

// 주소 첫 단어(시·도 정식 이름) → areas.js 짧은 이름
const SIDO_LONG = {
  제주특별자치도: '제주',
  서울특별시: '서울',
  인천광역시: '인천',
  경기도: '경기',
  강원특별자치도: '강원',
  강원도: '강원',
  부산광역시: '부산',
  경상남도: '경남',
  경상북도: '경북',
  전라남도: '전남',
  전북특별자치도: '전북',
  전라북도: '전북',
  충청남도: '충남',
  충청북도: '충북',
  대구광역시: '대구',
  광주광역시: '광주',
  대전광역시: '대전',
  울산광역시: '울산',
  세종특별자치시: '세종',
};

/** 주소 → { region, sido_code } (제주는 4권역, 나머지는 시·도 slug) */
export function regionForAddress(address, lat, lng) {
  const first = String(address || '').trim().split(/\s+/)[0] || '';
  const short = SIDO_LONG[first] || first;
  const area = AREAS.find((a) => a.name === short) || null;
  if (area?.slug === 'jeju') return { region: regionOf(address, lat, lng) || 'jeju-city', sido_code: area.code };
  if (area) return { region: area.slug, sido_code: area.code };
  return { region: 'etc', sido_code: null };
}

/** 카카오 결과 → wooz_trip_places 행 (후보) */
export function kakaoPlaceRow(item, userId) {
  const { region, sido_code } = regionForAddress(item.address, item.lat, item.lng);
  return {
    name: item.name,
    category: item.category || 'sight',
    sub_category: item.kind || null,
    address: item.address || null,
    lat: item.lat,
    lng: item.lng,
    region,
    sido_code,
    phone: item.phone || null,
    source_provider: 'kakao',
    source_external_id: item.kakaoId,
    status: 'candidate',
    external_links: item.url ? { map: item.url } : {},
    source_data: { addedBy: 'user', userId, kakaoKind: item.kind || null },
  };
}
