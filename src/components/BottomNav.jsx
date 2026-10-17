'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// 하단 탭 (시안 B: 진한 갈색 알약 위 밝은 선택 탭)
// 시안의 잘못된 연결(마이→홈, 둘러보기→상세)은 바로잡았다.
const TABS = [
  { href: '/', label: '홈', match: (p) => p === '/' },
  { href: '/trips', label: '내 여행', match: (p) => p === '/trips' },
  { href: '/routes', label: '둘러보기', match: (p) => p.startsWith('/routes') },
  { href: '/my', label: '마이', match: (p) => p.startsWith('/my') },
];

export default function BottomNav() {
  const path = usePathname() || '/';
  return (
    <nav
      aria-label="하단 메뉴"
      className="sticky bottom-0 z-20 mx-4 mb-5 mt-2 grid grid-cols-4 rounded-[30px] bg-selected p-1.5"
    >
      {TABS.map((t) => {
        const on = t.match(path);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? 'page' : undefined}
            className={
              on
                ? 'flex h-12 items-center justify-center rounded-3xl bg-bg font-display text-[15px] text-ink'
                : 'flex h-12 items-center justify-center text-sm text-[#F3E3D1]'
            }
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
