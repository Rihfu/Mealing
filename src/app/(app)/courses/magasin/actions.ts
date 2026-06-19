'use server';

import { getAuthContext } from '@/lib/auth';
import {
  generateShoppingListAutoSorted,
  getShoppingWindow,
  listHouseholdCategories,
  getLastKnownPrices,
  loadRayonOrder,
  essentialKey,
} from '@/lib/core';
import { groupByRayon } from '../rayons';
import type { StoreGroup } from './store-list';

export interface MagasinSnapshot {
  groups: StoreGroup[];
  total: number;
  done: number;
}

/**
 * Instantané sérialisable du mode magasin (liste groupée par rayon + prix suggérés).
 * Réutilise la même logique que la liste (generateShoppingListAutoSorted + groupByRayon).
 * Alimente le cache client (IndexedDB) → ouverture instantanée + lecture hors-ligne.
 */
export async function getMagasinSnapshotAction(): Promise<MagasinSnapshot | null> {
  const { supabase, userId, profile } = await getAuthContext();
  if (!userId || !profile?.household_id) return null;
  const householdId = profile.household_id as string;

  const { from, to } = await getShoppingWindow(supabase, householdId);
  const [lines, customCats, lastPrices, orderMap] = await Promise.all([
    generateShoppingListAutoSorted(supabase, { householdId, from, to }),
    listHouseholdCategories(supabase, householdId),
    getLastKnownPrices(supabase, householdId),
    loadRayonOrder(supabase, householdId),
  ]);

  const groups = groupByRayon(lines, customCats, orderMap).map<StoreGroup>((g) => ({
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

  return { groups, total: lines.length, done: lines.filter((l) => l.checked).length };
}
