import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth';
import { generateShoppingListAutoSorted, getShoppingWindow, listHouseholdCategories, getLastKnownPrices, loadRayonOrder, essentialKey } from '@/lib/core';
import { groupByRayon } from '../rayons';
import { StoreList, type StoreGroup } from './store-list';

export default async function MagasinPage() {
  const { supabase, profile, userId } = await getAuthContext();
  if (!userId) redirect('/login');
  if (!profile?.household_id) redirect('/onboarding');
  const householdId = profile.household_id;

  const { from, to } = await getShoppingWindow(supabase, householdId);
  const [lines, customCats, lastPrices, orderMap] = await Promise.all([
    generateShoppingListAutoSorted(supabase, { householdId, from, to }),
    listHouseholdCategories(supabase, householdId),
    getLastKnownPrices(supabase, householdId),
    loadRayonOrder(supabase, householdId),
  ]);

  // En magasin : tout reste visible dans son rayon (coché = barré sur place),
  // dans l'ordre choisi par le foyer (réordonnancement depuis la liste).
  const groups = groupByRayon(lines, customCats, orderMap);
  const done = lines.filter((l) => l.checked);
  const total = lines.length;
  const pct = total > 0 ? Math.round((done.length / total) * 100) : 0;

  // Données sérialisables pour la liste interactive (coche + saisie prix en rayon).
  const storeGroups: StoreGroup[] = groups.map((g) => ({
    key: g.key,
    label: g.view?.label ?? 'Autres',
    items: g.items.map((l) => ({
      key: l.key,
      name: l.name,
      qty: l.quantity != null ? `${l.quantity} ${l.unit ?? ''}`.trim() : '',
      checked: l.checked,
      foodId: l.foodId ?? null,
      suggestedPrice: lastPrices[essentialKey({ foodId: l.foodId ?? null, label: l.name })] ?? null,
    })),
  }));

  return (
    <div className="mx-auto w-full max-w-md pb-28">
      {/* En-tête : retour + titre + progression */}
      <div className="flex items-center justify-between gap-3">
        <Link href="/courses" className="flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Liste
        </Link>
        <h1 className="font-display text-2xl font-semibold">En magasin</h1>
        <span className="w-12" />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-green-strong transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="whitespace-nowrap text-sm font-bold">
          {done.length} / {total}
        </span>
      </div>

      {total === 0 ? (
        <p className="mt-10 text-center text-sm text-ink-soft">
          Rien à acheter pour l’instant.{' '}
          <Link href="/courses" className="font-semibold text-green-strong">
            Retour à la liste
          </Link>
        </p>
      ) : (
        <StoreList groups={storeGroups} />
      )}
    </div>
  );
}
