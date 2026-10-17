// 개발용 가짜 장소 시드 SQL 생성기 → supabase/migrations/0002_wooz_trip_seed.sql
// 실존 업체가 아님을 분명히 하려고 이름에 [샘플] 을 붙이고 is_sample = true 로 넣는다.
// 실행: node scripts/gen_seed_sql.mjs
import { writeFileSync } from 'node:fs';

const H = (open, close, lastOrder) => ({ all: lastOrder ? { open, close, lastOrder } : { open, close } });
// [name, category, sub, region, lat, lng, hours|null, closedDays(0=일~6=토), tags, indoor, status]
const P = [
  ['[샘플] 애월 해장국집', 'food', '해장국', 'jeju-west', 33.4625, 126.3305, H('07:00', '15:00'), [], ['baby_chair', 'parking', 'kids_menu']],
  ['[샘플] 한림 고기국수집', 'food', '고기국수', 'jeju-west', 33.4108, 126.266, H('10:00', '21:00', '20:30'), [], ['baby_chair', 'kids_menu', 'parking']],
  ['[샘플] 협재 해산물식당', 'food', '해산물', 'jeju-west', 33.393, 126.242, H('11:00', '20:30', '20:00'), [], ['baby_chair', 'floor_seat', 'parking']],
  ['[샘플] 금능 돈가스집', 'food', '돈가스', 'jeju-west', 33.3895, 126.233, H('11:30', '19:30', '19:00'), [], ['baby_chair', 'kids_menu', 'stroller']],
  ['[샘플] 한림 흑돼지구이', 'food', '흑돼지', 'jeju-west', 33.414, 126.27, H('12:00', '22:00', '21:00'), [5], ['baby_chair', 'parking', 'nursing']],
  ['[샘플] 귀덕 한식뷔페', 'food', '한식 뷔페', 'jeju-west', 33.44, 126.29, H('11:00', '20:00', '19:30'), [], ['kids_menu', 'parking', 'nursing', 'baby_chair']],
  ['[샘플] 애월 보말칼국수', 'food', '칼국수', 'jeju-west', 33.465, 126.32, H('09:00', '17:00', '16:30'), [3], ['floor_seat', 'parking']],
  ['[샘플] 한림 키즈카페', 'cafe', '키즈카페', 'jeju-west', 33.412, 126.262, H('10:00', '19:00'), [5], ['kids_zone', 'parking', 'baby_chair'], true],
  ['[샘플] 애월 바다전망 카페', 'cafe', '카페', 'jeju-west', 33.468, 126.31, H('09:00', '21:00'), [], ['parking', 'stroller']],
  ['[샘플] 협재 귤밭 카페', 'cafe', '카페', 'jeju-west', 33.398, 126.25, H('10:00', '18:00'), [2], ['parking', 'stroller', 'kids_zone']],
  ['[샘플] 서쪽 해변 모래놀이터', 'sight', '해변', 'jeju-west', 33.394, 126.239, null, [], ['foot_wash', 'parking', 'stroller']],
  ['[샘플] 애월 해안 산책로', 'sight', '산책로', 'jeju-west', 33.47, 126.315, null, [], ['stroller', 'parking']],
  ['[샘플] 한림 실내 체험관', 'sight', '실내 체험', 'jeju-west', 33.405, 126.28, H('09:30', '18:00'), [1], ['stroller', 'nursing', 'parking', 'kids_zone'], true],
  ['[샘플] 귀덕 목장 체험', 'sight', '목장', 'jeju-west', 33.43, 126.3, H('10:00', '17:00'), [], ['parking']],
  ['[샘플] 금능 해변 공원', 'sight', '해변', 'jeju-west', 33.39, 126.23, null, [], ['foot_wash', 'parking']],
  ['[샘플] 애월 동물농장', 'sight', '동물 체험', 'jeju-west', 33.43, 126.35, H('09:00', '18:00'), [], ['parking', 'stroller', 'nursing']],
  ['[샘플] 제주시 실내 놀이터', 'sight', '실내 놀이터', 'jeju-city', 33.495, 126.53, H('10:00', '20:00'), [], ['kids_zone', 'nursing', 'stroller', 'parking'], true],
  ['[샘플] 제주시 국수 식당', 'food', '국수', 'jeju-city', 33.505, 126.525, H('09:00', '21:00', '20:30'), [], ['baby_chair', 'kids_menu']],
  ['[샘플] 제주시 자연사 전시관', 'sight', '전시관', 'jeju-city', 33.5, 126.545, H('09:00', '18:00'), [1], ['stroller', 'nursing', 'parking'], true],
  ['[샘플] 공항 근처 카페', 'cafe', '카페', 'jeju-city', 33.503, 126.495, H('08:00', '22:00'), [], ['parking', 'baby_chair']],
  ['[샘플] 중문 해변', 'sight', '해변', 'jeju-south', 33.245, 126.412, null, [], ['foot_wash', 'parking']],
  ['[샘플] 서귀포 시장 식당', 'food', '분식', 'jeju-south', 33.25, 126.563, H('10:00', '21:00', '20:30'), [], ['baby_chair']],
  ['[샘플] 서귀포 폭포 공원', 'sight', '공원', 'jeju-south', 33.247, 126.554, H('09:00', '18:00'), [], ['stroller', 'parking']],
  ['[샘플] 중문 바다 체험관', 'sight', '실내 체험', 'jeju-south', 33.248, 126.41, H('10:00', '19:00'), [], ['nursing', 'stroller', 'parking', 'kids_zone'], true],
  ['[샘플] 서귀포 감귤 카페', 'cafe', '카페', 'jeju-south', 33.26, 126.52, H('10:00', '19:00'), [3], ['parking', 'kids_zone']],
  ['[샘플] 성산 일출 전망길', 'sight', '전망', 'jeju-east', 33.459, 126.94, null, [], ['parking']],
  ['[샘플] 월정 해변 카페', 'cafe', '카페', 'jeju-east', 33.556, 126.795, H('10:00', '20:00'), [], ['stroller']],
  ['[샘플] 구좌 해녀 식당', 'food', '해산물', 'jeju-east', 33.55, 126.8, H('10:00', '19:00', '18:30'), [4], ['floor_seat', 'parking', 'baby_chair']],
  ['[샘플] 표선 해변 놀이터', 'sight', '해변', 'jeju-east', 33.326, 126.837, null, [], ['foot_wash', 'parking', 'stroller']],
  ['[샘플] 성산 흑돼지 식당', 'food', '흑돼지', 'jeju-east', 33.458, 126.93, H('11:00', '21:00', '20:00'), [], ['baby_chair', 'parking', 'kids_menu']],
  ['[샘플] 애월 신규 후보 식당', 'food', '한식', 'jeju-west', 33.46, 126.34, H('11:00', '20:00'), [], [], false, 'candidate'],
];

