# 인수인계 — 지금 어디까지 왔나 (2026-10-18)

> 새 세션은 이 파일부터 읽는다. 결정 배경은 CLAUDE.md, 세부는 docs/ 의 각 문서.
> 새로 시작할 때: `cd C:\project\wooz-trip` → `claude` (이 폴더에서 열면 CLAUDE.md 가 자동으로 읽힌다)

## 한눈에

| 항목 | 값 |
| --- | --- |
| 서비스 | 제주 가족 여행 루트 플래너 (가칭 "우즈트립", `NEXT_PUBLIC_SERVICE_NAME` 으로 변경) |
| 운영 주소 | https://trip.z-labs.kr (Vercel) |
| 코드 | https://github.com/jeyounge/wooz-trip (`main` 에 push 하면 Vercel 자동 배포, **공개 저장소**) |
| DB | 공용 Supabase `rncjgtyqzjewnmxycexp` (lotto·goat·toto 와 같음), 테이블은 전부 `wooz_trip_` |
| 스택 | Next.js 15.5 App Router (JS) · React 19 · Tailwind 3.4 · Supabase · Vercel |
| 디자인 | 시안 B (따뜻한 가족 앨범), 토큰은 `src/app/theme.css` |
| 운영자 | `ADMIN_EMAIL` 계정 (쉼표로 여러 명 가능) → `/admin` |

## 실행한 SQL (사용자가 SQL Editor 에서 직접 실행)

| 파일 | 상태 |
| --- | --- |
| `0001_wooz_trip_init.sql` 테이블·RLS | 실행함 |
| `0002_wooz_trip_seed.sql` 샘플 장소 31·아이 태그 | 실행함 |
| `0003_wooz_trip_ai_routes.sql` AI 루트 테이블 + 샘플 루트 23 | 실행함 |
| `0004_wooz_trip_places_import.sql` 전국 장소 자동 반영 함수 | 실행함 |
| `0005_wooz_trip_review_facts.sql` 후기 근거 컬럼·함수 | 실행함 |

새 SQL 이 생기면 파일 경로를 정리해서 사용자에게 알려 준다 (사용자가 직접 실행).

## 만든 것

- **화면**: 홈, 여행 정보 입력, 루트 짜기 + 장소 선택 시트, 결과(지도·타임라인), 공개 루트 상세·복사, 둘러보기, 가족 공유 링크, 내 여행, 마이, 로그인, `/admin`
- **AI 초안** (LLM API 키 없음): 운영자가 LLM 으로 미리 만든 루트(`wooz_trip_ai_routes`)를 조건에 맞게 꺼내
  내 날짜 기준으로 휴무·영업시간을 다시 검사해 넣는다. 화면은 3.6초 "AI가 짜는 중" 단계. → `docs/ai-routes.md`
- **장소 수집** (LLM 없음): 한국관광공사 TourAPI → 변환 → DB 후보. 전국 17개 시·도 우선순위. → `docs/data-plan.md`, `docs/real-data.md`
- **블로그 후기 사실 수집** (LLM 없음): 카카오 블로그 검색 → robots.txt 허용 글만 3초 1건 → 규칙 사전으로
  아기의자·주차·키즈존 등 판정, 글 2개 이상 일치해야 인정, 근거 링크만 저장, 운영자가 반영. → `docs/data-plan.md` 1장
- **관리자**: 시·도 선택, 필터(확인 필요·아이 태그 없음·영업시간 없음·후기로 확인·노키즈존), 검색, 선택 승인/제외,
  TourAPI 원문·공식 홈페이지·후기 근거 보기, 승인 안내, AI 루트 켜기/끄기, 제보 처리, 지표

## 자동으로 돌고 있는 것

- 윈도우 작업 스케줄러 **"wooz-trip TourAPI daily"** 매일 **00:10 · 08:10 · 16:10** → `scripts/tourapi/daily.cmd`
  (놓친 실행은 PC 켜지면 바로 돌림. TourAPI 한도는 자정에 풀려서 08:10·16:10 은 00:10 을 놓쳤을 때만 받음)
  1. TourAPI 수집 (`collect.mjs auto`, API 별 하루 950회)
  2. 변환 (`build.mjs`) → 3. DB 반영 (`import.mjs`, 바뀐 것만, 승인·제외·운영자 수정 장소는 안 덮어씀)
  4. 블로그 후기 (`blogfacts/run.mjs --area jeju --limit 35`, 한 번에 글 300개 · 하루 900개, 네이버가 막으면 그날 남은 실행은 쉼) → 5. DB 반영 (`blogfacts/sync.mjs`)
