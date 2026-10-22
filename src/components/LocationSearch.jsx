'use client';
import { useEffect, useRef, useState } from 'react';
import { IconSearch } from './Icons';
import { searchKakao } from '@/app/actions/places';

/**
 * 카카오 장소·주소 검색 입력칸 (숙소, 직접 넣은 일정 위치)
 * - 글자를 치면 0.4초 뒤 검색, 고르면 이름·주소·좌표가 들어간다
 * - 고르지 않고 글자만 쳐도 이름은 남는다 (좌표 없음 → 동선 계산에는 안 쓰임)
 *
 * @param {{ value: {name, address?, lat?, lng?}|null, onChange: (v) => void, near?: {lat,lng}, label, placeholder }} props
 */
export default function LocationSearch({ value, onChange, near = null, label, placeholder = '이름이나 주소로 찾기', hint, fieldClass = '' }) {
  const [q, setQ] = useState(value?.name || '');
  const [state, setState] = useState({ loading: false, error: null, list: [], open: false });
  const picked = value && Number.isFinite(value.lat);
  const seq = useRef(0);

  useEffect(() => {
    const query = q.trim();
    if (!state.open || query.length < 2) return;
    const my = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    const t = setTimeout(async () => {
      const res = await searchKakao(query, near);
      if (my !== seq.current) return;
      setState((s) => ({ ...s, loading: false, error: res.ok ? null : res.message, list: res.ok ? res.data : [] }));
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, state.open]);

  function type(v) {
    setQ(v);
    setState((s) => ({ ...s, open: true }));
    onChange(v.trim() ? { name: v.trim() } : null);
  }

  function pick(item) {
    setQ(item.name);
    setState({ loading: false, error: null, list: [], open: false });
    onChange({ name: item.name, address: item.address, lat: item.lat, lng: item.lng, kakaoId: item.kakaoId || undefined });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className={`field ${fieldClass}`}>
        {label}
        <span className="flex items-center gap-2">
          <input type="text" value={q} maxLength={60} placeholder={placeholder} onChange={(e) => type(e.target.value)} className="min-w-0 flex-1" />
          <span className="text-sub" aria-hidden="true">
            <IconSearch size={18} />
          </span>
        </span>
      </label>
      {picked ? (
        <div className="text-xs text-ok">위치 확인됨 · {value.address || value.name}</div>
      ) : (
        q.trim() && !state.open && <div className="text-xs text-sub">{hint || '목록에서 골라야 위치가 들어가요'}</div>
      )}
      {state.open && q.trim().length >= 2 && (
        <div className="flex max-h-64 flex-col overflow-y-auto rounded-2xl border-2 border-line bg-surface" role="listbox" aria-label="검색 결과">
          {state.loading && <div className="px-3.5 py-3 text-sm text-sub">찾는 중…</div>}
          {state.error && <div className="px-3.5 py-3 text-sm text-warn-ink">{state.error}</div>}
          {!state.loading && !state.error && state.list.length === 0 && <div className="px-3.5 py-3 text-sm text-sub">찾은 곳이 없어요. 주소로도 찾아 보세요</div>}
          {state.list.map((it) => (
            <button
              key={`${it.kakaoId || it.address}`}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => pick(it)}
              className="flex min-h-11 flex-col items-start gap-0.5 border-b border-line px-3.5 py-2 text-left last:border-b-0"
            >
              <span className="text-sm font-bold">{it.name}</span>
              <span className="text-xs text-sub">{[it.kind, it.address].filter(Boolean).join(' · ')}</span>
            </button>
          ))}
          <button type="button" onClick={() => setState((s) => ({ ...s, open: false }))} className="min-h-11 px-3.5 text-left text-xs text-sub underline">
            고르지 않고 이름만 쓸게요
          </button>
        </div>
      )}
    </div>
  );
}
