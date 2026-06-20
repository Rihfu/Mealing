import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth';
import { StockView } from './stock-view';

/**
 * Stock — page LÉGÈRE (auth seulement). Les données passent par le cache client
 * (IndexedDB) via StockView → arrivée instantanée + revalidation en fond (Phase 2 du
 * chantier PWA, parité Courses). Les mutations rafraîchissent l'instantané via le
 * contexte `useStockRefresh`.
 */
export default async function StockPage() {
  const { profile, userId } = await getAuthContext();
  if (!userId) redirect('/login');
  if (!profile?.household_id) redirect('/onboarding');
  return <StockView />;
}
