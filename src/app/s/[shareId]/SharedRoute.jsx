'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import RouteMap from '@/components/RouteMap';
import { IconHome } from '@/components/Icons';
import { DAY_LABELS, SERVICE_NAME, dayStyle } from '@/lib/config';
import { mapDays, rowWarning, summarize } from '@/lib/trip';
import { formatDuration } from '@/lib/geo';
import { mapLink, tripSubtitle } from '@/lib/format';
import { shortDate, weekdayLabel } from '@/lib/hours';

/** 읽기 전용 루트: 지도 + 일자 탭 + 타임라인 */
export default function SharedRoute({ trip, placeMap }) {
  const [day, setDay] = useState(0);
  const sum = useMemo(() => summarize(trip, placeMap), [trip, placeMap]);
  const mapData = useMemo(() => mapDays(trip.days, placeMap, trip), [trip, placeMap]);
  const rows = sum.perDay[day] || [];
  const st = dayStyle(day);
  let n = 0;

  return (
    <>
      <header className="flex flex-col gap-0.5 px-5 pt-5 pb-3">
        <div className="text-xs text-sub">가족이 공유한 여행 동선</div>
        <h1 className="m-0 h-display text-2xl">{trip.title}</h1>
        <div className="text-[13px] text-sub">
          {tripSubtitle(trip)}
          {sum.travel > 0 && ` · 총 이동 ${formatDuration(sum.travel)}`}
        </div>
      </header>
      <div className="px-5">
        <RouteMap days={mapData} active={day} />
      </div>
      <nav aria-label="일자" className="flex gap-2 overflow-x-auto px-5 pt-3.5 pb-2">
        {trip.days.map((d, i) => (
          <button
            key={d.date}
            type="button"
            aria-pressed={day === i}
            onClick={() => setDay(i)}
            className={`flex h-[42px] min-w-[96px] flex-1 items-center justify-center gap-1.5 rounded-full font-display text-sm ${
              day === i ? 'bg-selected text-selected-ink' : 'border-2 border-line bg-surface'
            }`}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: dayStyle(i).hex }} />
            {DAY_LABELS[i] || `${i + 1}일차`}
          </button>
        ))}
      </nav>
      <main className="flex flex-1 flex-col gap-1 px-5 pt-1 pb-6">
        <div className="pb-1 text-xs text-sub">
          {shortDate(trip.days[day].date)} {weekdayLabel(trip.days[day].date)}요일
        </div>
        {rows.map((r) => {
          const s = r.slot;
          if (!s.fixed && !s.placeId) return null;
          const place = s.placeId ? placeMap[s.placeId] : null;
          if (s.placeId && !place) return null;
          if (place) n++;
          const warn = rowWarning(r);
          return (
            <div key={s.id} className="flex flex-col gap-1">
              {r.travelFromPrev && <div className="py-0.5 pl-14 text-xs text-sub">차로 {formatDuration(r.travelFromPrev.minutes) || '바로'}</div>}
              <div className="flex items-center gap-3 rounded-[20px] bg-surface p-3 shadow-soft">
                <div
                  className="flex h-9 w-9 flex-none items-center justify-center font-display text-[17px]"
                  style={place ? { background: st.hex, color: '#fff', borderRadius: '12px 18px 14px 18px' } : { background: '#FFC93C', borderRadius: 18 }}
                  aria-hidden="true"
                >
                  {place ? n : <IconHome />}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13px] font-bold text-sub">{s.time}</span>
                    <span className="truncate font-display text-base">{place ? place.name : s.fixed.name}</span>
                  </div>
                  {s.memo && <div className="text-xs text-warn-ink">챙길 것 · {s.memo}</div>}
                  {warn && (r.check.level === 'warn' || r.lateBy > 0) && <div className="text-xs font-bold text-warn-ink">{warn}</div>}
                </div>
                {place && (
                  <a href={mapLink(place)} target="_blank" rel="noopener noreferrer" className="text-xs text-ok underline">
                    지도
                  </a>
                )}
              </div>
            </div>
          );
        })}
        <Link href="/" className="mt-5 text-center text-[13px] text-sub underline">
          {SERVICE_NAME}에서 우리 가족 여행도 짜 보기
        </Link>
      </main>
    </>
  );
}
