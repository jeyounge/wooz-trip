// 인라인 SVG 선 아이콘 (이모지 대신). 모두 장식용이라 aria-hidden.
const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export const IconBack = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);
export const IconClose = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={2.4}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const IconSearch = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4-4" />
  </svg>
);
export const IconShare = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
    <path d="M12 15V3M7 8l5-5 5 5M5 13v7h14v-7" />
  </svg>
);
export const IconBookmark = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
    <path d="M6 3h12v18l-6-4-6 4z" />
  </svg>
);
export const IconWarn = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v6M12 16.5v.5" />
  </svg>
);
export const IconCheck = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={3}>
    <path d="M5 12l5 5 9-10" />
  </svg>
);
export const IconUpDown = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={2.4}>
    <path d="M8 9l4-4 4 4M8 15l4 4 4-4" />
  </svg>
);
export const IconUp = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={2.4}>
    <path d="M6 15l6-6 6 6" />
  </svg>
);
export const IconDown = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={2.4}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);
export const IconCar = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={2}>
    <path d="M5 16h14M6 16l2-6h8l2 6M7 19v-3M17 19v-3" />
  </svg>
);
export const IconEdit = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
  </svg>
);
export const IconSwap = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
    <path d="M4 8h13l-3-3M20 16H7l3 3" />
  </svg>
);
export const IconTrash = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </svg>
);
export const IconSpark = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" />
  </svg>
);
/** 장소 종류: 볼거리(깃발) · 식당(숟가락·포크) · 카페(컵) */
export const IconSight = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={2.2}>
    <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
  </svg>
);
export const IconFood = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={2.2}>
    <path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2 1-3 4-3 7h3" />
  </svg>
);
export const IconCafe = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={2.2}>
    <path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 10h2a2 2 0 0 1 0 4h-2M8 3v3M12 3v3" />
  </svg>
);
export const IconHome = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
    <path d="M3 11l9-7 9 7v9H3z" />
  </svg>
);
export const IconWave = ({ size = 34, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base} stroke={color} strokeWidth={1.8}>
    <path d="M2 17c3-2 5-2 8 0s5 2 8 0 3-1 4 0" />
    <path d="M6 13l3-7 3 7M7 11h4" />
  </svg>
);
export const IconUmbrella = ({ size = 34, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base} stroke={color} strokeWidth={1.8}>
    <path d="M5 11a7 7 0 0114 0z" />
    <path d="M12 11v8a2 2 0 01-4 0" />
  </svg>
);
export const IconMap = ({ size = 34, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base} stroke={color} strokeWidth={1.8}>
    <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z" />
    <path d="M9 4v14M15 6v14" />
  </svg>
);
