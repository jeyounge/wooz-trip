import { redirect } from 'next/navigation';
import { adminEmails, getCurrentUser, isAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { TABLES } from '@/lib/tables';
import { EVENTS } from '@/lib/events';
import { ErrorCard, TopBar } from '@/components/ui';
import { AREAS, areaByCode } from '@/lib/areas';
import AdminPanel from './AdminPanel';

export const dynamic = 'force-dynamic';

/** 운영자 화면: 장소 검수 · 제보 처리 · AI 루트 · MVP 지표 */
export default async function AdminPage({ searchParams }) {
  const sp = await searchParams;
  const area = areaByCode(sp?.area)?.code || AREAS[0].code; // 장소는 시·도 하나씩 본다 (전국 수만 곳)
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/admin');
  if (!isAdmin(user)) {
    // 조용히 넘기지 않고 이유를 보여준다 (운영자 이메일은 일부만)
    const mask = (e) => e.replace(/^(.{2}).*(@.*)$/, '$1***$2');
    const list = adminEmails();
    return (
      <>
        <TopBar back="/my" title="운영자 화면" />
        <ErrorCard
          title="운영자 계정이 아니에요"
          message={
            list.length
              ? `지금 로그인한 계정(${user.email})은 운영자가 아니에요. 운영자 계정(${list.map(mask).join(', ')})으로 로그인해 주세요.`
              : '운영자 이메일(ADMIN_EMAIL)이 서버에 설정되지 않았어요. Vercel → Settings → Environment Variables 에 ADMIN_EMAIL 을 넣고 다시 배포해 주세요.'
          }
        />
      </>
    );
  }

  try {
    const db = createAdminClient();
    const since = new Date(Date.now() - 90 * 86400000).toISOString();
    const [places, tags, reports, events, aiRoutes] = await Promise.all([
      fetchAllPlaces(db, area),
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
        area={area}
        tags={tags.data}
        reports={reports.data}
        aiRoutes={aiRoutes.data}
        metrics={computeMetrics(events.data)}
        funnel={computeFunnel(events.data)}
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

/** 장소가 수천 곳이 될 수 있어 1,000개씩 나눠 읽는다 (Supabase 기본 한도 1,000) */
async function fetchAllPlaces(db, area) {
  const all = [];
  let filtered = true;
  for (let from = 0; ; from += 1000) {
    let query = db.from(TABLES.places).select('*');
    // 제주는 예전 데이터(sido_code 없음)도 같이. 0004 를 아직 안 돌렸으면(컬럼 없음) 거르지 않는다
    if (filtered) query = area === '50' ? query.or('sido_code.eq.50,sido_code.is.null') : query.eq('sido_code', area);
    const { data, error } = await query
      .order('status')
      .order('updated_ts', { ascending: false })
      .order('id')
      .range(from, from + 999);
    if (error && filtered && /sido_code/.test(error.message)) {
      filtered = false;
      from -= 1000;
      continue;
    }
    if (error) return { data: null, error };
    all.push(...data);
    if (data.length < 1000) break;
  }
  return { data: all, error: null };
}

/**
 * 최근 90일 단계별 흐름: 로그인 벽 → 여행 정보 화면 → 여행 만듦 → 동선 그림 → 공유·공개
 * 앞 두 단계는 화면 열람 수, 뒤는 루트 수(같은 루트는 한 번)
 */
function computeFunnel(events) {
  const count = (name) => events.filter((e) => e.name === name).length;
  const trips = (...names) => new Set(events.filter((e) => names.includes(e.name) && e.trip_id).map((e) => e.trip_id)).size;
  return {
    wall: count(EVENTS.loginWall),
    steps: [
      { label: '여행 정보 화면 열림', value: count(EVENTS.setupViewed), unit: '번' },
      { label: '여행 만듦', value: count(EVENTS.tripCreated), unit: '개' },
      { label: '동선 그림', value: trips(EVENTS.routeDrawn), unit: '개' },
      { label: '공유·공개', value: trips(EVENTS.tripShared, EVENTS.tripPublished), unit: '개' },
    ],
  };
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
