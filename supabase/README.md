# Supabase — wooz-trip

> 새 프로젝트를 만들지 않는다. lotto·goat·toto가 쓰는 **기존 z-labs 공용 프로젝트**(`rncjgtyqzjewnmxycexp`)에
> `wooz_trip_` 프리픽스 테이블만 추가한다. 테이블 이름은 [`src/lib/tables.js`](../src/lib/tables.js)에서 관리한다.

## 실행할 SQL (순서대로)

| 순서 | 파일 | 내용 |
| --- | --- | --- |
| 1 | `migrations/0001_wooz_trip_init.sql` | 테이블 6개 + 인덱스 + RLS 정책 + updated_ts 트리거 |
| 2 | `migrations/0002_wooz_trip_seed.sql` | 아이 태그 9개 + 개발용 가짜 장소 31곳(`[샘플]`, 승인 30 · 후보 1) |

### 방법 — Supabase 대시보드 SQL Editor

1. [Supabase 대시보드](https://supabase.com/dashboard) → 프로젝트 `rncjgtyqzjewnmxycexp` → **SQL Editor** → New query
2. `0001_wooz_trip_init.sql` 전체를 붙여 넣고 **Run**
3. 새 쿼리에 `0002_wooz_trip_seed.sql` 전체를 붙여 넣고 **Run**
4. **Table Editor**에서 `wooz_trip_` 로 시작하는 테이블 6개 확인
   - `wooz_trip_kid_tags`, `wooz_trip_places`, `wooz_trip_trips`, `wooz_trip_travel_cache`, `wooz_trip_reports`, `wooz_trip_events`

두 파일 모두 여러 번 실행해도 안전하다 (중복 생성·중복 입력 없음).
기존 서비스 테이블은 건드리지 않는다 (만들거나 바꾸는 것은 전부 `wooz_trip_` 이름).

### 확인용 쿼리

```sql
select status, count(*) from wooz_trip_places group by status;   -- approved 30, candidate 1
select count(*) from wooz_trip_kid_tags;                          -- 9
```

## 나중에 실데이터로 바꿀 때

```sql
delete from wooz_trip_places where is_sample;   -- 가짜 장소 지우기 (이 장소를 쓴 루트의 슬롯은 "삭제된 장소"로 보임)
```

시드를 고치려면 `scripts/gen_seed_sql.mjs`를 고친 뒤 `node scripts/gen_seed_sql.mjs`로 다시 만든다.

## Auth 설정 (공용 프로젝트 — 필요할 때만)

- 지금은 이메일·비밀번호 로그인이라 추가 설정이 없다.
- 회원가입 확인 메일 링크가 trip 주소로 돌아오게 하려면 **Authentication → URL Configuration → Redirect URLs**에
  `http://localhost:3000/**` (배포 후에는 trip 도메인)을 추가한다. 다른 서비스 설정에는 영향이 없다.
