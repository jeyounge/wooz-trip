/** 앱 아이콘: 주황 바탕 + 점 세 개를 잇는 동선 선 (글자 없음, 서비스명이 바뀌어도 그대로) */
export function AppIconImage({ px }) {
  return (
    <div style={{ width: px, height: px, display: 'flex', background: '#CC4329' }}>
      <svg width={px} height={px} viewBox="0 0 100 100">
        <path d="M26 72 Q 30 50 50 56 T 76 30" fill="none" stroke="#FFF7EC" strokeWidth="5" strokeLinecap="round" />
        <circle cx="26" cy="72" r="9" fill="#FFF7EC" />
        <circle cx="50" cy="56" r="7" fill="#FFC93C" />
        <circle cx="76" cy="30" r="9" fill="#FFF7EC" />
      </svg>
    </div>
  );
}
