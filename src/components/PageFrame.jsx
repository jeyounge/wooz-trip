'use client';
import { usePathname } from 'next/navigation';

// PC 에서 넓게 쓰는 화면 (각 화면이 PC 배치를 직접 잡는다): 홈, 내 여행, 둘러보기, 공개 루트, 결과, 루트 짜기, 가족 공유, 관리자
const WIDE = [/^\/$/, /^\/trips$/, /^\/routes(\/[^/]+)?$/, /^\/trips\/(?!new$)[^/]+(\/edit)?$/, /^\/s\/[^/]+$/, /^\/admin$/];
// 중간 폭(960px): 여행 정보 입력, 마이
const MID = [/^\/trips\/new$/, /^\/my$/];

/**
 * 화면 틀. 모바일은 가운데 정렬한 모바일 폭(430px).
 * PC 는 넓은 화면이면 폭 제한을 풀고, 중간 화면은 960px, 나머지는 640px 가운데 칸으로 보여 준다.
 */
export default function PageFrame({ children }) {
  const path = usePathname() || '/';
  const wide = WIDE.some((re) => re.test(path));
  const mid = MID.some((re) => re.test(path));
  return (
    <div className={`relative mx-auto flex min-h-dvh w-full max-w-app flex-col bg-bg lg:min-h-[calc(100dvh-64px)] ${wide ? 'lg:max-w-none' : mid ? 'lg:max-w-[960px]' : 'lg:max-w-[640px]'}`}>
      {children}
    </div>
  );
}
