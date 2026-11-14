'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SERVICE_NAME } from '@/lib/config';

// PC 위쪽 메뉴 (모바일은 하단 탭 BottomNav). 탭은 하단 탭과 같다
const TABS = [
  { href: '/', label: '홈', match: (p) => p === '/' },
  { href: '/trips', label: '내 여행', match: (p) => p === '/trips' },
  { href: '/routes', label: '둘러보기', match: (p) => p.startsWith('/routes') },
  { href: '/my', label: '마이', match: (p) => p.startsWith('/my') },
];

export default function DesktopNav() {
  const path = usePathname() || '/';
  return (
    <nav aria-label="위쪽 메뉴" className="sticky top-0 z-30 hidden h-16 border-b-2 border-line bg-bg lg:block">
      <div className="mx-auto flex h-full max-w-[1280px] items-center gap-2 px-8">
        <Link href="/" className="mr-6 font-display text-[24px] text-cta no-underline">
          {SERVICE_NAME}
        </Link>
        {TABS.map((t) => {
          const on = t.match(path);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={on ? 'page' : undefined}
              className={`flex h-10 items-center rounded-full px-4 text-[15px] no-underline ${on ? 'bg-selected font-display text-selected-ink' : 'text-ink hover:bg-surface'}`}
            >
              {t.label}
            </Link>
          );
        })}
        <Link href="/trips/new" className="btn-cta ml-auto h-11 px-5 text-[15px]">
          우리 여행 짜기
        </Link>
      </div>
    </nav>
  );
}
