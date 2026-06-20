'use server';

import { getAuthContext } from '@/lib/auth';
import {
  getStockWithExpiry,
  listStorageLocations,
  loadLocationOrder,
  findCatalogFoodIdByLabel,
  getOrCreateCatalogFood,
} from '@/lib/core';
import { groupByLocation, orderedLocationKeys, locationView } from './locations';
import type { SGroup, SItem } from './stock-list';
import type { OrderedLocation } from './locations-manager';

interface StockRow {
  id: string;
  label: string | null;
  tracking_mode: string;
  quantity: number | null;
  unit: string | null;
  present: boolean;
  storage_location: string | null;
  date_ouverture: string | null;
  printed_expiry: string | null;
  food_id: string | null;
  food: { name: string; external_id: string | null } | { name: string; external_id: string | null }[] | null;
}

function foodOf(f: StockRow['food']) {
  return Array.isArray(f) ? (f[0] ?? null) : f;
}

/** Article « à consommer en priorité » (péremption ≤ 3 j), forme sérialisable. */
export interface PriorityItem {
  id: string;
  foodId: string | null;
  name: string;
  daysRemaining: number;
}

/**
 * Instantané SÉRIALISABLE de la page Stock (rendu cache-first côté client). Reprend
 * exactement l'assemblage de l'ancienne page serveur, en une passe parallélisée. Sert
 * de `loader` à `useCachedResource` → affichage instantané depuis le cache + revalidation
 * réseau en arrière-plan (Phase 2 du chantier PWA, parité avec `courses/snapshot.ts`).
 */
export interface StockPageSnapshot {
  groups: SGroup[];
  priority: PriorityItem[];
  locationOptions: { key: string; label: string }[];
  orderedLocations: OrderedLocation[];
}

export async function getStockSnapshotAction(): Promise<StockPageSnapshot | null> {
  const { supabase, profile, userId } = await getAuthContext();
  if (!userId || !profile?.household_id) return null;
  const householdId = profile.household_id as string;

  const [{ data: stock }, expiries, customLocations, orderMap] = await Promise.all([
    supabase
      .from('stock')
      .select(
        'id, label, tracking_mode, quantity, unit, present, storage_location, date_ouverture, printed_expiry, food_id, food:food_id(name, external_id)',
      )
      .eq('household_id', householdId)
      .order('created_at', { ascending: false }),
    getStockWithExpiry(supabase, householdId),
    listStorageLocations(supabase, householdId),
    loadLocationOrder(supabase, householdId),
  ]);

  // Backfill : TOUT article doit être lié au catalogue → fiche produit disponible (même
  // peu commun). Les articles ajoutés par l'agent IA (ou anciens) arrivaient food_id null
  // → non cliquables. On les rattache une fois (puis c'est un no-op : plus de food_id null).
  const unlinked = ((stock ?? []) as StockRow[]).filter((r) => !r.food_id && (r.label ?? '').trim());
  if (unlinked.length > 0) {
    await Promise.all(
      unlinked.map(async (r) => {
        const label = (r.label as string).trim();
        const fid =
          (await findCatalogFoodIdByLabel(supabase, label)) ??
          (await getOrCreateCatalogFood(supabase, { label, name: label, category: null }));
        if (fid) {
          await supabase.from('stock').update({ food_id: fid }).eq('id', r.id);
          r.food_id = fid; // reflété dès ce rendu → FoodLink cliquable
        }
      }),
    );
  }

  const expById = new Map(expiries.map((e) => [e.id, e]));
  const items: SItem[] = ((stock ?? []) as StockRow[]).map((r) => {
    const f = foodOf(r.food);
    const e = expById.get(r.id);
    return {
      id: r.id,
      name: f?.name ?? r.label ?? '(article)',
      foodId: r.food_id,
      iconSlug: f?.external_id ?? null,
      trackingMode: r.tracking_mode === 'quantity' ? 'quantity' : 'presence',
      quantity: r.quantity,
      unit: r.unit,
      present: r.present,
      storageLocation: r.storage_location,
      opened: r.date_ouverture != null,
      printedExpiry: r.printed_expiry,
      daysRemaining: e?.daysRemaining ?? null,
      expirySource: e?.expirySource ?? null,
    };
  });

  const groups = groupByLocation(items, customLocations, orderMap);
  const priority: PriorityItem[] = expiries
    .filter((e) => e.daysRemaining != null && (e.daysRemaining as number) <= 3)
    .map((e) => ({ id: e.id, foodId: e.foodId, name: e.name, daysRemaining: e.daysRemaining as number }));

  // Lieux dans l'ordre du foyer (pour les pickers + le gestionnaire).
  const customById = new Map(customLocations.map((c) => [c.id, c.label]));
  const customKeys = new Set(customLocations.map((c) => c.id));
  const orderedKeys = orderedLocationKeys(customLocations, orderMap);
  const locationOptions = orderedKeys.map((k) => ({ key: k, label: locationView(k, customById).label }));
  const orderedLocations: OrderedLocation[] = orderedKeys.map((k) => ({
    key: k,
    label: locationView(k, customById).label,
    isCustom: customKeys.has(k),
  }));

  return { groups, priority, locationOptions, orderedLocations };
}
