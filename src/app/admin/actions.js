'use server';
/**
 * 운영자 동작 (ADMIN_EMAIL 계정만). 장소·제보 쓰기는 service_role 로 한다.
 */
import { revalidatePath } from 'next/cache';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { TABLES } from '@/lib/tables';
import { CATEGORIES, REGIONS } from '@/lib/config';
import { AREAS } from '@/lib/areas';
import { introTemplate } from '@/lib/intro';

const fail = (message) => ({ ok: false, message });
const TIME = /^\d{2}:\d{2}$/;

async function guard() {
  const user = await getCurrentUser();
  return isAdmin(user) ? createAdminClient() : null;
}

/** 관리자 입력 → places 컬럼 */
function toPlaceRow(input, { partial = false } = {}) {
  const row = {};
  if (!partial || 'name' in input) {
    const name = String(input.name || '').trim();
    if (!name) throw new Error('이름을 넣어 주세요');
    row.name = name.slice(0, 80);
  }
  if (!partial || 'category' in input) {
    if (!CATEGORIES[input.category]) throw new Error('종류를 골라 주세요');
    row.category = input.category;
  }
  if ('sub_category' in input) row.sub_category = String(input.sub_category || '').trim().slice(0, 30) || null;
  if ('address' in input) row.address = String(input.address || '').trim().slice(0, 120) || null;
  if (!partial || 'region' in input) {
    if (!REGIONS.some((r) => r.id === input.region) && !AREAS.some((a) => a.slug === input.region && a.slug !== 'jeju')) throw new Error('지역을 골라 주세요');
    row.region = input.region;
  }
  for (const k of ['lat', 'lng']) {
    if (!partial || k in input) {
      const v = parseFloat(input[k]);
      if (!Number.isFinite(v)) throw new Error('좌표를 확인해 주세요');
      row[k] = v;
    }
  }
  if ('hours' in input) {
    const h = input.hours || {};
    if (h.open && h.close) {
      if (!TIME.test(h.open) || !TIME.test(h.close) || (h.lastOrder && !TIME.test(h.lastOrder))) throw new Error('영업시간 형식은 HH:MM');
      row.opening_hours = { all: h.lastOrder ? { open: h.open, close: h.close, lastOrder: h.lastOrder } : { open: h.open, close: h.close } };
      // 요일별 시간("0".."6")은 그대로 둔다
      for (const [d, v] of Object.entries(input.hoursOverrides || {})) {
        if (/^[0-6]$/.test(d) && TIME.test(v?.open || '') && TIME.test(v?.close || '')) {
          row.opening_hours[d] = { open: v.open, close: v.close, ...(TIME.test(v.lastOrder || '') ? { lastOrder: v.lastOrder } : {}) };
        }
      }
    } else {
      row.opening_hours = null;
    }
  }
  if ('regular_closed_days' in input) row.regular_closed_days = (input.regular_closed_days || []).map(Number).filter((d) => d >= 0 && d <= 6);
  if ('kid_tags' in input) row.kid_tags = (input.kid_tags || []).map(String).slice(0, 20);
  if ('indoor' in input) row.indoor = !!input.indoor;
  if ('intro' in input) row.intro = String(input.intro || '').trim().slice(0, 300) || null;
  if ('phone' in input) row.phone = String(input.phone || '').trim().slice(0, 30) || null;
  if ('map_url' in input || 'blog_url' in input) {
    const links = {};
    if (/^https?:\/\//.test(input.map_url || '')) links.map = input.map_url;
    if (/^https?:\/\//.test(input.blog_url || '')) links.blog = input.blog_url;
    row.external_links = links;
  }
  return row;
}

export async function createPlace(input) {
  const db = await guard();
  if (!db) return fail('권한 없음');
  try {
    const row = { ...toPlaceRow(input), status: 'candidate', source_provider: 'manual' };
    const { data, error } = await db.from(TABLES.places).insert(row).select('*').single();
    if (error) return fail(error.message);
    revalidatePath('/admin');
    return { ok: true, place: data };
  } catch (e) {
    return fail(e.message);
  }
}

export async function updatePlace(id, input) {
  const db = await guard();
  if (!db) return fail('권한 없음');
  try {
    const row = toPlaceRow(input, { partial: true });
    // 내용을 고쳤으면 표시 → 매일 자동 반영(TourAPI)이 덮어쓰지 않는다 (0004 의 edited_ts)
    if (Object.keys(row).length) row.edited_ts = new Date().toISOString();
    if ('status' in input) {
      if (!['candidate', 'approved', 'excluded'].includes(input.status)) return fail('상태 오류');
      row.status = input.status;
      if (input.status === 'approved') row.verified_ts = new Date().toISOString();
    }
    const { data, error } = await db.from(TABLES.places).update(row).eq('id', id).select('*').single();
    if (error) return fail(error.message);
    return { ok: true, place: data };
  } catch (e) {
    return fail(e.message);
  }
}

export async function draftIntro(id) {
  const db = await guard();
  if (!db) return fail('권한 없음');
  const [{ data: place }, { data: tags }] = await Promise.all([
    db.from(TABLES.places).select('*').eq('id', id).single(),
    db.from(TABLES.kidTags).select('id, label'),
  ]);
  if (!place) return fail('장소 없음');
  return { ok: true, intro: introTemplate(place, Object.fromEntries((tags || []).map((t) => [t.id, t.label]))) };
}

/** 여러 장소 한 번에 승인/제외 */
export async function setPlacesStatus(ids, status) {
  const db = await guard();
  if (!db) return fail('권한 없음');
  if (!['candidate', 'approved', 'excluded'].includes(status)) return fail('상태 오류');
  const list = (ids || []).map(Number).filter(Number.isInteger).slice(0, 500);
  if (!list.length) return fail('고른 장소가 없어요');
  const patch = { status };
  if (status === 'approved') patch.verified_ts = new Date().toISOString();
  const { error } = await db.from(TABLES.places).update(patch).in('id', list);
  if (error) return fail(error.message);
  revalidatePath('/admin');
  return { ok: true, count: list.length };
}

/** AI 루트 켜기/끄기 (끈 루트는 AI 초안에서 고르지 않는다) */
export async function setAiRouteActive(id, active) {
  const db = await guard();
  if (!db) return fail('권한 없음');
  const { error } = await db.from(TABLES.aiRoutes).update({ is_active: !!active }).eq('id', id);
  if (error) return fail(error.message);
  return { ok: true };
}

/** 제보 처리: applied | rejected. 태그 제보는 반영 시 장소 태그에 합친다 */
export async function resolveReport(id, status) {
  const db = await guard();
  if (!db) return fail('권한 없음');
  if (!['applied', 'rejected'].includes(status)) return fail('상태 오류');
  const { data: report } = await db.from(TABLES.reports).select('*').eq('id', id).single();
  if (!report) return fail('제보 없음');

  if (status === 'applied' && report.type === 'tag' && report.payload?.tags?.length) {
    const { data: place } = await db.from(TABLES.places).select('kid_tags').eq('id', report.place_id).single();
    const merged = [...new Set([...(place?.kid_tags || []), ...report.payload.tags])];
    await db.from(TABLES.places).update({ kid_tags: merged }).eq('id', report.place_id);
  }
  const { error } = await db.from(TABLES.reports).update({ status, resolved_ts: new Date().toISOString() }).eq('id', id);
  if (error) return fail(error.message);
  revalidatePath('/admin');
  return { ok: true };
}
