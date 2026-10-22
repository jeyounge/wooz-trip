import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanLocation, normalizeKakaoDoc, regionForAddress, kakaoPlaceRow, categoryOfKakao } from '../src/lib/location.js';
import { computeDay, mapDays, summarize, slotPoint, isEmptySlot, isFilled, slotTitle, buildDays } from '../src/lib/trip.js';
import { stayPenalty } from '../src/lib/ai/routes.js';
import { buildFillTasks, applyPicks } from '../src/lib/ai/fill.js';
import { routeLink } from '../src/lib/format.js';

const FRI = '2026-11-06';
const place = (id, extra = {}) => ({
  id,
  name: `[샘플] ${id}`,
  category: 'food',
  lat: 33.41,
  lng: 126.27,
  opening_hours: { all: { open: '09:00', close: '21:00' } },
  regular_closed_days: [],
  kid_tags: [],
  ...extra,
});

test('location: 위치 값 정리 (이름 필수, 좌표는 한국 안일 때만)', () => {
  assert.equal(cleanLocation(null), null);
  assert.equal(cleanLocation({ name: '  ' }), null);
  assert.deepEqual(cleanLocation({ name: '해변에서 놀기' }), { name: '해변에서 놀기' });
  assert.deepEqual(cleanLocation({ name: 'x', lat: 33.45064040259736, lng: 126.30467759583657, kakaoId: '25022153' }), {
    name: 'x',
    lat: 33.45064,
    lng: 126.304678,
    kakaoId: '25022153',
  });
  assert.deepEqual(cleanLocation({ name: 'x', lat: 0, lng: 0 }), { name: 'x' }); // 한국 밖 좌표는 버린다
  assert.deepEqual(cleanLocation({ name: 'x', lat: 33.4 }), { name: 'x' }); // 경도 없음
  assert.equal(cleanLocation({ name: 'a'.repeat(100) }).name.length, 40);
  assert.equal(cleanLocation({ name: 'x', kakaoId: 'abc<script>' }).kakaoId, undefined);
});

test('location: 카카오 결과 정리와 지역', () => {
  const doc = {
    address_name: '제주특별자치도 제주시 애월읍 곽지리 1565',
    category_group_code: 'AT4',
    category_name: '여행 > 관광,명소 > 해수욕장,해변',
    id: '25022153',
    phone: '064-728-3985',
    place_name: '곽지해수욕장',
    place_url: 'http://place.map.kakao.com/25022153',
    road_address_name: '',
    x: '126.30467759583657',
    y: '33.45064040259736',
  };
  const it = normalizeKakaoDoc(doc);
  assert.equal(it.kakaoId, '25022153');
  assert.equal(it.category, 'sight');
  assert.equal(it.kind, '해수욕장,해변');
  assert.equal(it.url, 'https://place.map.kakao.com/25022153');
  assert.equal(normalizeKakaoDoc({ ...doc, x: '0', y: '0' }), null);
  assert.equal(categoryOfKakao({ category_group_code: 'FD6' }), 'food');
  assert.equal(categoryOfKakao({ category_group_code: 'CE7' }), 'cafe');
  assert.equal(categoryOfKakao({ category_group_code: '', category_name: '스포츠 > 골프 > 골프장' }), 'golf');

  assert.deepEqual(regionForAddress(it.address, it.lat, it.lng), { region: 'jeju-west', sido_code: '50' });
  assert.deepEqual(regionForAddress('제주특별자치도 서귀포시 색달동 3039-3', 33.24, 126.4), { region: 'jeju-south', sido_code: '50' });
  assert.deepEqual(regionForAddress('경기도 용인시 처인구', 37.2, 127.2), { region: 'gyeonggi', sido_code: '41' });

  const row = kakaoPlaceRow(it, 'user-1');
  assert.equal(row.status, 'candidate');
  assert.equal(row.source_provider, 'kakao');
  assert.equal(row.source_external_id, '25022153');
  assert.equal(row.region, 'jeju-west');
});

