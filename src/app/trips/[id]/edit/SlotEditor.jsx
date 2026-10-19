'use client';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BackLink, KidTags } from '@/components/ui';
import { IconEdit, IconSpark, IconSwap, IconTrash, IconWarn } from '@/components/Icons';
import PlacePicker from '@/components/PlacePicker';
import ReportSheet from '@/components/ReportSheet';
import Sheet from '@/components/Sheet';
import { DAY_LABELS, SLOT_TYPES } from '@/lib/config';
import { computeDay, newSlotId, rowWarning, slotPoint } from '@/lib/trip';
import { shortDate, toHHMM, toMin, weekdayLabel } from '@/lib/hours';
import { tripSubtitle, slotLabel } from '@/lib/format';
import { formatDuration } from '@/lib/geo';
import { aiFill, markRouteDrawn, saveDays, updateTripMeta } from '@/app/actions/trips';
import AiThinking, { waitAtLeast } from '@/components/AiThinking';

export default function SlotEditor({ trip: initialTrip, initialPlaces, tags, fromAi, initialDay = 0 }) {
  const router = useRouter();
  const [trip, setTrip] = useState(initialTrip);
  const [days, setDays] = useState(initialTrip.days);
  const [places, setPlaces] = useState(initialPlaces);
  const [day, setDay] = useState(initialDay);
  const [picker, setPicker] = useState(null); // { slotId }
  const [report, setReport] = useState(null); // place
  const [metaOpen, setMetaOpen] = useState(false);
  const [save, setSave] = useState({ state: 'idle', message: '' }); // idle | saving | saved | error
  const [aiMsg, setAiMsg] = useState(fromAi ? 'ai-done' : null);
  const [aiPending, startAi] = useTransition();
  const [goPending, startGo] = useTransition();
  const timer = useRef(null);
  const latest = useRef(days);

  const tagLabels = useMemo(() => Object.fromEntries(tags.map((t) => [t.id, t.label])), [tags]);
  const tripView = useMemo(() => ({ ...trip, days }), [trip, days]);
  const rows = useMemo(() => computeDay(days[day], places, tripView), [days, day, places, tripView]);

  const stats = useMemo(() => {
    let empty = 0;
    let warns = 0;
    days.forEach((d) => {
      computeDay(d, places, tripView).forEach((r) => {
        if (!r.slot.fixed && !r.slot.placeId) empty++;
        if (r.check.level === 'warn' || r.lateBy > 0) warns++;
      });
    });
    return { empty, warns };
  }, [days, places, tripView]);

  // 자동 저장 (0.8초 묶음)
  const persist = useCallback(
    async (next) => {
      setSave({ state: 'saving', message: '' });
      const res = await saveDays(trip.id, next);
      setSave(res.ok ? { state: 'saved', message: '' } : { state: 'error', message: res.message });
      return res.ok;
    },
    [trip.id]
  );

  function update(next) {
    setDays(next);
    latest.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => persist(next), 800);
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  const patchSlot = (slotId, patch) =>
    update(days.map((d, i) => (i !== day ? d : { ...d, slots: d.slots.map((s) => (s.id === slotId ? { ...s, ...patch } : s)) })));

  function setSlotTime(slotId, time) {
    if (!/^\d{2}:\d{2}$/.test(time)) return;
    const slots = days[day].slots.map((s) => (s.id === slotId ? { ...s, time } : s));
    slots.sort((a, b) => toMin(a.time) - toMin(b.time));
    update(days.map((d, i) => (i === day ? { ...d, slots } : d)));
  }

  function addSlot() {
    const slots = days[day].slots;
    const lastMovable = [...slots].reverse().find((s) => !s.fixed?.kind?.endsWith('end') && s.fixed?.kind !== 'airport_depart');
    const after = lastMovable ? toMin(lastMovable.time) + (lastMovable.stayMinutes || 60) : toMin('15:00');
    const s = { id: newSlotId(), time: toHHMM(Math.min(after, 21 * 60)), slotType: 'extra', placeId: null, memo: '', stayMinutes: 60 };
    const next = [...slots, s].sort((a, b) => toMin(a.time) - toMin(b.time));
    update(days.map((d, i) => (i === day ? { ...d, slots: next } : d)));
  }

  // 골프 칸: 비어 있는 오전·점심 칸 자리에 5시간짜리 골프 칸을 넣는다 (시각은 첫 장소 칸, 없으면 07:00)
  function addGolf() {
    const slots = days[day].slots;
    const firstFree = slots.find((s) => !s.fixed);
    const time = firstFree ? firstFree.time : '07:00';
    const kept = slots.filter((s) => !(!s.fixed && !s.placeId && (s.slotType === 'am' || s.slotType === 'lunch')));
    const g = { id: newSlotId(), time, slotType: 'golf', placeId: null, memo: '', stayMinutes: SLOT_TYPES.golf.stay };
    const next = [...kept, g].sort((a, b) => toMin(a.time) - toMin(b.time));
    update(days.map((d, i) => (i === day ? { ...d, slots: next } : d)));
  }

  function removeSlot(slotId) {
    update(days.map((d, i) => (i === day ? { ...d, slots: d.slots.filter((s) => s.id !== slotId) } : d)));
  }

  function onPick(place) {
    setPlaces((m) => ({ ...m, [place.id]: place }));
    patchSlot(picker.slotId, { placeId: place.id, aiReason: undefined });
    setPicker(null);
  }

  function runAi() {
    startAi(async () => {
      clearTimeout(timer.current);
      const ok = await persist(latest.current);
      if (!ok) return;
      const res = await waitAtLeast(aiFill(trip.id));
      if (!res.ok) return setAiMsg(res.message);
      setPlaces((m) => ({ ...m, ...(res.places || {}) }));
      setDays(res.days);
      latest.current = res.days;
      setAiMsg(res.filled ? 'ai-done' : res.message || '채울 수 있는 장소를 찾지 못했어요');
    });
  }

  function goResult() {
    startGo(async () => {
      clearTimeout(timer.current);
      const ok = await persist(latest.current);
      if (!ok) return;
      await markRouteDrawn(trip.id);
      router.push(`/trips/${trip.id}`);
    });
  }

  const pickerSlot = picker && days[day].slots.find((s) => s.id === picker.slotId);
  const pickerFrom = useMemo(() => {
    if (!pickerSlot) return null;
    const idx = days[day].slots.findIndex((s) => s.id === pickerSlot.id);
    for (let i = idx - 1; i >= 0; i--) {
      const s = days[day].slots[i];
      const pt = slotPoint(s, places, tripView);
      if (pt) return { point: pt, name: s.placeId ? places[s.placeId]?.name : s.fixed?.name };
    }
    return null;
  }, [pickerSlot, days, day, places, tripView]);

  const aiCount = days.flatMap((d) => d.slots).filter((s) => s.aiReason).length;

  return (
    <>
      <header className="flex items-center gap-2.5 px-4 pt-4 pb-1.5">
        <BackLink href="/trips" />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="truncate font-display text-xl">{trip.title}</div>
          <div className="truncate text-[13px] text-sub">{tripSubtitle(trip)}</div>
        </div>
        <button type="button" aria-label="여행 정보 수정" onClick={() => setMetaOpen(true)} className="icon-btn">
          <IconEdit />
        </button>
      </header>

      <nav aria-label="일자" className="flex gap-2 overflow-x-auto px-5 pt-2 pb-2.5">
        {days.map((d, i) => (
          <button
            key={d.date}
            type="button"
            aria-pressed={day === i}
            onClick={() => setDay(i)}
            className={`flex h-11 min-w-[88px] flex-1 flex-col items-center justify-center rounded-full font-display text-[15px] leading-none ${
              day === i ? 'bg-selected text-selected-ink' : 'border-2 border-line bg-surface'
            }`}
          >
            {DAY_LABELS[i] || `${i + 1}일차`}
            <span className="mt-0.5 font-sans text-[11px] opacity-80">
              {shortDate(d.date)} {weekdayLabel(d.date)}
            </span>
          </button>
        ))}
      </nav>

      {aiMsg && (
        <div className="mx-5 mb-2 flex items-start gap-2 rounded-2xl bg-accent px-3.5 py-2.5 text-[13px]" role="status">
          <IconSpark />
          <span className="flex-1">
            {aiMsg === 'ai-done'
              ? aiCount
                ? `AI가 ${aiCount}곳을 골랐어요. 카드마다 고른 이유를 적어 뒀어요. 마음에 안 들면 바꾸면 돼요.`
                : 'AI가 채울 수 있는 빈칸이 없었어요.'
              : aiMsg}
          </span>
          <button type="button" onClick={() => setAiMsg(null)} aria-label="안내 닫기" className="px-1 text-sub">
            ×
          </button>
        </div>
      )}

      <main className="relative flex-1 px-5 pt-1.5 pb-4">
        <div className="pointer-events-none absolute left-[42px] top-5 bottom-5 border-l-[3px] border-dashed border-line-strong" aria-hidden="true" />
        <ol className="relative m-0 flex list-none flex-col gap-2.5 p-0">
          {rows.map((r) => (
            <SlotRow
              key={r.slot.id}
              row={r}
              tagLabels={tagLabels}
              withKids={trip.companion_type === 'kids'}
              onOpen={() => setPicker({ slotId: r.slot.id })}
              onClear={() => patchSlot(r.slot.id, { placeId: null, aiReason: undefined })}
              onRemove={() => removeSlot(r.slot.id)}
              onTime={(t) => setSlotTime(r.slot.id, t)}
              onStay={(m) => patchSlot(r.slot.id, { stayMinutes: m })}
            />
          ))}
        </ol>
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-1">
          <button type="button" onClick={addSlot} className="h-11 rounded-2xl text-sm font-bold text-ok">
            + 슬롯 추가 (간식·놀이터 등)
          </button>
          {!days[day].slots.some((s) => s.slotType === 'golf') && (
            <button type="button" onClick={addGolf} className="h-11 rounded-2xl px-3 text-sm font-bold text-ok">
              + 골프 칸
            </button>
          )}
        </div>
      </main>

      <div className="sticky bottom-0 z-10 flex flex-col gap-1.5 bg-bg px-5 pt-2 pb-6">
        <div className="text-center text-xs text-sub" aria-live="polite">
          빈 슬롯 {stats.empty}개 · 확인 필요 {stats.warns}건
          {save.state === 'saving' && ' · 저장 중…'}
          {save.state === 'saved' && ' · 저장됨'}
          {save.state === 'error' && <span className="font-bold text-warn-ink"> · 저장 실패: {save.message}</span>}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={runAi} disabled={aiPending || stats.empty === 0} className="btn-outline flex-1">
            {aiPending ? 'AI가 고르는 중…' : '빈칸 AI가 채우기'}
          </button>
          <button type="button" onClick={goResult} disabled={goPending} className="btn-cta flex-1 text-base">
            {goPending ? '그리는 중…' : '동선 그리기'}
          </button>
        </div>
      </div>

      {picker && pickerSlot && (
        <PlacePicker
          date={days[day].date}
          dayLabel={DAY_LABELS[day] || `${day + 1}일차`}
          slot={pickerSlot}
          from={pickerFrom}
          tags={tags}
          companion={trip.companion_type}
          excludeIds={days.flatMap((d) => d.slots.map((s) => s.placeId)).filter((id) => id && id !== pickerSlot.placeId)}
          onPick={onPick}
          onReport={(p) => setReport(p)}
          onClose={() => setPicker(null)}
        />
      )}
      {aiPending && <AiThinking companion={trip.companion_type} />}
      {report && <ReportSheet place={report} tripId={trip.id} tags={tags} onClose={() => setReport(null)} />}
      {metaOpen && (
        <MetaSheet
          trip={trip}
          onClose={() => setMetaOpen(false)}
          onSaved={(patch) => {
            setTrip((t) => ({ ...t, ...patch }));
            setMetaOpen(false);
            // 고정 슬롯의 숙소 이름도 같이 바꾼다
            const stay = patch.stay_name?.trim() || '숙소';
            update(
              days.map((d) => ({
                ...d,
                slots: d.slots.map((s) =>
                  s.fixed?.kind === 'stay_end'
                    ? { ...s, fixed: { ...s.fixed, name: stay } }
                    : s.fixed?.kind === 'stay_start'
                    ? { ...s, fixed: { ...s.fixed, note: stay } }
                    : s
                ),
              }))
            );
          }}
        />
      )}
    </>
  );
}

