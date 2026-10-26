'use client';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { IconBack, IconCafe, IconCar, IconFood, IconHome, IconShare, IconSight, IconSpark } from '@/components/Icons';
import Sheet from '@/components/Sheet';
import ReportSheet from '@/components/ReportSheet';
import RouteMap from '@/components/RouteMap';
import { CATEGORIES, DAY_LABELS, FEATURES, TRAVEL_MODES, dayStyle, departAreasFor } from '@/lib/config';
import { formatDuration, formatHM } from '@/lib/geo';
import RainyAlt from '@/components/RainyAlt';
import { rainyKey } from '@/lib/rainy';
import { makeTravelFn, withRoads } from '@/lib/travel';
import { blogLink, companionText, isEditorRoute, mapLink, routeLink } from '@/lib/format';
import { addDays, hoursText, isAlwaysOpen, isClosedOn, toHHMM, toMin } from '@/lib/hours';
import { isEmptySlot, mapDays, rowWarning, slotTitle, summarize, tripDepartArea, tripMode } from '@/lib/trip';
import { copyRoute, logRouteView } from '@/app/actions/trips';
import { LogLine, LogSummary } from '@/components/TripLog';
import { slotLog } from '@/lib/triplog';
import LocationSearch from '@/components/LocationSearch';
import { countRainy } from '@/components/CheckedBadge';

