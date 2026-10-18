/**
 * triplog.js — 여행 기록(쓴 돈 · 다녀온 뒤 한마디) 정리와 합계 (순수 함수, 테스트 대상)
 *
 * 저장은 wooz_trip_trip_logs (0006). 형식:
 * { slots: { [slotId]: { placeId, cost, rating: 'good'|'ok'|'bad', note } },
 *   extras: [{ label, amount }], rating: 1~5|null, comment: '', isPublic: false }
 *
 * 슬롯 기록은 placeId 도 같이 둔다. 나중에 그 슬롯의 장소가 바뀌면 옛 기록은 보이지 않는다.
 */
export const PLACE_RATINGS = [
  { id: 'good', label: '좋았어요' },
  { id: 'ok', label: '보통' },
  { id: 'bad', label: '별로' },
];
export const TRIP_RATINGS = [
  { id: 5, label: '최고예요' },
  { id: 4, label: '좋았어요' },
  { id: 3, label: '보통' },
  { id: 2, label: '아쉬워요' },
  { id: 1, label: '별로' },
];
export const MAX_COST = 10_000_000; // 한 칸에 1천만 원까지
const MAX_EXTRAS = 10;

export const emptyLog = () => ({ slots: {}, extras: [], rating: null, comment: '', isPublic: false });

const money = (v) => {
  const s = String(v ?? '').trim();
  if (s.startsWith('-')) return 0;
  const n = Math.round(Number(s.replace(/[^\d]/g, '')));
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_COST) : 0;
};

/** 화면에서 받은 기록을 허용된 모양으로만 정리 (이 여행에 있는 슬롯·장소만 남긴다) */
export function sanitizeLog(input, days) {
  const slotPlace = new Map();
  for (const d of days || []) for (const s of d.slots || []) if (s.placeId) slotPlace.set(String(s.id), s.placeId);

  const slots = {};
  for (const [id, v] of Object.entries(input?.slots || {})) {
    const placeId = slotPlace.get(String(id));
    if (!placeId || !v) continue;
    if (v.placeId && v.placeId !== placeId) continue; // 그 슬롯 장소가 바뀌었으면 옛 기록은 버린다
    const cost = money(v.cost);
    const rating = PLACE_RATINGS.some((r) => r.id === v.rating) ? v.rating : null;
    const note = String(v.note || '').trim().slice(0, 100);
    if (!cost && !rating && !note) continue;
    slots[String(id).slice(0, 40)] = { placeId, ...(cost ? { cost } : {}), ...(rating ? { rating } : {}), ...(note ? { note } : {}) };
  }
  const extras = (Array.isArray(input?.extras) ? input.extras : [])
    .map((e) => ({ label: String(e?.label || '').trim().slice(0, 30), amount: money(e?.amount) }))
    .filter((e) => e.label && e.amount)
    .slice(0, MAX_EXTRAS);
  const r = parseInt(input?.rating, 10);
  return {
    slots,
    extras,
    rating: r >= 1 && r <= 5 ? r : null,
    comment: String(input?.comment || '').trim().slice(0, 300),
    isPublic: !!input?.isPublic,
  };
}

/** 지금 그 슬롯에 맞는 기록 (장소가 바뀌었으면 null) */
export function slotLog(log, slot) {
  const v = log?.slots?.[slot.id];
  return v && slot.placeId && v.placeId === slot.placeId ? v : null;
}

/** 일자별·전체 합계 (원) */
export function logTotals(log, days) {
  const perDay = (days || []).map((d) => (d.slots || []).reduce((sum, s) => sum + (slotLog(log, s)?.cost || 0), 0));
  const extras = (log?.extras || []).reduce((sum, e) => sum + (e.amount || 0), 0);
  return { perDay, extras, total: perDay.reduce((a, b) => a + b, 0) + extras };
}

export const hasLog = (log) => !!log && (Object.keys(log.slots || {}).length > 0 || (log.extras || []).length > 0 || !!log.rating || !!log.comment);

/** 한국 시각 오늘 'YYYY-MM-DD' */
export function todayKST(now = Date.now()) {
  return new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
/** 쓴 돈 기록은 여행 첫날부터, 여행 한마디는 마지막 날부터 */
export const canLogSpend = (trip, today = todayKST()) => !!trip?.start_date && today >= trip.start_date;
export const canReview = (trip, today = todayKST()) => !!trip?.end_date && today >= trip.end_date;

export const won = (n) => `${Number(n || 0).toLocaleString('ko-KR')}원`;

/** DB 행 → 화면용 기록 */
export function fromRow(row) {
  if (!row) return emptyLog();
  return { slots: row.slots || {}, extras: row.extras || [], rating: row.rating ?? null, comment: row.comment || '', isPublic: !!row.is_public };
}
