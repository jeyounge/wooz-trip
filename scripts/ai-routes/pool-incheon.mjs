// AI 루트용 볼거리 고르기 — 인천 (운영자 + LLM 검토, 2026-11-14)
// 승인된 인천 볼거리 631곳 중 동네·체육공원, 도서관·문화원·공연장, 낚시터·야영장·골프장, 선착장·다리,
// 이름만 있는 돈대·비석, 음식 거리를 빼고 가족·연인·친구가 일부러 찾아갈 만한 곳만 골랐다. 형식은 pool.mjs 와 같다.
//
// 한 줄 형식: ref | 동행 | 테마 | 설명 | 표시
//   동행: k 아이들과 · p 부모님과 · c 연인과 · f 친구끼리
//   테마: sea 바다 · nature 숲·정원 · animal 동물 · exp 체험 · museum 전시 · park 테마파크 · history 역사 · in 실내
//   설명: 이름·종류에서 알 수 있는 것만 쓴다 (맛·후기·가격처럼 모르는 사실은 쓰지 않는다)
//   표시: o = 큰 아이용 → 아이 루트에선 7세 이상일 때만
//
// 뺀 곳 (예): 배로 가는 옹진 섬(서비스 권역 밖), 철 따라 다른 농장 체험(딸기 등), 사우나·스파(씨메르 빼고),
//            공항 터미널, 공연 시간이 있어야 하는 극장·아트센터
export const LINES = `
4627|kpcf|nature|호수공원
4654|kpcf|nature|운하 옆 전망대
4659|kpc|nature,animal|나비 공원
4699|pcf|sea|서쪽 바닷가 광장
4700|k|exp,in|국민 안전 체험관|o
4707|kf|exp|트램펄린 놀이터
4768|kpcf|nature|생태공원
4779|pcf|nature|운하 산책길
4795|kpcf|nature|야생화 단지
4834|k|exp|치즈 만들기 체험장
5067|kpc|museum,history,in|역사 박물관
5094|k|museum,in|어린이 과학관
5106|kpc|museum,in|청자 박물관
5107|kp|museum,history,in|선사 박물관
5113|pc|museum,history,in|산성 박물관
5133|kpcf|museum,in|국립 생물 전시관
4645|kpcf|history,sea|바닷가 옛 요새
4646|kpcf|nature|산 위 정원
4660|kpcf|history|세계유산 고인돌 유적
4667|pcf|history|고려 궁궐 터
4671|k|park|어린이 테마파크
4705|kpcf|sea|갯벌 해변
4719|kcf|museum|군함 전시 공원
4720|pcf|history,sea|바닷가 옛 요새
4721|kpcf|history,sea|바닷가 옛 요새
4829|kpcf|history|북녘이 보이는 평화 전망대
4832|kpcf|history|오래된 사찰
4839|k|park|우주 테마 놀이공원
4847|cf|exp|오래된 양조장
4853|pcf|nature|치유의 숲
4897|kpcf|exp|산 위로 오르는 모노레일
4905|pcf|sea|다리로 가는 섬
4935|kpcf|nature|자연휴양림
4945|pcf|history,sea|바닷가 사찰
4977|kpcf|nature|수목원
4978|pcf|history|조선 임금의 옛집
4981|kpc|exp,in|직물 체험관
4994|kpcf|sea|해변
5000|kpcf|history,sea|바닷가 돈대
5001|pc|history|한옥 성당
5070|kpc|museum,history,in|역사 박물관
5079|kpc|museum,history,in|전쟁 박물관|o
5085|pc|museum,in|미술관
5146|kcf|museum,in|천문 과학관
5150|kc|museum,in|소리 체험 박물관
5151|kpc|museum,in|자연사 박물관
4642|pcf|history|다리로 가는 섬 마을
4672|kpcf|history|차이나타운
4682|kc|exp|동화 벽화 마을
4661|pcf|history|개항기 거리
4678|pcf|history,nature|언덕 위 공원
4674|kpcf|sea|바다를 따라 달리는 열차
4784|kpcf|sea|바닷가 놀이 거리
4790|kpcf|nature,history|산 공원
4663|kcf|park|놀이공원
4673|kpcf|sea|등대섬 가는 유람선
4694|kpcf|nature|도심 공원
4710|pcf|history|한옥 마을
4731|kpcf|nature|큰 공원
4734|k|animal|양 목장
4739|pcf|sea|어시장 포구
4836|k|animal|어린이 동물원
4840|pcf|sea|바다 다리 전망대
4973|kpcf|nature|습지 생태공원
5011|kpcf|exp|높은 빌딩 전망대
5074|kpc|museum,history,in|이민사 박물관
5096|pc|museum,history,in|개항 박물관
5098|kc|museum,in|짜장면 박물관
5100|k|exp,in|국수 전시 체험관
5102|kpc|museum,history,in|시립 박물관
5103|kpc|museum,history,in|상륙작전 기념관|o
5104|kpcf|museum,in|국립 문자 박물관
5105|pc|museum,history,in|도시 역사관
5112|pc|museum,in|대학 박물관
5118|k|exp,in|목재 체험장
5128|kpc|museum,in|역사관
5137|kpcf|museum,in|국립 해양 박물관
5141|pc|museum,in|근대 문학관
5143|cf|exp,in|옛 창고 복합 문화공간
5160|pc|museum,in|미술관
5163|k|museum,in|어린이 박물관
4620|kcf|exp|트릭아트 전시관
4709|cf|sea|유람선
4640|kcf|park|놀이공원
4652|pcf|sea|바다 둘레길
4679|kpcf|sea|해수욕장
4684|kcf|exp|자동차 드라이빙 센터
4689|kpcf|sea|해변
4715|pcf|sea|바위 해변
4740|kpcf|sea|해수욕장
4750|pcf|sea,nature|다리로 가는 섬
4760|cf|exp|바다 전망 스파
4763|kpcf|sea|바닷가 공원
4785|k|sea,exp|어촌 체험마을
4786|kpcf|sea|해수욕장
4788|kpcf|sea|갯벌 해변
4804|pcf|sea|물 빠지면 걸어가는 섬
4812|kpcf|nature|공항 옆 정원
4816|kpcf|exp|공항 전망대
4822|kpcf|nature|자연휴양림
4851|kpcf|sea,exp|어촌 체험 섬
4899|pcf|sea|바다 전망대
4924|pcf|sea|물 빠지면 걸어가는 섬
4934|kpcf|sea|해수욕장
5072|k|museum,in|학생 과학관
5077|kpc|museum,history,in|역사관
5145|kcf|exp,in|디지털 전시 체험관
5817|kcf|exp|바닷가 레일바이크
`;
