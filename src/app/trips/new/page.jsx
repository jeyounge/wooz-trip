import { requireUser } from '@/lib/auth';
import TripSetupForm from './TripSetupForm';

/** S02 여행 정보 입력 */
export default async function NewTripPage({ searchParams }) {
  await requireUser('/trips/new');
  const sp = await searchParams;
  // 홈 첫 질문(누구랑·뭐 타고)을 거쳐 왔으면 같은 질문을 다시 묻지 않고 요약만 보여준다
  return <TripSetupForm initialCompanion={sp?.c} initialMode={sp?.m} fromHome={!!(sp?.c && sp?.m)} />;
}
