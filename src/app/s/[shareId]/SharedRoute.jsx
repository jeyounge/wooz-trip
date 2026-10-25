'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import RouteMap from '@/components/RouteMap';
import { IconHome } from '@/components/Icons';
import { DAY_LABELS, SERVICE_NAME, dayStyle } from '@/lib/config';
import { isEmptySlot, mapDays, rowWarning, slotTitle, summarize } from '@/lib/trip';
import { formatDuration } from '@/lib/geo';
import { mapLink, routeLink, tripSubtitle } from '@/lib/format';
import RainyAlt from '@/components/RainyAlt';
import { rainyKey } from '@/lib/rainy';
import { makeTravelFn } from '@/lib/travel';
import { shortDate, toHHMM, toMin, weekdayLabel } from '@/lib/hours';
import { LogLine, LogSummary } from '@/components/TripLog';
import { slotLog, logTotals, won } from '@/lib/triplog';

/** 읽기 전용 루트: 지도 + 일자 탭 + 타임라인 */
export default function SharedRoute({ trip, placeMap, log, rainy = {}, travel }) {
  const [day, setDay] = useState(0);
  const travelFn = useMemo(() => makeTravelFn(travel), [travel]);
  const sum = useMemo(() => summarize(trip, placeMap, travelFn), [trip, placeMap, travelFn]);
  const mapData = useMemo(() => mapDays(trip.days, placeMap, trip), [trip, placeMap]);
  const rows = sum.perDay[day] || [];
  const st = dayStyle(day);
  const totals = useMemo(() => (log ? logTotals(log, trip.days) : null), [log, trip.days]);
  // 이날 요약: 들르는 곳 수, 이동 합계
  const dayStops = rows.filter((r) => r.place || r.slot.custom).length;
  const dayTravel = rows.reduce((a, r) => a + (r.travelFromPrev?.minutes || 0), 0);
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
        {trip.stay_name && <div className="text-[13px] text-sub">숙소 · {trip.stay_name}</div>}
        {totals?.total > 0 && <div className="text-[13px] text-sub">쓴 돈 {won(totals.total)}</div>}
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
          {shortDate(trip.days[day].date)} {weekdayLabel(trip.days[day].date)}요일 · {dayStops}곳
          {dayTravel > 0 && ` · 이동 ${formatDuration(dayTravel)}`}
          {totals?.perDay[day] > 0 && ` · 쓴 돈 ${won(totals.perDay[day])}`}
        </div>
        {rows.map((r) => {
          const s = r.slot;
          if (isEmptySlot(s)) return null;
          const place = s.placeId ? placeMap[s.placeId] : null;
          if (s.placeId && !place) return null;
          const isStop = !!(place || s.custom);
          if (isStop) n++;
          const warn = rowWarning(r);
          const tr = r.travelFromPrev;
          const start = toMin(s.time);
          const timeText = isStop && s.stayMinutes > 0 && start !== null ? `${s.time}–${toHHMM(start + s.stayMinutes)}` : s.time;
          const name = slotTitle(s, placeMap);
          return (
            <div key={s.id} className="flex flex-col gap-1">
              {tr && (
                <div className="flex items-center gap-2 py-0.5 pl-14 text-xs text-sub">
                  <span>차로 약 {formatDuration(tr.minutes) || '바로'}</span>
                  {tr.minutes > 0 && r.point && (
                    <a href={routeLink(tr.from, { ...r.point, name })} target="_blank" rel="noopener noreferrer" className="text-ok underline">
                      길찾기
                    </a>
                  )}
                </div>
              )}
              <div className="flex items-center gap-3 rounded-[20px] bg-surface p-3 shadow-soft">
                <div
                  className="flex h-9 w-9 flex-none items-center justify-center font-display text-[17px]"
                  style={isStop ? { background: st.hex, color: '#fff', borderRadius: '12px 18px 14px 18px' } : { background: '#FFC93C', borderRadius: 18 }}
                  aria-hidden="true"
                >
                  {isStop ? n : <IconHome />}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="text-[13px] font-bold text-sub">{timeText}</div>
                  <div className="font-display text-base leading-snug">{name}</div>
                  {s.custom?.address && <div className="text-xs text-sub">{s.custom.address}</div>}
                  {s.fixed?.note && <div className="text-xs text-sub">{s.fixed.note}</div>}
                  {s.memo && <div className="text-xs text-warn-ink">챙길 것 · {s.memo}</div>}
                  {log && place && <LogLine entry={slotLog(log, s)} />}
                  {warn && (r.check.level === 'warn' || r.lateBy > 0) && <div className="text-xs font-bold text-warn-ink">{warn}</div>}
                  {place && <RainyAlt alt={rainy[rainyKey(trip.days[day].date, s.placeId)]} />}
                </div>
                {place ? (
                  <a href={mapLink(place)} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center text-xs text-ok underline">
                    지도
                  </a>
                ) : (
                  s.custom &&
                  r.point && (
                    <a href={routeLink(null, { ...r.point, name })} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center text-xs text-ok underline">
                      지도
                    </a>
                  )
                )}
              </div>
            </div>
          );
        })}
        {log && (
          <div className="mt-3">
            <LogSummary log={log} days={trip.days} />
          </div>
        )}
        <Link href="/" className="mt-5 text-center text-[13px] text-sub underline">
          {SERVICE_NAME}에서 우리 가족 여행도 짜 보기
        </Link>
      </main>
    </>
  );
}
