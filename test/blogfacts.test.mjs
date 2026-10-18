import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregate, analyzePost, factsInSentence, isAboutPlace } from '../src/lib/blogfacts/rules.js';

test('blogfacts: 문장 하나에서 있음/없음', () => {
  assert.deepEqual(factsInSentence('아기의자도 있어서 아기손님도 함께와도 좋답니다!'), { baby_chair: 1 });
  assert.deepEqual(factsInSentence('아기의자가 없어서 조금 아쉬웠어요'), { baby_chair: -1 });
  assert.deepEqual(factsInSentence('주차장이 넓어서 편했어요'), { parking: 1 });
  assert.deepEqual(factsInSentence('주차 걱정 없이 다녀왔어요'), { parking: 1 });
  assert.deepEqual(factsInSentence('주차는 협소해서 근처 공영주차장 이용'), { parking: -1 });
  assert.deepEqual(factsInSentence('유모차 끌고 다니기 좋아요'), { stroller: 1 });
  assert.deepEqual(factsInSentence('입구에 계단이 많아 유모차는 힘들어요'), { stroller: -1 });
  assert.deepEqual(factsInSentence('어린이 메뉴도 따로 있어요'), { kids_menu: 1 });
  assert.deepEqual(factsInSentence('발 씻는 곳이 있어서 모래놀이 후에도 편했어요'), { foot_wash: 1 });
  assert.deepEqual(factsInSentence('오늘 날씨가 좋았어요'), {});
  assert.deepEqual(factsInSentence('의자가 편해요'), {}, '그냥 의자는 아기의자가 아님');
  // 실제 글에서 나온 문장 (2026-10 시험)
  assert.deepEqual(factsInSentence('찾아가는 길이 어렵거나 주차하기 힘들지 않나요?'), {}, '질문은 무시');
  assert.deepEqual(factsInSentence('Q : 주차가 가능한가요?'), {});
  assert.deepEqual(factsInSentence('그리고 한쪽에는 아이들 놀이방과 수유실 이 있어'), { nursing: 1, kids_zone: 1 });
  assert.deepEqual(factsInSentence('기저귀갈이대까지 준비되어 있으니'), { nursing: 1 });
  assert.deepEqual(factsInSentence('주차장이 정말 태평양처럼 넓어서 운전 초보도 주차 스트레스 제로입니다.'), { parking: 1 });
});

test('blogfacts: 장소 일치·협찬·노키즈존', () => {
  const place = { name: '금능 돈가스집', address: '제주특별자치도 제주시 한림읍 금능리' };
  assert.ok(isAboutPlace({ title: '제주 금능돈가스집 후기', text: '' }, place));
  assert.ok(!isAboutPlace({ title: '협재 맛집', text: '다른 식당 이야기' }, place));

  const short = { name: '숨도', address: '제주특별자치도 서귀포시 강정동' };
  assert.ok(!isAboutPlace({ title: '숨도 쉬기 힘든 날', text: '' }, short), '짧은 이름은 지역도 있어야');
  assert.ok(isAboutPlace({ title: '서귀포 숨도 다녀옴', text: '' }, short));

  const p = analyzePost({ title: '금능 돈가스집', text: '업체로부터 식사를 제공받아 작성했어요\n아기의자 있어요\n아기의자는 없었어요' }, place);
  assert.equal(p.sponsored, true);
  assert.deepEqual(p.facts, {}, '같은 글 안에서 엇갈리면 버림');
  assert.equal(analyzePost({ title: '금능 돈가스집', text: '여기는 노키즈존이에요' }, place).nokids, true);
  assert.equal(analyzePost({ title: '금능 돈가스집', text: '노키즈존 아니에요 아이랑 가도 돼요' }, place).nokids, false);
});

test('blogfacts: 여러 글 집계 — 2개 이상 일치해야 인정', () => {
  const now = Date.parse('2026-10-18');
  const post = (facts, extra = {}) => ({ url: `u${Math.random()}`, date: '2026-05-01', relevant: true, sponsored: false, nokids: false, facts, ...extra });
  const r = aggregate(
    [
      post({ baby_chair: 1, parking: 1 }),
      post({ baby_chair: 1, parking: -1 }),
      post({ baby_chair: 1 }, { sponsored: true }),
      post({ kids_menu: 1 }),
      post({ floor_seat: 1 }, { date: '2021-01-01' }), // 3년 넘음
      post({ nursing: 1 }, { relevant: false }), // 다른 장소 글
    ],
    { now }
  );
  assert.equal(r.tags.baby_chair.verdict, 'yes');
  assert.equal(r.tags.baby_chair.pos, 2, '협찬은 세지 않음');
  assert.equal(r.tags.baby_chair.evidence.length, 3, '협찬도 근거로는 남김');
  assert.equal(r.tags.parking.verdict, 'mixed');
  assert.equal(r.tags.kids_menu.verdict, 'weak');
  assert.equal(r.tags.floor_seat, undefined);
  assert.equal(r.tags.nursing, undefined);
});
