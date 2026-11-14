'use client';
import { usePathname } from 'next/navigation';

// PC 에서 넓게 쓰는 화면 (각 화면이 PC 배치를 직접 잡는다): 홈, 둘러보기, 공개 루트, 결과, 가족 공유
const WIDE = [/^\/$/, /^\/routes(\/[^/]+)?$/, /^\/trips\/(?!new$)[^/]+$/, /^\/s\/[^/]+$/];

/**
 * 화면 틀. 모바일은 가운데 정렬한 모바일 폭(430px).
 * PC 는 넓은 화면이면 폭 제한을 풀고, 나머지는 640px 가운데 칸으로 보여 준다.
 */
export default function PageFrame({ children }) {
  const path = usePathname() || '/';
  const wide = WIDE.some((re) => re.test(path));
  return (
    <div className={`relative mx-auto flex min-h-dvh w-full max-w-app flex-col bg-bg lg:min-h-[calc(100dvh-64px)] ${wide ? 'lg:max-w-none' : 'lg:max-w-[640px]'}`}>
      {children}
    </div>
  );
}
