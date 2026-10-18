import Link from 'next/link';
import { IconBack, IconWarn } from './Icons';

/** 뒤로 가기 동그라미 버튼 */
export function BackLink({ href, label = '뒤로' }) {
  return (
    <Link href={href} aria-label={label} className="icon-btn">
      <IconBack />
    </Link>
  );
}

/** 상단 바: 뒤로 + 제목/부제 + 오른쪽 영역 */
export function TopBar({ back, title, sub, right, subClass = 'text-sub' }) {
  return (
    <header className="flex items-center gap-2.5 px-4 pt-4 pb-1.5">
      {back && <BackLink href={back} />}
      <div className="flex min-w-0 flex-1 flex-col">
        {title && <div className="truncate font-display text-xl">{title}</div>}
        {sub && <div className={`truncate text-[13px] ${subClass}`}>{sub}</div>}
      </div>
      {right}
    </header>
  );
}

/** 아이 태그 목록 */
export function KidTags({ ids = [], labels = {}, max = 4 }) {
  const list = ids.filter((id) => labels[id]).slice(0, max);
  if (!list.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map((id) => (
        <span key={id} className="kid-tag">
          {labels[id]}
        </span>
      ))}
    </div>
  );
}

export function WarnBox({ children }) {
  return (
    <div className="warn-box" role="note">
      <IconWarn />
      <span>{children}</span>
    </div>
  );
}

/** 빈 상태 카드 */
export function EmptyCard({ title, desc, action }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-5 py-8 text-center">
      <div className="font-display text-lg">{title}</div>
      {desc && <p className="m-0 text-sm text-sub leading-relaxed">{desc}</p>}
      {action}
    </div>
  );
}

/** DB 미준비(마이그레이션 전) 등 오류 안내 */
export function ErrorCard({ message, title = '데이터를 불러오지 못했어요' }) {
  return (
    <div className="card m-5 flex flex-col gap-2 p-5">
      <div className="font-display text-lg">{title}</div>
      <p className="m-0 text-sm text-sub leading-relaxed">
        {message?.includes('does not exist') || message?.includes('schema cache')
          ? 'DB 테이블이 아직 없어요. supabase/migrations 의 SQL 을 먼저 실행해 주세요.'
          : message}
      </p>
    </div>
  );
}
