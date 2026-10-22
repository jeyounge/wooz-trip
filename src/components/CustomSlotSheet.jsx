'use client';
import { useState } from 'react';
import Sheet from './Sheet';
import LocationSearch from './LocationSearch';

const EXAMPLES = ['해변에서 물놀이', '근처에서 사진 찍기', '숙소에서 쉬기', '시장 구경'];

/**
 * 직접 넣는 일정 (우리 장소 DB 에 없어도 되는 칸)
 * 예: "곽지해변에서 물놀이", "새별오름 근처에서 사진". 위치는 골라도 되고 안 골라도 된다.
 * 저장 값: { name, address?, lat?, lng? } → 슬롯의 custom
 */
export default function CustomSlotSheet({ initial, initialName = '', near, onSave, onClose }) {
  const [name, setName] = useState(initial?.name || initialName);
  const [loc, setLoc] = useState(
    initial && Number.isFinite(initial.lat) ? { name: initial.address || initial.name, address: initial.address, lat: initial.lat, lng: initial.lng } : null
  );
  const [err, setErr] = useState(null);

  function save() {
    const title = name.trim() || loc?.name?.trim() || '';
    if (!title) return setErr('뭐 할지 적어 주세요');
    const out = { name: title.slice(0, 40) };
    if (loc && Number.isFinite(loc.lat)) {
      out.lat = loc.lat;
      out.lng = loc.lng;
      out.address = [loc.name !== title ? loc.name : null, loc.address].filter(Boolean).join(' · ').slice(0, 120);
    }
    onSave(out);
  }

  return (
    <Sheet title="직접 넣기" sub="우리 목록에 없는 곳이나 하고 싶은 일을 적어요" onClose={onClose}>
      <div className="flex flex-col gap-2.5 px-5 pb-8">
        <label className="field bg-surface">
          뭐 할 거예요?
          <input value={name} maxLength={40} placeholder="예: 해변에서 물놀이" onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((x) => (
            <button key={x} type="button" onClick={() => setName(x)} className="h-9 rounded-full border-2 border-line bg-surface px-3 text-xs">
              {x}
            </button>
          ))}
        </div>
        <LocationSearch
          label="어디서? (선택 · 고르면 이동시간과 지도에 들어가요)"
          placeholder="장소 이름이나 주소"
          value={loc}
          onChange={setLoc}
          near={near}
          fieldClass="bg-surface"
          hint="목록에서 고르면 위치가 들어가요. 안 골라도 괜찮아요"
        />
        {err && <p className="m-0 text-sm font-bold text-warn-ink">{err}</p>}
        <button type="button" onClick={save} className="btn-cta">
          넣기
        </button>
      </div>
    </Sheet>
  );
}
