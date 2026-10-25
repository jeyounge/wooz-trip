/**
 * 공유 미리보기 이미지 (1200×630, next/og). 시안 B 색을 그대로 쓴다.
 * 왼쪽: 제목·요약·장소 칩 / 오른쪽: 일자별 색 동선 (실선·점선·파선)
 */
import { DAY_LABELS, DAY_STYLES } from '../config.js';

export const OG_SIZE = { width: 1200, height: 630 };

const C = {
  bg: '#FFF7EC',
  ink: '#3A2A20',
  sub: '#7A6352',
  line: '#F0DCC4',
  mint: '#BFE6D5',
  mintInk: '#1E5A45',
  cta: '#CC4329',
};

// 제주 섬 윤곽 (대략, 바탕 그림용) [위도, 경도]
const JEJU_COAST = [
  [33.517, 126.52],
  [33.545, 126.64],
  [33.558, 126.76],
  [33.53, 126.86],
  [33.5, 126.91],
  [33.46, 126.94],
  [33.4, 126.9],
  [33.33, 126.84],
  [33.28, 126.72],
  [33.24, 126.57],
  [33.24, 126.43],
  [33.22, 126.33],
  [33.2, 126.26],
  [33.25, 126.18],
  [33.3, 126.16],
  [33.36, 126.2],
  [33.41, 126.25],
  [33.46, 126.31],
  [33.49, 126.39],
  [33.505, 126.47],
];
const JEJU_BOX = { lat0: 33.19, lat1: 33.57, lng0: 126.14, lng1: 126.96 };
const K = Math.cos((33.4 * Math.PI) / 180); // 제주 위도에서 경도 1도 ≈ 위도 0.83도

/** 위경도 → 상자 안 좌표 (가로세로 비율 유지). 점이 모두 제주 안이면 섬 전체 기준으로 */
function projector(points, w, h, pad) {
  const inJeju = points.length > 0 && points.every((p) => p.lat > 33.1 && p.lat < 33.6 && p.lng > 126.1 && p.lng < 127);
  const box =
    inJeju || !points.length
      ? JEJU_BOX
      : {
          lat0: Math.min(...points.map((p) => p.lat)),
          lat1: Math.max(...points.map((p) => p.lat)),
          lng0: Math.min(...points.map((p) => p.lng)),
          lng1: Math.max(...points.map((p) => p.lng)),
        };
  const bw = Math.max((box.lng1 - box.lng0) * K, 0.02);
  const bh = Math.max(box.lat1 - box.lat0, 0.02);
  const scale = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh);
  const ox = (w - bw * scale) / 2;
  const oy = (h - bh * scale) / 2;
  const at = (lat, lng) => ({
    x: ox + (lng - box.lng0) * K * scale,
    y: oy + (box.lat1 - lat) * scale,
  });
  return { at, island: inJeju || !points.length };
}

export function RouteCardImage({ brand, title, summary, chips = [], days = [] }) {
  const W = 500;
  const H = 502;
  const { at, island } = projector(
    days.flatMap((d) => d.points),
    W,
    H,
    28,
  );
  const proj = days.map((d) => d.points.map((p) => ({ ...p, ...at(p.lat, p.lng) })));
  const lines = days.map((d) => (d.line || d.points).map((p) => at(p.lat, p.lng)));
  const coast = JEJU_COAST.map(([lat, lng]) => at(lat, lng));
  const shown = days.slice(0, 3);
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: C.bg,
        fontFamily: 'Jua',
        color: C.ink,
        padding: 64,
        gap: 40,
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ display: 'flex' }}>
            <div
              style={{
                display: 'flex',
                background: C.cta,
                color: '#FFFFFF',
                borderRadius: 999,
                padding: '8px 22px',
                fontSize: 26,
              }}
            >
              {brand}
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: title.length > 16 ? 54 : 64,
              lineHeight: 1.18,
              maxHeight: 160,
              overflow: 'hidden',
            }}
          >
            {title}
          </div>
          {summary && <div style={{ display: 'flex', fontSize: 30, color: C.sub }}>{summary}</div>}
          {chips.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 10,
                marginTop: 6,
              }}
            >
              {chips.map((c) => (
                <div
                  key={c}
                  style={{
                    display: 'flex',
                    background: C.mint,
                    color: C.mintInk,
                    borderRadius: 999,
                    padding: '6px 18px',
                    fontSize: 24,
                  }}
                >
                  {c}
                </div>
              ))}
            </div>
          )}
        </div>
        {shown.length > 1 && (
          <div style={{ display: 'flex', gap: 26, fontSize: 24, color: C.sub }}>
            {shown.map((_, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <svg width="44" height="10" viewBox="0 0 44 10">
                  <line
                    x1="2"
                    y1="5"
                    x2="42"
                    y2="5"
                    stroke={DAY_STYLES[i].hex}
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={DAY_STYLES[i].dash || undefined}
                  />
                </svg>
                {DAY_LABELS[i] || `${i + 1}일차`}
              </div>
            ))}
          </div>
        )}
      </div>
      <div
        style={{
          width: W,
          height: H,
          display: 'flex',
          background: '#FFFFFF',
          borderRadius: 36,
          border: `3px solid ${C.line}`,
        }}
      >
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          {island && (
            <polygon
              points={coast.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
              fill="#FFF1DE"
              stroke={C.line}
              strokeWidth="4"
              strokeLinejoin="round"
            />
          )}
          {lines.map((pts, i) =>
            pts.length > 1 ? (
              <polyline
                key={`l${i}`}
                points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
                fill="none"
                stroke={DAY_STYLES[i % 3].hex}
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={DAY_STYLES[i % 3].dash ? DAY_STYLES[i % 3].dash.replace(/\d+/g, (n) => String(Number(n) * 1.6)) : undefined}
              />
            ) : null,
          )}
          {proj.flatMap((pts, i) =>
            pts.map((p, j) =>
              p.kind === 'place' ? (
                <circle key={`p${i}-${j}`} cx={p.x} cy={p.y} r="8" fill={DAY_STYLES[i % 3].hex} stroke="#FFFFFF" strokeWidth="3" />
              ) : (
                <rect key={`s${i}-${j}`} x={p.x - 8} y={p.y - 8} width="16" height="16" rx="4" fill={C.ink} stroke="#FFFFFF" strokeWidth="3" />
              ),
            ),
          )}
        </svg>
      </div>
    </div>
  );
}
