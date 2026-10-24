import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rainyAlternatives, rainyKey } from '../src/lib/rainy.js';
import { hoursLabel, isAlwaysOpen } from '../src/lib/hours.js';
import { placeMeta, routeShareText } from '../src/lib/format.js';

const FRI = '2026-11-06'; // 금요일
const P = (id, lat, lng, extra = {}) => ({ id, name: id, category: 'sight', lat, lng, indoor: false, kid_tags: [], regular_closed_days: [], ...extra });

const beach = P('beach', 33.39, 126.24);
const museumNear = P('museumNear', 33.4, 126.26, { indoor: true, opening_hours: { all: { open: '09:00', close: '18:00' } } });
const museumFar = P('museumFar', 33.25, 126.56, { indoor: true });
const museumFri = P('museumFri', 33.395, 126.245, { indoor: true, regular_closed_days: [5] });
const trip = (time = '10:00', companion = 'couple') => ({
  companion_type: companion,
  days: [{ date: FRI, slots: [{ id: 's1', time, placeId: 'beach', stayMinutes: 90 }] }],
});

test('야외 볼거리에 가까운 실내 대안을 붙인다 (휴무·먼 곳 제외)', () => {
  const alt = rainyAlternatives(trip(), { beach }, [beach, museumNear, museumFar, museumFri]);
  const a = alt[rainyKey(FRI, 'beach')];
  assert.equal(a.id, 'museumNear');
  assert.ok(a.minutes <= 25);
});

test('그 시각에 닫혀 있으면 대안으로 안 쓴다', () => {
  assert.deepEqual(rainyAlternatives(trip('19:00'), { beach }, [beach, museumNear]), {});
});

test('실내 장소에는 대안을 붙이지 않는다', () => {
  const t = { companion_type: 'kids', days: [{ date: FRI, slots: [{ id: 's1', time: '10:00', placeId: 'museumNear' }] }] };
  assert.deepEqual(rainyAlternatives(t, { museumNear }, [museumNear, museumFri]), {});
});

test('상시 개방 표시', () => {
  const p = { name: '해변', sub_category: '해수욕장', opening_hours: { always: true } };
  assert.equal(isAlwaysOpen(p), true);
  assert.equal(hoursLabel(p, FRI), '상시 개방');
  assert.equal(placeMeta(p, FRI), '해수욕장 · 상시 개방');
});

test('공유 미리보기 문구', () => {
  const t = { region: 'jeju-east', companion_type: 'parents', days: [{}, {}, {}] };
  assert.equal(routeShareText(t, ['a', 'b']), '제주 동쪽 · 2박 3일 · 부모님과 · 2곳 — a, b');
});
