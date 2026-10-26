import test from 'node:test';
import assert from 'node:assert/strict';
import { nowNext } from '../src/lib/trip.js';

const row = (id, time, stayMinutes, point = { lat: 33.4, lng: 126.5 }) => ({ slot: { id, time, stayMinutes, placeId: 1 }, point });
const rows = [row('a', '09:00', 60), row('b', '12:00', 60), { slot: { id: 'empty', time: '14:00' }, point: null }, row('c', '15:00', 90)];

test('nowNext: 머무는 중이면 지금 + 다음', () => {
  const r = nowNext(rows, 9 * 60 + 30);
  assert.equal(r.current.slot.id, 'a');
  assert.equal(r.next.slot.id, 'b');
  assert.equal(r.currentEnd, 10 * 60);
});

test('nowNext: 이동 중이면 다음만, 빈 칸은 건너뜀', () => {
  const r = nowNext(rows, 13 * 60 + 30);
  assert.equal(r.current, null);
  assert.equal(r.next.slot.id, 'c');
});

test('nowNext: 일정이 끝나면 둘 다 없음', () => {
  const r = nowNext(rows, 18 * 60);
  assert.equal(r.current, null);
  assert.equal(r.next, null);
  assert.equal(r.any, true);
});
