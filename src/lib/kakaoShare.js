'use client';
/**
 * 카카오톡 공유 (카카오 JS SDK, 지도와 같은 JavaScript 키).
 * 링크 주소의 도메인은 카카오 개발자센터 「플랫폼 → Web 사이트 도메인」에 등록돼 있어야 한다.
 */
const SDK_URL = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js';
let loading = null;

function loadKakao() {
  const key = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
  if (!key || typeof window === 'undefined') return Promise.resolve(null);
  if (window.Kakao?.Share) {
    if (!window.Kakao.isInitialized()) window.Kakao.init(key);
    return Promise.resolve(window.Kakao);
  }
  if (!loading) {
    loading = new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = SDK_URL;
      s.async = true;
      s.onload = () => {
        try {
          if (!window.Kakao.isInitialized()) window.Kakao.init(key);
          resolve(window.Kakao);
        } catch {
          resolve(null);
        }
      };
      s.onerror = () => {
        loading = null;
        resolve(null);
      };
      document.head.appendChild(s);
    });
  }
  return loading;
}

/** 미리 불러 두기 (버튼이 보일 때 호출하면 누를 때 바로 열린다) */
export function preloadKakao() {
  loadKakao();
}

/**
 * 피드 카드로 보낸다. 성공하면 true, SDK를 못 쓰면 false (그때는 링크 복사로 넘긴다)
 * @param {{ title: string, description?: string, imageUrl?: string, url: string, buttonTitle?: string }} card
 */
export async function shareToKakao({ title, description = '', imageUrl, url, buttonTitle = '동선 보기' }) {
  const Kakao = await loadKakao();
  if (!Kakao?.Share) return false;
  const link = { mobileWebUrl: url, webUrl: url };
  try {
    Kakao.Share.sendDefault({
      objectType: 'feed',
      content: { title, description, ...(imageUrl ? { imageUrl, imageWidth: 1200, imageHeight: 630 } : {}), link },
      buttons: [{ title: buttonTitle, link }],
    });
    return true;
  } catch {
    return false;
  }
}
