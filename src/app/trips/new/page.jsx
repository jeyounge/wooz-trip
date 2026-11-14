import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { EVENTS, logEvent } from '@/lib/events';
import TripSetupForm from './TripSetupForm';

/** S02 여행 정보 입력 */
export default async function NewTripPage({ searchParams }) {
  const user = await getCurrentUser();
  const sp = await searchParams;
  if (!user) {
    await logEvent(EVENTS.loginWall);
    // 홈에서 고른 값(?to=&c=&m=)을 로그인 뒤에도 그대로 들고 온다
    const q = new URLSearchParams(Object.entries(sp || {}).filter(([k, v]) => ['to', 'c', 'm'].includes(k) && typeof v === 'string'));
    redirect(`/login?next=${encodeURIComponent(`/trips/new${q.size ? `?${q}` : ''}`)}`);
  }
  await logEvent(EVENTS.setupViewed, { userId: user.id });
  // 홈 첫 질문(누구랑·뭐 타고)을 거쳐 왔으면 같은 질문을 다시 묻지 않고 요약만 보여준다
  return <TripSetupForm initialDest={sp?.to} initialCompanion={sp?.c} initialMode={sp?.m} fromHome={!!(sp?.c && sp?.m)} />;
}