function SlotRow({ row, tagLabels, withKids, onOpen, onClear, onRemove, onTime, onStay }) {
  const { slot: s, place, travelFromPrev: tr } = row;
  const warn = rowWarning(row);
  const isWarn = row.check.level === 'warn' || row.lateBy > 0;
  const travelText = tr ? `차로 ${formatDuration(tr.minutes) || '바로'}${tr.nap && withKids ? ' · 낮잠 타임' : ''}` : '';

  const pinCls = s.fixed
    ? 'bg-accent text-ink'
    : !s.placeId
    ? 'bg-bg border-2 border-dashed border-line-strong text-sub'
    : isWarn
    ? 'bg-cta text-cta-ink'
    : 'bg-accent text-ink';

  return (
    <li className="flex items-start gap-3">
      <label className={`relative flex h-[46px] w-[46px] flex-none items-center justify-center rounded-full text-xs font-bold ${pinCls}`}>
        <span aria-hidden="true">{s.time}</span>
        <input
          type="time"
          value={s.time}
          aria-label={`${s.fixed ? s.fixed.name : slotLabel(s)} 시각 바꾸기`}
          onChange={(e) => onTime(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>

      {s.fixed ? (
        <div className="flex-1 rounded-[20px] bg-soft px-3.5 py-3">
          <div className="font-display text-base">{s.fixed.name}</div>
          <div className="text-xs text-[#6B5445]">{[travelText, s.fixed.note].filter(Boolean).join(' · ')}</div>
        </div>
      ) : place ? (
        <div className="card flex min-w-0 flex-1 flex-col gap-1.5 p-3.5">
          <div className="flex items-center gap-1.5">
            <span className="rounded-[10px] bg-bg px-2 py-0.5 text-xs text-sub">{slotLabel(s)}</span>
            {travelText && <span className="text-xs text-sub">{travelText}</span>}
            <div className="ml-auto flex gap-1">
              <button type="button" aria-label="장소 바꾸기" onClick={onOpen} className="flex h-9 w-9 items-center justify-center rounded-xl bg-bg">
                <IconSwap />
              </button>
              <button type="button" aria-label="이 슬롯 비우기" onClick={onClear} className="flex h-9 w-9 items-center justify-center rounded-xl bg-bg text-sub">
                <IconTrash />
              </button>
            </div>
          </div>
          <div className="font-display text-[17px] leading-snug">{place.name}</div>
          <KidTags ids={place.kid_tags} labels={tagLabels} />
          <StayControl value={s.stayMinutes} onChange={onStay} />
          {s.aiReason && <div className="rounded-xl bg-bg px-2.5 py-1.5 text-xs text-sub">AI 추천 이유 · {s.aiReason}</div>}
          {warn &&
            (isWarn ? (
              <button type="button" onClick={onOpen} className="warn-box text-left">
                <IconWarn />
                {warn}
              </button>
            ) : (
              <div className="rounded-[14px] bg-bg px-2.5 py-2 text-[13px] text-sub">{warn}</div>
            ))}
        </div>
      ) : (
        <div className="flex flex-1 items-center gap-1">
          <button
            type="button"
            onClick={onOpen}
            className="flex flex-1 items-center gap-2.5 rounded-[20px] border-2 border-dashed border-line-strong p-4 text-left"
          >
            <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-accent text-[22px] leading-none">+</span>
            <span className="flex flex-col">
              <span className="font-display text-base">{SLOT_TYPES[s.slotType]?.emptyName || '장소 고르기'}</span>
              <span className="text-xs text-sub">
                {slotLabel(s)} 자리가 비어 있어요{travelText ? ` · ${travelText}` : ''}
              </span>
            </span>
          </button>
          {(s.slotType === 'extra' || s.slotType === 'golf') && (
            <button type="button" aria-label={s.slotType === 'golf' ? '골프 칸 지우기' : '추가 슬롯 지우기'} onClick={onRemove} className="flex h-11 w-11 items-center justify-center rounded-xl text-sub">
              <IconTrash />
            </button>
          )}
        </div>
      )}
    </li>
  );
}

const STAY_OPTIONS = [30, 60, 90, 120, 150, 180, 240];
function StayControl({ value, onChange }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-sub">
      머무는 시간
      <select value={value} onChange={(e) => onChange(Number(e.target.value))} className="rounded-lg bg-bg px-1.5 py-1 text-xs text-ink outline-none">
        {[...new Set([...STAY_OPTIONS, value])].sort((a, b) => a - b).map((m) => (
          <option key={m} value={m}>
            {formatDuration(m)}
          </option>
        ))}
      </select>
    </label>
  );
}

function MetaSheet({ trip, onClose, onSaved }) {
  const [title, setTitle] = useState(trip.title);
  const [stayName, setStayName] = useState(trip.stay_name || '');
  const [pending, start] = useTransition();
  const [err, setErr] = useState(null);
  return (
    <Sheet title="여행 정보" onClose={onClose}>
      <div className="flex flex-col gap-2.5 px-5 pb-6">
        <label className="field bg-surface">
          루트 이름
          <input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field bg-surface">
          숙소
          <input value={stayName} maxLength={80} placeholder="숙소 이름이나 주소" onChange={(e) => setStayName(e.target.value)} />
        </label>
        <p className="m-0 text-xs text-sub">날짜·비행기 시각을 바꾸려면 새 루트를 만들어 주세요.</p>
        {err && <p className="m-0 text-sm font-bold text-warn-ink">{err}</p>}
        <button
          type="button"
          disabled={pending}
          className="btn-cta"
          onClick={() =>
            start(async () => {
              const res = await updateTripMeta(trip.id, { title, stayName });
              if (!res.ok) return setErr(res.message);
              onSaved({ title, stay_name: stayName });
            })
          }
        >
          저장
        </button>
        <Link href="/trips" className="text-center text-sm text-sub underline">
          내 여행 목록으로
        </Link>
      </div>
    </Sheet>
  );
}
