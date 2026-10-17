# 개발 관례 (conventions)

> 기준 프로젝트: **`C:\project\wooz-toto-service`** (Next.js App Router + 공용 Supabase).
> 같은 DB를 쓰는 `wooz-lotto-service`, `wooz-goat-react`도 참고했다. `wooz-baseball-service`는 다른 Supabase 프로젝트라 참고에서 뺐다.
> 이 문서는 2026-10-17 사용자 승인(“JS, 공용 계정, 시안 B, 로컬 테스트”)을 반영한다.

## 1. 스택

| 항목 | 결정 | 근거 |
| --- | --- | --- |
| 런타임 | Node.js (로컬 v24) | toto 동일 |
| 프레임워크 | Next.js 15.5 App Router, React 19 | toto 동일 (baseball의 Next 16은 따르지 않음) |
| 언어 | **JavaScript (ESM, `.js`/`.jsx`)**, `jsconfig.json`의 `@/*` 경로 별칭 | 기존 서비스 전부 JS. 사용자 결정 |
| 스타일 | Tailwind CSS 3.4 + CSS 변수 테마 토큰 | toto 동일 (Tailwind 4 아님) |
| DB·인증 | Supabase 공용 프로젝트(`rncjg…`), `@supabase/ssr` 0.5 | toto·lotto·goat와 같은 인스턴스 |
| AI | **LLM API 호출 없음.** 운영자가 LLM으로 미리 만든 루트를 DB(`wooz_trip_ai_routes`)에 넣고 꺼내 쓴다 | 사용자 결정 (API 키 비용 없음) → `docs/ai-routes.md` |
| 배포 | Vercel (지금은 로컬호스트에서만 테스트) | 도메인 미정 |
| 패키지 매니저 | npm (`package-lock.json`) | 전 서비스 동일 |

## 2. 폴더 구조

```
src/
  app/                    라우트 (페이지 = 서버 컴포넌트, 상호작용은 같은 폴더의 *.jsx 클라이언트 컴포넌트)
    actions/              서버 동작 ('use server') — 쓰기 작업은 전부 여기
    api/places/route.js   GET 조회 API (장소 후보)
    admin/                운영자 화면 + actions.js
  components/             공용 UI (BottomNav, Sheet, PlacePicker, RouteMap …)
  lib/
    supabase/             client(브라우저) · server(쿠키 세션) · admin(service_role) · middleware
    tables.js             테이블 이름 상수 (wooz_trip_ 프리픽스)
    config.js             서비스명·지역·동행 유형·슬롯·기능 플래그
    geo.js hours.js trip.js candidates.js format.js   순수 함수 (테스트 대상)
    places.js trips.js    DB 조회 (서버 전용)
    travel.js             이동시간 창구 (지금은 추정치, 나중에 캐시+API)
    events.js             MVP 지표 이벤트 기록
    ai/routes.js          미리 만든 AI 루트 고르기·내 일정에 맞추기 (순수 함수)
    ai/fill.js            남은 빈칸 규칙 채우기·최종 검사 (순수 함수)
    ai/store.js           AI 루트 조회 (서버 전용)
data/
  sample-places.mjs       개발용 가짜 장소 (seed·루트 생성기 공용)
  ai-routes/*.json        미리 만든 AI 루트 원본 → npm run routes:sql
supabase/migrations/      000N_wooz_trip_*.sql (SQL Editor에 붙여 넣어 실행)
scripts/                  시드·AI 루트 SQL 생성기, 장소 내보내기
test/                     node --test 단위 테스트
```

레이어 원칙(toto 계승): **얇은 서비스 레이어.** 페이지 → `lib/*` 조회 함수 → Supabase. 계산은 순수 함수로 빼고 테스트한다.

## 3. DB 규칙

- 새 Supabase 프로젝트를 만들지 않는다. 모든 테이블·함수 이름은 **`wooz_trip_`** 로 시작한다.
- 코드에서는 `TABLES.places`처럼 `src/lib/tables.js` 상수로만 부른다 (문자열 하드코딩 금지).
- 컬럼은 snake_case, 시각은 `timestamptz` + `*_ts` 이름 (toto 동일). 여행 시각(슬롯)은 제주 현지 `'HH:MM'` 문자열, 날짜는 `date`.
- 모든 테이블 RLS 켜기. 쓰기 권한 요약:
  - `places`, `kid_tags`: 공개 읽기(승인된 장소만), 쓰기는 service_role(운영자 서버 코드)만
  - `trips`: 본인 읽기·쓰기(`owner_id = auth.uid()`) + 공개 루트는 누구나 읽기. 가족 공유 링크는 서버가 service_role로 `share_id` 정확 일치 조회
  - `reports`: 로그인 사용자 본인 명의로만 작성
  - `travel_cache`, `events`, `ai_routes`: service_role 전용
