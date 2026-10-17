'use client';
import { Fragment, useMemo, useState, useTransition } from 'react';
import { TopBar } from '@/components/ui';
import { CATEGORIES, COMPANIONS, REGIONS, WEEKDAYS } from '@/lib/config';
import { createPlace, draftIntro, resolveReport, setAiRouteActive, setPlacesStatus, updatePlace } from './actions';

const STATUS = { candidate: '후보', approved: '승인', excluded: '제외' };
const REPORT_TYPES = { closed: '휴무·폐업', info: '정보 변경', tag: '아이 태그' };

export default function AdminPanel({ places: initialPlaces, tags, reports: initialReports, aiRoutes = [], metrics }) {
  const [tab, setTab] = useState('places');
  const [places, setPlaces] = useState(initialPlaces);
  const [reports, setReports] = useState(initialReports);
  const placeName = useMemo(() => Object.fromEntries(places.map((p) => [p.id, p.name])), [places]);
  const tagLabel = useMemo(() => Object.fromEntries(tags.map((t) => [t.id, t.label])), [tags]);

  return (
    <>
      <TopBar back="/my" title="운영자 화면" sub="장소 검수 · 제보 · AI 루트 · 지표" />
      <nav className="grid grid-cols-4 gap-1.5 px-5 pb-3" role="tablist">
        {[
          ['places', `장소 ${places.length}`],
          ['reports', `제보 ${reports.length}`],
          ['routes', `AI 루트 ${aiRoutes.length}`],
          ['metrics', '지표'],
        ].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`pill ${tab === id ? 'pill-on' : ''}`}>
            {label}
          </button>
        ))}
      </nav>
      <main className="flex flex-1 flex-col gap-3 px-5 pb-10">
        {tab === 'places' && <PlacesTab places={places} setPlaces={setPlaces} tags={tags} />}
        {tab === 'reports' && (
          <ReportsTab reports={reports} placeName={placeName} tagLabel={tagLabel} onResolved={(id) => setReports((r) => r.filter((x) => x.id !== id))} />
        )}
        {tab === 'routes' && <AiRoutesTab routes={aiRoutes} />}
        {tab === 'metrics' && (
          <div className="grid grid-cols-2 gap-2">
            {metrics.map((m) => (
              <div key={m.label} className="card flex flex-col gap-0.5 p-4">
                <div className="text-xs text-sub">{m.label}</div>
                <div className="font-display text-2xl">{m.value}</div>
                {m.hint && <div className="text-[11px] text-sub">{m.hint}</div>}
              </div>
            ))}
            <p className="col-span-2 m-0 text-xs text-sub">최근 90일 기준. 목표 수치는 첫 달 데이터를 보고 정해요.</p>
          </div>
        )}
      </main>
    </>
  );
}

