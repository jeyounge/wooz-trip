import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import { EmptyCard, ErrorCard, TopBar } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { getMyTrips } from '@/lib/trips';
import { regionShort, nightsText } from '@/lib/format';
import { shortDate } from '@/lib/hours';
import { COMPANIONS } from '@/lib/config';

export const dynamic = 'force-dynamic';

const VIS = { private: '나만 보기', shared: '가족 공유 중', public: '공개 중' };

/** 내 여행 목록 */
export default async function MyTripsPage() {
  const user = await requireUser('/trips');
  let trips = [];
  let error = null;
  try {
    trips = await getMyTrips(user.id);
  } catch (e) {
    error = e.message;
  }

  return (
    <>
      <TopBar title="내 여행" sub="짜 둔 루트를 다시 열어 고칠 수 있어요" />
      <main className="flex flex-1 flex-col gap-3 px-5 pt-2 pb-4">
        <Link href="/trips/new" className="btn-cta">
          새 여행 짜기
        </Link>
        {error ? (
          <ErrorCard message={error} />
        ) : trips.length ? (
          trips.map((t) => {
            const slots = t.days.flatMap((d) => d.slots);
            const filled = slots.filter((s) => s.placeId).length;
            const empty = slots.filter((s) => !s.fixed && !s.placeId).length;
            return (
              <Link key={t.id} href={empty ? `/trips/${t.id}/edit` : `/trips/${t.id}`} className="card flex flex-col gap-1 p-4">
                <div className="flex items-center gap-2">
                  <span className="truncate font-display text-[17px]">{t.title}</span>
                  <span className="ml-auto flex-none rounded-xl bg-bg px-2 py-0.5 text-xs text-sub">{VIS[t.visibility]}</span>
                </div>
                <div className="text-[13px] text-sub">
                  {regionShort(t.region)} · {shortDate(t.start_date)} – {shortDate(t.end_date)} · {nightsText(t.days.length)} ·{' '}
                  {COMPANIONS.find((c) => c.id === t.companion_type)?.label}
                </div>
                <div className="text-xs text-sub">
                  장소 {filled}곳{empty ? ` · 빈 슬롯 ${empty}개` : ' · 완성'}
                </div>
              </Link>
            );
          })
        ) : (
          <EmptyCard title="아직 짠 여행이 없어요" desc="여행 정보를 넣고 슬롯을 채우면 동선이 자동으로 그려져요." />
        )}
      </main>
      <BottomNav />
    </>
  );
}
