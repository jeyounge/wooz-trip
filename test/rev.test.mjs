import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysRev } from '../src/lib/rev.js';

test('일정 지문: 키 순서·undefined 는 무시하고 내용이 바뀌면 달라진다', () => {
  const a = [{ date: '2026-11-01', slots: [{ id: 's1', time: '10:00', placeId: 3, memo: '' }] }];
  const b = [{ slots: [{ memo: '', placeId: 3, time: '10:00', id: 's1', custom: undefined }], date: '2026-11-01' }];
  assert.equal(daysRev(a), daysRev(b));
  const c = [{ date: '2026-11-01', slots: [{ id: 's1', time: '10:00', placeId: 4, memo: '' }] }];
  assert.notEqual(daysRev(a), daysRev(c));
  assert.match(daysRev(a), /^[0-9a-f]{16}$/);
  assert.equal(daysRev(null), daysRev([]));
});
