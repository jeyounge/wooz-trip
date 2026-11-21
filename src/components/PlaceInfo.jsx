import { blogLink, mapLink, placeArea, placeKind } from '@/lib/format';

const linkCls = 'inline-flex min-h-8 items-center text-xs text-ok underline';

function homeOf(place) {
  const h = place?.external_links?.home;
  return typeof h === 'string' && /^https?:\/\//.test(h) ? h : null;
}

/**
 * 일정 칸의 장소 이름 아래 한 줄: 「한식 · 제주시 애월읍」 + 카카오맵 · 후기 · 홈페이지 링크.
 * 사진·리뷰는 저장하지 않으니 원본 페이지로만 보낸다.
 * links=false 면 종류·동네만.
 */
export default function PlaceInfo({ place, links = true }) {
  if (!place) return null;
  const meta = [placeKind(place), placeArea(place.address)].filter(Boolean).join(' · ');
  const home = homeOf(place);
  return (
    <>
      {meta && <div className="truncate text-xs text-sub">{meta}</div>}
      {links && (
        <div className="flex flex-wrap gap-x-3">
          <a href={mapLink(place)} target="_blank" rel="noopener noreferrer" className={linkCls}>
            카카오맵 정보
          </a>
          <a href={blogLink(place)} target="_blank" rel="noopener noreferrer" className={linkCls}>
            후기 보기
          </a>
          {home && (
            <a href={home} target="_blank" rel="noopener noreferrer" className={linkCls}>
              홈페이지
            </a>
          )}
        </div>
      )}
    </>
  );
}

/** 장소 이름 자체를 카카오맵 정보로 거는 링크 (이름을 눌러도 넘어가게) */
export function PlaceName({ place, className = '', children }) {
  if (!place) return <span className={className}>{children}</span>;
  return (
    <a href={mapLink(place)} target="_blank" rel="noopener noreferrer" className={`${className} hover:underline`}>
      {children}
    </a>
  );
}
