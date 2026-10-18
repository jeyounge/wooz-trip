// AI 루트용 볼거리 고르기 (운영자 + LLM 검토, 2026-10-18)
// 승인된 제주 볼거리를 하나씩 보고 동행 유형별로 맞는 곳만 골랐다. 여기 없는 볼거리는 루트에 넣지 않는다.
//
// 한 줄 형식: ref | 동행 | 테마 | 설명 | 표시
//   동행: k 아이들과 · p 부모님과 · c 연인과 · f 친구끼리
//   테마: sea 바다 · nature 숲·정원 · animal 동물 · exp 체험 · museum 전시 · park 테마파크 · history 역사 · in 실내(데이터에 실내 표시가 없어도 실내인 곳)
//   설명: 이름·종류에서 알 수 있는 것만 쓴다 (맛·후기·가격처럼 모르는 사실은 쓰지 않는다)
//   표시: o = 큰 아이용 (카트·승마·카약 등) → 아이 루트에선 7세 이상일 때만
//
// 뺀 곳 (예): 골프장, 수영장, 항구 대합실·여객선, 도서관·문화원·책방, 양조장, 성인 대상 시설,
//            밤에만 여는 곳(오후 슬롯에 못 넣음), 새벽 등산로 입구, 우도·마라도 안 장소(배 시간 필요)
const LINES = `
43|kpcf|exp|감귤밭 체험
57|kpcf|exp|감귤밭 체험
64|pcf|history|제주 시조 신화가 깃든 유적
116|kpcf|nature|수목원
140|kpcf|nature|야자숲 산책길
146|kpcf|exp|감귤 체험 농장
150|kpcf|animal|목장
165|pcf|history|4·3 평화공원
166|pc|history|한라산 자락 사찰
195|kpcf|nature,exp|감귤나무 숲
271|pcf|nature|숲길
272|kpcf|exp|체험 농원
299|kpcf|nature|해바라기 농장
372|kpcf|nature|자연휴양림
465|kpcf|nature|생태숲
546|kcf|museum|컴퓨터 박물관
562|kpcf|animal,nature|노루 생태 관찰원
571|kpcf|sea|바다 앞 등대
578|kcf|park|수목원 테마파크
593|kpcf|museum|도립 미술관
596|kpc|museum|기념관
599|kcf|museum|전시 공간
609|kp|museum|교육 박물관
611|kpcf|museum|갤러리
613|kpcf|museum|민속자연사 박물관
614|kpcf|museum|국립 박물관
636|pcf|museum|미술관
645|cf|museum|미술관
648|kcf|exp,in|젤리 체험 매장
669|k|museum,exp|과학 탐구 체험관
1428|kf|exp,animal|승마장|o
1442|kf|exp,animal|승마장|o
33|pcf|sea|바다 전망 건축물
36|k|park|테마파크
39|kp|exp|체험 농장
46|k|park,animal|공룡 테마 사파리
47|kpcf|park,nature|정원 테마파크
60|kpcf|nature|유채밭
61|kpcf|sea,exp|잠수함 관광
65|kpcf|nature|용암동굴
67|kpcf|park|미로공원
76|pc|nature|유채꽃 들판
89|kpcf|nature,sea|성산일출봉
100|kpcf|nature|자연휴양림
102|pcf|nature|곶자왈 숲길
108|kpcf|nature|자연휴양림
111|kpcf|nature|꽃밭 농장
123|kpcf|nature|비자나무 숲
133|cf|nature|숲 산책길
151|k|exp,sea|어촌 체험 마을
153|pc|exp,in|족욕 체험
157|kpcf|park|기차 타는 테마파크
172|kc|park|동화 마을
183|kpcf|sea|해변
194|kpcf|park|미로 테마파크
207|pcf|nature|세계자연유산 오름
258|kpcf|sea,exp|잠수함 관광
266|k|museum,exp|에너지 체험관
268|k|exp,in|사탕 체험 공간
285|kpcf|animal|말 목장
290|kp|exp|감귤 체험 농장
298|k|animal,exp|체험 농장
301|k|sea,exp|바다 체험장
303|kp|exp|감귤 정원
334|k|exp|농어촌 체험 마을
370|kpcf|nature,park|동굴이 있는 공원
375|kpcf|park|추억 테마공원
376|kpcf|nature|허브 동산
378|kpcf|sea|유람선
383|k|nature,animal|자연생태공원
386|pcf|nature|녹차 정원
401|pc|museum|미술관 공원
436|kf|animal,exp|낙타 체험
505|kpcf|animal,exp|조랑말 체험 공원
556|k|park|테마파크
582|kpcf|nature|분화구
600|pcf|museum|아르누보 뮤지엄
605|p|museum,history|항일 기념관
617|kp|museum,animal|해양동물 박물관
623|kpcf|animal,sea,museum|아쿠아리움
628|cf|museum|커피 박물관
629|pc|museum|미술관
631|kpcf|museum,nature|돌문화 공원
632|kpcf|museum|미디어아트 전시관
641|kpcf|museum|세계자연유산 센터
642|kpcf|museum,sea|해녀 박물관
659|kp|exp|물 공연장
670|kpcf|museum,history|민속촌
672|pc|museum|사진 갤러리
678|pcf|museum|전시 공원
1386|kf|exp|대형 공 놀이 체험
1391|kf|exp,animal|승마장|o
1394|kf|exp|모험 놀이 체험|o
1423|kcf|sea,exp|투명 카약|o
1431|kf|exp|낚시 테마파크
1446|kcf|exp|카트 체험|o
1450|pcf|nature|숲길
1451|kpcf|nature|삼나무 숲길
1477|kpcf|sea,exp|요트 투어
1480|kf|exp|레포츠 체험장|o
35|pc|nature|녹차밭
41|kpcf|nature|정원
48|kpcf|sea,nature|계곡과 바다가 만나는 곳
50|pcf|nature|동백 수목원
59|kpcf|nature|동백 정원
80|cf|nature|동백숲
83|pcf|nature|산방산
85|kpcf|sea,nature|해안 산책로
86|kf|park|테마파크
87|pcf|nature|정원
117|kpcf|nature|식물원
120|kpcf|nature|폭포
161|kp|exp|열대과일 농장
170|kpcf|nature|폭포
182|kpcf|nature,sea|바다로 떨어지는 폭포
189|kp|exp|감귤 체험 농장
190|kpc|exp|천연염색 체험
203|pcf|nature|수국밭
213|pcf|nature|치유의 숲
236|kpcf|nature,animal|자연생활 공원
237|pf|exp|탄산온천
255|kp|exp|감귤 체험 농원
256|pcf|nature|편백숲
283|k|exp|체험 농장
304|k|park|어린이 캐릭터 테마파크
306|kp|exp|감귤밭 체험
307|kpcf|sea,exp|잠수함 관광
316|kp|park|소인국 테마파크
318|k|exp|감귤 체험 농장
329|kf|exp|워터파크
335|kc|park|미로 공원
379|k|sea,exp|어촌 체험 마을
381|pc|museum|교회 건축물
382|pc|history|화가가 살던 집
444|kpcf|sea|바닷물 놀이터
467|kpcf|sea,nature|주상절리 해안
464|pcf|nature|폭포
469|kpcf|nature|수목원
495|pc|nature|분화구
502|kc|park|동화 테마 공간
506|kpcf|animal|코끼리 테마공원
533|pc|exp|녹차 마을
542|pcf|nature|차밭
555|kpcf|nature|자연휴양림
590|kp|museum|아프리카 박물관
592|kp|museum|자동차·피아노 박물관
595|kcf|museum|피규어 박물관
597|pc|museum|미술관
602|kc|museum|크리스마스 박물관
608|kp|museum|평화센터 전시관
610|kp|museum|감귤 박물관
612|kpc|museum|유리 박물관
616|kpcf|museum|항공우주 박물관
620|k|museum|캐릭터 전시관
637|k|museum|곰인형 전시관
640|pcf|museum|박물관
644|cf|museum|미디어아트 전시관
646|pcf|museum|미술관
653|kpc|museum|테디베어 박물관
665|kpcf|museum|차 박물관
668|pc|museum|미술관
671|pc|museum|시립 미술관
674|kp|museum|조개껍데기 박물관
677|kf|museum|야구 명예의 전당
679|kpcf|museum|천문 과학관
680|k|museum|초콜릿 박물관
1381|f|sea,exp|제트보트|o
1385|kf|exp|레저 체험장|o
1424|kpcf|sea|유리바닥 보트
1425|kf|exp,animal|승마 공원|o
1435|pcf|nature|숲길
1438|kcf|exp|카트 체험|o
1445|kcf|exp|카트 테마파크|o
1474|f|nature|계곡 트레킹
1475|kf|animal,exp|말 테마 체험장
40|kpcf|animal|알파카 목장
42|k|animal|동물 체험장
58|kp|exp|감귤 체험 창고
62|kf|exp|실내외 놀이 체험장|o
72|pcf|nature|곶자왈 숲길
97|p|history|추사 김정희 유배지
158|kpcf|history,nature|항몽 유적지
164|pcf|nature|정원
178|pc|nature|분재 정원
181|kpcf|nature|곶자왈 숲길
197|kpcf|animal|말 공연 테마파크
216|kpcf|animal|양떼 목장
244|kpcf|museum,in|미디어아트 전시관
282|k|exp,museum|안전 체험관
292|k|exp|체험 농장
296|k|sea,exp|바다 체험 마을
300|kpcf|sea|유람선
309|k|exp,in|어린이 미디어아트 놀이 공간
359|kpcf|animal|새와 동물 테마공원
387|pcf|nature|매화 공원
395|kpcf|nature|정원과 동굴이 있는 공원
425|kpcf|exp,nature|카누 타는 정원
560|kpcf|park|조각 테마공원
569|kf|park|테마 공간
580|kpcf|animal,nature|목장
585|kpcf|nature|곶자왈 숲길
589|k|museum|초콜릿 박물관
591|pc|nature,museum|식물 전시원
601|pcf|museum|미술관
603|pc|museum|추사 기념관
615|kc|museum|신화 박물관
633|pc|museum|현대 미술관
657|kc|museum|체험형 전시관
681|k|museum|테디베어 전시관
1392|kf|exp,animal|승마 공원|o
1422|f|sea,exp|서핑|o
1427|kcf|sea,exp|투명 카약|o
1449|kpcf|sea|요트 투어
1464|kf|exp,in|실내 서핑장|o
1465|kcf|exp|카트 체험|o
`;

export const POOL = new Map(
  LINES.trim()
    .split('\n')
    .map((line) => {
      const [ref, comp, themes, note, flag] = line.split('|');
      return [Number(ref), { comp: new Set(comp.split('')), themes: themes.split(','), note, older: flag === 'o' }];
    })
);
