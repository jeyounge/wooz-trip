import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanText, homepageOf, kidTagsOf, parseClosedDays, parseHours, regionOf, toPlace } from '../src/lib/tourapi/transform.js';

test('tourapi: 전국 — 다른 시·도는 시·도 단위 지역, 홈페이지 링크', () => {
  const item = {
    contentid: 'i1', contenttypeid: '12', title: '[테스트] 인천 공원', addr1: '인천광역시 연수구', mapx: '126.64', mapy: '37.39',
    lDongRegnCd: '28', lDongSignguCd: '185',
  };
  const { row } = toPlace(item, { usetime: '09:00~18:00' }, {}, {}, {
    common: { homepage: '<a href="https://example.com/park" target="_blank">https://example.com/park</a>', overview: '<p>소개</p>' },
    area: { code: '28', slug: 'incheon' },
  });
  assert.equal(row.region, 'incheon');
  assert.equal(row.sido_code, '28');
  assert.equal(row.sigungu_code, '185');
  assert.equal(row.external_links.home, 'https://example.com/park');
  assert.equal(row.source_data.overview, '소개');
  // 제주 목록에 육지 좌표가 섞이면 뺀다, 다른 지역은 국내면 받는다
  assert.equal(toPlace(item, {}, {}, {}, { area: { code: '50', slug: 'jeju' } }), null);
  assert.equal(homepageOf('www.example.com'), 'https://www.example.com/');
  assert.equal(homepageOf('없음'), null);
  assert.equal(homepageOf('<a href="https://www.visitjeju.net/kr/">비짓제주</a>'), null, '포털 첫 화면은 버림');
  assert.equal(homepageOf('https://www.visitjeju.net/kr'), null);
  assert.ok(homepageOf('https://www.visitjeju.net/kr/detail/view?contentsid=CNTS_1'), '그 장소 상세 페이지는 남김');
});

test('tourapi: 지역은 주소 읍면동, 없으면 좌표', () => {
  assert.equal(regionOf('제주특별자치도 제주시 애월읍 애월리 1'), 'jeju-west');
  assert.equal(regionOf('제주특별자치도 서귀포시 대정읍 하모리'), 'jeju-west');
  assert.equal(regionOf('제주특별자치도 서귀포시 성산읍 성산리'), 'jeju-east');
  assert.equal(regionOf('제주특별자치도 제주시 구좌읍 월정리'), 'jeju-east');
  assert.equal(regionOf('제주특별자치도 서귀포시 안덕면 사계리'), 'jeju-south');
  assert.equal(regionOf('제주특별자치도 서귀포시 중문동'), 'jeju-south');
  assert.equal(regionOf('제주특별자치도 제주시 연동'), 'jeju-city');
  assert.equal(regionOf('', 33.39, 126.24), 'jeju-west');
  assert.equal(regionOf('', 33.46, 126.93), 'jeju-east');
  assert.equal(regionOf('', 33.25, 126.56), 'jeju-south');
  assert.equal(regionOf('', 33.5, 126.53), 'jeju-city');
});

test('tourapi: 영업시간 글 → 시간', () => {
  assert.deepEqual(parseHours('09:00~18:00 (입장마감 17:00)'), { hours: { all: { open: '09:00', close: '18:00', lastOrder: '17:00' } }, flags: [] });
  assert.deepEqual(parseHours('10:00 ~ 21:00<br>라스트오더 20:30').hours, { all: { open: '10:00', close: '21:00', lastOrder: '20:30' } });
  assert.deepEqual(parseHours('매일 9시~18시').hours, { all: { open: '09:00', close: '18:00' } });

  const wk = parseHours('평일 11:00~21:00 / 주말 10:00~21:00');
  assert.deepEqual(wk.hours.all, { open: '11:00', close: '21:00' });
  assert.deepEqual(wk.hours['0'], { open: '10:00', close: '21:00' });
  assert.deepEqual(wk.hours['6'], { open: '10:00', close: '21:00' });

  const br = parseHours('11:00~21:00 (브레이크타임 15:00~17:00)');
  assert.deepEqual(br.hours.all, { open: '11:00', close: '21:00' });
  assert.ok(br.flags.includes('hours_break'));

  assert.ok(parseHours('하절기 09:00~19:00 / 동절기 09:00~18:00').flags.includes('hours_seasonal'));
  assert.deepEqual(parseHours('상시 개방 (24시간)'), { hours: null, flags: [] });
  assert.deepEqual(parseHours('상시 개방'), { hours: null, flags: [] });
  assert.deepEqual(parseHours('문의 바람'), { hours: null, flags: ['hours_check'] });
  assert.deepEqual(parseHours(''), { hours: null, flags: ['hours_missing'] });
});

