'use client';
import { useState } from 'react';
import { PLACE_RATINGS, TRIP_RATINGS, logTotals, won } from '@/lib/triplog';

const placeRatingLabel = (id) => PLACE_RATINGS.find((r) => r.id === id)?.label;
const tripRatingLabel = (id) => TRIP_RATINGS.find((r) => r.id === id)?.label;

/** 장소 한 줄 기록: "32,000원 · 좋았어요 · 한마디" */
export function LogLine({ entry }) {
  if (!entry) return null;
  const parts = [entry.cost ? won(entry.cost) : null, placeRatingLabel(entry.rating)].filter(Boolean);
  return (
    <div className="text-xs text-ink">
      {parts.length > 0 && <span className="font-bold">{parts.join(' · ')}</span>}
      {entry.note && <span className="text-sub">{parts.length ? ' · ' : ''}{entry.note}</span>}
    </div>
  );
}

/** 장소 기록 입력 (쓴 돈 · 좋았어요/보통/별로 · 한마디) */
export function LogEditor({ entry, onDone, onCancel }) {
  const [cost, setCost] = useState(entry?.cost ? String(entry.cost) : '');
  const [rating, setRating] = useState(entry?.rating || null);
  const [note, setNote] = useState(entry?.note || '');
  return (
    <form
      className="mt-1 flex flex-col gap-2 rounded-2xl bg-bg p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        onDone({ cost: Number(cost.replace(/[^\d]/g, '')) || 0, rating, note: note.trim() });
      }}
    >
      <label className="flex items-center gap-2 text-xs text-sub">
        쓴 돈
        <input
          autoFocus
          inputMode="numeric"
          value={cost ? Number(cost.replace(/[^\d]/g, '') || 0).toLocaleString('ko-KR') : ''}
          onChange={(e) => setCost(e.target.value.replace(/[^\d]/g, '').slice(0, 8))}
          placeholder="0"
          aria-label="쓴 돈 (원)"
          className="min-w-0 flex-1 rounded-xl bg-surface px-2.5 py-2 text-right text-sm font-bold text-ink outline-none"
        />
        원
      </label>
      <div className="flex gap-1.5" role="group" aria-label="어땠어요?">
        {PLACE_RATINGS.map((r) => (
          <button
            key={r.id}
            type="button"
            aria-pressed={rating === r.id}
            onClick={() => setRating(rating === r.id ? null : r.id)}
            className={`h-11 flex-1 rounded-full text-sm ${rating === r.id ? 'bg-selected text-selected-ink' : 'border-2 border-line bg-surface'}`}
          >
            {r.label}
          </button>
        ))}
      </div>
      <input
        value={note}
        maxLength={100}
        onChange={(e) => setNote(e.target.value)}
        placeholder="한마디 (예: 아이가 제일 좋아했어요)"
        aria-label="한마디"
        className="rounded-xl bg-surface px-2.5 py-2 text-sm outline-none"
      />
      <div className="flex gap-1.5">
        <button type="button" onClick={onCancel} className="h-11 flex-1 rounded-xl border-2 border-line bg-surface text-sm text-sub">
          닫기
        </button>
        <button type="submit" className="h-11 flex-1 rounded-xl bg-selected text-sm text-selected-ink">
          완료
        </button>
      </div>
    </form>
  );
}

/** 장소에 안 붙는 지출 (항공권·렌터카·숙소 등) */
export function ExtrasEditor({ extras, onChange }) {
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const add = () => {
    const n = Number(amount.replace(/[^\d]/g, '')) || 0;
    if (!label.trim() || !n) return;
    onChange([...extras, { label: label.trim().slice(0, 30), amount: n }].slice(0, 10));
    setLabel('');
    setAmount('');
  };
  return (
    <div className="flex flex-col gap-1.5">
      {extras.map((e, i) => (
        <div key={`${e.label}-${i}`} className="flex items-center gap-2 rounded-xl bg-bg px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate">{e.label}</span>
          <span className="font-bold">{won(e.amount)}</span>
          <button type="button" onClick={() => onChange(extras.filter((_, k) => k !== i))} aria-label={`${e.label} 지우기`} className="h-9 px-2 text-xs text-sub underline">
            지우기
          </button>
        </div>
      ))}
      {extras.length < 10 && (
        <div className="flex gap-1.5">
          <input
            value={label}
            maxLength={30}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="항목 (예: 렌터카)"
            aria-label="지출 항목"
            className="min-w-0 flex-[3] rounded-xl bg-bg px-2.5 py-2 text-sm outline-none"
          />
          <input
            inputMode="numeric"
            value={amount ? Number(amount).toLocaleString('ko-KR') : ''}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, '').slice(0, 8))}
            placeholder="금액"
            aria-label="지출 금액 (원)"
            className="min-w-0 flex-[2] rounded-xl bg-bg px-2.5 py-2 text-right text-sm outline-none"
          />
          <button type="button" onClick={add} className="h-11 flex-none rounded-xl bg-selected px-3 text-sm text-selected-ink">
            추가
          </button>
        </div>
      )}
    </div>
  );
}

/** 여행 전체 만족도 + 한마디 입력 */
export function ReviewEditor({ rating, comment, onChange }) {
  const [text, setText] = useState(comment || '');
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="여행 만족도">
        {TRIP_RATINGS.map((r) => (
          <button
            key={r.id}
            type="button"
            aria-pressed={rating === r.id}
            onClick={() => onChange({ rating: rating === r.id ? null : r.id, comment: text.trim() })}
            className={`h-11 rounded-full px-3.5 text-sm ${rating === r.id ? 'bg-selected text-selected-ink' : 'border-2 border-line bg-surface'}`}
          >
            {r.label}
          </button>
        ))}
      </div>
      <textarea
        rows={2}
        maxLength={300}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text.trim() !== (comment || '') && onChange({ rating, comment: text.trim() })}
        placeholder="여행 한마디 (예: 다음엔 서쪽에 하루 더 있고 싶어요)"
        aria-label="여행 한마디"
        className="resize-none rounded-xl bg-bg px-3 py-2 text-sm outline-none"
      />
    </div>
  );
}

/** 남이 보는 기록 요약 (공개 루트·공유 링크) */
export function LogSummary({ log, days }) {
  const t = logTotals(log, days);
  if (!t.total && !log.rating && !log.comment) return null;
  return (
    <div className="card flex flex-col gap-2 p-4">
      <div className="font-display text-base">다녀온 기록</div>
      {t.total > 0 && (
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-sub">실제로 쓴 돈</span>
          <span className="font-display text-lg">{won(t.total)}</span>
        </div>
      )}
      {log.extras?.length > 0 && <div className="text-xs text-sub">{log.extras.map((e) => `${e.label} ${won(e.amount)}`).join(' · ')}</div>}
      {log.rating && <div className="text-sm font-bold">{tripRatingLabel(log.rating)}</div>}
      {log.comment && <div className="whitespace-pre-line text-sm leading-relaxed">{log.comment}</div>}
    </div>
  );
}
