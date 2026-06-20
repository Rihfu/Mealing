'use server';

import { revalidatePath } from 'next/cache';
import { getAuthContext } from '@/lib/auth';
import {
  upsertStockItem,
  decrementStock,
  setStockLocation,
  createStorageLocation,
  deleteStorageLocation,
  listStorageLocations,
  loadLocationOrder,
  saveLocationOrder,
  ensureStockConservation,
  ensureFoodConservation,
  storageDef,
  recordStockEvent,
  searchFoodCatalog,
  findCatalogFoodIdByLabel,
  getOrCreateCatalogFood,
  applyDueMealsToStock,
  undoMealStockApplication,
  removeStockItems,
  restoreStockItems,
  type StockTrackingMode,
  type FoodSuggestion,
  type MealStockSummary,
  type StockSnapshot,
} from '@/lib/core';

async function requireHousehold() {
  const { supabase, userId, profile } = await getAuthContext();
  if (!userId || !profile?.household_id) throw new Error('Contexte foyer manquant.');
  return { supabase, householdId: profile.household_id as string };
}

const num = (v: FormDataEntryValue | null) => {
  const n = Number(v);
  return v != null && v !== '' && !Number.isNaN(n) ? n : undefined;
};

/** Autocomplétion d'aliments (catalogue local + USDA/OFF) — partagé avec Courses. */
export async function searchCatalogAction(query: string): Promise<FoodSuggestion[]> {
  const { supabase } = await requireHousehold();
  return searchFoodCatalog(supabase, query);
}

/**
 * Ajoute un article au stock. Le texte libre est RATTACHÉ au catalogue (lien existant
 * sinon création d'une fiche `cat:`) → fiche produit + conservation intelligente
 * disponibles. Journalise une entrée (`stock_event` kind='in').
 */
export async function addStockAction(formData: FormData): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  const trackingMode = (String(formData.get('tracking_mode')) || 'quantity') as StockTrackingMode;
  let foodId = String(formData.get('food_id') ?? '') || undefined;
  const label = String(formData.get('label') ?? '').trim();
  const location = String(formData.get('storage_location') ?? '') || undefined;
  const quantity = trackingMode === 'quantity' ? num(formData.get('quantity')) : undefined;
  const unit = String(formData.get('unit') ?? '') || undefined;

  if (!foodId && !label) return;
  // Rattachement au catalogue (comme Courses) → fiche + conservation par aliment.
  if (!foodId && label) {
    foodId = (await findCatalogFoodIdByLabel(supabase, label)) ?? (await getOrCreateCatalogFood(supabase, { label, name: label, category: null })) ?? undefined;
  }

  const stockId = await upsertStockItem(supabase, {
    householdId,
    foodId,
    label: label || undefined,
    trackingMode,
    quantity,
    unit,
    present: true,
  });
  if (location) await setStockLocation(supabase, stockId, location);
  await recordStockEvent(supabase, {
    householdId,
    stockId,
    foodId: foodId ?? null,
    label: label || null,
    kind: 'in',
    quantity: quantity ?? null,
    unit: unit ?? null,
    source: 'manual',
  });
  revalidatePath('/stock');
}

/** Range un article dans un lieu de conservation (clé prédéfinie ou uuid custom). */
export async function setStockLocationAction(stockId: string, location: string | null): Promise<void> {
  const { supabase } = await requireHousehold();
  await setStockLocation(supabase, stockId, location);
  revalidatePath('/stock');
}

/** Marque un article comme ouvert/entamé (ou annule) → recalcule la péremption. */
export async function setOpenedAction(stockId: string, opened: boolean): Promise<void> {
  const { supabase } = await requireHousehold();
  await supabase.from('stock').update({ date_ouverture: opened ? new Date().toISOString() : null }).eq('id', stockId);
  revalidatePath('/stock');
}

/** Saisit/efface la DLC imprimée (prime sur l'estimation). */
export async function setPrintedExpiryAction(stockId: string, date: string | null): Promise<void> {
  const { supabase } = await requireHousehold();
  await supabase.from('stock').update({ printed_expiry: date || null }).eq('id', stockId);
  revalidatePath('/stock');
}

