import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDays, computeDay, mapDays, setTripEnds, tripDepartArea, tripMode } from '../src/lib/trip.js';
import { defaultMode, departAreasFor } from '../src/lib/config.js';

const kinds = (day) => day.slots.filter((s) => s.fixed).map((s) => s.fixed.kind);
const types = (day) => day.slots.filter((s) => !s.fixed).map((s) => s.slotType);

test('daytrip: 차로 가는 당일치기는 출발 지역 출발 → 슬롯 → 도착', () => {
  const days = buildDays({ startDate: '2026-11-07', endDate: '2026-11-07', arrivalTime: '08:00', departureTime: '20:00', mode: 'car', departAreaId: 'jeju-downtown' });
  assert.equal(days.length, 1);
  assert.deepEqual(kinds(days[0]), ['home_start', 'home_end']);
  assert.equal(days[0].slots[0].time, '08:00');
  assert.equal(days[0].slots.at(-1).time, '20:00');
  assert.equal(days[0].slots[0].fixed.name, '제주시내 출발');
  // 19시까지 끝내야 하므로 저녁(18:00, 90분)은 빠지지 않고 들어간다 (+30분 여유 규칙)
  assert.deepEqual(types(days[0]), ['am', 'lunch', 'pm', 'cafe', 'dinner']);
  assert.equal(tripMode({ days }), 'car');
  assert.equal(tripDepartArea({ days }), 'jeju-downtown');
});

test('daytrip: 차로 2박 3일은 첫날 출발·마지막 날 도착, 사이는 숙소', () => {
  const days = buildDays({ startDate: '2026-11-06', endDate: '2026-11-08', arrivalTime: '09:00', departureTime: '19:00', stayName: '애월 숙소', mode: 'car', departAreaId: 'jeju-port' });
  assert.deepEqual(kinds(days[0]), ['home_start', 'stay_end']);
  assert.deepEqual(kinds(days[1]), ['stay_start', 'stay_end']);
  assert.deepEqual(kinds(days[2]), ['stay_start', 'home_end']);
});

test('daytrip: 비행기 여행은 그대로 공항', () => {
  const days = buildDays({ startDate: '2026-11-06', endDate: '2026-11-06', arrivalTime: '09:00', departureTime: '20:00' });
  assert.deepEqual(kinds(days[0]), ['airport_arrive', 'airport_depart']);
  assert.equal(tripMode({ days }), 'fly');
});

test('daytrip: 출발 지역 좌표로 첫 장소까지 이동시간을 계산하고 지도에 집 표시', () => {
  const days = buildDays({ startDate: '2026-11-07', endDate: '2026-11-07', arrivalTime: '08:00', departureTime: '20:00', mode: 'car', departAreaId: 'jeju-downtown' });
  const am = days[0].slots.find((s) => s.slotType === 'am');
  am.placeId = 1;
  const placeMap = { 1: { id: 1, name: '서쪽 해변', category: 'sight', lat: 33.394, lng: 126.239, opening_hours: null, regular_closed_days: [] } };
  const rows = computeDay(days[0], placeMap, {});
  const amRow = rows.find((r) => r.slot.id === am.id);
  assert.ok(amRow.travelFromPrev.minutes >= 30, '제주시내 → 서쪽은 30분 넘게 걸린다');
  assert.deepEqual(mapDays(days, placeMap, {})[0].points.map((p) => p.kind), ['home', 'place', 'home']);
});

test('daytrip: 복사할 때 내 이동 방식으로 첫 칸·끝 칸만 바꾼다', () => {
  const src = buildDays({ startDate: '2026-11-07', endDate: '2026-11-07', arrivalTime: '08:00', departureTime: '20:00', mode: 'car', departAreaId: 'jeju-downtown' });
  src[0].slots.find((s) => s.slotType === 'lunch').placeId = 7;
  const fly = setTripEnds(src, { mode: 'fly', arrivalTime: '10:30', departureTime: '19:00' });
  assert.deepEqual(kinds(fly[0]), ['airport_arrive', 'airport_depart']);
  assert.equal(fly[0].slots[0].time, '10:30');
  assert.equal(fly[0].slots.at(-1).time, '17:00'); // 출발 2시간 전
  assert.equal(fly[0].slots.find((s) => s.slotType === 'lunch').placeId, 7, '장소는 그대로');
  const back = setTripEnds(fly, { mode: 'car', arrivalTime: '07:30', departureTime: '21:00', departAreaId: 'seogwipo-downtown' });
  assert.deepEqual(kinds(back[0]), ['home_start', 'home_end']);
  assert.equal(back[0].slots[0].fixed.name, '서귀포시내 출발');
});

test('daytrip: 권역별 기본 이동 방식과 출발 지역', () => {
  assert.equal(defaultMode('jeju-west'), 'fly');
  assert.ok(departAreasFor('jeju-west').every((a) => a.zone === 'jeju'));
  assert.equal(defaultMode('incheon-songdo'), 'car'); // 아직 없는 권역은 수도권 묶음으로 본다
});