function AiRoutesTab({ routes: initial }) {
  const [routes, setRoutes] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const region = (id) => REGIONS.find((r) => r.id === id)?.short || id;
  const companion = (id) => COMPANIONS.find((c) => c.id === id)?.label || id;

  if (!routes.length) {
    return (
      <div className="card p-4 text-sm text-sub">
        아직 넣은 AI 루트가 없어요. docs/ai-routes.md 순서대로 루트를 만들어 SQL을 실행하면 여기에 보여요. 루트가 없으면 AI 초안은 가까운 곳 위주 규칙으로 채워요.
      </div>
    );
  }
  return (
    <>
      <p className="m-0 text-xs text-sub">
        켜진 루트 {routes.filter((r) => r.is_active).length}개 · 끈 루트는 AI 초안에서 고르지 않아요. 내용 수정은 data/ai-routes 파일을 고친 뒤 SQL을 다시 실행해요.
      </p>
      {msg && <p className="m-0 text-xs font-bold text-warn-ink">{msg}</p>}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {routes.map((r) => (
          <li key={r.id} className={`card flex items-center gap-3 p-3.5 ${r.is_active ? '' : 'opacity-60'}`}>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">{r.title}</div>
              <div className="text-xs text-sub">
                {region(r.region)} · {companion(r.companion_type)} · {r.day_count}일 · 꺼내 쓴 횟수 {r.pick_count}
              </div>
              <div className="truncate text-[11px] text-sub">{r.code}</div>
            </div>
            <button
              type="button"
              disabled={pending}
              aria-pressed={r.is_active}
              onClick={() =>
                start(async () => {
                  setMsg(null);
                  const res = await setAiRouteActive(r.id, !r.is_active);
                  if (!res.ok) return setMsg(res.message);
                  setRoutes((all) => all.map((x) => (x.id === r.id ? { ...x, is_active: !x.is_active } : x)));
                })
              }
              className={`h-11 flex-none rounded-full px-4 text-xs ${r.is_active ? 'bg-selected text-selected-ink' : 'border-2 border-line bg-surface'}`}
            >
              {r.is_active ? '켜짐' : '꺼짐'}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

const FLAG_LABELS = {
  hours_missing: '영업시간 없음',
  hours_check: '영업시간 확인',
  hours_seasonal: '계절별 시간',
  hours_break: '브레이크타임',
  closed_monthly: '월 단위 휴무',
  closed_irregular: '부정기 휴무',
  closed_check: '휴무 확인',
  no_detail: '상세 미수집',
  region_check: '지역 확인',
};
const PAGE = 30;
const KID_ONLY = ['baby_chair', 'kids_menu', 'stroller', 'nursing', 'floor_seat', 'foot_wash', 'kids_zone'];

function PlacesTab({ places, setPlaces, tags }) {
  const [filter, setFilter] = useState('candidate');
  const [region, setRegion] = useState('');
  const [category, setCategory] = useState('');
  const [check, setCheck] = useState('');
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [selected, setSelected] = useState(() => new Set());
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState(null);
  const [pending, start] = useTransition();

  const list = useMemo(() => {
    const term = q.trim();
    return places.filter(
      (p) =>
        (filter === 'all' || p.status === filter) &&
        (!region || p.region === region) &&
        (!category || p.category === category) &&
        (!term || p.name.includes(term) || (p.address || '').includes(term) || (p.sub_category || '').includes(term)) &&
        (!check ||
          (check === 'flags' && p.source_data?.flags?.length > 0) ||
          (check === 'notags' && !p.kid_tags?.some((t) => KID_ONLY.includes(t))) ||
          (check === 'nohours' && !p.opening_hours))
    );
  }, [places, filter, region, category, check, q]);

  const replace = (p) => setPlaces((all) => all.map((x) => (x.id === p.id ? p : x)));
  const visible = list.slice(0, shown);
  const toggleSel = (id) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  function bulk(status) {
    const ids = [...selected];
    if (!ids.length) return;
    start(async () => {
      setMsg(null);
      const res = await setPlacesStatus(ids, status);
      if (!res.ok) return setMsg(res.message);
      const picked = new Set(ids);
      setPlaces((all) => all.map((x) => (picked.has(x.id) ? { ...x, status } : x)));
      setSelected(new Set());
      setMsg(`${ids.length}곳을 ${STATUS[status]}했어요`);
    });
  }

  const sel = 'rounded-xl bg-surface px-2 py-2 text-xs';
  return (
    <>
      <div className="flex gap-1.5 overflow-x-auto">
        {[['candidate', '후보'], ['approved', '승인'], ['excluded', '제외'], ['all', '전체']].map(([id, l]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setFilter(id);
              setShown(PAGE);
              setSelected(new Set());
            }}
            className={`pill whitespace-nowrap ${filter === id ? 'pill-on' : ''}`}
          >
            {l} {id === 'all' ? places.length : places.filter((p) => p.status === id).length}
          </button>
        ))}
        <button type="button" onClick={() => setAdding(!adding)} className="pill ml-auto whitespace-nowrap">
          {adding ? '닫기' : '+ 장소 추가'}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <select className={sel} value={region} onChange={(e) => setRegion(e.target.value)} aria-label="지역 필터">
          <option value="">지역 전체</option>
          {REGIONS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.short}
            </option>
          ))}
        </select>
        <select className={sel} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="종류 필터">
          <option value="">종류 전체</option>
          {Object.entries(CATEGORIES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select className={sel} value={check} onChange={(e) => setCheck(e.target.value)} aria-label="확인 필요 필터">
          <option value="">확인 전체</option>
          <option value="flags">확인 필요 표시</option>
          <option value="notags">아이 태그 없음</option>
          <option value="nohours">영업시간 없음</option>
        </select>
      </div>
      <input className="rounded-xl bg-surface px-3 py-2 text-sm outline-none" placeholder="이름·주소·세부 검색" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-sub">
        <span className="min-w-0 flex-1">
          {list.length}곳{selected.size > 0 && ` · ${selected.size}곳 선택`}
          {msg && <b className="ml-1 text-ink">{msg}</b>}
        </span>
        <button type="button" onClick={() => setSelected(new Set(visible.map((p) => p.id)))} className="rounded-full bg-surface px-3 py-2">
          보이는 것 선택
        </button>
        <button type="button" disabled={pending || !selected.size} onClick={() => bulk('approved')} className="rounded-full bg-ok px-3 py-2 text-white disabled:opacity-40">
          선택 승인
        </button>
        <button type="button" disabled={pending || !selected.size} onClick={() => bulk('excluded')} className="rounded-full bg-soft px-3 py-2 text-ink disabled:opacity-40">
          선택 제외
        </button>
      </div>
      {adding && (
        <PlaceForm
          tags={tags}
          onSaved={(p) => {
            setPlaces((all) => [p, ...all]);
            setAdding(false);
            setFilter('candidate');
          }}
        />
      )}
      {visible.map((p) => (
        <PlaceForm key={p.id} place={p} tags={tags} onSaved={replace} selected={selected.has(p.id)} onSelect={() => toggleSel(p.id)} />
      ))}
      {list.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + PAGE)} className="h-11 rounded-2xl bg-surface text-sm">
          더 보기 ({list.length - shown}곳 남음)
        </button>
      )}
      {!list.length && <div className="card p-5 text-center text-sm text-sub">조건에 맞는 장소가 없어요</div>}
    </>
  );
}