/** Estime (IA, best-effort, mise en cache) la conservation des aliments du stock. */
export async function estimateConservationAction(): Promise<{ done: number }> {
  const { supabase, householdId } = await requireHousehold();
  const done = await ensureStockConservation(supabase, householdId);
  revalidatePath('/stock');
  return { done };
}

/**
 * Estime (IA, best-effort, mise en cache) la conservation d'UN article — déclenché par
 * la pastille « estimer ? ». Renvoie un statut pour un retour clair côté UI :
 * - 'no-location' : pas de lieu exploitable (range-le d'abord — l'estimation est par lieu) ;
 * - 'no-food'     : article non lié au catalogue (rare) ;
 * - 'failed'      : l'IA n'a pas répondu (souvent le rate-limit Groq gratuit) ;
 * - 'estimated'   : estimation faite ET affichable (une date apparaît au refresh).
 * Pas de `revalidatePath` (cache-first) : l'appelant fait `refresh()`.
 */
const BASIS_HINT: Record<'placard' | 'frigo' | 'congelateur', string> = {
  placard: 'le placard',
  frigo: 'le frigo',
  congelateur: 'le congélateur',
};

export async function estimateItemConservationAction(
  stockId: string,
): Promise<{ status: 'estimated' | 'no-location' | 'no-estimate-here' | 'no-food' | 'failed'; suggested?: string[] }> {
  const { supabase } = await requireHousehold();
  const { data: row } = await supabase
    .from('stock')
    .select('food_id, label, storage_location, date_ouverture, food:food_id(name, category)')
    .eq('id', stockId)
    .maybeSingle();
  if (!row) return { status: 'failed' };

  const basis = storageDef(row.storage_location)?.conservationBasis;
  if (!basis) return { status: 'no-location' };

  const food = Array.isArray(row.food) ? row.food[0] : row.food;
  let foodId = row.food_id;
  let name = food?.name ?? row.label ?? '';
  // Article non lié au catalogue (ex. ajouté par l'agent IA, food_id null) → on le
  // rattache par libellé puis on BACKFILL le lien → fiche produit + estimation possibles.
  if (!foodId) {
    const label = row.label ?? '';
    foodId =
      (await findCatalogFoodIdByLabel(supabase, label)) ??
      (await getOrCreateCatalogFood(supabase, { label, name: label, category: null }));
    if (foodId) {
      await supabase.from('stock').update({ food_id: foodId }).eq('id', stockId);
      if (!name) name = label;
    }
  }
  if (!foodId) return { status: 'no-food' };

  const days = await ensureFoodConservation(supabase, foodId, name || 'aliment', food?.category ?? null);
  if (!days) return { status: 'failed' };

  const b = days[basis];
  const opened = row.date_ouverture != null;
  const val = b ? (opened ? (b.opened ?? b.unopened) : b.unopened) : null;
  if (val != null) return { status: 'estimated' };

  // L'IA a renvoyé des repères, mais PAS pour ce lieu (ex. melon au placard → seul le
  // frigo a une durée). Réessayer n'y changerait rien → on suggère les lieux pertinents.
  const suggested = (['placard', 'frigo', 'congelateur'] as const)
    .filter((k) => {
      const x = days[k];
      return x && (x.unopened != null || x.opened != null);
    })
    .map((k) => BASIS_HINT[k]);
  return suggested.length > 0 ? { status: 'no-estimate-here', suggested } : { status: 'failed' };
}

export async function createLocationAction(label: string, iconSlug?: string | null): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  if (!label.trim()) return;
  await createStorageLocation(supabase, householdId, { label: label.trim(), iconSlug });
  revalidatePath('/stock');
}

export async function deleteLocationAction(id: string): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  await deleteStorageLocation(supabase, householdId, id);
  revalidatePath('/stock');
}

/** Réordonne les lieux (flèches ↑/↓) — persiste l'ordre complet du foyer. */
export async function moveLocationAction(input: { key: string; dir: 'up' | 'down' }): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  const { orderedLocationKeys } = await import('./locations');
  const [custom, orderMap] = await Promise.all([
    listStorageLocations(supabase, householdId),
    loadLocationOrder(supabase, householdId),
  ]);
  const keys = orderedLocationKeys(custom, orderMap);
  const i = keys.indexOf(input.key);
  const j = input.dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= keys.length) return;
  [keys[i], keys[j]] = [keys[j], keys[i]];
  await saveLocationOrder(supabase, householdId, keys);
  revalidatePath('/stock');
}

