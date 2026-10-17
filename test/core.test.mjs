import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateCarMinutes, haversineM, formatDuration } from '../src/lib/geo.js';
import { checkVisit, dowOf, dayCount, addDays, toMin, hoursOn } from '../src/lib/hours.js';
import { buildDays, computeDay, summarize, redateDays, overlapsNap } from '../src/lib/trip.js';
import { rankCandidates } from '../src/lib/candidates.js';
import { buildFillTasks, validatePicks, applyPicks, finalCheck } from '../src/lib/ai/fill.js';
import { chooseRoute, planFromRoute, placeIndex, scoreRoute } from '../src/lib/ai/routes.js';

const FRI = '2026-11-06'; // 금요일
const place = (id, extra = {}) => ({
  id,
  name: `[샘플] ${id}`,
  category: 'food',
  lat: 33.41,
  lng: 126.27,
  opening_hours: { all: { open: '10:00', close: '21:00', lastOrder: '20:30' } },
  regular_closed_days: [],
  kid_tags: [],
  ...extra,
});

test('geo: 거리와 이동시간 추정', () => {
  const a = { lat: 33.4625, lng: 126.3305 };
  const b = { lat: 33.393, lng: 126.242 };
  const m = haversineM(a, b);
  assert.ok(m > 10000 && m < 12500, `distance ${m}`);
  const min = estimateCarMinutes(a, b);
  assert.equal(min % 5, 0);
  assert.ok(min >= 25 && min <= 35, `minutes ${min}`);
  assert.equal(estimateCarMinutes(a, a), 0);
  assert.equal(estimateCarMinutes(a, { lat: null, lng: null }), null);
  assert.equal(formatDuration(80), '1시간 20분');
});

test('hours: 요일·날짜 계산', () => {
  assert.equal(dowOf(FRI), 5);
  assert.equal(dayCount('2026-11-06', '2026-11-08'), 3);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(hoursOn(place(1, { opening_hours: { all: { open: '18:00', close: '02:00' } } }), FRI).close, toMin('02:00') + 1440);
});

test('hours: 정기휴무·영업시간 판단', () => {
  const closedFri = place(1, { regular_closed_days: [5] });
  assert.equal(checkVisit(closedFri, FRI, toMin('12:00'), 60).closed, true);
  assert.equal(checkVisit(place(2), FRI, toMin('09:00'), 60).level, 'warn'); // 오픈 전
  assert.equal(checkVisit(place(2), FRI, toMin('20:45'), 60).level, 'warn'); // 라스트오더 뒤
  const tight = checkVisit(place(2), FRI, toMin('19:45'), 90);
  assert.equal(tight.level, 'info');
  assert.match(tight.message, /45분/);
  assert.equal(checkVisit(place(3, { opening_hours: null }), FRI, toMin('03:00'), 60).level, 'none');
});

test('trip: 기본 일자·슬롯 생성', () => {
  const days = buildDays({ startDate: FRI, endDate: '2026-11-08', arrivalTime: '10:30', departureTime: '18:40', stayName: '애월 숙소' });
  assert.equal(days.length, 3);
  const d1 = days[0].slots;
  assert.equal(d1[0].fixed.kind, 'airport_arrive');
  assert.equal(d1.at(-1).fixed.kind, 'stay_end');
  assert.ok(!d1.some((s) => s.slotType === 'am'), '도착 전 오전 슬롯 없음');
  const d3 = days[2].slots;
  assert.equal(d3.at(-1).fixed.kind, 'airport_depart');
  assert.equal(d3.at(-1).time, '16:40'); // 출발 2시간 전
  assert.ok(!d3.some((s) => s.slotType === 'dinner'), '마지막 날 저녁 없음');
  // 시각은 오름차순
  for (const d of days) {
    const ts = d.slots.map((s) => toMin(s.time));
    assert.deepEqual([...ts].sort((a, b) => a - b), ts);
  }
});

test('trip: 타임라인 이동시간·휴무·지각 경고', () => {
  const trip = { companion_type: 'kids', days: [] };
  const p1 = place(1, { lat: 33.4625, lng: 126.3305 });
  const p2 = place(2, { lat: 33.393, lng: 126.242, regular_closed_days: [5] });
  const map = { 1: p1, 2: p2 };
  const day = {
    date: FRI,
    slots: [
      { id: 'a', time: '12:00', slotType: 'lunch', placeId: 1, stayMinutes: 60 },
      { id: 'b', time: '13:05', slotType: 'pm', placeId: 2, stayMinutes: 60 },
    ],
  };
  const rows = computeDay(day, map, trip);
  assert.equal(rows[0].travelFromPrev, null);
  assert.ok(rows[1].travelFromPrev.minutes > 0);
  assert.equal(rows[1].travelFromPrev.nap, true);
  assert.equal(rows[1].check.closed, true);
  assert.ok(rows[1].lateBy > 0);
  const sum = summarize({ ...trip, days: [day] }, map);
  assert.equal(sum.places, 2);
  assert.equal(sum.warns, 1);
});

test('trip: 복사 시 날짜만 새로 매긴다', () => {
  const days = [{ date: FRI, slots: [{ id: 'x', time: '12:00', placeId: 1, aiReason: 'r' }] }];
  const out = redateDays(days, '2026-12-01');
  assert.equal(out[0].date, '2026-12-01');
  assert.equal(out[0].slots[0].placeId, 1);
  assert.notEqual(out[0].slots[0].id, 'x');
  assert.equal(out[0].slots[0].aiReason, undefined);
  assert.equal(overlapsNap(toMin('12:30'), 20), false);
});

