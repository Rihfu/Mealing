import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth';
import { CoursesView } from './courses-view';

/**
 * Liste de courses — page LÉGÈRE (auth seulement). Les données passent par le cache
 * client (IndexedDB) via CoursesView → arrivée instantanée + revalidation en fond
 * (cf. Phase 2 du chantier PWA). Les mutations rafraîchissent l'instantané via le
 * contexte `useCoursesRefresh`.
 */
export default async function CoursesPage() {
  const { profile, userId } = await getAuthContext();
  if (!userId) redirect('/login');
  if (!profile?.household_id) redirect('/onboarding');
  return <CoursesView />;
}
