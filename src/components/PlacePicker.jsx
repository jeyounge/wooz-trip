'use client';
import { useEffect, useMemo, useState } from 'react';
import Sheet from './Sheet';
import { IconCheck, IconSearch } from './Icons';
import { KidTags } from './ui';
import { SLOT_TYPES } from '@/lib/config';
import { blogLink, mapLink, placeMeta } from '@/lib/format';

const TITLES = {
  am: '오전에 어디 갈까?',
  lunch: '점심, 어디서 먹을까?',
  pm: '오후엔 어디 갈까?',
  cafe: '카페는 어디로?',
  dinner: '저녁, 어디서 먹을까?',
  extra: '어디 들를까?',
  golf: '어디서 칠까?',
};

/**
 * S04 장소 선택 바텀시트
 * - 앞 장소 기준 가까운 순, 아이 태그 필터, 쉬는 날은 선택 불가, 영업시간 임박 경고
 * - 사진·리뷰·블로그는 저장하지 않고 외부 링크로만 연결
 */
export default function PlacePicker({ date, dayLabel, slot, from, tags, companion, excludeIds, onPick, onReport, onClose }) {
  const filterTags = useMemo(() => tags.filter((t) => t.filterable), [tags]);
  const [on, setOn] = useState(() =>
    companion === 'kids' && SLOT_TYPES[slot.slotType]?.categories.includes('food') ? { baby_chair: true } : {}
  );
  const [q, setQ] = useState('');
  const [state, setState] = useState({ loading: true, error: null, list: [] });

  const active = Object.keys(on).filter((k) => on[k]);
  const query = useMemo(() => {
    const p = new URLSearchParams({
      date,
      time: slot.time,
      slotType: slot.slotType,
      stay: String(slot.stayMinutes || ''),
    });
    if (from?.point) {
      p.set('lat', from.point.lat);
      p.set('lng', from.point.lng);
    }
    if (active.length) p.set('tags', active.join(','));
    if (q.trim()) p.set('q', q.trim());
    if (excludeIds.length) p.set('exclude', excludeIds.join(','));
    return p.toString();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, slot.time, slot.slotType, slot.stayMinutes, from, active.join(','), q, excludeIds.join(',')]);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places?${query}`);
        const json = await res.json();
        if (!alive) return;
        if (!json.ok) throw new Error(json.message);
        setState({ loading: false, error: null, list: json.data });
      } catch (e) {
        if (alive) setState({ loading: false, error: e.message, list: [] });
      }
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query]);

  const tagLabels = useMemo(() => Object.fromEntries(tags.map((t) => [t.id, t.label])), [tags]);
  const sub = `${dayLabel} ${slot.time}${from?.name ? ` · ${from.name}에서 가까운 순` : ''}`;
  const openCount = state.list.filter((p) => !p.check.closed).length;

  return (
    <Sheet title={TITLES[slot.slotType] || '어디로 갈까?'} sub={sub} onClose={onClose} tall>
      <div className="flex flex-col gap-2 px-5 pb-3">
        <label className="flex h-11 items-center gap-2 rounded-2xl bg-surface px-3.5 text-sub">
          <IconSearch size={18} />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="장소 이름으로 찾기"
            aria-label="장소 이름 검색"
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none"
          />
        </label>
        <div className="text-[13px] text-sub">우리 아이한테 꼭 필요한 건?</div>
        <div className="grid grid-cols-3 gap-1.5">
          {filterTags.map((t) => {
            const v = !!on[t.id];
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={v}
                onClick={() => setOn({ ...on, [t.id]: !v })}
                className={`flex h-11 items-center gap-2 rounded-2xl border-2 bg-surface px-2.5 text-sm ${v ? 'border-ink' : 'border-line'}`}
              >
                <span
                  className={`flex h-5 w-5 flex-none items-center justify-center rounded-[7px] text-white ${
                    v ? 'bg-cta' : 'border-2 border-line-strong'
                  }`}
                >
                  {v && <IconCheck size={12} />}
                </span>
                <span className="truncate">{t.label}</span>
              </button>
            );
          })}
        </div>
        <div className="text-xs text-sub" aria-live="polite">
          {state.loading ? '찾는 중…' : `조건에 맞는 곳 ${openCount}곳 · 검수된 장소만 보여요`}
        </div>
      </div>

      <div className="flex flex-col gap-3 px-5 pt-1 pb-8">
        {state.error && <div className="warn-box">{state.error.includes('does not exist') ? 'DB 테이블이 아직 없어요. SQL 을 먼저 실행해 주세요.' : state.error}</div>}
        {!state.loading && !state.error && state.list.length === 0 && (
          <div className="card p-5 text-center text-sm text-sub">조건에 맞는 장소가 없어요. 필터를 줄여 보세요.</div>
        )}
        {state.list.map((p, i) => {
          const closed = p.check.closed;
          const firstOpen = !closed && state.list.findIndex((x) => !x.check.closed) === i;
          const badge = closed ? '쉬는 날' : firstOpen && from ? '제일 가까워요' : active.length ? '조건 딱 맞음' : null;
          return (
            <article
              key={p.id}
              className={`flex flex-col gap-2 rounded-card p-4 ${closed ? 'bg-[#F6EEE5] opacity-80' : 'bg-surface shadow-card'}`}
            >
              <div className="flex items-center gap-2">
                {badge && (
                  <span
                    className={`rounded-xl px-2.5 py-1 text-xs font-bold ${
                      closed ? 'bg-[#EADFD3] text-[#6B5445]' : firstOpen && from ? 'bg-accent' : 'border-[1.5px] border-line bg-surface'
                    }`}
                  >
                    {badge}
                  </span>
                )}
                {p.travel !== null && <span className="ml-auto text-[13px] font-bold text-ok">차로 {p.travel || 1}분</span>}
              </div>
              <div className="font-display text-lg leading-snug">{p.name}</div>
              <div className="text-[13px] text-sub">{placeMeta(p, date)}</div>
              <KidTags ids={p.kid_tags} labels={tagLabels} max={5} />
              {p.check.message && (
                <div className={`rounded-[14px] px-2.5 py-2 text-[13px] font-bold ${p.check.level === 'warn' ? 'bg-warn text-warn-ink' : 'bg-bg text-sub'}`}>
                  {closed ? '이 날은 쉬는 날이라 고를 수 없어요' : p.check.message}
                </div>
              )}
              <div className="flex items-center gap-3">
                <a href={mapLink(p)} target="_blank" rel="noopener noreferrer" className="text-[13px] text-ok underline">
                  사진·리뷰 보기
                </a>
                <a href={blogLink(p)} target="_blank" rel="noopener noreferrer" className="text-[13px] text-ok underline">
                  블로그 후기
                </a>
                <button type="button" onClick={() => onReport(p)} className="text-xs text-sub underline">
                  정보 제보
                </button>
                {!closed && (
                  <button type="button" onClick={() => onPick(p)} className="ml-auto flex h-11 items-center rounded-full bg-cta px-5 font-display text-base text-cta-ink">
                    여기로!
                  </button>
                )}
              </div>
            </article>
          );
        })}
        <p className="m-0 px-1 pb-2 text-center text-[11px] text-sub">장소 기본 정보 일부 출처: 한국관광공사 TourAPI · 방문 전 영업 여부를 한 번 더 확인해 주세요</p>
      </div>
    </Sheet>
  );
}
