import Link from 'next/link';
import { TopBar } from '@/components/ui';
import { CONTACT_EMAIL, OPERATOR_NAME, POLICY_DATE, SERVICE_NAME } from '@/lib/config';

/** 운영자·문의 한 줄 (값이 없으면 오픈 전 초안으로 표시) */
export function Contact() {
  if (!CONTACT_EMAIL) return <span>문의 이메일은 정식 오픈 때 알려 드려요</span>;
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
      {CONTACT_EMAIL}
    </a>
  );
}
export const operator = () => OPERATOR_NAME || `${SERVICE_NAME} 운영자`;

/** 약관·방침 공통 틀: 제목 + 시행일 + 섹션 목록 */
export default function PolicyPage({ title, sections, other }) {
  return (
    <>
      <TopBar back="/my" title={title} />
      <main className="flex flex-1 flex-col gap-4 px-5 pt-2 pb-10 text-sm leading-relaxed">
        <p className={`m-0 rounded-2xl px-3.5 py-2.5 text-xs ${POLICY_DATE ? 'bg-surface text-sub' : 'bg-warn text-warn-ink'}`}>
          {POLICY_DATE ? `시행일 ${POLICY_DATE}` : '정식 오픈 전 초안이에요. 오픈 전에 검토를 거쳐 확정해요.'}
        </p>
        {sections.map(([h, body]) => (
          <section key={h} className="flex flex-col gap-1.5">
            <h2 className="m-0 font-display text-base">{h}</h2>
            {body}
          </section>
        ))}
        <Link href={other.href} className="self-start text-xs text-sub underline">
          {other.label}
        </Link>
      </main>
    </>
  );
}

export const List = ({ items }) => (
  <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
    {items.map((t, i) => (
      <li key={i}>{t}</li>
    ))}
  </ul>
);
