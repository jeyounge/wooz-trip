/**
 * blogfacts/rules.js — 블로그 후기 글에서 "카테고리화할 수 있는 사실"만 규칙으로 뽑는다 (순수 함수, LLM 없음)
 *
 * 원칙
 *  - 글 본문은 저장하지 않는다. 결과는 태그별 있음(+1)/없음(-1)과 근거 글 주소·날짜뿐이다.
 *  - 한 글만으로는 인정하지 않는다. 서로 다른 글 2개 이상이 같은 말을 하고 반대가 없어야 'yes'/'no'.
 *  - 협찬·광고 글은 기록하되 인정 기준(2개)에는 세지 않는다.
 *  - 네이버 robots.txt 가 AI 학습·RAG 용도를 금지하므로 AI 로 읽히지 않는다 (이 파일의 사전만 쓴다).
 */

// 태그별 사전: key = 무엇을 말하는지, pos = 있다/좋다 쪽 말, neg = 없다/나쁘다 쪽 말
// key 가 나온 문장에서, key 뒤 20자 안의 말로 판단한다 (한국어는 서술어가 뒤에 온다)
export const FACT_RULES = {
  baby_chair: {
    label: '아기의자',
    key: /(?:아기|유아|어린이|아이|베이비)\s*(?:용\s*)?(?:의자|체어)|하이\s*체어|부스터\s*(?:시트|의자)/,
    pos: /있|구비|준비|비치|가져다|챙겨|제공|마련|여러\s*개|넉넉|앉혀|앉아/,
    neg: /없|부족|모자라|안\s*(?:보|줘|주)|못\s*봤|요청해도/,
  },
  kids_menu: {
    label: '유아 메뉴',
    key: /(?:어린이|아이|유아|키즈|아기)\s*(?:메뉴|세트|정식|식판|돈가스|돈까스|밥|반찬)/,
    pos: /있|주문|시켜|나와|제공|따로|좋|맛있|먹/,
    neg: /없|안\s*(?:팔|해)|따로\s*없/,
  },
  parking: {
    label: '주차',
    key: /주차/,
    pos: /넓|편|가능|무료|여유|넉넉|쉽|걱정\s*(?:없|안)|전용\s*주차장|주차장\s*(?:이|도|은)?\s*(?:있|완비|마련)/,
    neg: /불가|어렵|힘들|협소|좁|부족|헬|전쟁|없어서|자리\s*없|공간\s*없|쉽지\s*않|애먹/,
  },
  stroller: {
    label: '유모차',
    key: /유모차/,
    pos: /가능|들어가|끌고|편|대여|진입|다니기\s*좋|무리\s*없/,
    neg: /불가|어렵|힘들|계단|못\s*(?:들어|가)|비추|접어/,
  },
  nursing: {
    label: '수유실',
    key: /수유실|기저귀\s*(?:교환|갈이)\s*대|수유\s*(?:공간|룸)/,
    pos: /있|마련|구비|깨끗|넓|편/,
    neg: /없|부족/,
  },
  floor_seat: {
    label: '좌식',
    key: /좌식|신발\s*벗고|방\s*(?:자리|좌석)|룸\s*좌석|온돌/,
    pos: /있|좋|편|마련|가능|앉/,
    neg: /없|불편/,
  },
  foot_wash: {
    label: '발 씻는 곳',
    key: /발\s*(?:씻|닦|세척)|세족|샤워\s*(?:시설|장|실)|모래\s*(?:털|씻)/,
    pos: /있|가능|마련|편|무료|좋/,
    neg: /없|불가|유료만/,
  },
  kids_zone: {
    label: '키즈존',
    key: /키즈\s*(?:존|룸|공간|카페|놀이)|놀이방|놀이\s*(?:공간|시설|터)|아이들\s*놀\s*(?:곳|공간)/,
    pos: /있|마련|넓|좋|잘\s*되|놀|깨끗/,
    neg: /없|좁|작아서/,
  },
};

/** 노키즈존은 태그가 아니라 경고로 따로 본다 */
const NO_KIDS = /노\s*키즈(?:\s*존)?|어린이\s*(?:출입|입장)\s*(?:금지|불가|제한)|\d{1,2}\s*세\s*미만\s*(?:출입|입장|이용)\s*(?:금지|불가|제한)|아이\s*동반\s*(?:불가|안\s*돼|안\s*됩)/;
const NOT_NO_KIDS = /노\s*키즈\s*(?:존)?\s*(?:아니|아님|아닙|아니에요|X)|노키즈존이\s*아니/;

/** 협찬·광고 표시 */
const SPONSORED = /협찬|제공\s*받아|제공받|원고료|소정의|업체로부터|체험단|광고\s*(?:포함|입니다)|유료\s*광고|지원\s*받아/;

