'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { COMPANIONS, DESTINATIONS, TRAVEL_MODES } from '@/lib/config';

/**
 * S01 홈 첫 질문: 어디 가요? / 뭐 타고 가요? / 누구랑 가요?
 * 고른 값은 주소(?c=&m=)에 담는다. 동행을 바꾸면 아래 인기 루트도 서버에서 다시 걸러진다.
 * 「여행 짜러 가기」는 같은 값을 S02(/trips/new)로 넘긴다.
 */
export default function HomeQuickStart({ companion, mode }) {
  const router = useRouter();
  const dest = DESTINATIONS.find((d) => d.open);
  const who = COMPANIONS.find((c) => c.id === companion) || COMPANIONS[0];

  function pick(next) {
    const q = new URLSearchParams({ c: companion, m: mode, ...next });
    router.replace(`/?${q}`, { scroll: false });
  }

  const pill = (on) => `pill h-11 ${on ? 'pill-on' : ''}`;
  const next = new URLSearchParams({ to: dest.id, c: companion, m: mode });

  return (
    <>
      <h1 className="relative m-0 h-display text-[30px] leading-tight">
        {who.with} {dest.label},
        <br />
        어디부터 가볼까?
      </h1>

      <div className="relative flex flex-col gap-1.5">
        <h2 className="m-0 text-sm font-bold text-[#4E3A2C]">어디 가요?</h2>
        <div className="grid grid-cols-3 gap-1.5">
          {DESTINATIONS.map((d) =>
            d.open ? (
              <button key={d.id} type="button" aria-pressed={d.id === dest.id} className={`${pill(d.id === dest.id)} px-0`}>
                {d.label}
              </button>
            ) : (
              <span
                key={d.id}
                aria-disabled="true"
                className="flex h-11 flex-col items-center justify-center rounded-btn border-2 border-dashed border-line-strong bg-surface text-sub"
              >
                <span className="text-sm leading-none">{d.label}</span>
                <span className="mt-0.5 text-[11px] leading-none">준비 중</span>
              </span>
            ),
          )}
        </div>
      </div>

      <div className="relative flex flex-col gap-1.5">
        <h2 className="m-0 text-sm font-bold text-[#4E3A2C]">뭐 타고 가요?</h2>
        <div className="grid grid-cols-2 gap-1.5">
          {TRAVEL_MODES.map((m) => (
            <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => pick({ m: m.id })} className={`${pill(mode === m.id)} px-0`}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative flex flex-col gap-1.5">
        <h2 className="m-0 text-sm font-bold text-[#4E3A2C]">누구랑 가요?</h2>
        <div className="grid grid-cols-4 gap-1.5">
          {COMPANIONS.map((c) => (
            <button key={c.id} type="button" aria-pressed={companion === c.id} onClick={() => pick({ c: c.id })} className={`${pill(companion === c.id)} px-0`}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <Link href={`/trips/new?${next}`} className="btn-cta relative mt-1">
        여행 짜러 가기
      </Link>
    </>
  );
}
