/**
 * tagProof.js — 아이 태그의 후기 근거 (화면 표시용, 순수 함수)
 * 운영자가 넣은 태그(kid_tags) 중 후기 판정이 「있음」인 것만, 협찬 아닌 글 링크를 최대 3개.
 * review_facts 구조는 scripts/blogfacts 참고.
 */
export function tagProof(place) {
  const facts = place?.review_facts?.tags;
  if (!facts) return {};
  const out = {};
  for (const tag of place.kid_tags || []) {
    const f = facts[tag];
    if (f?.verdict !== 'yes') continue;
    const links = (f.evidence || []).filter((e) => e.url && e.value !== 'no' && !e.sponsored).slice(0, 3).map((e) => ({ url: e.url, date: e.date || '' }));
    if (links.length) out[tag] = { count: f.pos || links.length, links };
  }
  return out;
}
