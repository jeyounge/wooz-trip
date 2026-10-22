'use server';
/**
 * 장소 검색·추가 (카카오 로컬 검색)
 * - searchKakao: 숙소·직접 넣은 일정 위치·DB 에 없는 장소 찾기
 * - addKakaoPlace: 고른 카카오 장소를 우리 장소 DB 에 후보(candidate)로 저장하고 돌려준다.
 *   운영자가 관리자 화면에서 승인하면 다른 사람 장소 선택에도 나온다.
 * 응답 형식: { ok: true, ... } | { ok: false, message }
 */
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { TABLES } from '@/lib/tables';
import { PLACE_COLUMNS } from '@/lib/places';
import { kakaoSearch, kakaoVerify } from '@/lib/kakao';
import { inKorea, kakaoPlaceRow } from '@/lib/location';
import { EVENTS, logEvent } from '@/lib/events';

const fail = (message) => ({ ok: false, message });

export async function searchKakao(q, near) {
  const user = await getCurrentUser();
  if (!user) return fail('로그인하면 찾을 수 있어요');
  const query = String(q || '').trim().slice(0, 50);
  if (query.length < 2) return { ok: true, data: [] };
  const lat = Number(near?.lat);
  const lng = Number(near?.lng);
  try {
    const data = await kakaoSearch(query, inKorea(lat, lng) ? { lat, lng } : null);
    return { ok: true, data };
  } catch (e) {
    return fail(e.message);
  }
}

export async function addKakaoPlace(item) {
  const user = await getCurrentUser();
  if (!user) return fail('로그인이 필요해요');
  if (!/^\d{1,20}$/.test(String(item?.kakaoId || ''))) return fail('카카오 장소만 넣을 수 있어요');
  const lat = Number(item.lat);
  const lng = Number(item.lng);
  if (!inKorea(lat, lng) || !String(item.name || '').trim()) return fail('장소 정보를 확인해 주세요');

  const admin = createAdminClient();
  const sel = () => admin.from(TABLES.places).select(PLACE_COLUMNS).eq('source_provider', 'kakao').eq('source_external_id', String(item.kakaoId)).maybeSingle();
  try {
    let { data: place } = await sel();
    if (!place) {
      const real = await kakaoVerify({ name: String(item.name).slice(0, 80), lat, lng, kakaoId: item.kakaoId });
      if (!real) return fail('카카오에서 이 장소를 다시 찾지 못했어요');
      const { error } = await admin.from(TABLES.places).upsert(kakaoPlaceRow(real, user.id), { onConflict: 'source_provider,source_external_id', ignoreDuplicates: true });
      if (error) return fail(`저장 실패: ${error.message}`);
      ({ data: place } = await sel());
      if (!place) return fail('저장한 장소를 읽지 못했어요');
      await logEvent(EVENTS.placeAdded, { userId: user.id, meta: { placeId: place.id, kakaoId: real.kakaoId } });
    }
    if (place.status === 'excluded') return fail('운영자가 목록에서 뺀 장소예요. 직접 넣기로 적어 주세요');
    return { ok: true, place };
  } catch (e) {
    return fail(e.message);
  }
}
