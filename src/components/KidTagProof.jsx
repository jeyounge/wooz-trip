'use client';
import { useState } from 'react';
import { IconCheck } from './Icons';

/**
 * 아이 태그 + 후기 근거. 근거가 있는 태그는 체크 표시가 붙고, 누르면 「후기 N곳에서 확인」과 원문 링크.
 * 후기 본문은 보여 주지 않는다 (원문 링크만).
 */
/** proof = loadTagProofs() 의 한 장소 값 */
export default function KidTagProof({ proof = {}, tags, tagLabels, extra = null }) {
  const [open, setOpen] = useState(null);
  if (!tags.length && !extra) return null;
  const p = open && proof[open];
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1">
        {extra}
        {tags.map((t) =>
          proof[t] ? (
            <button
              key={t}
              type="button"
              aria-expanded={open === t}
              onClick={() => setOpen(open === t ? null : t)}
              className="kid-tag inline-flex items-center gap-1"
              title="후기 근거 보기"
            >
              {tagLabels[t]}
              <IconCheck size={11} />
            </button>
          ) : (
            <span key={t} className="kid-tag">
              {tagLabels[t]}
            </span>
          )
        )}
      </div>
      {p && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[12px] bg-bg px-2.5 py-1.5 text-xs">
          <span>
            <b>{tagLabels[open]}</b> · 후기 {p.count}곳에서 확인
          </span>
          {p.links.map((l, i) => (
            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="flex min-h-8 items-center text-ok underline">
              {l.date ? l.date.slice(2, 7).replace('-', '.') : `글${i + 1}`}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