/** TourAPI 원문 힌트 (운영자가 시간·태그를 확인할 때 참고) */
function SourceHints({ data }) {
  if (!data) return null;
  const rows = [
    ['영업시간', data.hoursText],
    ['휴무', data.closedText],
    ['유모차', data.strollerText],
    ['수유실', data.nursingText],
    ['유아 의자', data.babyChairText],
    ['놀이방', data.kidsText],
    ['주차', data.parkingText],
    ['메뉴', data.menuText],
    ['체험 연령', data.ageText],
  ].filter(([, v]) => v);
  return (
    <div className="rounded-xl bg-bg px-3 py-2 text-xs text-sub">
      <div className="mb-1 font-bold text-ink">
        TourAPI 원문{data.type ? ` · ${data.type}` : ''}
        {data.flags?.length > 0 && <span className="ml-1 text-warn-ink">· {data.flags.map((f) => FLAG_LABELS[f] || f).join(', ')}</span>}
      </div>
      {rows.length ? (
        <dl className="m-0 grid grid-cols-[64px_1fr] gap-x-2 gap-y-0.5">
          {rows.map(([k, v]) => (
            <Fragment key={k}>
              <dt>{k}</dt>
              <dd className="m-0 whitespace-pre-line text-ink">{v}</dd>
            </Fragment>
          ))}
        </dl>
      ) : (
        <div>상세 정보 없음</div>
      )}
    </div>
  );
}