const TAGS = [
  ['baby_chair', '아기의자', true, 1],
  ['kids_menu', '유아 메뉴', true, 2],
  ['parking', '주차', true, 3],
  ['stroller', '유모차', true, 4],
  ['nursing', '수유실', true, 5],
  ['floor_seat', '좌식', true, 6],
  ['foot_wash', '발 씻는 곳', true, 7],
  ['kids_zone', '키즈존', true, 8],
  ['regular_closed', '정기휴무', false, 9],
];

const q = (s) => (s === null || s === undefined ? 'null' : `'${String(s).replaceAll("'", "''")}'`);
const arr = (a, type) => `'{${a.join(',')}}'::${type}[]`;

let sql = `-- ============================================================
-- wooz-trip — 개발용 시드 (가짜 장소 ${P.length}곳 + 아이 태그)
-- 생성: node scripts/gen_seed_sql.mjs  (직접 고치지 말고 생성기를 고친다)
-- 실존 업체가 아님: 이름에 [샘플], is_sample = true. 실데이터를 넣은 뒤
--   delete from wooz_trip_places where is_sample;  로 지운다.
-- 여러 번 실행해도 중복되지 않는다 (on conflict).
-- ============================================================

insert into wooz_trip_kid_tags (id, label, filterable, sort_order) values
${TAGS.map((t) => `  (${q(t[0])}, ${q(t[1])}, ${t[2]}, ${t[3]})`).join(',\n')}
on conflict (id) do update set label = excluded.label, filterable = excluded.filterable, sort_order = excluded.sort_order;

insert into wooz_trip_places
  (name, category, sub_category, region, lat, lng, opening_hours, regular_closed_days, kid_tags, indoor,
   status, verified_ts, source_provider, source_external_id, external_links, is_sample, intro)
values
`;
sql += P.map((p, i) => {
  const [name, cat, sub, region, lat, lng, hours, closed, tags, indoor = false, status = 'approved'] = p;
  const links = { map: `https://map.kakao.com/?q=${encodeURIComponent(name.replace('[샘플] ', ''))}` };
  const hoursSql = hours ? `${q(JSON.stringify(hours))}::jsonb` : 'null';
  const verified = status === 'approved' ? 'now()' : 'null';
  const ext = q('sample-' + String(i + 1).padStart(2, '0'));
  return `  (${q(name)}, ${q(cat)}, ${q(sub)}, ${q(region)}, ${lat}, ${lng}, ${hoursSql}, ${arr(closed, 'smallint')}, ${arr(tags, 'text')}, ${indoor}, ${q(status)}, ${verified}, 'manual', ${ext}, ${q(JSON.stringify(links))}::jsonb, true, ${q('개발용 샘플 장소예요. 실제 업체가 아니에요.')})`;
}).join(',\n');
sql += `
on conflict (source_provider, source_external_id) do update set
  name = excluded.name, category = excluded.category, sub_category = excluded.sub_category, region = excluded.region,
  lat = excluded.lat, lng = excluded.lng, opening_hours = excluded.opening_hours,
  regular_closed_days = excluded.regular_closed_days, kid_tags = excluded.kid_tags, indoor = excluded.indoor;
`;

writeFileSync(new URL('../supabase/migrations/0002_wooz_trip_seed.sql', import.meta.url), sql);
console.log(`places: ${P.length}`);
