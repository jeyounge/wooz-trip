import { redirect } from 'next/navigation';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { TABLES } from '@/lib/tables';
import { EVENTS } from '@/lib/events';
import { ErrorCard, TopBar } from '@/components/ui';
import AdminPanel from './AdminPanel';

export const dynamic = 'force-dynamic';

/** 운영자 화면: 장소 검수 · 제보 처리 · AI 루트 · MVP 지표 */
export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/admin');
  if (!isAdmin(user)) redirect('/my');

  try {
    const db = createAdminClient();
    const since = new Date(Date.now() - 90 * 86400000).toISOString();
    const [places, tags, reports, events, aiRoutes] = await Promise.all([
      db.from(TABLES.places).select('*').order('status').order('updated_ts', { ascending: false }),
      db.from(TABLES.kidTags).select('*').order('sort_order'),
      db.from(TABLES.reports).select('*').eq('status', 'pending').order('created_ts', { ascending: false }).limit(100),
      db.from(TABLES.events).select('name, trip_id').gte('created_ts', since).limit(20000),
      db
        .from(TABLES.aiRoutes)
        .select('id, code, title, region, companion_type, day_count, tags, is_active, pick_count')
        .order('region')
        .order('companion_type')
        .order('day_count'),
    ]);
    for (const r of [places, tags, reports, events, aiRoutes]) if (r.error) throw new Error(r.error.message);

    return (
      <AdminPanel
        places={places.data}
        tags={tags.data}
        reports={reports.data}
        aiRoutes={aiRoutes.data}
        metrics={computeMetrics(events.data)}
      />
    );
  } catch (e) {
    return (
      <>
        <TopBar back="/my" title="운영자 화면" />
        <ErrorCard message={e.message} />
      </>
    );
  }
}

/** 최근 90일 지표: 루트 완성률·복사율·공유 수·제보 수 */
function computeMetrics(events) {
  const count = (name) => events.filter((e) => e.name === name).length;
  const distinctTrips = (name) => new Set(events.filter((e) => e.name === name && e.trip_id).map((e) => e.trip_id)).size;
  const created = count(EVENTS.tripCreated);
  const drawn = distinctTrips(EVENTS.routeDrawn);
  const views = count(EVENTS.routeViewed);
  const copies = count(EVENTS.tripCopied);
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '-');
  return [
    { label: '만든 루트', value: created },
    { label: '루트 완성률', value: pct(drawn, created), hint: `동선 그리기까지 간 루트 ${drawn}개` },
    { label: '복사율', value: pct(copies, views), hint: `공개 루트 열람 ${views} · 복사 ${copies}` },
    { label: '공유 수', value: count(EVENTS.tripShared) },
    { label: '공개 등록', value: count(EVENTS.tripPublished) },
    { label: '제보 수', value: count(EVENTS.reportCreated) },
    { label: 'AI 초안·빈칸 채우기', value: count(EVENTS.aiFill) },
  ];
}