- 위치 검색은 **PostGIS 없이** lat/lng 숫자 컬럼 + 코드의 하버사인 거리 계산. (장소 300곳 규모라 충분. 수천 곳이 되면 PostGIS + RPC로 옮긴다)
- 일자·슬롯은 `trips.days` jsonb 하나에 저장. 서버 동작에서 모양을 정리(`sanitizeDays`)하고 장소 ID가 실제로 있는지 확인한 뒤 저장한다.
- 마이그레이션은 여러 번 실행해도 안전하게(`if not exists`, `drop policy if exists`, `on conflict`).

## 4. 인증

- Supabase Auth 이메일·비밀번호. **계정은 lotto·goat·toto와 공용** (같은 `auth.users`).
- 세션은 `src/middleware.js`가 매 요청 쿠키를 갱신(toto 동일).
- 로그인 필요한 페이지는 `requireUser(next)` → `/login?next=…`로 보낸다.
- 운영자는 `ADMIN_EMAIL` 환경변수와 이메일이 같은 계정 (toto 동일).

## 5. 서버 동작·API 형식

- 쓰기는 Server Action. 응답은 항상 `{ ok: true, ... }` 또는 `{ ok: false, message }` (toto 동일, 메시지는 사용자에게 바로 보여줄 한국어).
- 조회 API(`/api/places`)도 `{ ok, data | message }` 형식.
- 예외를 던지지 않고 `fail(message)`로 돌려준다. 오류 메시지를 화면에 그대로 띄울 수 있게 쓴다.

## 6. 환경변수

`.env.example`에 이름만 적는다. `.env.local`은 커밋하지 않는다.

| 이름 | 용도 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 공용 Supabase (toto와 같은 값) |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용: 공유 링크 조회, 운영자, 이벤트 기록, 복사 수 |
| `ADMIN_EMAIL` | 운영자 계정 |
| `NEXT_PUBLIC_KAKAO_MAP_KEY` | 카카오맵 (없으면 간이 SVG 지도) |
| `NEXT_PUBLIC_SERVICE_NAME` | 서비스명 (미정, 기본값 “우즈트립”) |

## 7. 디자인 (시안 B 확정)

- 토큰은 `src/app/theme.css`의 CSS 변수 → `tailwind.config.js`가 이름으로 연결. 시안을 바꾸려면 `theme.css`만 바꾼다.
- 서체: 제목 Jua, 본문 Gowun Dodum (`next/font/google`).
- 주 CTA는 시안의 `#D2492F`를 흰 글자 대비 4.5:1을 맞추려고 `#CC4329`로 아주 살짝 진하게 썼다.
- 일자 동선은 색(빨강·초록·파랑) + 선 모양(실선·점선·파선)으로 구분.
- 모바일 폭 우선: 최대 430px 가운데 정렬, 터치 영역 44px 이상, 아이콘은 인라인 SVG(이모지 금지).

| 토큰 | A | B (적용) | C |
| --- | --- | --- | --- |
| 배경 | `#F6F8F7` | `#FFF7EC` | `#0F1417` |
| 본문 글자 | `#17312B` | `#3A2A20` | `#EEF2F3` |
| 주 CTA | `#F2A33A` | `#CC4329` | `#C8F25A` |
| 일자 색 | `#1F6F6A` `#C4661A` `#3D5BA9` | `#D2492F` `#2E8A6A` `#3B5BA5` | `#C8F25A` `#7CC8FF` `#FF8FC7` |

## 8. 테스트·빌드·커밋

- `npm test` = `node --test` (toto 동일). 거리·영업시간·타임라인·후보 정렬·AI 루트 고르기·검증 단계를 테스트한다.
- `npm run routes:sql` = AI 루트 JSON 검사 + SQL 생성, `npm run seed:sql` = 개발용 시드 SQL 생성.
- `npm run build`가 린트(`next/core-web-vitals`)까지 같이 돈다.
- 커밋 메시지: 영어 `feat:` / `fix:` / `refactor:` 접두사 + 짧은 설명 (toto 최근 커밋 형식).

## 9. 프로젝트별 차이 (참고)

| 항목 | toto (기준) | lotto | goat | baseball |
| --- | --- | --- | --- | --- |
| 프레임워크 | Next 15 App Router | Vite SPA | Vite SPA | Next 16 |
| Supabase | 공용, `wooz_toto_` 프리픽스 | 공용, 프리픽스 없음 | 공용, 프리픽스 없음 | 별도 프로젝트 |
| 인증 | 이메일·비번, ADMIN_EMAIL | 이메일·비번 + `profiles` | 이메일·비번 | 없음 |
| 스타일 | Tailwind 3 | CSS | Tailwind 3 | Tailwind 4 |
| 테스트 | node --test | 없음 | 없음 | 없음 |
