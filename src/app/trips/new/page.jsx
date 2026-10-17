import { requireUser } from '@/lib/auth';
import TripSetupForm from './TripSetupForm';

/** S02 여행 정보 입력 */
export default async function NewTripPage({ searchParams }) {
  await requireUser('/trips/new');
  const sp = await searchParams;
  return <TripSetupForm initialCompanion={sp?.c} />;
}
