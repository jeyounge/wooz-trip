// 공개 루트(추천 루트 포함)의 이동 구간을 카카오모빌리티 길찾기로 미리 채운다 (0009 필요, 0010 이면 도로 경로도)
// 실행: npm run travel:fill  (이미 받은 구간은 건너뜀, 하루 상한 TRAVEL_DAILY_LIMIT)
import { createClient } from '@supabase/supabase-js';
import { makeTravelFn, mergeTravel, tripLegs } from '../../src/lib/travel.js';
import { estimateCarMinutes } from '../../src/lib/geo.js';
import { fillTravel, readTravel } from '../../src/lib/travelCache.js';
import { usedPlaceIds } from '../../src/lib/trip.js';

process.loadEnvFile(new URL('../../.env.local', import.meta.url));
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: trips, error } = await db.from('wooz_trip_trips').select('id, title, days, companion_type, stay_lat, stay_lng').eq('visibility', 'public');
if (error) throw new Error(error.message);
const ids = [...new Set(trips.flatMap((t) => usedPlaceIds(t.days)))];
const { data: places } = await db.from('wooz_trip_places').select('id, name, lat, lng').in('id', ids);
const placeMap = Object.fromEntries(places.map((p) => [p.id, p]));

let total = 0;
let diffSum = 0;
let diffN = 0;
for (const t of trips) {
  const legs = tripLegs(t, placeMap);
  const have = await readTravel(legs);
  const got = await fillTravel(legs, have);
  const travel = mergeTravel(have, got);
  total += Object.keys(got.minutes).length;
  const fn = makeTravelFn(travel.minutes);
  for (const l of legs) if (travel.minutes[l.key] != null) { diffSum += fn(l.from, l.to) - estimateCarMinutes(l.from, l.to); diffN++; }
  const timed = legs.filter((l) => travel.minutes[l.key] != null).length;
  const roads = legs.filter((l) => travel.paths[l.key]).length;
  console.log(`${t.title} — 구간 ${legs.length} · 시간 ${timed} · 도로 선 ${roads} (새로 ${Object.keys(got.minutes).length})`);
}
console.log(`새로 받은 구간 ${total}개 · 추정치 대비 평균 ${diffN ? (diffSum / diffN).toFixed(1) : 0}분`);
