import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { EVENTS, logEvent } from '@/lib/events';
import TripSetupForm from './TripSetupForm';

/** S02 여행 정보 입력 */
export default async function NewTripPage({ searchParams }) {
  const user = await getCurrentUser();
  if (!user) {
    await logEvent(EVENTS.loginWall);
    redirect(`/login?next=${encodeURIComponent('/trips/new')}`);
  }
  await logEvent(EVENTS.setupViewed, { userId: user.id });
  const sp = await searchParams;
  // 홈 첫 질문(누구랑·뭐 타고)을 거쳐 왔으면 같은 질문을 다시 묻지 않고 요약만 보여준다
  return <TripSetupForm initialCompanion={sp?.c} initialMode={sp?.m} fromHome={!!(sp?.c && sp?.m)} />;
}
