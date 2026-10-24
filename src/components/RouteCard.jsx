import Link from 'next/link';
import { COMPANIONS, REGIONS } from '@/lib/config';
import { isEditorRoute } from '@/lib/format';
import { IconMap, IconUmbrella, IconWave } from './Icons';

const ICONS = [
  { bg: 'bg-mint', color: '#1E5A45', Icon: IconWave },
  { bg: 'bg-sky', color: '#2F4A8A', Icon: IconUmbrella },
  { bg: 'bg-peach', color: '#9E3520', Icon: IconMap },
];

/** 공개 루트 카드 (S01 홈, 둘러보기 목록) */
export default function RouteCard({ route, index = 0, placeCount, query = '' }) {
  const look = ICONS[index % ICONS.length];
  const region = REGIONS.find((r) => r.id === route.region)?.short || '제주';
  const companion = COMPANIONS.find((c) => c.id === route.companion_type)?.label;
  const n = route.days?.length || 1;
  return (
    <Link href={`/routes/${route.id}${query ? `?${query}` : ''}`} className="card flex items-center gap-3.5 p-3.5 no-underline">
      <div className={`flex h-16 w-16 flex-none items-center justify-center rounded-[18px] ${look.bg}`}>
        <look.Icon color={look.color} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="truncate font-display text-[17px]">{route.title}</div>
        <div className="text-[13px] text-sub">
          {region} · {n === 1 ? '당일' : `${n - 1}박 ${n}일`} · {placeCount}곳
        </div>
        <div className="flex flex-wrap gap-1.5">
          {isEditorRoute(route) && <span className="rounded-xl bg-mint px-[9px] py-[3px] text-xs text-[#1E5A45]">추천</span>}
          {companion && <span className="rounded-xl bg-[#FFE9DF] px-[9px] py-[3px] text-xs text-warn-ink">{companion}</span>}
          {route.copy_count > 0 && (
            <span className="rounded-xl bg-[#FFE9DF] px-[9px] py-[3px] text-xs text-warn-ink">{route.copy_count}가족이 따라감</span>
          )}
        </div>
      </div>
    </Link>
  );
}
