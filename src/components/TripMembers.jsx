'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addTripMember, removeTripMember } from '@/app/actions/trips';
import { SERVICE_NAME } from '@/lib/config';

/**
 * 같이 고치기 (S05 아래 카드).
 * 작성자: 가입한 이메일로 같이 고칠 사람 넣기 · 빼기. 멤버: 초대받은 여행 안내 · 나가기.
 * members 가 null 이면 0008 실행 전 → 카드를 숨긴다.
 */
export default function TripMembers({ tripId, role, userId, members: initial }) {
  const router = useRouter();
  const [members, setMembers] = useState(initial || []);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState(null);
  const [pending, start] = useTransition();

  if (role === 'member') {
    return (
      <section className="card mt-1 flex flex-col gap-2 p-4" aria-label="같이 고치기">
        <div className="font-display text-base">초대받은 여행이에요</div>
        <p className="m-0 text-xs leading-relaxed text-sub">
          일정과 쓴 돈을 같이 고칠 수 있어요. 여행 정보 수정·공유·공개는 만든 분만 할 수 있어요.
        </p>
        {msg && <p className="m-0 text-sm font-bold text-warn-ink">{msg}</p>}
        <button
          type="button"
          disabled={pending}
          className="h-11 self-start text-sm text-sub underline"
          onClick={() => {
            if (!window.confirm('이 여행에서 나갈까요? 다시 들어오려면 만든 분이 다시 넣어 줘야 해요')) return;
            start(async () => {
              const res = await removeTripMember(tripId, userId);
              if (!res.ok) return setMsg(res.message);
              router.push('/trips');
            });
          }}
        >
          이 여행에서 나가기
        </button>
      </section>
    );
  }

  if (!initial) return null;

  return (
    <section className="card mt-1 flex flex-col gap-2 p-4" aria-label="같이 고치기">
      <div className="font-display text-base">같이 고치기</div>
      <p className="m-0 text-xs leading-relaxed text-sub">
        {SERVICE_NAME}에 가입한 이메일을 넣으면 그분도 일정과 쓴 돈을 고칠 수 있어요. 여행 정보·공유·공개는 나만 할 수 있어요.
      </p>
      {members.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {members.map((m) => (
            <li key={m.userId} className="flex min-h-11 items-center gap-2 rounded-2xl bg-bg px-3">
              <span className="min-w-0 flex-1 truncate text-sm">{m.email}</span>
              <button
                type="button"
                disabled={pending}
                aria-label={`${m.email} 빼기`}
                className="h-11 px-1 text-xs text-sub underline"
                onClick={() =>
                  start(async () => {
                    const res = await removeTripMember(tripId, m.userId);
                    if (!res.ok) return setMsg(res.message);
                    setMembers(res.members);
                    setMsg(null);
                  })
                }
              >
                빼기
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!email.trim()) return;
          start(async () => {
            const res = await addTripMember(tripId, email);
            if (!res.ok) return setMsg(res.message);
            setMembers(res.members);
            setEmail('');
            setMsg('넣었어요. 그분의 「내 여행」에 이 여행이 보여요');
          });
        }}
      >
        <input
          type="email"
          inputMode="email"
          autoComplete="off"
          value={email}
          maxLength={120}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="가입한 이메일"
          aria-label="같이 고칠 사람 이메일"
          className="h-11 min-w-0 flex-1 rounded-xl bg-bg px-3 text-sm outline-none"
        />
        <button type="submit" disabled={pending} className="h-11 flex-none rounded-xl bg-selected px-4 text-sm text-selected-ink">
          {pending ? '…' : '넣기'}
        </button>
      </form>
      {msg && (
        <p className="m-0 text-sm text-sub" role="status">
          {msg}
        </p>
      )}
    </section>
  );
}
