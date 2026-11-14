// AI 루트용 볼거리 고르기 — 경기 남부 (운영자 + LLM 검토, 2026-11-14)
// 승인된 경기 남부 볼거리 1,402곳 중 공원·체육시설·도서관·문화원·낚시·야영장·골프장·사찰 대부분을 빼고 보면서
// 가족·연인·친구가 일부러 찾아갈 만한 곳만 골랐다. 형식은 pool.mjs 와 같다.
//
// 한 줄 형식: ref | 동행 | 테마 | 설명 | 표시
//   동행: k 아이들과 · p 부모님과 · c 연인과 · f 친구끼리
//   테마: sea 바다 · nature 숲·정원 · animal 동물 · exp 체험 · museum 전시 · park 테마파크 · history 역사 · in 실내
//   설명: 이름·종류에서 알 수 있는 것만 쓴다 (맛·후기·가격처럼 모르는 사실은 쓰지 않는다)
//   표시: o = 큰 아이용 → 아이 루트에선 7세 이상일 때만
//
// 뺀 곳 (예): 동네 공원·체육공원, 문화원·도서관·공연장(공연 시간 필요), 낚시터·야영장·골프장, 스키 대여점,
//            밤에만 여는 천문대, 음식 거리(식당 칸에서 따로 고름), 운영 시간이 오후 칸과 안 맞는 곳,
//            하루 종일 노는 곳(에버랜드·캐리비안베이·서울랜드·웅진플레이도시 — 오전·오후 칸 하나로는 모자람, 사용자가 직접 넣는다)
export const LINES = `
10040|kpcf|nature|식물원
10064|kpcf|sea|바다 위 조력발전소 옆 공원
10124|kpcf|nature|호수공원
10136|kcf|museum,in|만화 박물관
10151|kpcf|history,sea|바닷가 선사 유적 공원
10252|kpcf|nature|식물원
10334|kpcf|nature|호수 식물원
10419|kpcf|exp,in|폐광을 꾸민 동굴 테마파크
10461|pcf|nature|메타세쿼이아 산책길
10497|pcf|history,nature|연꽃 연못 유적
10664|kcf|museum,in|천문 과학관
10682|kc|animal,in|아쿠아리움
10695|pcf|sea|바닷가 섬 산책길
10697|k|exp,in|해양 안전 체험관|o
10898|kpcf|nature|수목원
10906|kpc|nature|수목원
10927|kpcf|sea|해변
10946|kpcf|nature|갯골 생태공원
10948|pc|nature|정원
10965|kpcf|nature|갈대 습지공원
10399|kpcf|sea,nature|바닷가 테마공원
11510|kp|exp,sea|어촌 체험마을
11520|kpcf|sea|바다 섬 등대 전망대
11575|cf|museum,in|복합 문화공간
11674|k|museum,in|로봇 전시관
11692|k|museum,in|발명 전시관
11716|kc|museum,in|업사이클 미술관
11760|kpcf|museum,in|도립 미술관
11767|kp|museum,in|어촌 민속 박물관
11792|kpcf|museum,exp,in|유리 공예 박물관
11824|k|museum,in|곤충 전시관
11885|k|museum,in|해양 생태 과학관
15425|f|exp|서핑장|o
10293|kpcf|animal,nature|동물원과 공원
11568|pcf|museum,in|국립 미술관
11789|kpcf|museum,in|국립 과학관
11708|k|exp,in|직업 체험관
10411|kp|museum,in|철도 박물관
14994|kcf|exp|레일바이크
15424|kcf|exp|호숫가 스카이레일
10412|pcf|nature|호수
10440|pcf|museum,nature|계곡 예술공원
10726|kpc|nature|수목원
10474|kpcf|nature|생태공원
10518|kpcf|nature|호수공원
10590|k|animal,in|실내 동물원
11230|k|park|공룡 테마 공원
11372|kp|nature|식물원
11376|kpc|nature|대학 식물원
11606|kp|history,museum,in|역사 박물관
11644|pc|museum,in|추사 기념 박물관
11569|cf|museum,in|카메라 박물관
11721|k|museum,in|말 박물관
11192|k|animal|포니 공원
11769|k|museum,in|새 생태 과학관
11918|pc|history,museum,in|역사 박물관
11189|pcf|nature|숲길
10483|kpcf|history|세계유산 성곽
10442|kpcf|history|조선 행궁
11711|kpc|history,museum,in|성곽 역사 박물관
11715|pcf|museum,in|시립 미술관
11778|kp|museum,in|시립 박물관
11607|kp|museum,in|박물관
10331|kpcf|nature|호수공원
10140|kpcf|nature|수목원
10141|kpcf|nature|수목원
11868|kcf|animal,in|아쿠아리움
11719|kpcf|museum,in|국립 농업 박물관
11731|kcf|exp|복합 문화공간
11800|k|museum,in|화장실 문화 전시관
11645|k|museum,in|환경 전시관
10455|pcf|history|조선 왕릉
10160|pc|history|사찰
10192|kpcf|nature,history|공룡알 화석 산지
10277|kpcf|sea|바닷길로 들어가는 섬
10574|kcf|exp,sea|해상 케이블카
10958|pcf|sea|해안 산책로
10512|pcf|sea|항구 마리나
10558|pcf|sea|항구
11186|kpcf|sea,nature|해송 숲
10466|kpcf|nature|수목원
10707|k|animal|새 공원
10159|k|park|미니어처 마을
10613|kp|nature,exp|농업 생태원
10572|pc|nature|허브 농원
10368|k|animal,in|실내 동물원
11252|kpcf|nature|호수공원
11469|k|animal|동물 농장
11467|k|exp,animal|목장 낙농 체험
11086|kp|exp,sea|어촌 체험마을
10730|kpf|nature|유원지
10571|kpcf|history,exp|민속촌
11665|pc|museum,in|미술관
11704|kpcf|museum,in|미디어아트 미술관
11706|kp|history,museum,in|도립 박물관
11796|k|museum,in|어린이 박물관
10349|kpcf|nature|숲 정원
10397|pcf|history,nature|세계유산 산성
11528|kpc|history|산성 행궁
10317|kpcf|animal,exp|목장 체험
10407|kpcf|nature|식물원
10562|k|nature,park|공룡 수목원
10567|k|exp|어린이 숲 놀이터
10408|k|park|캐릭터 체험 공원
11334|kc|park|유럽 마을 테마파크
11154|kpcf|exp,museum|도자 체험
10465|pcf|history|강변 사찰
10369|pcf|history|세종대왕릉 (조선 왕릉)
11621|kp|history,museum,in|세종대왕 역사 문화관
10490|kp|museum,in|강 문화관
10529|pc|museum,in|도자 미술관
10471|kpcf|nature,exp|도자 공원
10561|pcf|exp|도자 예술마을
10304|kp|nature,exp|농업 테마공원
10921|pc|nature|산수유 마을
11613|k|museum,in|곤충 박물관
11622|kc|museum,in|박물관
10302|pc|history|사극 촬영지
10112|k|animal|곤충 테마파크
10301|pc|nature|자작나무 숲
10922|kpcf|nature|자연휴양림
11863|kp|museum,in|유기 박물관
10516|kpcf|park|테마공원
11808|kpcf|exp,in|남사당 공연장
10564|pcf|nature|호수 전망대
10867|k|nature,exp|체험 식물원
10123|kpcf|nature|수목원
10200|pc|nature|식물원
10877|pcf|nature|강변 공원
10708|pcf|nature|출렁다리
10627|pcf|nature|강변 섬
11483|kpcf|exp|강 위 돛배
10121|k|animal|목장
10391|k|animal|목장
11296|k|animal|조랑말 농장
10198|k|animal|동물 체험 농장
`;
