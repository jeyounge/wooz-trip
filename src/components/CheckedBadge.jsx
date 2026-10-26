import { IconCheck, IconWarn } from '@/components/Icons';
import { formatDuration } from '@/lib/geo';
import { rainyKey } from '@/lib/rainy';

/**
 * 「확인했어요」 배지: 쉬는 날·영업시간·비 올 때 대안을 한 줄로 보여 준다.
 * sum = summarize() 결과, rainyCount = 비 올 때 대안이 있는 야외 장소 수
 */
export default function CheckedBadge({ sum, rainyCount = 0 }) {
  const stops = sum.places;
  if (!stops) return null;
  const ok = sum.warns === 0;
  const timeIssues = Math.max(0, sum.warns - sum.closed);
  const items = [`쉬는 곳 ${sum.closed}곳`, `시간 겹침 ${timeIssues}건`];
  if (rainyCount > 0) items.push(`비 오면 갈 곳 ${rainyCount}곳`);
  return (
    <div className={`flex items-start gap-2.5 rounded-2xl px-3.5 py-2.5 ${ok ? 'bg-tag text-tag-ink' : 'bg-warn text-warn-ink'}`}>
      <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-surface" aria-hidden="true">
        {ok ? <IconCheck size={14} /> : <IconWarn size={14} />}
      </span>
      <div className="flex min-w-0 flex-col">
        <b className="text-sm">{ok ? '고른 날짜로 다 확인했어요' : `확인이 필요한 곳이 ${sum.warns}곳 있어요`}</b>
        <span className="text-xs">{items.join(' · ')}</span>
      </div>
    </div>
  );
}

/** 일자별 「차 타는 시간」 크게 */
export function DayDrive({ minutes }) {
  if (!minutes) return null;
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-xs text-sub">이날 차 타는 시간</span>
      <b className="font-display text-lg">{formatDuration(minutes)}</b>
    </div>
  );
}

/** 비 올 때 대안이 있는 장소 수 */
export function countRainy(days, rainy) {
  if (!rainy) return 0;
  let n = 0;
  for (const d of days || []) for (const s of d.slots || []) if (s.placeId && rainy[rainyKey(d.date, s.placeId)]) n++;
  return n;
}
