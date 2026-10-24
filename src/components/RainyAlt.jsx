import { mapLink } from '@/lib/format';
import { IconUmbrella } from './Icons';

/** 야외 장소 아래 "비 오면 여기" 한 줄 (가까운 실내 볼거리, 누르면 지도) */
export default function RainyAlt({ alt, tagLabels = {} }) {
  if (!alt) return null;
  const tag = alt.kidTags?.map((t) => tagLabels[t]).find(Boolean);
  return (
    <a
      href={mapLink(alt)}
      target="_blank"
      rel="noopener noreferrer"
      className="flex min-h-11 items-center gap-2 rounded-[12px] border border-dashed border-line px-2.5 py-1.5 text-[13px] no-underline"
    >
      <span className="flex-none text-[#2F4A8A]">
        <IconUmbrella size={18} />
      </span>
      <span className="min-w-0 flex-1 leading-snug">
        <span className="text-sub">비 오면 </span>
        <b className="font-normal text-ink underline">{alt.name}</b>
        <span className="text-sub">
          {' '}
          · 실내 · 차로 {alt.minutes}분{tag ? ` · ${tag}` : ''}
        </span>
      </span>
    </a>
  );
}
