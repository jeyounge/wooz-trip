'use client';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BackLink } from '@/components/ui';
import { IconBookmark, IconDown, IconEdit, IconHome, IconUp } from '@/components/Icons';
import RouteMap from '@/components/RouteMap';
import RainyAlt from '@/components/RainyAlt';
import { rainyKey } from '@/lib/rainy';
import { makeTravelFn, mergeTravel, withRoads } from '@/lib/travel';
import Sheet from '@/components/Sheet';
import { DAY_LABELS, dayStyle } from '@/lib/config';
import { isEmptySlot, mapDays, rowWarning, slotTitle, summarize } from '@/lib/trip';
import { formatDuration } from '@/lib/geo';
import { routeLink, tripSubtitle } from '@/lib/format';
import { publishTrip, saveDays, saveTripLog, shareTrip, unpublishTrip } from '@/app/actions/trips';
import { ExtrasEditor, LogEditor, LogLine, ReviewEditor } from '@/components/TripLog';
import { canLogSpend, canReview, hasLog, logTotals, slotLog, won } from '@/lib/triplog';
import TripMembers from '@/components/TripMembers';
import CheckedBadge, { DayDrive, countRainy } from '@/components/CheckedBadge';

/** S05 루트 결과: 지도 동선 + 타임라인 + 순서 바꾸기·메모 + 쓴 돈·한마디 기록 + 저장/공유/공개 */
export default function RouteResult({ trip: initialTrip, rev: initialRev, role = 'owner', members, userId, placeMap, userEmail, log: initialLog, rainy = {}, travel: initialTravel }) {
  const router = useRouter();
  const isOwner = role === 'owner';
  const rev = useRef(initialRev); // 마지막으로 받은 일정 지문 (같이 고칠 때 충돌 확인)
  const conflicted = useRef(false);
  const queue = useRef(Promise.resolve(true));
  const [trip, setTrip] = useState(initialTrip);
  const [days, setDays] = useState(initialTrip.days);
  const [day, setDay] = useState(0);
  const [memoFor, setMemoFor] = useState(null);
  const [toast, setToast] = useState(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [sharePending, startShare] = useTransition();
  const timer = useRef(null);
  const latest = useRef(days);
  const daysDirty = useRef(false);
  const [log, setLog] = useState(initialLog);
  const [logFor, setLogFor] = useState(null);
  const logTimer = useRef(null);
  const latestLog = useRef(initialLog);
  const logDirty = useRef(false);
  const spendOpen = canLogSpend(trip);
  const reviewOpen = canReview(trip);
  const totals = useMemo(() => logTotals(log, days), [log, days]);

  const view = useMemo(() => ({ ...trip, days }), [trip, days]);
  const [travel, setTravel] = useState(initialTravel || { minutes: {}, paths: {} });
  const travelFn = useMemo(() => makeTravelFn(travel.minutes), [travel]);
  const sum = useMemo(() => summarize(view, placeMap, travelFn), [view, placeMap, travelFn]);
  const rows = sum.perDay[day] || [];
  const mapData = useMemo(() => withRoads(mapDays(days, placeMap, view), travel.paths), [days, placeMap, view, travel]);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      clearTimeout(logTimer.current);
    },
    []
  );
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  /** 저장은 한 번에 하나씩. 다른 사람이 먼저 고쳤으면 최신 일정을 다시 불러온다 */
  function persist(next = latest.current) {
    clearTimeout(timer.current);
    const run = queue.current.then(async () => {
      if (conflicted.current) return false;
      const res = await saveDays(trip.id, next, rev.current);
      if (res.ok) {
        rev.current = res.rev;
        if (res.travel) setTravel((t) => mergeTravel(t, res.travel));
        if (next === latest.current) daysDirty.current = false;
      } else if (res.conflict) {
        conflicted.current = true;
        setToast(res.message);
        setTimeout(() => window.location.reload(), 1800);
      } else setToast(`저장 실패: ${res.message}`);
      return res.ok;
    });
    queue.current = run.catch(() => false);
    return run;
  }
  function update(next) {
    setDays(next);
    latest.current = next;
    daysDirty.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => persist(next), 800);
  }

  /** 기록은 일정(슬롯)을 먼저 저장한 뒤 저장한다 (서버가 저장된 슬롯 기준으로 기록을 정리하므로) */
  async function persistLog() {
    clearTimeout(logTimer.current);
    if (!logDirty.current) return true;
    if (daysDirty.current && !(await persist())) return false;
    const res = await saveTripLog(trip.id, latestLog.current);
    if (!res.ok) {
      setToast(res.message);
      return false;
    }
    logDirty.current = false;
    return true;
  }
  function updateLog(next) {
    setLog(next);
    latestLog.current = next;
    logDirty.current = true;
    clearTimeout(logTimer.current);
    logTimer.current = setTimeout(persistLog, 800);
  }
  async function persistAll() {
    if (daysDirty.current && !(await persist())) return false;
    return persistLog();
  }
  function setSlotLog(slot, entry) {
    const slots = { ...latestLog.current.slots };
    if (entry.cost || entry.rating || entry.note) slots[slot.id] = { placeId: slot.placeId, ...entry };
    else delete slots[slot.id];
    updateLog({ ...latestLog.current, slots });
  }

  /** 순서 바꾸기: 시간 칸은 그대로 두고 장소만 앞/뒤 칸과 맞바꾼다 */
  function move(slotId, dir) {
    const slots = [...days[day].slots];
    const i = slots.findIndex((s) => s.id === slotId);
    let j = i + dir;
    while (j >= 0 && j < slots.length && slots[j].fixed) j += dir;
    if (j < 0 || j >= slots.length) return;
    const a = slots[i];
    const b = slots[j];
    slots[i] = { ...a, placeId: b.placeId, custom: b.custom, memo: b.memo, aiReason: b.aiReason, stayMinutes: b.placeId || b.custom ? b.stayMinutes : a.stayMinutes };
    slots[j] = { ...b, placeId: a.placeId, custom: a.custom, memo: a.memo, aiReason: a.aiReason, stayMinutes: a.stayMinutes };
    update(days.map((d, k) => (k === day ? { ...d, slots } : d)));
    // 기록도 장소를 따라 옮긴다
    const ls = latestLog.current.slots;
    if (ls[a.id] || ls[b.id]) {
      const next = { ...ls };
      delete next[a.id];
      delete next[b.id];
      if (ls[b.id]) next[a.id] = ls[b.id];
      if (ls[a.id]) next[b.id] = ls[a.id];
      updateLog({ ...latestLog.current, slots: next });
    }
  }

  function setMemo(slotId, memo) {
    update(days.map((d, k) => (k !== day ? d : { ...d, slots: d.slots.map((s) => (s.id === slotId ? { ...s, memo } : s)) })));
  }

  async function onSave() {
    if ((await persist()) && (await persistLog())) setToast('저장했어요. 내 여행에서 언제든 다시 볼 수 있어요');
  }

  function onShare() {
    startShare(async () => {
      await persistAll();
      const res = await shareTrip(trip.id);
      if (!res.ok) return setToast(res.message);
      setTrip((t) => ({ ...t, share_id: res.shareId, visibility: t.visibility === 'public' ? 'public' : 'shared' }));
      const url = `${window.location.origin}/s/${res.shareId}`;
      const text = `${trip.title} 동선이에요`;
      try {
        if (navigator.share) {
          await navigator.share({ title: trip.title, text, url });
          return;
        }
      } catch {
        // 공유 창을 닫은 경우 복사로 넘어간다
      }
      try {
        await navigator.clipboard.writeText(url);
        setToast('링크를 복사했어요. 가족 단톡방에 붙여 넣어 주세요');
      } catch {
        setToast(url);
      }
    });
  }

  const rainyCount = useMemo(() => countRainy(days, rainy), [days, rainy]);
  const st = dayStyle(day);
  let n = 0;

  return (
    <>
      <header className="flex items-center gap-2.5 px-4 pt-4 pb-2">
        <BackLink href={`/trips/${trip.id}/edit?day=${day}`} label="편집으로 돌아가기" />
        <div className="min-w-0 flex-1">
          <div className="font-display text-xl">{sum.empty ? trip.title : '짜잔, 동선 완성!'}</div>
          {(sum.travel > 0 || totals.total > 0) && (
            <div className="text-xs text-sub">
              {[sum.travel > 0 && `총 이동 ${formatDuration(sum.travel)}`, totals.total > 0 && `쓴 돈 ${won(totals.total)}`].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
        <Link href={`/trips/${trip.id}/edit?day=${day}`} aria-label="루트 고치기" className="icon-btn">
          <IconEdit />
        </Link>
      </header>

      <div className="flex flex-col gap-2.5 px-5">
        <CheckedBadge sum={sum} rainyCount={rainyCount} />
        <RouteMap days={mapData} active={day} />
      </div>

      <nav aria-label="일자" className="flex gap-2 overflow-x-auto px-5 pt-3.5 pb-2">
        {days.map((d, i) => (
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

      <main className="flex flex-1 flex-col gap-1 px-5 pt-1 pb-3">
        <DayDrive minutes={sum.dayTravel[day]} />
        <div className="pb-1 text-xs text-sub">
          {tripSubtitle(trip)}
          {spendOpen && totals.perDay[day] > 0 && <b className="text-ink"> · 이날 쓴 돈 {won(totals.perDay[day])}</b>}
        </div>
        {rows.map((r) => {
          const s = r.slot;
          if (isEmptySlot(s)) return null; // 빈 칸은 결과에서 숨긴다
          const isPlace = !!s.placeId; // 쓴 돈 기록은 DB 장소에만
          const isStop = isPlace || !!s.custom;
          if (isStop) n++;
          const warn = rowWarning(r);
          const tr = r.travelFromPrev;
          return (
            <div key={s.id} className="flex flex-col gap-1">
              {tr && (
                <div className="flex items-center gap-2 py-0.5 pl-14 text-xs text-sub">
                  <span>
                    차로 약 {formatDuration(tr.minutes) || '바로'}
                    {tr.nap && ' · 아이들 낮잠'}
                  </span>
                  {tr.minutes > 0 && r.point && (
                    <a href={routeLink(tr.from, { ...r.point, name: slotTitle(s, placeMap) })} target="_blank" rel="noopener noreferrer" className="text-ok underline">
                      길찾기
                    </a>
                  )}
                </div>
              )}
              <div className="flex items-center gap-3 rounded-[20px] bg-surface p-3 shadow-soft">
                <div
                  className="flex h-9 w-9 flex-none items-center justify-center font-display text-[17px]"
                  style={
                    isStop
                      ? { background: st.hex, color: '#fff', borderRadius: '12px 18px 14px 18px' }
                      : { background: '#FFC93C', color: '#3A2A20', borderRadius: 18 }
                  }
                  aria-hidden="true"
                >
                  {isStop ? n : <IconHome />}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13px] font-bold text-sub">{s.time}</span>
                    <span className="truncate font-display text-base">{slotTitle(s, placeMap)}</span>
                  </div>
                  {s.custom?.address && <div className="truncate text-xs text-sub">{s.custom.address}</div>}
                  {isStop && s.stayMinutes > 0 && <div className="text-xs text-sub">머무는 시간 {formatDuration(s.stayMinutes)}</div>}
                  {s.memo && memoFor !== s.id && <div className="text-xs text-warn-ink">챙길 것 · {s.memo}</div>}
                  {warn && (r.check.level === 'warn' || r.lateBy > 0) && <div className="text-xs font-bold text-warn-ink">{warn}</div>}
                  {s.placeId && <RainyAlt alt={rainy[rainyKey(days[day].date, s.placeId)]} />}
                  {isStop && memoFor !== s.id && (
                    <button type="button" onClick={() => setMemoFor(s.id)} className="self-start text-xs text-sub underline">
                      {s.memo ? '메모 고치기' : '+ 챙길 것 메모'}
                    </button>
                  )}
                  {isPlace && spendOpen && logFor !== s.id && (
                    <>
                      <LogLine entry={slotLog(log, s)} />
                      <button type="button" onClick={() => setLogFor(s.id)} className="self-start text-xs text-sub underline">
                        {slotLog(log, s) ? '기록 고치기' : '+ 쓴 돈·한마디'}
                      </button>
                    </>
                  )}
                  {logFor === s.id && (
                    <LogEditor
                      entry={slotLog(log, s)}
                      onCancel={() => setLogFor(null)}
                      onDone={(entry) => {
                        setSlotLog(s, entry);
                        setLogFor(null);
                      }}
                    />
                  )}
                  {memoFor === s.id && (
                    <MemoInput
                      initial={s.memo}
                      onDone={(v) => {
                        setMemo(s.id, v);
                        setMemoFor(null);
                      }}
                    />
                  )}
                </div>
                {isStop && (
                  <div className="flex flex-none flex-col gap-1">
                    <button type="button" aria-label="앞으로" onClick={() => move(s.id, -1)} className="flex h-8 w-9 items-center justify-center rounded-xl bg-bg text-sub">
                      <IconUp />
                    </button>
                    <button type="button" aria-label="뒤로" onClick={() => move(s.id, 1)} className="flex h-8 w-9 items-center justify-center rounded-xl bg-bg text-sub">
                      <IconDown />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {sum.empty > 0 && (
          <Link href={`/trips/${trip.id}/edit?day=${day}`} className="mt-2 rounded-2xl border-2 border-dashed border-line-strong p-3 text-center text-sm text-sub">
            아직 빈 슬롯이 {sum.empty}개 있어요 · 채우러 가기
          </Link>
        )}
        {spendOpen ? (
          <section className="card mt-3 flex flex-col gap-2 p-4" aria-label="그 밖에 쓴 돈">
            <div className="flex items-baseline justify-between">
              <span className="font-display text-base">그 밖에 쓴 돈</span>
              {totals.total > 0 && (
                <span className="text-sm">
                  전체 <b>{won(totals.total)}</b>
                </span>
              )}
            </div>
            <div className="text-xs text-sub">항공권·렌터카·숙소처럼 장소에 안 붙는 돈</div>
            <ExtrasEditor extras={log.extras} onChange={(extras) => updateLog({ ...latestLog.current, extras })} />
          </section>
        ) : (
          <p className="m-0 mt-3 text-center text-xs text-sub">여행 첫날부터 장소마다 쓴 돈과 한마디를 적을 수 있어요</p>
        )}
        {reviewOpen && (
          <section className="card mt-1 flex flex-col gap-2 p-4" aria-label="다녀온 뒤 한마디">
            <div className="font-display text-base">다녀오셨나요? 어땠어요?</div>
            <ReviewEditor rating={log.rating} comment={log.comment} onChange={(v) => updateLog({ ...latestLog.current, ...v })} />
          </section>
        )}
        <TripMembers tripId={trip.id} role={role} userId={userId} members={members} />
      </main>

      <div className="sticky bottom-0 z-10 flex gap-2 bg-bg px-5 pt-2.5 pb-6">
        <button type="button" aria-label="저장" onClick={onSave} className="flex h-14 w-14 flex-none items-center justify-center rounded-full border-2 border-line bg-surface">
          <IconBookmark />
        </button>
        {isOwner ? (
          <>
            <button type="button" onClick={onShare} disabled={sharePending} className="btn-yellow flex-1">
              {sharePending ? '링크 만드는 중…' : '가족 단톡에 공유'}
            </button>
            <button type="button" onClick={() => setPublishOpen(true)} className="btn-cta flex-1 text-base">
              {trip.visibility === 'public' ? '공개 중' : '자랑하기'}
            </button>
          </>
        ) : (
          <Link href={`/trips/${trip.id}/edit?day=${day}`} className="btn-cta flex-1 text-base">
            일정 고치기
          </Link>
        )}
      </div>

      {toast && (
        <div role="status" className="fixed bottom-28 left-1/2 z-50 w-[calc(100%-40px)] max-w-[390px] -translate-x-1/2 break-all rounded-2xl bg-selected px-4 py-3 text-sm text-selected-ink">
          {toast}
        </div>
      )}

      {publishOpen && (
        <PublishSheet
          trip={trip}
          log={log}
          defaultName={(userEmail || '').split('@')[0]}
          onClose={() => setPublishOpen(false)}
          onDone={(patch, goDetail, logPublic) => {
            setTrip((t) => ({ ...t, ...patch }));
            if (typeof logPublic === 'boolean') {
              setLog((l) => ({ ...l, isPublic: logPublic }));
              latestLog.current = { ...latestLog.current, isPublic: logPublic };
            }
            setPublishOpen(false);
            if (goDetail) router.push(`/routes/${trip.id}`);
            else setToast('공개를 취소했어요. 가족 공유 링크는 그대로 열려요');
          }}
          beforePublish={persistAll}
        />
      )}
    </>
  );
}

function MemoInput({ initial, onDone }) {
  const [v, setV] = useState(initial || '');
  return (
    <form
      className="flex gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        onDone(v.trim());
      }}
    >
      <input
        autoFocus
        value={v}
        maxLength={200}
        onChange={(e) => setV(e.target.value)}
        placeholder="예: 모래놀이 장난감, 여벌 옷"
        aria-label="챙길 것 메모"
        className="min-w-0 flex-1 rounded-xl bg-bg px-2.5 py-2 text-sm outline-none"
      />
      <button type="submit" className="rounded-xl bg-selected px-3 text-sm text-selected-ink">
        완료
      </button>
    </form>
  );
}

function PublishSheet({ trip, log, defaultName, onClose, onDone, beforePublish }) {
  const [title, setTitle] = useState(trip.title);
  const [authorName, setAuthorName] = useState(trip.author_name || defaultName);
  const [tip, setTip] = useState(trip.author_tip || '');
  const [showLog, setShowLog] = useState(!!log?.isPublic);
  const withLog = hasLog(log);
  const [err, setErr] = useState(null);
  const [pending, start] = useTransition();
  const isPublic = trip.visibility === 'public';

  return (
    <Sheet title={isPublic ? '공개 루트 고치기' : '우리 루트 자랑하기'} sub="다른 가족이 보고 그대로 따라갈 수 있어요" onClose={onClose}>
      <div className="flex flex-col gap-2.5 px-5 pb-8">
        <label className="field bg-surface">
          루트 이름
          <input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field bg-surface">
          보여줄 이름 (예: 제키네 가족)
          <input value={authorName} maxLength={20} onChange={(e) => setAuthorName(e.target.value)} />
        </label>
        <label className="field bg-surface">
          엄마아빠 꿀팁 (선택)
          <textarea
            rows={3}
            maxLength={500}
            value={tip}
            onChange={(e) => setTip(e.target.value)}
            placeholder="예: 협재는 오후 물때가 좋아요. 비 오면 실내 코스로 바꿨어요."
            className="resize-none font-normal"
          />
        </label>
        {withLog && (
          <label className="flex min-h-11 items-center gap-2.5 rounded-2xl bg-surface px-3 py-2 text-sm">
            <input type="checkbox" checked={showLog} onChange={(e) => setShowLog(e.target.checked)} className="h-5 w-5" />
            쓴 돈·다녀온 한마디도 같이 보여주기
          </label>
        )}
        <p className="m-0 text-xs leading-relaxed text-sub">
          공개하면 루트 이름·보여줄 이름·아이 나이·여행 달·장소 목록이 보여요{withLog ? ' (쓴 돈·한마디는 체크했을 때만)' : ''}. 이메일은 보이지 않아요.
        </p>
        {err && <p className="m-0 text-sm font-bold text-warn-ink">{err}</p>}
        <button
          type="button"
          disabled={pending}
          className="btn-cta"
          onClick={() =>
            start(async () => {
              if (!(await beforePublish())) return;
              const res = await publishTrip(trip.id, { title, authorName, tip, ...(withLog ? { showLog } : {}) });
              if (!res.ok) return setErr(res.message);
              onDone({ title, author_name: authorName, author_tip: tip, visibility: 'public' }, true, withLog ? showLog : undefined);
            })
          }
        >
          {pending ? '올리는 중…' : isPublic ? '고친 내용 올리기' : '공개하기'}
        </button>
        {isPublic && (
          <button
            type="button"
            disabled={pending}
            className="h-11 text-sm text-sub underline"
            onClick={() =>
              start(async () => {
                const res = await unpublishTrip(trip.id);
                if (!res.ok) return setErr(res.message);
                onDone({ visibility: 'shared' }, false);
              })
            }
          >
            공개 취소하기
          </button>
        )}
      </div>
    </Sheet>
  );
}
