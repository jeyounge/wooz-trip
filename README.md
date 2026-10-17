# wooz-trip (여행 루트 서비스, 가칭 "우즈트립")

검증된 제주 장소를 시간대 슬롯에 넣으면 이동 동선과 타임라인이 자동으로 그려지는 가족 여행 루트 서비스.

- 개발 지침: [`CLAUDE.md`](CLAUDE.md) · 기술 관례: [`docs/conventions.md`](docs/conventions.md) · 기획서: [`docs/planning.md`](docs/planning.md)
- 스택: Next.js 15 (App Router, JS) · 공용 Supabase (`wooz_trip_` 프리픽스) · Vercel

## 처음 실행

1. Supabase SQL 실행 → [`supabase/README.md`](supabase/README.md)
2. `.env.local` 준비 (`.env.example` 참고 — Supabase 값은 toto와 같다)
3. `npm install` → `npm run dev` → http://localhost:3000

```bash
npm test              # 계산 로직 단위 테스트
npm run build         # 빌드 + 린트
npm run routes:sql    # AI 루트 JSON 검사 → SQL 생성 (docs/ai-routes.md)
```

## AI 초안

서비스는 LLM API를 부르지 않는다. 운영자가 LLM으로 미리 만든 루트(`data/ai-routes/*.json`)를 DB에 넣어 두고,
"AI 초안"을 누르면 조건에 맞는 루트를 꺼내 내 날짜 기준으로 휴무·영업시간을 다시 검사해 넣는다.
루트 추가 방법과 LLM 프롬프트는 [`docs/ai-routes.md`](docs/ai-routes.md).

## 실데이터 (장소)

한국관광공사 TourAPI로 전국 장소 후보를 매일 자동 수집·DB 반영하고(LLM 호출 없음) `/admin`에서 승인한다.
계획: [`docs/data-plan.md`](docs/data-plan.md) · 명령: [`docs/real-data.md`](docs/real-data.md).

## 화면

| 경로 | 화면 |
| --- | --- |
| `/` | S01 홈 (동행 유형별 인기 루트) |
| `/trips/new` | S02 여행 정보 입력 |
| `/trips/:id/edit` | S03 루트 짜기 + S04 장소 선택 바텀시트 |
| `/trips/:id` | S05 루트 결과 (지도 동선·타임라인·공유·공개) |
| `/routes`, `/routes/:id` | 둘러보기 목록, S06 공개 루트 상세 + 내 일정으로 복사 |
| `/s/:shareId` | 가족 공유 링크 (읽기 전용, 로그인 불필요) |
| `/trips`, `/my`, `/login` | 내 여행, 마이, 로그인 |
| `/admin` | 운영자: 장소 검수 · 제보 처리 · AI 루트 켜기/끄기 · 지표 |