test('candidates: 카테고리·태그·휴무·거리 정렬', () => {
  const places = [
    place(1, { lat: 33.5, lng: 126.5, kid_tags: ['baby_chair'] }),
    place(2, { lat: 33.411, lng: 126.271, kid_tags: ['baby_chair'], regular_closed_days: [5] }),
    place(3, { lat: 33.42, lng: 126.28, kid_tags: ['baby_chair', 'parking'] }),
    place(4, { category: 'cafe', lat: 33.41, lng: 126.27 }),
  ];
  const r = rankCandidates(places, { date: FRI, time: '18:00', slotType: 'dinner', from: { lat: 33.41, lng: 126.27 }, tags: ['baby_chair'] });
  assert.deepEqual(r.map((p) => p.id), [3, 1, 2]); // 쉬는 날(2)은 맨 아래, 카페(4) 제외
  const r2 = rankCandidates(places, { date: FRI, time: '18:00', slotType: 'dinner', tags: ['parking'], excludeIds: [] });
  assert.deepEqual(r2.map((p) => p.id), [3]);
});

test('ai fill: 후보 밖 ID·중복은 버리고 코드 후보로 채운다', () => {
  const places = [
    place(1, { lat: 33.41, lng: 126.27 }),
    place(2, { lat: 33.42, lng: 126.28 }),
    place(3, { lat: 33.43, lng: 126.29, regular_closed_days: [5] }),
  ];
  const trip = {
    companion_type: 'kids',
    days: [{
      date: FRI,
      slots: [
        { id: 'L', time: '12:00', slotType: 'lunch', placeId: null, stayMinutes: 60 },
        { id: 'D', time: '18:00', slotType: 'dinner', placeId: null, stayMinutes: 90 },
      ],
    }],
  };
  const tasks = buildFillTasks(trip, places);
  assert.equal(tasks.length, 2);
  assert.ok(tasks.every((t) => t.candidates.every((c) => c.id !== 3)), '쉬는 날 장소는 후보에서 빠진다');

  const picks = validatePicks(tasks, [
    { slotId: 'L', placeId: 999, reason: '없는 장소' },
    { slotId: 'D', placeId: 2, reason: '가까워요' },
  ]);
  assert.equal(picks.length, 2);
  const L = picks.find((p) => p.slotId === 'L');
  const D = picks.find((p) => p.slotId === 'D');
  assert.equal(D.source, 'pick');
  assert.equal(L.source, 'rule');
  assert.notEqual(L.placeId, D.placeId);

  const days = applyPicks(trip.days, picks);
  const map = Object.fromEntries(places.map((p) => [p.id, p]));
  const { days: checked, filled } = finalCheck(trip, days, map);
  assert.equal(filled, 2);
  assert.ok(checked[0].slots.every((s) => s.placeId));
});

test('ai routes: 장소 참조는 id 숫자와 source_external_id 둘 다 된다', () => {
  const find = placeIndex([place(7, { source_external_id: 'sample-07' }), place(8)]);
  assert.equal(find(7).id, 7);
  assert.equal(find('7').id, 7);
  assert.equal(find('sample-07').id, 7);
  assert.equal(find('sample-99'), null);
});

test('ai routes: 맞는 루트를 골라 빈 슬롯에만 넣고, 그날 쉬는 곳은 버린다', () => {
  const places = [
    place(1, { category: 'sight', source_external_id: 's1', opening_hours: null }),
    place(2, { source_external_id: 's2' }),
    place(3, { source_external_id: 's3', regular_closed_days: [5] }), // 금요일 휴무
    place(4, { category: 'cafe', source_external_id: 's4' }),
  ];
  const trip = {
    region: 'jeju-west',
    companion_type: 'kids',
    kids_ages: [5],
    days: [{
      date: FRI,
      slots: [
        { id: 'A', time: '10:00', slotType: 'am', placeId: null, stayMinutes: 120 },
        { id: 'L', time: '12:00', slotType: 'lunch', placeId: null, stayMinutes: 60 },
        { id: 'C', time: '16:00', slotType: 'cafe', placeId: 4, stayMinutes: 60 }, // 사용자가 이미 고름
        { id: 'D', time: '18:00', slotType: 'dinner', placeId: null, stayMinutes: 90 },
      ],
    }],
  };
  const good = {
    id: 10, region: 'jeju-west', companion_type: 'kids', day_count: 1, kid_age_min: 3, kid_age_max: 8,
    days: [{ slots: [
      { slot: 'am', place: 's1', reason: '모래놀이' },
      { slot: 'lunch', place: 's2', reason: '아기의자' },
      { slot: 'cafe', place: 's4', reason: '이미 쓴 곳' },
      { slot: 'dinner', place: 's3', reason: '금요일 휴무' },
    ] }],
  };
  const other = { ...good, id: 11, region: 'jeju-east', companion_type: 'couple' };
  assert.ok(scoreRoute(good, trip) > scoreRoute(other, trip));

  const picks = planFromRoute(good, trip, places);
  assert.deepEqual(picks.map((p) => [p.slotId, p.placeId]), [['A', 1], ['L', 2]]);
  assert.ok(picks.every((p) => p.source === 'route' && p.reason));

  const chosen = chooseRoute([other, good], trip, places, { random: () => 0 });
  assert.equal(chosen.route.id, 10);
  // 비슷한 루트가 여럿이면 직전에 쓴 루트는 피한다
  const twin = { ...good, id: 12 };
  assert.equal(chooseRoute([good, twin], trip, places, { excludeId: 10, random: () => 0 }).route.id, 12);
  assert.equal(chooseRoute([], trip, places), null);
});
