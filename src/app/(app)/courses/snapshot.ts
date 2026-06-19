'use server';

import { getAuthContext } from '@/lib/auth';
import {
  generateShoppingListAutoSorted,
  getShoppingWindow,
  listHouseholdCategories,
  listRecurringItems,
  getLastKnownPrices,
  loadRayonOrder,
  essentialKey,
  type ShoppingLine,
} from '@/lib/core';
import { categoryLabel } from '@/lib/product-assets';
import { groupByRayon, orderRayonKeys } from './rayons';
import type { SGroup, SLine } from './shopping-list';
import type { CustomCategory } from './category-controls';

/** ShoppingLine (serveur) → SLine (sérialisable pour les listes client). */
function toSLine(l: ShoppingLine): SLine {
  return {
    key: l.key,
    name: l.name,
    qty: l.quantity != null ? `${l.quantity} ${l.unit ?? ''}`.trim() : '',
    quantity: l.quantity ?? null,
    unit: l.unit ?? null,
    sources: l.sources,
    manualId: l.manualId ?? null,
    manualIds: l.manualIds ?? [],
    manualOnly: !!l.manualOnly,
    foodId: l.foodId ?? null,
    category: l.category ?? null,
    iconSlug: l.iconSlug ?? null,
    checked: l.checked,
    alreadyStocked: !!l.alreadyStocked,
    stockedLabel: l.stockedLabel ?? null,
  };
}

/** Référence d'un article déjà sur la liste (anti-doublon / anti-surplus du formulaire). */
export interface OnListRef {
  foodId: string | null;
  name: string;
  qty: string;
}
export interface InStockRef {
  foodId: string | null;
  label: string | null;
  qty: string;
  present: boolean;
}
export interface CheckoutItemSnap {
  key: string;
  name: string;
  qty: string;
  category: string | null;
  suggestedPrice: number | null;
}

/** Instantané SÉRIALISABLE de la liste de courses (rendu cache-first côté client). */
export interface CoursesSnapshot {
  activeGroups: SGroup[];
  doneLines: SLine[];
  customCats: CustomCategory[];
  rayonOrder: string[];
  essentials: { id: string; label: string }[];
  onListRefs: OnListRef[];
  inStockRefs: InStockRef[];
  checkoutItems: CheckoutItemSnap[];
  activeCount: number;
  doneCount: number;
}

/**
 * Assemble tout ce dont la page « Liste de courses » a besoin, en une seule passe
 * (mêmes requêtes parallélisées que l'ancienne page serveur). Sert de `loader` à
 * `useCachedResource` → affichage instantané depuis le cache + revalidation en fond.
 */
export async function getCoursesSnapshotAction(): Promise<CoursesSnapshot | null> {
  const { supabase, profile, userId } = await getAuthContext();
  if (!userId || !profile?.household_id) return null;
  const householdId = profile.household_id;

  const { from, to } = await getShoppingWindow(supabase, householdId);

  const [lines, customCats, essentials, lastPrices, orderMap, { data: stock }] = await Promise.all([
    generateShoppingListAutoSorted(supabase, { householdId, from, to }),
    listHouseholdCategories(supabase, householdId),
    listRecurringItems(supabase, householdId),
    getLastKnownPrices(supabase, householdId),
    loadRayonOrder(supabase, householdId),
    supabase.from('stock').select('food_id, label, quantity, unit, present').eq('household_id', householdId),
  ]);

  const rayonOrder = orderRayonKeys(customCats, orderMap);
  const active = lines.filter((l) => !l.checked);
  const done = lines.filter((l) => l.checked);

  const onListRefs: OnListRef[] = active.map((l) => ({
    foodId: l.foodId ?? null,
    name: l.name,
    qty: l.quantity != null ? `${l.quantity} ${l.unit ?? ''}`.trim() : '',
  }));
  const inStockRefs: InStockRef[] = (stock ?? []).map((s) => ({
    foodId: s.food_id ?? null,
    label: s.label ?? null,
    qty: s.quantity != null ? `${s.quantity} ${s.unit ?? ''}`.trim() : '',
    present: s.present,
  }));

  const activeGroups: SGroup[] = groupByRayon(active, customCats, orderMap).map((g) => ({
    key: g.key,
    label: g.view?.label ?? 'Autres',
    tint: g.view?.tint ?? 'var(--color-line)',
    ink: g.view?.ink ?? 'var(--color-ink-soft)',
    iconSlug: g.view?.isCustom ? (g.view.iconSlug ?? null) : null,
    items: g.items.map(toSLine),
  }));
  const doneLines: SLine[] = done.map(toSLine);

  const checkoutItems: CheckoutItemSnap[] = done.map((l) => ({
    key: l.key,
    name: l.name,
    qty: l.quantity != null ? `${l.quantity} ${l.unit ?? ''}`.trim() : '',
    category: categoryLabel(l.category),
    suggestedPrice: lastPrices[essentialKey({ foodId: l.foodId ?? null, label: l.name })] ?? null,
  }));

  return {
    activeGroups,
    doneLines,
    customCats,
    rayonOrder,
    essentials: essentials.map((e) => ({ id: e.id, label: e.label })),
    onListRefs,
    inStockRefs,
    checkoutItems,
    activeCount: active.length,
    doneCount: done.length,
  };
}
