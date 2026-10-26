'use client';
import { useEffect, useState } from 'react';
import Sheet from './Sheet';
import { preloadKakao, shareToKakao } from '@/lib/kakaoShare';

/**
 * 공유 방법 고르기: 카카오톡 · 링크 복사 · 다른 앱
 * card = { title, description, imageUrl, url, buttonTitle }
 */
export default function ShareSheet({ card, sheetTitle = '어디로 보낼까요?', onClose, onToast }) {
  const [canNative, setCanNative] = useState(false);
  useEffect(() => {
    preloadKakao();
    setCanNative(typeof navigator !== 'undefined' && !!navigator.share);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(card.url);
      onToast('링크를 복사했어요. 단톡방에 붙여 넣어 주세요');
    } catch {
      onToast(card.url);
    }
    onClose();
  }

  async function kakao() {
    if (await shareToKakao(card)) return onClose();
    await copy(); // SDK 를 못 쓰면 링크 복사로
  }

  async function native() {
    try {
      await navigator.share({ title: card.title, text: card.description, url: card.url });
      onClose();
    } catch {
      // 공유 창을 닫은 경우 그대로 둔다
    }
  }

  return (
    <Sheet title={sheetTitle} sub="받는 사람은 로그인 없이 동선을 볼 수 있어요" onClose={onClose}>
      <div className="flex flex-col gap-2 px-5 pb-8">
        <button type="button" onClick={kakao} className="flex h-14 items-center justify-center rounded-full bg-[#FEE500] font-display text-base text-[#191919]">
          카카오톡으로 보내기
        </button>
        <button type="button" onClick={copy} className="flex h-12 items-center justify-center rounded-full border-2 border-line bg-surface text-sm">
          링크 복사
        </button>
        {canNative && (
          <button type="button" onClick={native} className="flex h-12 items-center justify-center rounded-full border-2 border-line bg-surface text-sm">
            다른 앱으로 보내기
          </button>
        )}
      </div>
    </Sheet>
  );
}