test('custom: 직접 넣은 일정은 채운 칸으로 치고, 위치가 있으면 동선에 들어간다', () => {
  const placeMap = { 1: place(1, { lat: 33.41, lng: 126.27 }) };
  const day = {
    date: FRI,
    slots: [
      { id: 'a', time: '10:00', slotType: 'am', placeId: 1, stayMinutes: 60 },
      { id: 'b', time: '12:00', slotType: 'extra', placeId: null, stayMinutes: 120, custom: { name: '해변에서 물놀이', lat: 33.45, lng: 126.3 } },
      { id: 'c', time: '15:00', slotType: 'extra', placeId: null, stayMinutes: 60, custom: { name: '근처에서 사진' } },
      { id: 'd', time: '17:00', slotType: 'cafe', placeId: null, stayMinutes: 60 },
    ],
  };
  assert.equal(isFilled(day.slots[1]), true);
  assert.equal(isEmptySlot(day.slots[2]), false);
  assert.equal(isEmptySlot(day.slots[3]), true);
  assert.equal(slotTitle(day.slots[1], placeMap), '해변에서 물놀이');

  const rows = computeDay(day, placeMap, {});
  assert.ok(rows[1].travelFromPrev, '장소 → 위치 있는 직접 일정 이동시간');
  assert.equal(rows[1].travelFromPrev.from.name, placeMap[1].name);
  assert.equal(rows[2].travelFromPrev, null, '위치 없는 직접 일정은 이동시간 없음');

  const sum = summarize({ days: [day] }, placeMap);
  assert.equal(sum.places, 3);
  assert.equal(sum.empty, 1);

  // 지도 번호는 목록과 같게: 위치 없는 3번은 지도에 안 찍혀도 번호는 쓴다
  const pts = mapDays([day], placeMap, {})[0].points;
  assert.deepEqual(pts.map((p) => p.n), [1, 2]);
});

test('stay: 숙소 좌표가 있으면 숙소 칸이 위치를 갖고, AI 는 직접 일정을 덮지 않는다', () => {
  const trip = {
    stay_lat: 33.25,
    stay_lng: 126.41,
    companion_type: 'kids',
    days: buildDays({ startDate: FRI, endDate: '2026-11-07', arrivalTime: '10:00', departureTime: '18:00', stayName: '[숙소]' }),
  };
  const stayStart = trip.days[1].slots[0];
  assert.equal(stayStart.fixed.kind, 'stay_start');
  assert.deepEqual(slotPoint(stayStart, {}, trip), { lat: 33.25, lng: 126.41 });
  assert.equal(slotPoint(stayStart, {}, { ...trip, stay_lat: null, stay_lng: null }), null);

  // 직접 일정 칸은 AI 가 건드리지 않는다
  const target = trip.days[1].slots[1];
  target.custom = { name: '숙소에서 쉬기' };
  const places = [place(5, { category: 'sight' }), place(6, { category: 'food' }), place(7, { category: 'cafe' })];
  const tasks = buildFillTasks(trip, places);
  assert.ok(!tasks.some((t) => t.slotId === target.id));
  const after = applyPicks(trip.days, [{ slotId: target.id, placeId: 5, reason: 'x' }]);
  assert.equal(after[1].slots[1].placeId, null);
});

test('stay: 숙소에서 먼 루트일수록 감점', () => {
  const byId = new Map([
    [1, place(1, { lat: 33.25, lng: 126.42 })], // 숙소 근처 (중문)
    [2, place(2, { lat: 33.46, lng: 126.93 })], // 성산 쪽 (약 50km)
  ]);
  const trip = { stay_lat: 33.25, stay_lng: 126.41 };
  const near = stayPenalty([{ placeId: 1 }], byId, trip);
  const far = stayPenalty([{ placeId: 2 }], byId, trip);
  assert.ok(near <= 2);
  assert.ok(far > 30);
  assert.equal(stayPenalty([{ placeId: 2 }], byId, {}), 0, '숙소 좌표가 없으면 감점 없음');
});

test('format: 카카오맵 길찾기 링크', () => {
  assert.equal(
    routeLink({ name: '숙소, A', lat: 33.25, lng: 126.41 }, { name: '해변', lat: 33.45, lng: 126.3 }),
    `https://map.kakao.com/link/from/${encodeURIComponent('숙소  A')},33.25,126.41/to/${encodeURIComponent('해변')},33.45,126.3`
  );
  assert.ok(routeLink(null, { name: 'x', lat: 1, lng: 2 }).startsWith('https://map.kakao.com/link/to/'));
});