function PlaceForm({ place, tags, onSaved, selected = false, onSelect }) {
  const isNew = !place;
  const h = place?.opening_hours?.all || {};
  // 요일별 시간("0".."6")은 이 폼에서 고치지 않지만 저장할 때 지우지 않게 같이 보낸다
  const overrides = Object.fromEntries(Object.entries(place?.opening_hours || {}).filter(([k]) => k !== 'all'));
  const [f, setF] = useState({
    name: place?.name || '',
    category: place?.category || 'food',
    sub_category: place?.sub_category || '',
    region: place?.region || 'jeju-west',
    lat: place?.lat ?? '',
    lng: place?.lng ?? '',
    hours: { open: h.open || '', close: h.close || '', lastOrder: h.lastOrder || '' },
    hoursOverrides: overrides,
    address: place?.address || '',
    regular_closed_days: place?.regular_closed_days || [],
    kid_tags: place?.kid_tags || [],
    indoor: !!place?.indoor,
    intro: place?.intro || '',
    map_url: place?.external_links?.map || '',
    blog_url: place?.external_links?.blog || '',
  });
  const [open, setOpen] = useState(isNew);
  const [msg, setMsg] = useState(null);
  const [pending, start] = useTransition();
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const toggle = (k, v) => set(k, f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v]);

  function save(extra = {}) {
    start(async () => {
      const res = isNew ? await createPlace(f) : await updatePlace(place.id, { ...f, ...extra });
      if (!res.ok) return setMsg(res.message);
      setMsg('저장했어요');
      onSaved(res.place);
    });
  }

  const input = 'w-full rounded-xl bg-bg px-2.5 py-2 text-sm outline-none';

  return (
    <div className="card flex flex-col gap-2 p-4">
      {!isNew && (
        <div className="flex items-center gap-2">
          {onSelect && <input type="checkbox" checked={selected} onChange={onSelect} aria-label={`${place.name} 선택`} className="h-5 w-5 flex-none" />}
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="min-w-0 flex-1 text-left">
            <div className="truncate font-display text-base">{place.name}</div>
            <div className="text-xs text-sub">
              {CATEGORIES[place.category]} · {REGIONS.find((r) => r.id === place.region)?.short} · {STATUS[place.status]}
              {place.is_sample && ' · 샘플'}
              {place.source_provider === 'tourapi' && ' · TourAPI'}
              {place.source_data?.flags?.length > 0 && <span className="text-warn-ink"> · 확인 {place.source_data.flags.length}</span>}
            </div>
          </button>
          {place.status !== 'approved' && (
            <button type="button" disabled={pending} onClick={() => save({ status: 'approved' })} className="rounded-full bg-ok px-3 py-2 text-xs text-white">
              승인
            </button>
          )}
          {place.status !== 'excluded' && (
            <button type="button" disabled={pending} onClick={() => save({ status: 'excluded' })} className="rounded-full bg-soft px-3 py-2 text-xs">
              제외
            </button>
          )}
        </div>
      )}
      {open && (
        <div className="flex flex-col gap-2">
          <SourceHints data={place?.source_data} />
          <input className={input} placeholder="이름 (실존 업체명은 공식 API/직접 확인한 것만)" value={f.name} onChange={(e) => set('name', e.target.value)} />
          <input className={input} placeholder="주소" value={f.address} onChange={(e) => set('address', e.target.value)} />
          <div className="grid grid-cols-3 gap-1.5">
            <select className={input} value={f.category} onChange={(e) => set('category', e.target.value)} aria-label="종류">
              {Object.entries(CATEGORIES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <input className={input} placeholder="세부 (고기국수)" value={f.sub_category} onChange={(e) => set('sub_category', e.target.value)} />
            <select className={input} value={f.region} onChange={(e) => set('region', e.target.value)} aria-label="지역">
              {REGIONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.short}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <input className={input} placeholder="위도 33.xx" inputMode="decimal" value={f.lat} onChange={(e) => set('lat', e.target.value)} />
            <input className={input} placeholder="경도 126.xx" inputMode="decimal" value={f.lng} onChange={(e) => set('lng', e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-1.5 text-xs text-sub">
            {[['open', '여는 시간'], ['close', '닫는 시간'], ['lastOrder', '라스트오더']].map(([k, l]) => (
              <label key={k} className="flex flex-col gap-0.5">
                {l}
                <input type="time" className={input} value={f.hours[k]} onChange={(e) => set('hours', { ...f.hours, [k]: e.target.value })} />
              </label>
            ))}
          </div>
          {Object.keys(f.hoursOverrides).length > 0 && (
            <div className="text-xs text-sub">
              요일별 시간:{' '}
              {Object.entries(f.hoursOverrides)
                .map(([d, v]) => `${WEEKDAYS[d]} ${v.open}~${v.close}`)
                .join(', ')}{' '}
              <button type="button" onClick={() => set('hoursOverrides', {})} className="underline">
                지우기
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1 text-xs text-sub">
            정기휴무
            {WEEKDAYS.map((w, i) => (
              <button
                key={w}
                type="button"
                aria-pressed={f.regular_closed_days.includes(i)}
                onClick={() => toggle('regular_closed_days', i)}
                className={`h-8 w-8 rounded-full text-xs ${f.regular_closed_days.includes(i) ? 'bg-cta text-white' : 'bg-bg text-ink'}`}
              >
                {w}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <label key={t.id} className={`flex items-center gap-1 rounded-xl px-2 py-1 text-xs ${f.kid_tags.includes(t.id) ? 'bg-tag text-tag-ink' : 'bg-bg'}`}>
                <input type="checkbox" checked={f.kid_tags.includes(t.id)} onChange={() => toggle('kid_tags', t.id)} />
                {t.label}
              </label>
            ))}
            <label className={`flex items-center gap-1 rounded-xl px-2 py-1 text-xs ${f.indoor ? 'bg-sky' : 'bg-bg'}`}>
              <input type="checkbox" checked={f.indoor} onChange={(e) => set('indoor', e.target.checked)} />
              실내
            </label>
          </div>
          <textarea className={`${input} resize-none`} rows={2} placeholder="소개 문장 (운영자 검수)" value={f.intro} onChange={(e) => set('intro', e.target.value)} />
          <div className="grid grid-cols-2 gap-1.5">
            <input className={input} placeholder="지도 링크 https://" value={f.map_url} onChange={(e) => set('map_url', e.target.value)} />
            <input className={input} placeholder="블로그 링크 https://" value={f.blog_url} onChange={(e) => set('blog_url', e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            {!isNew && (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await draftIntro(place.id);
                    if (res.ok) set('intro', res.intro);
                    else setMsg(res.message);
                  })
                }
                className="rounded-full border-2 border-ink px-3 py-2 text-xs"
              >
                소개 초안 만들기
              </button>
            )}
            {msg && <span className="text-xs text-sub">{msg}</span>}
            <button type="button" disabled={pending} onClick={() => save()} className="ml-auto rounded-full bg-cta px-4 py-2 text-sm text-white">
              {pending ? '저장 중…' : isNew ? '후보로 추가' : '저장'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReportsTab({ reports, placeName, tagLabel, onResolved }) {
  const [pending, start] = useTransition();
  if (!reports.length) return <div className="card p-5 text-center text-sm text-sub">처리할 제보가 없어요</div>;
  return reports.map((r) => (
    <div key={r.id} className="card flex flex-col gap-1.5 p-4">
      <div className="flex items-center gap-2">
        <span className="rounded-xl bg-warn px-2 py-0.5 text-xs text-warn-ink">{REPORT_TYPES[r.type]}</span>
        <span className="truncate font-display text-base">{placeName[r.place_id] || `장소 #${r.place_id}`}</span>
      </div>
      {r.message && <div className="text-sm">{r.message}</div>}
      {r.payload?.tags?.length > 0 && <div className="text-xs text-sub">추가 태그: {r.payload.tags.map((t) => tagLabel[t] || t).join(', ')}</div>}
      <div className="text-[11px] text-sub">{new Date(r.created_ts).toLocaleString('ko-KR')}</div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => (await resolveReport(r.id, 'applied')).ok && onResolved(r.id))}
          className="rounded-full bg-ok px-3 py-2 text-xs text-white"
        >
          {r.type === 'tag' ? '태그 반영' : '반영함'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => (await resolveReport(r.id, 'rejected')).ok && onResolved(r.id))}
          className="rounded-full bg-soft px-3 py-2 text-xs"
        >
          반려
        </button>
      </div>
    </div>
  ));
}
