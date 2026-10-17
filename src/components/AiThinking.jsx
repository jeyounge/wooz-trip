'use client';
import { useEffect, useState } from 'react';
import { IconCheck, IconSpark } from './Icons';

/** AI 초안을 고르는 동안 보여줄 단계 (실제로 서버가 하는 일과 같은 순서) */
function stepsFor(companion) {
  return [
    '여행 조건에 맞는 루트 찾는 중',
    '그날 휴무·영업시간 확인 중',
    '장소 사이 이동 동선 계산 중',
    companion === 'kids' ? '아이 편의(아기의자·수유실) 챙기는 중' : companion === 'parents' ? '덜 걷는 곳 위주로 고르는 중' : '빈칸 마저 채우는 중',
  ];
}

export const AI_MIN_MS = 3600;
const STEP_MS = AI_MIN_MS / 4;

/** 결과가 일찍 와도 최소 ms 동안은 기다린다 (단계 연출이 끝까지 보이게) */
export async function waitAtLeast(promise, ms = AI_MIN_MS) {
  const [res] = await Promise.all([promise, new Promise((r) => setTimeout(r, ms))]);
  return res;
}

/**
 * "AI가 루트를 짜는 중" 전체 화면 안내.
 * 단계가 하나씩 체크된다. 마지막 단계는 서버 응답이 올 때까지 진행 중으로 남는다.
 */
export default function AiThinking({ companion }) {
  const steps = stepsFor(companion);
  const [done, setDone] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setDone((d) => Math.min(d + 1, steps.length - 1)), STEP_MS);
    return () => clearInterval(t);
  }, [steps.length]);

  return (
    <div className="fixed inset-0 z-50 flex justify-center" role="status" aria-live="polite" aria-label="AI가 루트를 짜는 중">
      <div className="absolute inset-0 bg-[#6E5A4C]/80" aria-hidden="true" />
      <section className="sheet-in relative mx-4 my-auto flex w-full max-w-[398px] flex-col items-center gap-4 rounded-[28px] bg-bg px-6 pt-7 pb-6 shadow-card">
        <div className="ai-pulse flex h-16 w-16 items-center justify-center rounded-full bg-accent text-ink" aria-hidden="true">
          <IconSpark size={30} />
        </div>
        <div className="text-center">
          <div className="font-display text-[22px] leading-snug">AI가 루트를 짜고 있어요</div>
          <div className="mt-1 text-[13px] text-sub">잠깐만 기다려 주세요</div>
        </div>
        <ol className="m-0 flex w-full list-none flex-col gap-2 p-0">
          {steps.map((label, i) => {
            const state = i < done ? 'done' : i === done ? 'now' : 'wait';
            return (
              <li
                key={label}
                className={`flex min-h-[44px] items-center gap-2.5 rounded-2xl px-3.5 text-sm ${
                  state === 'wait' ? 'bg-surface/60 text-sub' : 'bg-surface'
                }`}
              >
                <span
                  className={`flex h-6 w-6 flex-none items-center justify-center rounded-full ${
                    state === 'done' ? 'bg-ok text-white' : state === 'now' ? 'ai-dot bg-accent' : 'border-2 border-line-strong'
                  }`}
                  aria-hidden="true"
                >
                  {state === 'done' && <IconCheck size={13} />}
                </span>
                <span className="flex-1">{label}</span>
                <span className="sr-only">{state === 'done' ? '완료' : state === 'now' ? '진행 중' : '대기'}</span>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
