'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import Sheet from './Sheet';
import { createReport } from '@/app/actions/trips';

const TYPES = [
  { id: 'closed', label: '문을 닫았어요 / 휴무가 달라요' },
  { id: 'info', label: '영업시간·정보가 달라요' },
  { id: 'tag', label: '아이 편의시설 정보 추가' },
];

/**
 * 장소 정보 제보 바텀시트.
 * places 를 넘기면 장소를 고를 수 있다 (공개 루트 상세에서 사용).
 */
export default function ReportSheet({ place, places, tripId, tags, onClose }) {
  const [placeId, setPlaceId] = useState(place?.id || places?.[0]?.id || '');
  const [type, setType] = useState('closed');
  const [picked, setPicked] = useState([]);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState(null);
  const [pending, start] = useTransition();

  const target = place || places?.find((p) => p.id === Number(placeId));

  function submit() {
    start(async () => {
      const res = await createReport({ placeId, tripId, type, message, tags: picked });
      setResult(res);
    });
  }

  return (
    <Sheet title="정보가 바뀌었나요? 알려주기" sub={target?.name} onClose={onClose}>
      {result?.ok ? (
        <div className="flex flex-col gap-3 px-5 pb-8">
          <p className="m-0 text-[15px] leading-relaxed">고마워요! 운영자가 확인한 뒤 다음 가족들의 추천에 반영할게요.</p>
          <button type="button" onClick={onClose} className="btn-cta">
            닫기
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-5 pb-8">
          {places && !place && (
            <label className="field bg-surface">
              어느 장소인가요?
              <select value={placeId} onChange={(e) => setPlaceId(e.target.value)}>
                {places.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="제보 종류">
            {TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={type === t.id}
                onClick={() => setType(t.id)}
                className={`flex h-12 items-center rounded-2xl border-2 bg-surface px-4 text-left text-sm ${type === t.id ? 'border-ink font-bold' : 'border-line'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {type === 'tag' && (
            <div className="flex flex-wrap gap-1.5">
              {tags
                .filter((t) => t.filterable)
                .map((t) => {
                  const v = picked.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={v}
                      onClick={() => setPicked(v ? picked.filter((x) => x !== t.id) : [...picked, t.id])}
                      className={`pill ${v ? 'pill-on' : ''}`}
                    >
                      {t.label}
                    </button>
                  );
                })}
            </div>
          )}
          <label className="field bg-surface">
            자세히 (선택)
            <textarea rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} className="resize-none font-normal" placeholder="예: 매주 화요일도 쉬어요" />
          </label>
          {result && !result.ok && (
            <p className="m-0 text-sm font-bold text-warn-ink">
              {result.message}{' '}
              {result.message.includes('로그인') && (
                <Link href="/login" className="underline">
                  로그인
                </Link>
              )}
            </p>
          )}
          <button type="button" disabled={pending || !placeId} onClick={submit} className="btn-cta">
            {pending ? '보내는 중…' : '제보하기'}
          </button>
        </div>
      )}
    </Sheet>
  );
}
