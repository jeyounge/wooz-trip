'use client';
import { useEffect, useRef } from 'react';
import { IconClose } from './Icons';

/**
 * 바텀시트 (시안 B: 위쪽이 크게 둥근 크림색 시트 + 어두운 배경)
 * Esc·배경 누르면 닫힌다. 열려 있는 동안 뒤 화면 스크롤을 막는다.
 */
export default function Sheet({ title, sub, onClose, children, tall = false }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex justify-center">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-[#6E5A4C]/80" />
      <section
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`sheet-in absolute bottom-0 flex w-full max-w-app flex-col rounded-t-[32px] bg-bg outline-none ${
          tall ? 'top-16' : 'max-h-[88dvh]'
        }`}
      >
        <div className="flex justify-center pt-3 pb-0.5" aria-hidden="true">
          <div className="h-1.5 w-12 rounded-full bg-line-strong" />
        </div>
        <div className="flex items-center gap-2 px-5 pt-2.5 pb-3">
          <div className="min-w-0 flex-1">
            <div className="font-display text-[22px] leading-snug">{title}</div>
            {sub && <div className="text-[13px] text-sub">{sub}</div>}
          </div>
          <button type="button" aria-label="닫기" onClick={onClose} className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-surface">
            <IconClose />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </section>
    </div>
  );
}