function today() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** S06 공개 루트 상세 (시안 B) */
export default function RouteDetail({ trip, placeMap, tags, stats, places, isLoggedIn, isOwner, setup, log, rainy = {}, travel }) {
  const router = useRouter();
  const [open, setOpen] = useState(0);
  const [copyOpen, setCopyOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const editor = isEditorRoute(trip);
  const travelFn = useMemo(() => makeTravelFn(travel?.minutes), [travel]);
  const perDay = useMemo(() => summarize(trip, placeMap, travelFn).perDay, [trip, placeMap, travelFn]);
  const mapData = useMemo(() => withRoads(mapDays(trip.days, placeMap, trip), travel?.paths), [trip, placeMap, travel]);
  const rainyCount = useMemo(() => countRainy(trip.days, rainy), [trip.days, rainy]);
  const tagLabels = useMemo(() => Object.fromEntries((tags || []).map((t) => [t.id, t.label])), [tags]);

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
            <span className="text-[15px] font-bold">{editor ? `${trip.author_name} 추천 루트` : `${trip.author_name || '익명'}네 가족`}</span>
            <span className="text-[13px] text-[#2C5546]">
              {editor ? `여행 후기를 참고해 짰어요 · ${companionText(trip)}` : `${companionText(trip)} · ${month}`}
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

        {/* 동선 지도 + 일자 탭 (지도는 고른 날 동선을 진하게) */}
        <div className="card flex flex-col gap-3 p-3">
          <RouteMap days={mapData} active={open} />
          <div className="flex gap-1.5 overflow-x-auto" role="tablist" aria-label="일자">
            {trip.days.map((d, i) => (
              <button
                key={d.date}
                type="button"
                role="tab"
                aria-selected={open === i}
                onClick={() => setOpen(i)}
                className={`flex h-11 min-w-[84px] flex-1 items-center justify-center gap-1.5 rounded-full font-display text-sm ${
                  open === i ? 'bg-selected text-selected-ink' : 'border-2 border-line bg-surface'
                }`}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: dayStyle(i).hex }} aria-hidden="true" />
                {DAY_LABELS[i] || `${i + 1}일차`}
              </button>
            ))}
          </div>
        </div>

        <DayTimeline
          key={open}
          dayIndex={open}
          date={trip.days[open]?.date}
          rows={perDay[open] || []}
          placeMap={placeMap}
          tagLabels={tagLabels}
          rainy={rainy}
          log={log}
        />

        {log && <LogSummary log={log} days={trip.days} />}

        {rainyCount > 0 && (
          <div className="rounded-2xl bg-sky px-3.5 py-2.5 text-sm text-[#2F4A8A]">
            비가 오면 <b>{rainyCount}곳</b>은 25분 안 실내 장소로 바꿀 수 있어요. 장소마다 「비 오면」 줄을 확인하세요
          </div>
        )}

        {trip.author_tip && (
          <div className="rounded-card bg-accent p-4">
            <div className="mb-1 font-display text-base">{editor ? '이렇게 짰어요' : '엄마아빠 꿀팁'}</div>
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
            이 루트로 우리 일정 만들기
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

/** 장소 종류 딱지 모양 (시안 B 색: 볼거리 민트 · 식당 복숭아 · 카페 하늘) */
const KIND_LOOK = {
  sight: { bg: 'bg-mint', ink: 'text-[#1E5A45]', Icon: IconSight },
  food: { bg: 'bg-[#FFE9DF]', ink: 'text-warn-ink', Icon: IconFood },
  cafe: { bg: 'bg-sky', ink: 'text-[#2F4A8A]', Icon: IconCafe },
};
// 세부 종류가 큰 종류와 같은 말이면 안 보여 준다 ("음식점", "관광지")
const PLAIN_SUB = new Set(['음식점', '관광지', '기타', '카페/전통찻집', '문화시설']);
const HIDDEN_TAGS = new Set(['regular_closed']); // 정기휴무는 영업시간 줄에서 따로 알려 준다

/** "제주특별자치도 제주시 구좌읍 비자숲길 55" → "제주시 구좌읍" */
function areaOf(address) {
  return String(address || '')
    .replace(/^제주특별자치도\s*/, '')
    .split(/\s+/)
    .slice(0, 2)
    .join(' ');
}

/** 고른 날의 타임라인: 이동 → 장소 카드(종류 딱지·태그·영업시간·추천 이유·링크) */
function DayTimeline({ dayIndex, date, rows, placeMap, tagLabels, log, rainy }) {
  const st = dayStyle(dayIndex);
  const stops = rows.filter((r) => (r.slot.placeId && r.place) || r.slot.custom);
  const travel = rows.reduce((a, r) => a + (r.travelFromPrev?.minutes || 0), 0);
  const kinds = stops.reduce((a, r) => ((a[r.place?.category] = (a[r.place?.category] || 0) + 1), a), {});
  let n = 0;

  return (
    <section className="flex flex-col gap-1" aria-label={DAY_LABELS[dayIndex]}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pb-1">
        <h2 className="m-0 font-display text-lg">{DAY_LABELS[dayIndex] || `${dayIndex + 1}일차`}</h2>
        <span className="text-[13px] text-sub">
          {stops.length}곳{travel > 0 && ` · 차 타는 시간 ${formatDuration(travel)}`}
        </span>
        <span className="ml-auto flex gap-1">
          {['sight', 'food', 'cafe'].map((k) =>
            kinds[k] ? (
              <span key={k} className={`rounded-xl px-2 py-0.5 text-[11px] font-bold ${KIND_LOOK[k].bg} ${KIND_LOOK[k].ink}`}>
                {CATEGORIES[k]} {kinds[k]}
              </span>
            ) : null
          )}
        </span>
      </div>
      {!stops.length && <div className="card p-4 text-sm text-sub">이날은 비어 있어요</div>}

      {rows.map((r) => {
        const s = r.slot;
        if (isEmptySlot(s)) return null;
        const place = s.placeId ? placeMap[s.placeId] : null;
        if (s.placeId && !place) return null;
        const isStop = !!(place || s.custom);
        if (isStop) n++;
        const name = slotTitle(s, placeMap);
        const tr = r.travelFromPrev;
        const start = toMin(s.time);
        const timeText = isStop && s.stayMinutes > 0 && start !== null ? `${s.time}–${toHHMM(start + s.stayMinutes)}` : s.time;
        const warn = rowWarning(r);

        return (
          <div key={s.id} className="flex flex-col gap-1">
            {tr && (
              <div className="flex items-center gap-1.5 py-0.5 pl-[52px] text-xs text-sub">
                <IconCar />
                <span>차로 약 {formatDuration(tr.minutes) || '바로'}</span>
                {tr.minutes > 0 && r.point && (
                  <a href={routeLink(tr.from, { ...r.point, name })} target="_blank" rel="noopener noreferrer" className="flex min-h-8 items-center text-ok underline">
                    길찾기
                  </a>
                )}
              </div>
            )}
            {place ? (
              <PlaceStop n={n} st={st} s={s} place={place} name={name} timeText={timeText} date={date} tagLabels={tagLabels} warn={warn} r={r} log={log} alt={rainy[rainyKey(date, s.placeId)]} />
            ) : (
              <div className="flex items-center gap-3 rounded-[20px] bg-surface px-3 py-2.5 shadow-soft">
                <div
                  className="flex h-9 w-9 flex-none items-center justify-center font-display text-[17px]"
                  style={isStop ? { background: st.hex, color: '#fff', borderRadius: '12px 18px 14px 18px' } : { background: '#FFC93C', borderRadius: 18 }}
                  aria-hidden="true"
                >
                  {isStop ? n : <IconHome />}
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="text-[13px] font-bold text-sub">{timeText}</div>
                  <div className="font-display text-[15px] leading-snug">{name}</div>
                  {s.custom?.address && <div className="text-xs text-sub">{s.custom.address}</div>}
                  {s.fixed?.note && <div className="text-xs text-sub">{s.fixed.note}</div>}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

function PlaceStop({ n, st, s, place, name, timeText, date, tagLabels, warn, r, log, alt }) {
  const look = KIND_LOOK[place.category] || KIND_LOOK.sight;
  const sub = place.sub_category && !PLAIN_SUB.has(place.sub_category) ? place.sub_category : null;
  const tags = (place.kid_tags || []).filter((t) => !HIDDEN_TAGS.has(t) && tagLabels[t]).slice(0, 4);
  const closed = date && isClosedOn(place, date);
  const hours = date ? hoursText(place, date) : '';
  const area = areaOf(place.address);
  const meta = [area, closed ? null : isAlwaysOpen(place) ? '상시 개방' : hours && `${hours} 영업`].filter(Boolean).join(' · ');

  return (
    <article className="flex gap-3 rounded-[20px] bg-surface p-3 shadow-soft">
      <div
        className="flex h-9 w-9 flex-none items-center justify-center font-display text-[17px] text-white"
        style={{ background: st.hex, borderRadius: '12px 18px 14px 18px' }}
        aria-hidden="true"
      >
        {n}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold text-sub">{timeText}</span>
          <span className={`inline-flex items-center gap-1 rounded-xl px-2 py-0.5 text-[11px] font-bold ${look.bg} ${look.ink}`}>
            <look.Icon />
            {CATEGORIES[place.category] || '장소'}
          </span>
          {sub && <span className="truncate text-[11px] text-sub">{sub}</span>}
        </div>
        <h3 className="m-0 font-display text-[17px] font-normal leading-snug">{name}</h3>
        {meta && <div className="text-xs text-sub">{meta}</div>}
        {s.aiReason && (
          <p className="m-0 flex gap-1.5 rounded-[12px] bg-bg px-2.5 py-1.5 text-[13px] leading-relaxed">
            <span className="mt-[3px] flex-none text-ok" aria-hidden="true">
              <IconSpark size={13} />
            </span>
            <span>{s.aiReason}</span>
          </p>
        )}
        {(place.indoor || tags.length > 0) && (
          <div className="flex flex-wrap gap-1">
            {place.indoor && <span className="kid-tag">실내</span>}
            {tags.map((t) => (
              <span key={t} className="kid-tag">
                {tagLabels[t]}
              </span>
            ))}
          </div>
        )}
        {s.memo && <div className="text-xs text-warn-ink">챙길 것 · {s.memo}</div>}
        {log && <LogLine entry={slotLog(log, s)} />}
        {warn && (r.check.level === 'warn' || r.lateBy > 0) && <div className="text-xs font-bold text-warn-ink">{warn}</div>}
        <RainyAlt alt={alt} tagLabels={tagLabels} />
        <div className="flex gap-3 text-xs">
          <a href={mapLink(place)} target="_blank" rel="noopener noreferrer" className="flex min-h-8 items-center text-ok underline">
            지도
          </a>
          <a href={blogLink(place)} target="_blank" rel="noopener noreferrer" className="flex min-h-8 items-center text-ok underline">
            사진·후기 보기
          </a>
        </div>
      </div>
    </article>
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
  const [stay, setStay] = useState(setup.stay ? { name: setup.stay, ...(setup.slat && setup.slng ? { lat: Number(setup.slat), lng: Number(setup.slng) } : {}) } : null);
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
          <LocationSearch label="숙소 (선택, 고르면 숙소에서 출발해요)" placeholder="숙소 이름이나 주소" value={stay} onChange={setStay} fieldClass="bg-surface" />
        )}
        <p className="m-0 text-xs leading-relaxed text-sub">가져온 뒤 내 날짜에 쉬는 곳이 있으면 루트 짜기 화면에서 빨간 경고로 알려 드려요.</p>
        {err && <p className="m-0 text-sm font-bold text-warn-ink">{err}</p>}
        <button
          type="button"
          disabled={pending || !startDate}
          className="btn-cta"
          onClick={() =>
            start(async () => {
              const res = await copyRoute(trip.id, { startDate, arrivalTime, departureTime, stay, mode, departAreaId: isCar ? departAreaId : null });
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
