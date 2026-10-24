/**
 * 공유 미리보기 이미지(next/og)용 한글 서체.
 * 이미지 엔진에는 한글 글꼴이 없어서, 그림에 들어가는 글자만 Google Fonts 에서 잘라 받는다 (시안 B 제목 서체 Jua).
 * 받기에 실패하면 빈 배열 → 기본 서체로 그린다 (이미지 자체는 나온다).
 */
export async function loadDisplayFont(text) {
  try {
    const unique = [...new Set(text)].join('');
    const cssRes = await fetch(`https://fonts.googleapis.com/css2?family=Jua&text=${encodeURIComponent(unique)}`, {
      next: { revalidate: 86400 },
    });
    const css = await cssRes.text();
    const url = css.match(/src:\s*url\(([^)]+)\)\s*format\('(?:opentype|truetype)'\)/)?.[1];
    if (!url) return [];
    const data = await (await fetch(url, { next: { revalidate: 86400 } })).arrayBuffer();
    return [{ name: 'Jua', data, style: 'normal', weight: 400 }];
  } catch {
    return [];
  }
}
