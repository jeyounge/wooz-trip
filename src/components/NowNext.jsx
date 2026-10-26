'use client';
import { useEffect, useState } from 'react';
import { routeLink } from '@/lib/format';
import { nowNext, slotTitle } from '@/lib/trip';

/** 여행자 기기의 오늘 날짜 (YYYY-MM-DD) */
export function localToday() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** 오늘이 여행 중이면 그날 인덱스, 아니면 -1 */
export function todayIndex(days) {
  const t = localToday();
  return (days || []).findIndex((d) => d.date === t);
}

const nowMin = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

/**
 * 여행 중 모드: 오늘 일정에서 「지금」과 「다음」 장소를 크게 보여 주고 길찾기를 한 번에.
 * rows = computeDay() 결과 (오늘 것). 오늘이 아니면 아무것도 안 그린다.
 */
export default function NowNext({ rows, placeMap, isToday }) {
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(nowMin());
    const t = setInterval(() => setNow(nowMin()), 60000);
    return () => clearInterval(t);
  }, []);
  if (!isToday || now === null) return null;

  const { current, next, currentEnd, any } = nowNext(rows, now);
  if (!any) return null;
  if (!current && !next) {
    return <div className="rounded-2xl bg-surface px-4 py-3 text-sm text-sub shadow-soft">오늘 일정을 다 마쳤어요. 수고하셨어요!</div>;
  }

  const go = (r) => routeLink(null, { ...r.point, name: slotTitle(r.slot, placeMap) });
  return (
    <section aria-label="지금 일정" className="flex flex-col gap-2 rounded-[20px] bg-selected p-4 text-selected-ink">
      {current && (
        <div className="flex items-baseline gap-2 text-sm">
          <span className="opacity-80">지금</span>
          <b className="min-w-0 flex-1 truncate">{slotTitle(current.slot, placeMap)}</b>
          <span className="opacity-80">~{fmt(currentEnd)}</span>
        </div>
      )}
      {next && (
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-xs opacity-80">
              다음 · {next.slot.time}
              {next.travelFromPrev?.minutes > 0 && ` · 차로 약 ${next.travelFromPrev.minutes}분`}
            </span>
            <b className="truncate font-display text-lg">{slotTitle(next.slot, placeMap)}</b>
          </div>
          <a href={go(next)} target="_blank" rel="noopener noreferrer" className="flex h-11 flex-none items-center rounded-full bg-cta px-4 text-sm text-cta-ink">
            길찾기
          </a>
        </div>
      )}
    </section>
  );
}

const fmt = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
