/**
 * provider.js — LLM 호출 (서버 전용). 3단계 "선택과 설명"만 맡는다.
 * ANTHROPIC_API_KEY 가 없거나 호출이 실패하면 null 을 돌려주고,
 * 호출한 쪽은 코드 1순위 후보로 채운다 (fill.validatePicks).
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

const MODEL = 'claude-opus-5-5';

const PicksSchema = z.object({
  picks: z.array(
    z.object({
      slotId: z.string(),
      placeId: z.number().int(),
      reason: z.string(),
    })
  ),
});

const SYSTEM = `너는 제주 가족 여행 동선을 짜는 도우미다.
각 빈 슬롯마다 주어진 candidates 중 정확히 한 곳을 고르고, 고른 이유를 한국어 한두 문장(60자 안팎)으로 쓴다.

규칙:
- placeId 는 반드시 그 슬롯의 candidates 에 있는 id 만 쓴다. 목록에 없는 장소를 만들거나 언급하지 않는다.
- 같은 장소를 두 번 고르지 않는다.
- 후보 정보(이름, 종류, 태그, 실내 여부, 이동시간) 밖의 사실(맛, 리뷰, 가격 등)을 지어내지 않는다.
- 이동시간이 짧을수록 좋지만, 동행 조건에 맞는 태그가 있으면 조금 멀어도 괜찮다.`;

function companionRules(trip) {
  if (trip.companion_type === 'kids') {
    const ages = (trip.kids_ages || []).join(', ');
    return `동행: 아이 동반${ages ? ` (아이 나이 ${ages}세)` : ''}.
- 13~15시 낮잠 시간대에는 이동이 긴 곳을 골라 차에서 재우는 동선이 좋다.
- 식당은 아기의자·유아 메뉴·좌식 태그를 우선한다.
- 하루에 실내(indoor) 볼거리가 적어도 한 곳 있으면 비 오는 날 대안이 된다.`;
  }
  if (trip.companion_type === 'parents') {
    return '동행: 부모님 동반. 걷는 거리와 계단이 적은 곳(주차·유모차 가능 태그)을 우선한다.';
  }
  if (trip.companion_type === 'couple') return '동행: 연인. 분위기 있는 곳을 우선하되 이동은 짧게.';
  return '동행: 친구끼리. 활동적인 곳을 우선하되 이동은 짧게.';
}

/**
 * @param {object} trip
 * @param {object[]} promptTasks fill.tasksForPrompt 결과
 * @returns {Promise<Array<{slotId, placeId, reason}>|null>}
 */
export async function pickWithLLM(trip, promptTasks) {
  if (!process.env.ANTHROPIC_API_KEY || !promptTasks.length) return null;
  try {
    const client = new Anthropic();
    const response = await client.beta.messages.parse(
      {
        model: MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low', format: betaZodOutputFormat(PicksSchema) },
        system: SYSTEM,
        messages: [
          {
            role: 'user',
            content: `${companionRules(trip)}\n\n빈 슬롯과 후보(JSON):\n${JSON.stringify(promptTasks)}`,
          },
        ],
      },
      { timeout: 45_000 }
    );
    if (response.stop_reason === 'refusal') return null;
    return response.parsed_output?.picks ?? null;
  } catch (e) {
    console.error('[ai] pickWithLLM 실패:', e?.message || e);
    return null;
  }
}
