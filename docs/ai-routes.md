# AI 루트 만들기 (미리 생성 → DB 저장 방식)

> 결정 (2026-10-17): 서비스는 **LLM API 키를 쓰지 않는다.**
> 운영자가 우리 LLM(Claude Code 등)으로 루트를 많이 만들어 DB에 넣어 두고,
> 사용자가 "AI 초안"을 누르면 조건에 맞는 루트를 꺼내 준다. 화면은 "AI가 짜는 중" 단계를 3~4초 보여준다.

## 사용자가 누르면 일어나는 일

1. **루트 고르기** — 지역·동행·일수·아이 나이 점수 + 그날 실제로 넣을 수 있는 장소 수로 줄 세우고,
   1등과 비슷한 루트 중 무작위로 하나 고른다. 같은 여행에서 다시 누르면 직전 루트는 피한다.
2. **내 일정에 맞추기** — 루트의 N일차를 내 N일차에, 슬롯 종류(오전·점심·…)가 같은 빈 슬롯에 넣는다.
   이미 고른 슬롯은 건드리지 않는다. 첫날 늦게 도착하면 오전 장소는 버려진다.
3. **검사** — 내 날짜·시각 기준으로 휴무·영업시간을 다시 검사해서 안 맞는 장소는 버린다.
4. **나머지 채우기** — 남은 빈칸은 "가까운 곳 + 영업 중" 규칙으로 채운다.
5. 화면은 서버 응답과 상관없이 최소 3.6초 동안 단계 안내(`src/components/AiThinking.jsx`)를 보여준다.

코드: `src/lib/ai/routes.js`(고르기·맞추기), `src/app/actions/trips.js`의 `aiFill`, 테스트 `test/core.test.mjs`.

## 루트 추가하는 순서

```
1) npm run places:export        # 승인된 장소 목록 → data/places-for-llm.json (DB 에 장소가 있어야 함)
2) LLM 에 아래 프롬프트 + data/places-for-llm.json 을 주고 루트 JSON 을 받는다
3) data/ai-routes/<이름>.json 으로 저장 (파일 여러 개 가능)
4) npm run routes:sql           # 검사 후 supabase/migrations/0003_wooz_trip_ai_routes.sql 생성
5) Supabase SQL Editor 에서 0003 파일 실행 (같은 code 는 덮어쓴다 → 여러 번 실행해도 안전)
```

- 4단계에서 **오류**(모르는 장소, 승인 안 된 장소, 같은 장소 두 번, 이유 없음 등)가 있으면 SQL을 만들지 않는다.
- **경고**(점심 슬롯에 카페, 기본 시각에 영업시간 밖 등)는 SQL을 만들되 고치는 게 좋다.
- 내용을 고치려면 JSON을 고치고 4~5단계를 다시 한다. 빼고 싶은 루트는 `/admin` → AI 루트 탭에서 끈다.
- 지금 들어 있는 `data/ai-routes/sample-jeju.json`(23개)은 가짜 장소(`sample-01`…)로 만든 **개발용 샘플**이다.
  실데이터를 넣을 때 `delete from wooz_trip_ai_routes where code like 'sample-%';`로 지운다.

## JSON 형식

```json
[
  {
    "code": "west-kids-3d-001",
    "title": "서쪽 아이랑 2박 3일",
    "summary": "첫날은 가볍게, 둘째 날 모래놀이와 실내 체험",
    "region": "jeju-west",
    "companion": "kids",
    "kidAges": [2, 9],
    "tags": ["beach", "indoor"],
    "days": [
      [
        { "slot": "am", "place": 12, "reason": "유모차로 다닐 수 있는 해안 산책로라 가볍게 걷기 좋아요" },
        { "slot": "lunch", "place": 7, "reason": "좌식 자리가 있어 편하게 앉아 먹을 수 있어요" }
      ],
      []
    ]
  }
]
```

| 필드 | 값 |
| --- | --- |
| `code` | 영문 소문자·숫자·`-`, 고유값. 같은 code로 다시 넣으면 덮어쓴다 |
| `region` | `jeju-west` `jeju-east` `jeju-south` `jeju-city` (루트의 중심 지역) |
| `companion` | `kids` `parents` `couple` `friends` |
| `kidAges` | 아이 동반일 때 맞는 나이 범위 `[최소, 최대]` (선택) |
| `days` | 일자 배열(1~7일). 각 일자는 슬롯 배열 |
| `slot` | `am`(10시·2시간) `lunch`(12시) `pm`(14시·2시간) `cafe`(16시) `dinner`(18시·1시간 반) `extra` |
| `place` | `places-for-llm.json`의 `ref` (실제 장소는 숫자 id, 샘플은 `sample-01` 형식) |
| `reason` | 추천 이유 한 문장, 160자 이내 |

## LLM에 줄 프롬프트 (복사해서 사용)

```
너는 제주 가족 여행 루트를 짜는 도우미다. 첨부한 places-for-llm.json 의 장소만 써서
아래 조건의 루트를 JSON 배열로 만들어라. JSON 말고 다른 말은 쓰지 않는다.

만들 루트: {지역} · {동행} · {N}일 · {개수}개 (서로 다른 동선으로)
code 는 "{지역짧게}-{동행}-{N}d-{번호 3자리}" 형식 (예: west-kids-3d-001)

규칙
- place 에는 목록의 ref 값만 쓴다. 목록에 없는 장소를 만들거나 이름을 지어내지 않는다.
- 한 루트 안에서 같은 장소를 두 번 쓰지 않는다.
- 슬롯 종류와 카테고리를 맞춘다: am·pm = sight, lunch·dinner = food, cafe = cafe.
- 영업시간(hours)이 슬롯 시각(am 10:00~12:00, lunch 12:00~13:00, pm 14:00~16:00,
  cafe 16:00~17:00, dinner 18:00~19:30)을 덮는 곳만 넣는다. hours 가 null 이면 늘 열린 곳이다.
- 정기휴무(closed, 0=일~6=토)가 있는 곳은 써도 되지만, 하루에 휴무 있는 곳을 2곳 넘게 몰지 않는다.
  (사용자 날짜에 쉬는 곳은 서비스가 자동으로 빼고 다른 곳으로 채운다)
- 하루 동선은 가까운 곳끼리 묶는다 (lat/lng 기준). 첫날 오전은 공항(제주시) 쪽에서 시작하면 좋다.
- reason 은 그 장소의 정보(종류, tags, indoor)로만 쓴다. 맛·리뷰·가격·분위기처럼 주어지지 않은 사실은 쓰지 않는다.
  tags 뜻: baby_chair=아기의자, kids_menu=유아 메뉴, parking=주차, stroller=유모차 가능,
  nursing=수유실, floor_seat=좌식, foot_wash=발 씻는 곳, kids_zone=키즈존
- 아이 동반: 하루에 실내(indoor) 한 곳 이상, 식당은 아기의자·유아 메뉴 우선, 13~15시 사이 이동이 긴 곳 배치(차에서 낮잠).
- 부모님 동반: 많이 걷지 않는 곳(주차·유모차 가능 태그)을 우선한다.
```

### 몇 개나 만들까

조합은 지역 4 × 동행 4 × 일수(1~4일) = 64가지다. 조합마다 3~5개씩이면 200~300개로
같은 조건에서 다시 눌러도 다른 초안이 나온다. 많이 쓰는 조합(서쪽·아이·2박 3일 등)은 더 많이 만든다.
`/admin` → AI 루트 탭의 "꺼내 쓴 횟수"로 어떤 조합이 많이 쓰이는지 보고 보충한다.
