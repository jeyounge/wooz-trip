/**
 * rev.js — 일정(days) 지문. 같이 고칠 때 "내가 불러온 일정이 지금 DB 와 같은지" 확인하는 데 쓴다.
 * jsonb 는 키 순서를 바꿔 저장하므로 키를 정렬해서 문자열로 만든 뒤 해시한다.
 * 서버에서만 계산해서 화면에 넘긴다 (화면은 받은 값을 저장할 때 그대로 돌려준다).
 */

function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(v[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

/** FNV-1a 32bit 두 번 (충돌 걱정 없을 만큼) → 16자리 */
export function daysRev(days) {
  const s = stable(days ?? []);
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x5bd1e995) ^ (b >>> 15);
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}
