/** 화면용 이동시간 (Next 서버 전용: after 사용). 캐시·API 로직은 travelCache.js — 노드 스크립트에서도 쓰려고 나눔 */
import { after } from 'next/server';
import { fillTravel, loadTripTravel } from './travelCache.js';

/** 화면 열 때: 캐시만 읽어 바로 보여 주고, 없는 구간은 응답을 보낸 뒤 채운다 (다음에 열면 실제 시간) */
export async function travelForPage(trip, placeMap) {
  try {
    const { known, missing } = await loadTripTravel(trip, placeMap);
    if (missing.length) after(() => fillTravel(missing, known));
    return known;
  } catch {
    return {};
  }
}