/** Décrément par CONSOMMATION (specs 3.4) + journal (sortie). */
export async function decrementStockAction(formData: FormData): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  const stockId = String(formData.get('stock_id'));
  const amount = num(formData.get('amount')) ?? 0;
  if (amount <= 0) return;
  const { data: row } = await supabase.from('stock').select('food_id, label, unit').eq('id', stockId).maybeSingle();
  await decrementStock(supabase, { stockId, amount });
  await recordStockEvent(supabase, {
    householdId,
    stockId,
    foodId: row?.food_id ?? null,
    label: row?.label ?? null,
    kind: 'out',
    quantity: amount,
    unit: row?.unit ?? null,
    source: 'consumption',
  });
  revalidatePath('/stock');
}

/** Jeter / périmé : sort l'article du stock + journalise (kind='discard'). */
export async function discardStockAction(stockId: string): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  const { data: row } = await supabase.from('stock').select('food_id, label, quantity, unit').eq('id', stockId).maybeSingle();
  await recordStockEvent(supabase, {
    householdId,
    stockId,
    foodId: row?.food_id ?? null,
    label: row?.label ?? null,
    kind: 'discard',
    quantity: row?.quantity ?? null,
    unit: row?.unit ?? null,
    source: 'expiry',
  });
  await supabase.from('stock').delete().eq('id', stockId);
  revalidatePath('/stock');
}

/** Retire des articles (réversible) → renvoie l'instantané pour l'annulation. */
export async function removeStockItemsAction(ids: string[]): Promise<StockSnapshot[]> {
  const { supabase } = await requireHousehold();
  if (ids.length === 0) return [];
  const snapshots = await removeStockItems(supabase, ids);
  revalidatePath('/stock');
  return snapshots;
}

export async function undoRemoveStockAction(snapshots: StockSnapshot[]): Promise<void> {
  const { supabase } = await requireHousehold();
  await restoreStockItems(supabase, snapshots);
  revalidatePath('/stock');
}

export async function deleteStockAction(stockId: string): Promise<void> {
  const { supabase } = await requireHousehold();
  await supabase.from('stock').delete().eq('id', stockId);
  revalidatePath('/stock');
}

/** Déplace plusieurs articles vers un lieu (multi-sélection). */
export async function bulkSetStockLocationAction(ids: string[], location: string | null): Promise<void> {
  const { supabase } = await requireHousehold();
  if (ids.length === 0) return;
  await supabase.from('stock').update({ storage_location: location }).in('id', ids);
  revalidatePath('/stock');
}

/** Marque plusieurs articles ouverts/entamés (multi-sélection). */
export async function bulkSetOpenedAction(ids: string[], opened: boolean): Promise<void> {
  const { supabase } = await requireHousehold();
  if (ids.length === 0) return;
  await supabase.from('stock').update({ date_ouverture: opened ? new Date().toISOString() : null }).in('id', ids);
  revalidatePath('/stock');
}

export async function toggleStockPresenceAction(stockId: string, present: boolean): Promise<void> {
  const { supabase } = await requireHousehold();
  await supabase.from('stock').update({ present }).eq('id', stockId);
  revalidatePath('/stock');
}

/**
 * Réconcilie les repas passés → décrément automatique du stock (specs 3.4).
 * Déclenchée au montage de la page Stock (effet client, PAS au rendu serveur → pas
 * de décrément au prefetch). Idempotente. Renvoie le résumé pour l'annulation.
 */
export async function applyDueMealsAction(): Promise<MealStockSummary> {
  const { supabase, householdId } = await requireHousehold();
  const summary = await applyDueMealsToStock(supabase, householdId);
  if (summary.decrements.length > 0) revalidatePath('/stock');
  return summary;
}

export async function undoMealsAction(summary: MealStockSummary): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  await undoMealStockApplication(supabase, householdId, summary);
  revalidatePath('/stock');
}
