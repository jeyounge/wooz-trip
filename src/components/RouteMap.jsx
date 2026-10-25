'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { dayStyle } from '@/lib/config';

/**
 * 일자별 색상 동선 지도.
 * - NEXT_PUBLIC_KAKAO_MAP_KEY 가 있으면 카카오맵 SDK (폴리라인 + 번호 마커)
 * - 없으면 좌표를 그대로 투영한 간이 SVG 지도 (개발·키 발급 전용)
 * 일자는 색 + 선 모양(실선/점선/파선)으로 구분한다.
 *
 * 선은 d.line(도로를 따라가는 좌표, travel.withRoads)이 있으면 그걸로, 없으면 장소 점을 곧게 잇는다.
 *
 * @param {{ days: Array<{ points: Array<{lat,lng,label,n,kind}>, line?: Array<{lat,lng}> }>, active: number }} props
 */
export default function RouteMap({ days, active = 0, height = 220 }) {
  const key = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
  return key ? <KakaoMap appKey={key} days={days} active={active} height={height} /> : <SvgMap days={days} active={active} height={height} />;
}

function SvgMap({ days, active, height }) {
  const W = 350;
  const H = height;
  const all = days.flatMap((d) => d.points);
  const proj = useMemo(() => {
    if (!all.length) return null;
    const lats = all.map((p) => p.lat);
    const lngs = all.map((p) => p.lng);
    let [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
    const pad = 0.01;
    if (maxLat - minLat < 0.02) [minLat, maxLat] = [minLat - pad, maxLat + pad];
    if (maxLng - minLng < 0.02) [minLng, maxLng] = [minLng - pad, maxLng + pad];
    const k = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180)); // 경도 압축
    const spanX = (maxLng - minLng) * k;
    const spanY = maxLat - minLat;
    const s = Math.min((W - 60) / spanX, (H - 50) / spanY);
    const ox = (W - spanX * s) / 2;
    const oy = (H - spanY * s) / 2;
    return (p) => [ox + (p.lng - minLng) * k * s, oy + (maxLat - p.lat) * s];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(all.map((p) => [p.lat, p.lng])), H]);

  return (
    <div className="relative overflow-hidden rounded-[28px] bg-[#CFEDE2] shadow-card" style={{ height: H }}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="일자별 동선 지도 (간이 지도)">
        <path d={`M-10 40 C 50 20, 110 50, 170 34 S 280 14, ${W + 10} 46 L ${W + 10} ${H + 10} L -10 ${H + 10} Z`} fill="#FFF3DD" />
        <path d={`M-10 40 C 50 20, 110 50, 170 34 S 280 14, ${W + 10} 46`} fill="none" stroke="#FFFFFF" strokeWidth="6" strokeLinecap="round" />
        {proj &&
          days.map((d, i) => {
            const st = dayStyle(i);
            const on = i === active;
            const pts = d.points.map(proj);
            const linePts = (d.line || d.points).map(proj);
            return (
              <g key={i} opacity={on ? 1 : 0.2}>
                {linePts.length > 1 && (
                  <polyline
                    points={linePts.map((p) => p.join(',')).join(' ')}
                    fill="none"
                    stroke={st.hex}
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray={st.dash || undefined}
                  />
                )}
                {on &&
                  d.points.map((p, j) => {
                    const [x, y] = pts[j];
                    if (p.kind !== 'place') {
                      return (
                        <g key={j}>
                          <circle cx={x} cy={y} r="13" fill="#FFC93C" stroke="#FFFFFF" strokeWidth="3" />
                          <path d={`M${x - 6} ${y + 4} l6 -6 l6 6 v3 h-12 z`} fill="#3A2A20" />
                        </g>
                      );
                    }
                    return (
                      <g key={j}>
                        <circle cx={x} cy={y} r="13" fill={st.hex} stroke="#FFFFFF" strokeWidth="3" />
                        <text x={x} y={y + 4.5} textAnchor="middle" fontSize="12" fontWeight="700" fill="#FFFFFF">
                          {p.n}
                        </text>
                      </g>
                    );
                  })}
              </g>
            );
          })}
      </svg>
      {!all.length && <div className="absolute inset-0 flex items-center justify-center text-sm text-sub">장소를 넣으면 동선이 그려져요</div>}
      <div className="absolute left-3 top-3 rounded-lg bg-surface/90 px-2 py-1 text-[11px] text-sub">간이 지도 · 카카오맵 키 연결 전</div>
    </div>
  );
}

/** 카카오맵 SDK 한 번만 로드 */
let kakaoPromise = null;
function loadKakao(appKey) {
  if (typeof window === 'undefined') return Promise.reject(new Error('ssr'));
  if (window.kakao?.maps?.LatLng) return Promise.resolve(window.kakao);
  if (!kakaoPromise) {
    kakaoPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`;
      s.async = true;
      s.onload = () => window.kakao.maps.load(() => resolve(window.kakao));
      s.onerror = () => {
        kakaoPromise = null;
        reject(new Error('카카오맵을 불러오지 못했어요 (도메인 등록 확인)'));
      };
      document.head.appendChild(s);
    });
  }
  return kakaoPromise;
}

function KakaoMap({ appKey, days, active, height }) {
  const el = useRef(null);
  const map = useRef(null);
  const layers = useRef([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    loadKakao(appKey)
      .then((kakao) => {
        if (!alive || !el.current) return;
        if (!map.current) {
          map.current = new kakao.maps.Map(el.current, { center: new kakao.maps.LatLng(33.38, 126.55), level: 10 });
        }
        layers.current.forEach((o) => o.setMap(null));
        layers.current = [];
        const bounds = new kakao.maps.LatLngBounds();
        days.forEach((d, i) => {
          const st = dayStyle(i);
          const on = i === active;
          const path = (d.line || d.points).map((p) => new kakao.maps.LatLng(p.lat, p.lng));
          if (path.length > 1) {
            const line = new kakao.maps.Polyline({
              path,
              strokeWeight: 5,
              strokeColor: st.hex,
              strokeOpacity: on ? 0.95 : 0.2,
              strokeStyle: st.kakao,
            });
            line.setMap(map.current);
            layers.current.push(line);
          }
          if (on) {
            d.points.forEach((p) => {
              const pos = new kakao.maps.LatLng(p.lat, p.lng);
              bounds.extend(pos);
              const isBase = p.kind !== 'place'; // 숙소·공항·출발지
              const html = `<div style="width:28px;height:28px;border-radius:14px;border:3px solid #fff;background:${isBase ? '#FFC93C' : st.hex};color:${isBase ? '#3A2A20' : '#fff'};font:700 12px/22px sans-serif;text-align:center;box-sizing:border-box">${isBase ? '⌂' : p.n}</div>`;
              const ov = new kakao.maps.CustomOverlay({ position: pos, content: html, yAnchor: 0.5 });
              ov.setMap(map.current);
              layers.current.push(ov);
            });
          }
        });
        if (!bounds.isEmpty()) map.current.setBounds(bounds, 40, 40, 40, 40);
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [appKey, days, active]);

  if (error) return <SvgMap days={days} active={active} height={height} />;
  return <div ref={el} role="img" aria-label="일자별 동선 지도" className="overflow-hidden rounded-[28px] shadow-card" style={{ height }} />;
}
