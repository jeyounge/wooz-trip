import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canLogSpend, canReview, hasLog, logTotals, sanitizeLog, slotLog, todayKST } from '../src/lib/triplog.js';

const days = [
  { date: '2026-11-06', slots: [{ id: 'a', placeId: 1 }, { id: 'b', placeId: 2 }, { id: 'f', placeId: null, fixed: { kind: 'stay_end' } }] },
  { date: '2026-11-07', slots: [{ id: 'c', placeId: 3 }] },
];

test('triplog: 이 여행의 장소 슬롯 기록만 남기고 값을 정리한다', () => {
  const log = sanitizeLog(
    {
      slots: {
        a: { cost: '32,000원', rating: 'good', note: '  아이가 좋아함  ' },
        b: { cost: -5, rating: 'wow' }, // 음수·모르는 평가 → 비어서 빠짐
        f: { cost: 1000 }, // 장소 없는 고정 슬롯
        zz: { cost: 1000 }, // 없는 슬롯
        c: { cost: 99_999_999 },
      },
      extras: [{ label: '렌터카', amount: '120000' }, { label: '', amount: 5 }, { label: '간식', amount: 0 }],
      rating: '9',
      comment: 'x'.repeat(400),
      isPublic: 'yes',
    },
    days
  );
  assert.deepEqual(log.slots, { a: { placeId: 1, cost: 32000, rating: 'good', note: '아이가 좋아함' }, c: { placeId: 3, cost: 10_000_000 } });
  assert.deepEqual(log.extras, [{ label: '렌터카', amount: 120000 }]);
  assert.equal(log.rating, null);
  assert.equal(log.comment.length, 300);
  assert.equal(log.isPublic, true);

  // 슬롯 장소가 바뀐 뒤 남은 옛 기록은 새 장소에 붙지 않는다
  const stale = sanitizeLog({ slots: { a: { placeId: 99, cost: 5000 }, b: { placeId: 2, cost: 3000 } } }, days);
  assert.deepEqual(stale.slots, { b: { placeId: 2, cost: 3000 } });
});

test('triplog: 합계와 장소가 바뀐 슬롯', () => {
  const log = { slots: { a: { placeId: 1, cost: 10000 }, b: { placeId: 2, cost: 5000 }, c: { placeId: 3, cost: 7000 } }, extras: [{ label: '항공', amount: 200000 }] };
  assert.deepEqual(logTotals(log, days), { perDay: [15000, 7000], extras: 200000, total: 222000 });
  // b 슬롯 장소를 바꾸면 옛 기록은 안 보이고 합계에서도 빠진다
  const moved = [{ ...days[0], slots: [days[0].slots[0], { id: 'b', placeId: 9 }] }, days[1]];
  assert.equal(slotLog(log, moved[0].slots[1]), null);
  assert.deepEqual(logTotals(log, moved).perDay, [10000, 7000]);
  assert.equal(hasLog({ slots: {}, extras: [], rating: null, comment: '' }), false);
  assert.equal(hasLog(log), true);
});

test('triplog: 기록 여는 날짜 (한국 시각)', () => {
  const trip = { start_date: '2026-11-06', end_date: '2026-11-08' };
  assert.equal(canLogSpend(trip, '2026-11-05'), false);
  assert.equal(canLogSpend(trip, '2026-11-06'), true);
  assert.equal(canReview(trip, '2026-11-07'), false);
  assert.equal(canReview(trip, '2026-11-08'), true);
  // UTC 15:30 = 한국 다음날 00:30
  assert.equal(todayKST(Date.parse('2026-11-05T15:30:00Z')), '2026-11-06');
});
