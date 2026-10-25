import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTravelFn, pairKey, pointKey, roundTravel, tripLegs } from '../src/lib/travel.js';
import { estimateCarMinutes } from '../src/lib/geo.js';
import { AIRPORT } from '../src/lib/config.js';

const airport = { lat: 33.507, lng: 126.493 };
const bija = { lat: 33.4892, lng: 126.8093 };

test('좌표 키는 소수 넷째 자리', () => {
  assert.equal(pointKey({ lat: 33.50701, lng: 126.49299 }), '33.5070,126.4930');
  assert.equal(pairKey(airport, bija), '33.5070,126.4930>33.4892,126.8093');
});

test('캐시에 있으면 길찾기 시간(5분 올림), 없으면 추정치', () => {
  const fn = makeTravelFn({ [pairKey(airport, bija)]: 57 });
  assert.equal(fn(airport, bija), 60);
  assert.equal(fn(bija, airport), estimateCarMinutes(bija, airport)); // 방향 다름 → 추정치
  assert.equal(makeTravelFn({}), estimateCarMinutes);
  assert.equal(roundTravel(1), 5);
});

test('루트 구간: 타임라인과 같은 순서, 빈 칸은 건너뛰고 앞 위치에서 이어짐', () => {
  const placeMap = { 1: { id: 1, name: 'a', lat: 33.45, lng: 126.6 }, 2: { id: 2, name: 'b', ...bija } };
  const trip = {
    companion_type: 'couple',
    days: [{ date: '2026-11-06', slots: [
      { id: 'x', time: '09:00', fixed: { kind: 'airport_arrive' } },
      { id: 'y', time: '10:00', placeId: 1, stayMinutes: 60 },
      { id: 'z', time: '12:00', placeId: null },
      { id: 'w', time: '13:00', placeId: 2, stayMinutes: 60 },
    ] }],
  };
  const legs = tripLegs(trip, placeMap);
  assert.deepEqual(legs.map((l) => l.key), [pairKey(AIRPORT, placeMap[1]), pairKey(placeMap[1], bija)]);
});
