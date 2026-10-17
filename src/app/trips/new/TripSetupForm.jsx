'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BackLink } from '@/components/ui';
import { COMPANIONS, MAX_TRIP_DAYS, REGIONS } from '@/lib/config';
import { addDays, dayCount, shortDate, weekdayLabel } from '@/lib/hours';
import { createTrip } from '@/app/actions/trips';

const STARTS = [
  { id: 'self', title: '직접 짜기', desc: '빈 칸부터', color: '#BFE6D5' },
  { id: 'ai', title: 'AI 초안', desc: '먼저 받아보기', color: '#FFC93C' },
  { id: 'browse', title: '따라가기', desc: '남의 루트 복사', color: '#FFC6B8' },
];
const NEXT_LABEL = { self: '좋아요, 시작할게요', ai: 'AI 초안 받아보기', browse: '인기 루트 보러 가기' };

function today() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export default function TripSetupForm({ initialCompanion }) {
  const router = useRouter();
  const base = useMemo(() => addDays(today(), 14), []);
  const [companion, setCompanion] = useState(COMPANIONS.some((c) => c.id === initialCompanion) ? initialCompanion : 'kids');
  const [ages, setAges] = useState([7, 3]);
  const [region, setRegion] = useState('jeju-west');
  const [startDate, setStartDate] = useState(base);
  const [endDate, setEndDate] = useState(addDays(base, 2));
  const [arrivalTime, setArrivalTime] = useState('10:30');
  const [departureTime, setDepartureTime] = useState('18:40');
  const [stayName, setStayName] = useState('');
  const [start, setStart] = useState('self');
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();

  const n = startDate && endDate ? dayCount(startDate, endDate) : 0;
  const dateError = n < 1 ? '오는 날이 가는 날보다 빨라요' : n > MAX_TRIP_DAYS ? `최대 ${MAX_TRIP_DAYS}일까지 짤 수 있어요` : null;

  function onStartDate(v) {
    setStartDate(v);
    if (v && endDate && dayCount(v, endDate) < 1) setEndDate(addDays(v, 2));
  }

  function submit() {
    setError(null);
    if (dateError) return setError(dateError);
    if (start === 'browse') {
      const q = new URLSearchParams({ c: companion, start: startDate, arr: arrivalTime, dep: departureTime });
      if (stayName) q.set('stay', stayName);
      router.push(`/routes?${q}`);
      return;
    }
    startTransition(async () => {
      const res = await createTrip({ region, startDate, endDate, arrivalTime, departureTime, companion, kidsAges: ages, stayName, start });
      if (!res.ok) return setError(res.message);
      router.push(`/trips/${res.id}/edit${start === 'ai' ? '?ai=1' : ''}`);
    });
  }

  const card = 'card flex flex-col gap-2.5 p-[18px] shadow-card';

  return (
    <>
      <header className="flex items-center gap-2 px-4 pt-4 pb-2">
        <BackLink href="/" />
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-soft" aria-hidden="true">
          <div className="h-2.5 w-1/2 rounded-full bg-cta" />
        </div>
        <div className="pr-1 text-[13px] text-sub">1/2</div>
      </header>

      <main className="flex flex-1 flex-col gap-4 px-5 pt-2 pb-6">
        <h1 className="m-0 h-display text-[26px] leading-snug">몇 가지만 알려주세요!</h1>

        <section className={card}>
          <h2 className="m-0 h-display text-lg">누구랑 가요?</h2>
          <div className="grid grid-cols-4 gap-1.5">
            {COMPANIONS.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={companion === c.id}
                onClick={() => setCompanion(c.id)}
                className={`pill px-0 ${companion === c.id ? 'pill-on' : ''}`}
              >
                {c.label}
              </button>
            ))}
          </div>
          {companion === 'kids' && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-sm text-sub">아이 나이</span>
              {ages.map((a, i) => (
                <span key={i} className="flex h-10 items-center gap-1 rounded-full bg-accent pl-3 pr-1 text-[15px] font-bold">
                  <select
                    aria-label={`${i + 1}번째 아이 나이`}
                    value={a}
                    onChange={(e) => setAges(ages.map((x, j) => (j === i ? Number(e.target.value) : x)))}
                    className="appearance-none bg-transparent font-bold outline-none"
                  >
                    {Array.from({ length: 14 }, (_, k) => (
                      <option key={k} value={k}>
                        {k}살
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label={`${i + 1}번째 아이 빼기`}
                    onClick={() => setAges(ages.filter((_, j) => j !== i))}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-sub"
                  >
                    ×
                  </button>
                </span>
              ))}
              {ages.length < 6 && (
                <button
                  type="button"
                  aria-label="아이 추가"
                  onClick={() => setAges([...ages, 3])}
                  className="h-10 w-10 rounded-full border-2 border-dashed border-line-strong text-xl text-sub"
                >
                  +
                </button>
              )}
            </div>
          )}
        </section>

        <section className={card}>
          <h2 className="m-0 h-display text-lg">제주 어느 쪽이에요?</h2>
          <div className="flex flex-wrap gap-1.5">
            {REGIONS.map((r) => (
              <button
                key={r.id}
                type="button"
                aria-pressed={region === r.id}
                onClick={() => setRegion(r.id)}
                className={`pill ${region === r.id ? 'pill-on' : ''}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </section>

        <section className={card}>
          <h2 className="m-0 h-display text-lg">언제, 몇 시 비행기예요?</h2>
          <div className="grid grid-cols-2 gap-2">
            <label className="field">
              가는 날{startDate && ` · ${weekdayLabel(startDate)}`}
              <input type="date" required value={startDate} min={today()} onChange={(e) => onStartDate(e.target.value)} />
            </label>
            <label className="field">
              오는 날{endDate && ` · ${weekdayLabel(endDate)}`}
              <input type="date" required value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
            <label className="field">
              제주 도착
              <input type="time" required value={arrivalTime} onChange={(e) => setArrivalTime(e.target.value)} />
            </label>
            <label className="field">
              제주 출발
              <input type="time" required value={departureTime} onChange={(e) => setDepartureTime(e.target.value)} />
            </label>
          </div>
          {!dateError && n > 0 && (
            <div className="text-[13px] text-sub">
              {shortDate(startDate)} – {shortDate(endDate)} · {n === 1 ? '당일치기' : `${n - 1}박 ${n}일`}
            </div>
          )}
          {dateError && <div className="text-[13px] font-bold text-warn-ink">{dateError}</div>}
          <label className="field">
            숙소
            <input type="text" placeholder="숙소 이름이나 주소" value={stayName} onChange={(e) => setStayName(e.target.value)} />
          </label>
        </section>

        <section className="flex flex-col gap-2.5">
          <h2 className="m-0 h-display text-lg">어떻게 시작할까요?</h2>
          <div className="grid grid-cols-3 gap-2">
            {STARTS.map((s) => {
              const on = start === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setStart(s.id)}
                  className={`flex flex-col items-start gap-1.5 rounded-[22px] bg-surface px-3 py-3.5 text-left ${
                    on ? 'border-2 border-ink' : 'border-2 border-transparent shadow-card'
                  }`}
                >
                  <span className="h-[30px] w-[30px]" style={{ background: s.color, borderRadius: '10px 15px 12px 15px' }} />
                  <span className="font-display text-[15px]">{s.title}</span>
                  <span className="text-xs leading-snug text-sub">{s.desc}</span>
                </button>
              );
            })}
          </div>
        </section>
        {error && (
          <p role="alert" className="m-0 text-sm font-bold text-warn-ink">
            {error}
          </p>
        )}
      </main>

      <div className="sticky bottom-0 bg-bg px-5 pt-3 pb-6">
        <button type="button" onClick={submit} disabled={pending} className="btn-cta w-full">
          {pending ? (start === 'ai' ? 'AI가 동선을 고르는 중…' : '만드는 중…') : NEXT_LABEL[start]}
        </button>
      </div>
    </>
  );
}
