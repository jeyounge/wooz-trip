'use client';
import { useEffect, useState } from 'react';

// tailwind lg 와 같은 기준
const QUERY = '(min-width: 1024px)';

/**
 * PC(1024px 이상)면 왼쪽에 크게 띄울 지도 높이(화면 높이 - 위 메뉴·여백), 아니면 null.
 * 서버 그림과 첫 그림은 모바일이고, 브라우저에서 화면 폭을 확인한 뒤 바꾼다.
 */
export function useDesktopMap(offset = 104) {
  const [height, setHeight] = useState(null);
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const on = () => setHeight(mq.matches ? Math.max(420, window.innerHeight - offset) : null);
    on();
    mq.addEventListener('change', on);
    window.addEventListener('resize', on);
    return () => {
      mq.removeEventListener('change', on);
      window.removeEventListener('resize', on);
    };
  }, [offset]);
  return height;
}
