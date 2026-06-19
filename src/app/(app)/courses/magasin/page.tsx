import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth';
import { MagasinView } from './magasin-view';

/**
 * Mode magasin — page LÉGÈRE (auth seulement) : les données passent par le cache
 * client (IndexedDB) via MagasinView → ouverture instantanée + lecture hors-ligne.
 * Plus aucune requête lourde dans le chemin de navigation (cf. Phase 2 du chantier PWA).
 */
export default async function MagasinPage() {
  const { userId, profile } = await getAuthContext();
  if (!userId) redirect('/login');
  if (!profile?.household_id) redirect('/onboarding');
  return <MagasinView />;
}
