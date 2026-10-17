/**
 * GET /api/places — 슬롯 후보 조회 (S04 장소 선택 바텀시트)
 *
 * query: date, time, slotType, stay, lat, lng, tags(콤마), q, exclude(콤마), category
 * 응답: { ok: true, data: [{ id, name, ..., travel, check }] } | { ok: false, message }
 */
import { NextResponse } from 'next/server';
import { getApprovedPlaces, rankCandidates } from '@/lib/places';

export const dynamic = 'force-dynamic';

const list = (v) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : []);

export async function GET(request) {
  const sp = request.nextUrl.searchParams;
  const date = sp.get('date');
  const time = sp.get('time');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(time || '')) {
    return NextResponse.json({ ok: false, message: 'date, time 형식 오류' }, { status: 400 });
  }
  const lat = parseFloat(sp.get('lat'));
  const lng = parseFloat(sp.get('lng'));

  try {
    const places = await getApprovedPlaces();
    const data = rankCandidates(places, {
      date,
      time,
      slotType: sp.get('slotType') || 'extra',
      stayMinutes: parseInt(sp.get('stay'), 10) || undefined,
      from: Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null,
      tags: list(sp.get('tags')),
      q: sp.get('q') || '',
      excludeIds: list(sp.get('exclude')).map(Number),
      category: sp.get('category') || undefined,
    }).slice(0, 40);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e.message }, { status: 500 });
  }
}
