import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-5 text-center">
      <div className="font-display text-2xl">찾는 루트가 없어요</div>
      <p className="m-0 text-sm text-sub">비공개로 바뀌었거나 지워진 루트일 수 있어요.</p>
      <Link href="/" className="btn-cta mt-2 w-full max-w-xs">
        홈으로
      </Link>
    </main>
  );
}
