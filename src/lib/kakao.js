/**
 * kakao.js — 카카오 로컬 검색 (서버 전용, KAKAO_REST_API_KEY)
 *
 * 키워드 검색 → 결과가 없으면 주소 검색. 결과는 location.js 로 정리한다.
 * 무료 한도 안에서 쓴다. 로그인 사용자만 부를 수 있게 서버 액션에서 감싼다.
 */
import { normalizeKakaoAddress, normalizeKakaoDoc } from './location.js';

const BASE = 'https://dapi.kakao.com/v2/local/search';

function key() {
  const k = String(process.env.KAKAO_REST_API_KEY || '').trim().replace(/^["']|["']$/g, '');
  if (!k) throw new Error('카카오 검색 키가 아직 없어요 (운영자: KAKAO_REST_API_KEY 설정 필요)');
  return k;
}

async function call(path, params) {
  const u = `${BASE}/${path}.json?${new URLSearchParams(params)}`;
  const res = await fetch(u, { headers: { Authorization: `KakaoAK ${key()}` }, cache: 'no-store' });
  if (!res.ok) throw new Error(`카카오 검색 실패 (${res.status})`);
  return res.json();
}

/**
 * @param {string} q 검색어
 * @param {{ lat, lng }|null} near 가까운 곳을 먼저 (반경 안 결과 우선)
 * @returns 정리된 결과 목록
 */
export async function kakaoSearch(q, near = null, { size = 15 } = {}) {
  const params = { query: q, size: String(size) };
  if (near) {
    params.x = String(near.lng);
    params.y = String(near.lat);
  }
  const json = await call('keyword', params);
  const list = (json.documents || []).map(normalizeKakaoDoc).filter(Boolean);
  if (list.length) return list;
  const addr = await call('address', { query: q, size: '5' });
  return (addr.documents || []).map(normalizeKakaoAddress).filter(Boolean);
}

/** 카카오 장소 ID 를 다시 확인 (화면이 보낸 값을 믿지 않고 이름·좌표로 다시 찾아 같은 ID 인지 본다) */
export async function kakaoVerify(item) {
  const json = await call('keyword', { query: item.name, x: String(item.lng), y: String(item.lat), radius: '2000', size: '15' });
  const doc = (json.documents || []).find((d) => String(d.id) === String(item.kakaoId));
  return doc ? normalizeKakaoDoc(doc) : null;
}