- 로그: `data/raw/tourapi/daily.log` · 진행 상황: `npm run tour:collect -- status`, `npm run facts:run -- status`
- **이 PC 가 켜져 있어야 돈다** (Vercel 아님). 수집용 키(TourAPI·카카오 REST)는 `.env.local` 에만.

## 데이터 현황 (2026-10-18)

| 항목 | 수 |
| --- | --- |
| 제주 TourAPI 후보 (DB) | 1,472곳 (승인 0) |
| 영업시간 있음 / 공식 홈페이지 | 1,028 / 154 (공통정보 1,114곳 남음 → 1~2일) |
| 블로그 후기 확인 | 22곳 (주차 13 · 키즈존 3 · 유모차 2 인정) |
| 샘플 | 장소 31, AI 루트 23 (실데이터 승인 후 삭제) |

## 다음 할 일

1. **운영자 승인** (사용자): `/admin` → 제주 300곳 승인 (볼거리 120 · 식당 120 · 카페 60)
2. 승인 장소로 **AI 루트 만들기**: `npm run places:export` → LLM(Claude Code 세션)으로 JSON → `npm run routes:sql` → SQL 실행
3. **샘플 삭제**: `delete from wooz_trip_ai_routes where code like 'sample-%'; delete from wooz_trip_places where is_sample;`
4. 도메인 등록 확인: Supabase Redirect URLs `https://trip.z-labs.kr/**`, 카카오 Web 도메인 `https://trip.z-labs.kr`
5. 서비스명 정하기 (`NEXT_PUBLIC_SERVICE_NAME`)
6. 제주 수집이 끝나면 TourAPI **운영계정(트래픽 증가)** 신청 → `TOURAPI_DAILY_LIMIT` 올리기
7. 인천·경기 오픈 준비: 권역 나누기 → `config.js` REGIONS 확장 (`docs/data-plan.md` 5장)
8. 다음 공공데이터: 어린이놀이시설(키즈존 후보), 인허가(폐업 표시)
9. 정식 오픈 전 법률 확인 (블로그 수집·네이버 약관)

## 알려진 문제

- **사용자 PC 입력 문제**: cmd 창 깜빡임·복사 불가, 브라우저/터미널에서 `@`→`W`, `a`→`w` 처럼 글자가 바뀌어 들어감.
  키 재배치 프로그램·레지스트리 재배치 없음, 키보드 배열은 한국어 하나 (원인 미확정). 사이트 코드 문제 아님.
  권장: Windows Terminal 사용, 시크릿 창·화상 키보드(osk)로 원인 좁히기. 당장은 메모장에 써서 붙여넣기.
- 계절 운영("11~3월만") 은 데이터 구조로 표현 못 함 → 운영자가 승인 때 거른다.
- 장소 조회는 승인 장소를 한 번에 읽는다 (수천 곳이 되면 지역별로 나눔).

## 작업 방식 (사용자와 합의)

- 한국어, 쉬운 말로 결과부터. 승인 필요한 작업은 진행하고, **사용자가 실행할 SQL 만 정리해서** 알려 준다.
- 서비스에서 **LLM API 를 부르지 않는다** (토큰 비용 없음). 수집·변환 파이프라인도 규칙 기반.
- 빠르기보다 **정확하게**. 자동 수집 결과는 운영자 확인 후 반영.
- 커밋: 영어 `feat:`/`fix:` + Co-Authored-By. `main` push = 운영 배포이므로 push 전에 `npm run build`(린트 포함)·`npm test` 통과 확인.
- 이 PC 의 Bash 에서 따옴표가 섞인 heredoc 은 자주 깨진다 → 스크립트는 Write 도구로 파일을 만든 뒤 실행한다.
