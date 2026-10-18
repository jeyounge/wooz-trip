/**
 * intro.js — 소개 문장 틀 (관리자 「소개 초안 만들기」와 승인 스크립트가 같이 쓴다)
 * 운영자가 체크한 종류·태그만으로 만든다. 지어낸 내용은 넣지 않는다.
 */
export function introTemplate(place, tagLabels = {}) {
  const tags = (place.kid_tags || []).filter((t) => t !== 'regular_closed').map((t) => tagLabels[t] || t);
  const kind = place.sub_category || '장소';
  const parts = [`${kind}${place.indoor ? '(실내)' : ''}`];
  if (tags.length) parts.push(`${tags.slice(0, 3).join(', ')} 있어요`);
  return parts.join(' · ');
}