/** HTML → 문장 목록 (본문은 메모리에서만 쓰고 버린다) */
export function htmlToSentences(html) {
  const text = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;|​/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return text
    .split(/\n|(?<=[.!?。]|[요다죠네음]\s)\s+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= 4 && s.length <= 400);
}

/** 이름 비교용: 공백·괄호·특수문자 제거, 소문자 */
export function normName(s) {
  return String(s || '')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, '')
    .replace(/[\s·.,'"!?~\-_/]/g, '')
    .toLowerCase();
}

/**
 * 글이 이 장소 얘기인지: 장소 이름(괄호 뺀 것)이 제목이나 본문에 있어야 한다.
 * 이름이 짧거나(3자 이하) 흔하면 지역 단어도 같이 있어야 한다.
 */
export function isAboutPlace({ title = '', text = '' }, place) {
  const name = normName(place.name);
  if (name.length < 2) return false;
  const hay = normName(`${title} ${text.slice(0, 20000)}`);
  if (!hay.includes(name)) return false;
  if (name.length > 3) return true;
  const area = (place.address || '').split(/\s+/).slice(1, 3).map((w) => w.replace(/(특별자치도|특별자치시|광역시|특별시|시|군|구|읍|면|동)$/, ''));
  return area.some((w) => w.length >= 2 && hay.includes(normName(w)));
}

/** 한 문장 → { tag: +1 | -1 } */
export function factsInSentence(sentence) {
  const out = {};
  // 질문("주차 가능한가요?", "힘들지 않나요?")은 사실이 아니다
  if (/\?\s*$|나요\s*$|까요\s*$|ㄹ까\s*$|인가요|한가요|있나요|되나요/.test(sentence.trim())) return out;
  for (const [tag, r] of Object.entries(FACT_RULES)) {
    const m = sentence.match(r.key);
    if (!m) continue;
    const after = sentence.slice(m.index + m[0].length, m.index + m[0].length + 20);
    if (r.neg.test(after)) out[tag] = -1;
    else if (r.pos.test(after)) out[tag] = 1;
  }
  return out;
}

/**
 * 글 하나 → { relevant, sponsored, nokids, facts: { tag: +1|-1 } }
 * 같은 글 안에서 있음/없음이 섞이면 그 태그는 버린다.
 */
export function analyzePost({ title = '', html = '', text }, place) {
  const sentences = text ? text.split(/\n+/) : htmlToSentences(html);
  const joined = sentences.join('\n');
  const relevant = isAboutPlace({ title, text: joined }, place);
  const sponsored = SPONSORED.test(joined);
  const nokids = NO_KIDS.test(joined) && !NOT_NO_KIDS.test(joined);
  const seen = {};
  for (const s of sentences) {
    for (const [tag, v] of Object.entries(factsInSentence(s))) {
      seen[tag] = seen[tag] === undefined || seen[tag] === v ? v : 0;
    }
  }
  const facts = Object.fromEntries(Object.entries(seen).filter(([, v]) => v !== 0));
  return { relevant, sponsored, nokids, facts };
}

/**
 * 여러 글 → 태그별 판정
 * @param posts [{ url, date, relevant, sponsored, nokids, facts }]
 * @returns {{ tags: { [tag]: { verdict, pos, neg, evidence } }, nokids: { count, evidence } }}
 *   verdict: yes (긍정 2+ · 부정 0) | no (부정 2+ · 긍정 0) | mixed (둘 다) | weak (한 글뿐)
 *   협찬 글은 evidence 에는 남기되 pos/neg 수에는 넣지 않는다. 3년 넘은 글은 넣지 않는다.
 */
export function aggregate(posts, { now = Date.now(), maxAgeDays = 365 * 3 } = {}) {
  const tags = {};
  const nokids = { count: 0, evidence: [] };
  for (const p of posts) {
    if (!p.relevant) continue;
    const age = p.date ? (now - Date.parse(p.date)) / 86400000 : 0;
    if (age > maxAgeDays) continue;
    const ev = { url: p.url, date: p.date ? String(p.date).slice(0, 10) : null, sponsored: !!p.sponsored };
    if (p.nokids) {
      if (!p.sponsored) nokids.count++;
      nokids.evidence.push(ev);
    }
    for (const [tag, v] of Object.entries(p.facts || {})) {
      const t = (tags[tag] = tags[tag] || { pos: 0, neg: 0, evidence: [] });
      if (!p.sponsored) v > 0 ? t.pos++ : t.neg++;
      t.evidence.push({ ...ev, value: v > 0 ? 'yes' : 'no' });
    }
  }
  for (const t of Object.values(tags)) {
    t.verdict = t.pos >= 2 && t.neg === 0 ? 'yes' : t.neg >= 2 && t.pos === 0 ? 'no' : t.pos && t.neg ? 'mixed' : 'weak';
    t.evidence = t.evidence.slice(0, 6);
  }
  nokids.evidence = nokids.evidence.slice(0, 6);
  return { tags, nokids };
}