test('tourapi: 실제 응답 모양 (2026-10 probe)', () => {
  // 음식점: 요일 범위별 시간
  const food = parseHours('- 화요일~금요일 09:00~19:00<br>- 토요일~월요일 09:00~21:00');
  assert.deepEqual(food.hours.all, { open: '09:00', close: '19:00' }); // 화~금 4일이 더 많음
  for (const d of ['6', '0', '1']) assert.deepEqual(food.hours[d], { open: '09:00', close: '21:00' });
  assert.equal(food.hours['3'], undefined);
  // 문화시설: "입장 마감"
  assert.deepEqual(parseHours('- 09:00~18:00- 입장 마감 17:30').hours, { all: { open: '09:00', close: '18:00', lastOrder: '17:30' } });
  // 레포츠: 계절별 + 정비시간
  const lp = parseHours('[1월~6월/9월~10월]- 09:00~18:30- 정비시간 12:00~13:00- 운행 마감 18:10[7월~8월]- 09:00~18:30');
  assert.deepEqual(lp.hours.all, { open: '09:00', close: '18:30', lastOrder: '18:10' });
  assert.ok(lp.flags.includes('hours_seasonal') && lp.flags.includes('hours_break'));
  // 관광지: 시간 없이 안내문
  assert.ok(parseHours('※ 일부 출입이 제한되거나 통제되므로 방문 시 전화문의 요망').flags.includes('hours_check'));
  // 휴무: 날짜만 있는 경우 / 무휴 + 안내
  assert.deepEqual(parseClosedDays('1월 1일 / 설·추석 연휴'), { days: [], flags: [] });
  assert.deepEqual(parseClosedDays('연중무휴<br>※ 변동 가능성이 있으므로 전화문의 요망'), { days: [], flags: [] });
  // 아이 태그: 놀이방 0/1, 무장애 "아기의자 9개", 주차 "불가능"
  assert.deepEqual(kidTagsOf({ kidsfacility: '0', parkingfood: '불가능' }, { babysparechair: '아기의자 9개', stroller: '' }), ['baby_chair']);
  assert.deepEqual(kidTagsOf({ kidsfacility: '1' }, {}), ['kids_zone']);
});

test('tourapi: 휴무 글 → 매주 쉬는 요일', () => {
  assert.deepEqual(parseClosedDays('매주 월요일'), { days: [1], flags: [] });
  assert.deepEqual(parseClosedDays('월·화요일 휴무'), { days: [1, 2], flags: [] });
  assert.deepEqual(parseClosedDays('매주 화요일, 1월 1일, 설·추석 당일'), { days: [2], flags: [] });
  assert.deepEqual(parseClosedDays('연중무휴'), { days: [], flags: [] });
  assert.deepEqual(parseClosedDays('토,일 휴무'), { days: [0, 6], flags: [] });
  const monthly = parseClosedDays('매월 첫째 주 월요일');
  assert.deepEqual(monthly.days, []);
  assert.ok(monthly.flags.includes('closed_monthly'));
  assert.ok(parseClosedDays('부정기 휴무 (인스타 공지)').flags.includes('closed_irregular'));
});

test('tourapi: 아이 태그는 공식 항목에서만', () => {
  assert.deepEqual(kidTagsOf({ parkingfood: '가능', kidsfacility: '없음' }, {}).sort(), ['parking']);
  assert.deepEqual(
    kidTagsOf({ chkbabycarriage: '불가' }, { stroller: '유모차 대여 가능', lactationroom: '수유실 있음(1층)', babysparechair: '' }).sort(),
    ['nursing', 'stroller']
  );
  assert.equal(cleanText('a<br/>b &amp; c'), 'a\nb & c');
});

test('tourapi: 한 장소 변환 (카페 판별·휴무 태그·제주 밖 제외)', () => {
  const item = {
    contentid: '9001', contenttypeid: '39', title: '[테스트] 귤밭 카페', addr1: '제주특별자치도 제주시 한림읍 협재리 1',
    mapx: '126.25', mapy: '33.39', cat3: 'A05020900', tel: '064-000-0000',
  };
  const { row, flags } = toPlace(item, { opentimefood: '10:00~18:00', restdatefood: '매주 화요일', parkingfood: '가능' }, {}, { A05020900: '카페/전통찻집' });
  assert.equal(row.category, 'cafe');
  assert.equal(row.region, 'jeju-west');
  assert.equal(row.source_provider, 'tourapi');
  assert.equal(row.source_external_id, '9001');
  assert.deepEqual(row.regular_closed_days, [2]);
  assert.ok(row.kid_tags.includes('parking') && row.kid_tags.includes('regular_closed'));
  assert.deepEqual(row.opening_hours, { all: { open: '10:00', close: '18:00' } });
  assert.equal(row.status, 'candidate');
  assert.deepEqual(flags, []);

  assert.equal(toPlace({ ...item, mapy: '37.5', mapx: '127.0' }), null, '제주 밖');
  assert.equal(toPlace({ ...item, contenttypeid: '32' }), null, '숙박은 안 받음');
  assert.ok(toPlace({ ...item, contenttypeid: '12' }).flags.includes('no_detail'));
});
