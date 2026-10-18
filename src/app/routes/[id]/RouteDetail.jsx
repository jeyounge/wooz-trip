'use client';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { IconBack, IconShare } from '@/components/Icons';
import Sheet from '@/components/Sheet';
import ReportSheet from '@/components/ReportSheet';
import { DAY_LABELS, FEATURES, TRAVEL_MODES, dayStyle, departAreasFor } from '@/lib/config';
import { formatHM } from '@/lib/geo';
import { companionText, mapLink } from '@/lib/format';
import { addDays } from '@/lib/hours';
import { daySummary, tripDepartArea, tripMode } from '@/lib/trip';
import { copyRoute, logRouteView } from '@/app/actions/trips';
import { LogLine, LogSummary } from '@/components/TripLog';
import { slotLog } from '@/lib/triplog';

function today() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** S06 공개 루트 상세 (시안 B) */
export default function RouteDetail({ trip, placeMap, tags, stats, places, isLoggedIn, isOwner, setup, log }) {
  const router = useRouter();
  const [open, setOpen] = useState(0);
  const [copyOpen, setCopyOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!isOwner) logRouteView(trip.id);
  }, [trip.id, isOwner]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const month = useMemo(() => {
    const [y, m] = trip.start_date.split('-').map(Number);
    return `${y}년 ${m}월`;
  }, [trip.start_date]);

  async function share() {
    const url = window.location.href.split('?')[0];
    try {
      if (navigator.share) return await navigator.share({ title: trip.title, url });
    } catch {
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setToast('링크를 복사했어요');
    } catch {
      setToast(url);
    }
  }

  function onCopyClick() {
    if (!isLoggedIn) {
      router.push(`/login?next=${encodeURIComponent(`/routes/${trip.id}`)}`);
      return;
    }
    setCopyOpen(true);
  }

  return (
    <>
      <div className="relative flex flex-none flex-col gap-3 overflow-hidden rounded-b-[36px] bg-mint px-5 pt-4 pb-6">
        <svg width="100%" height="90" viewBox="0 0 390 90" preserveAspectRatio="none" aria-hidden="true" className="absolute bottom-0 left-0">
          <path d="M0 50 Q 50 25 100 50 T 200 50 T 300 50 T 400 50 V90 H0 Z" fill="#A9DCC8" />
        </svg>
        <div className="relative flex items-center">
          <Link href="/routes" aria-label="뒤로" className="flex h-11 w-11 items-center justify-center rounded-full bg-surface">
            <IconBack />
          </Link>
          <button type="button" aria-label="링크 공유" onClick={share} className="ml-auto flex h-11 w-11 items-center justify-center rounded-full bg-surface">
            <IconShare />
          </button>
        </div>
        <h1 className="relative m-0 h-display text-[27px] leading-snug">{trip.title}</h1>
        <div className="relative flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent font-display text-base" aria-hidden="true">
            {(trip.author_name || '익')[0]}
          </div>
          <div className="flex flex-col">
            <span className="text-[15px] font-bold">{trip.author_name || '익명'}네 가족</span>
            <span className="text-[13px] text-[#2C5546]">
              {companionText(trip)} · {month}
            </span>
          </div>
        </div>
      </div>

      <main className="flex flex-1 flex-col gap-4 px-5 pt-[18px] pb-5">
        <div className="flex gap-2">
          {[
            [stats.places, '곳'],
            [stats.travel ? formatHM(stats.travel) : '-', '총 이동'],
            [trip.copy_count || 0, '가족이 따라감'],
          ].map(([v, l]) => (
            <div key={l} className="flex-1 rounded-[20px] bg-surface p-3 text-center shadow-soft">
              <div className="font-display text-[22px]">{v}</div>
              <div className="text-xs text-sub">{l}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2.5">
          {trip.days.map((d, i) => {
            const isOpen = open === i;
            const stops = d.slots.filter((s) => s.placeId && placeMap[s.placeId]);
            return (
              <div key={d.date} className="card flex flex-col gap-2 p-4">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  className="flex min-h-9 items-center gap-2.5 text-left"
                >
                  <span
                    className="flex h-8 w-11 flex-none items-center justify-center rounded-full font-display text-sm text-white"
                    style={{ background: dayStyle(i).hex }}
                  >
                    {i + 1}일
                  </span>
                  <span className="flex-1 text-sm">{daySummary(d, placeMap) || '장소 없음'}</span>
                  <span className="text-lg text-sub" aria-hidden="true">
                    {isOpen ? '−' : '+'}
                  </span>
                </button>
                {isOpen && (
                  <div className="flex flex-col gap-1.5">
                    {stops.map((s) => (
                      <div key={s.id} className="flex flex-col gap-0.5 rounded-[14px] bg-bg px-2.5 py-2 text-sm">
                        <div className="flex items-center gap-2.5">
                          <span className="font-bold text-sub">{s.time}</span>
                          <span className="min-w-0 flex-1 truncate">{placeMap[s.placeId].name}</span>
                          <a href={mapLink(placeMap[s.placeId])} target="_blank" rel="noopener noreferrer" className="text-xs text-ok underline">
                            지도
                          </a>
                        </div>
                        {log && <LogLine entry={slotLog(log, s)} />}
                      </div>
                    ))}
                    {!stops.length && <div className="text-sm text-sub">{DAY_LABELS[i]}은 비어 있어요</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {log && <LogSummary log={log} days={trip.days} />}

        {trip.author_tip && (
          <div className="rounded-card bg-accent p-4">
            <div className="mb-1 font-display text-base">엄마아빠 꿀팁</div>
            <div className="whitespace-pre-line text-sm leading-relaxed">{trip.author_tip}</div>
          </div>
        )}

        {places.length > 0 && (
          <button type="button" onClick={() => setReportOpen(true)} className="h-10 self-center px-2 text-[13px] text-sub underline">
            정보가 바뀌었나요? 알려주기
          </button>
        )}
      </main>

      <div className="sticky bottom-0 z-10 bg-bg px-5 pt-2.5 pb-6">
        {isOwner ? (
          <Link href={`/trips/${trip.id}`} className="btn-cta">
            내 루트 열기
          </Link>
        ) : (
          <button type="button" onClick={onCopyClick} className="btn-cta w-full gap-2">
            우리 일정으로 가져오기
            {FEATURES.copyRequiresPremium && (
              <span className="rounded-[10px] bg-surface px-2 py-0.5 font-sans text-[11px] font-bold text-warn-ink">프리미엄</span>
            )}
          </button>
        )}
        <div className="mt-1.5 text-center text-xs text-sub">가져오면 내 날짜·숙소 기준으로 휴무와 이동시간을 다시 확인해요</div>
      </div>

      {toast && (
        <div role="status" className="fixed bottom-28 left-1/2 z-50 w-[calc(100%-40px)] max-w-[390px] -translate-x-1/2 break-all rounded-2xl bg-selected px-4 py-3 text-sm text-selected-ink">
          {toast}
        </div>
      )}
      {copyOpen && <CopySheet trip={trip} setup={setup} onClose={() => setCopyOpen(false)} />}
      {reportOpen && <ReportSheet places={places} tripId={trip.id} tags={tags} onClose={() => setReportOpen(false)} />}
    </>
  );
}

function CopySheet({ trip, setup, onClose }) {
  const router = useRouter();
  const n = trip.days.length;
  const areas = departAreasFor(trip.region);
  // 이동 방식: S02 에서 고른 것 → 없으면 원본 루트를 따른다
  const srcMode = tripMode(trip);
  const initMode = TRAVEL_MODES.some((m) => m.id === setup.mode) ? setup.mode : srcMode;
  const [mode, setMode] = useState(initMode);
  const [departAreaId, setDepartAreaId] = useState(areas.find((a) => a.id === setup.area)?.id || tripDepartArea(trip) || areas[0]?.id || '');
  const sameMode = initMode === srcMode;
  const [startDate, setStartDate] = useState(setup.start || addDays(today(), 14));
  const [arrivalTime, setArrivalTime] = useState(setup.arr || (sameMode && trip.arrival_time) || (initMode === 'car' ? '08:00' : '10:30'));
  const [departureTime, setDepartureTime] = useState(setup.dep || (sameMode && trip.departure_time) || (initMode === 'car' ? '20:00' : '18:40'));
  const [stayName, setStayName] = useState(setup.stay || '');
  const isCar = mode === 'car';
  function onMode(m) {
    setMode(m);
    setArrivalTime(m === 'car' ? '08:00' : '10:30');
    setDepartureTime(m === 'car' ? '20:00' : '18:40');
  }
  const [err, setErr] = useState(null);
  const [pending, start] = useTransition();

  return (
    <Sheet title="우리 일정으로 가져오기" sub={`${n === 1 ? '당일' : `${n - 1}박 ${n}일`} 루트를 내 날짜로 옮겨요`} onClose={onClose}>
      <div className="flex flex-col gap-2.5 px-5 pb-8">
        <div className="grid grid-cols-2 gap-2">
          <label className="field bg-surface col-span-2">
            가는 날 (오는 날: {startDate ? addDays(startDate, n - 1) : '-'})
            <input type="date" value={startDate} min={today()} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <div className="col-span-2 grid grid-cols-2 gap-1.5" role="group" aria-label="어떻게 가요?">
            {TRAVEL_MODES.map((m) => (
              <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => onMode(m.id)} className={`pill px-0 ${mode === m.id ? 'pill-on' : ''}`}>
                {m.label}
              </button>
            ))}
          </div>
          {isCar && (
            <label className="field bg-surface col-span-2">
              어디서 출발해요?
              <select value={departAreaId} onChange={(e) => setDepartAreaId(e.target.value)}>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field bg-surface">
            {isCar ? '출발 시각' : '제주 도착'}
            <input type="time" value={arrivalTime} onChange={(e) => setArrivalTime(e.target.value)} />
          </label>
          <label className="field bg-surface">
            {isCar ? '집에 오는 시각' : '제주 출발'}
            <input type="time" value={departureTime} onChange={(e) => setDepartureTime(e.target.value)} />
          </label>
        </div>
        {n > 1 && (
          <label className="field bg-surface">
            숙소 (선택)
            <input value={stayName} placeholder="숙소 이름이나 주소" onChange={(e) => setStayName(e.target.value)} />
          </label>
        )}
        <p className="m-0 text-xs leading-relaxed text-sub">가져온 뒤 내 날짜에 쉬는 곳이 있으면 루트 짜기 화면에서 빨간 경고로 알려 드려요.</p>
        {err && <p className="m-0 text-sm font-bold text-warn-ink">{err}</p>}
        <button
          type="button"
          disabled={pending || !startDate}
          className="btn-cta"
          onClick={() =>
            start(async () => {
              const res = await copyRoute(trip.id, { startDate, arrivalTime, departureTime, stayName, mode, departAreaId: isCar ? departAreaId : null });
              if (!res.ok) return setErr(res.message);
              router.push(`/trips/${res.id}/edit`);
            })
          }
        >
          {pending ? '가져오는 중…' : '가져오기'}
        </button>
      </div>
    </Sheet>
  );
}
