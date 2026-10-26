import test from 'node:test';
import assert from 'node:assert/strict';
import { tagProof } from '../src/lib/tagProof.js';

test('tagProof: 운영자가 넣은 태그 중 「있음」만, 협찬 글 빼고 3개까지', () => {
  const ev = (n, extra = {}) => ({ url: `https://blog.example/${n}`, date: '2026-10-0' + n, value: 'yes', sponsored: false, ...extra });
  const place = {
    kid_tags: ['parking', 'baby_chair', 'stroller'],
    review_facts: {
      tags: {
        parking: { verdict: 'yes', pos: 5, neg: 0, evidence: [ev(1), ev(2, { sponsored: true }), ev(3), ev(4), ev(5)] },
        baby_chair: { verdict: 'mixed', pos: 2, neg: 1, evidence: [ev(6)] },
        kids_zone: { verdict: 'yes', pos: 2, neg: 0, evidence: [ev(7)] }, // 운영자가 안 넣은 태그
      },
    },
  };
  const p = tagProof(place);
  assert.deepEqual(Object.keys(p), ['parking']);
  assert.equal(p.parking.count, 5);
  assert.deepEqual(p.parking.links.map((l) => l.url), ['https://blog.example/1', 'https://blog.example/3', 'https://blog.example/4']);
});

test('tagProof: 근거 없으면 빈 객체', () => {
  assert.deepEqual(tagProof({ kid_tags: ['parking'] }), {});
  assert.deepEqual(tagProof(null), {});
});
