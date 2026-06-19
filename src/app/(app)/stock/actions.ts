'use server';

import { revalidatePath } from 'next/cache';
import { getAuthContext } from '@/lib/auth';
import {
  upsertStockItem,
  decrementStock,
  setStockLocation,
  createStorageLocation,
  deleteStorageLocation,
  ensureStockConservation,
  recordStockEvent,
  searchFoodCatalog,
  findCatalogFoodIdByLabel,
  getOrCreateCatalogFood,
  type StockTrackingMode,
  type FoodSuggestion,
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

export async function deleteStockAction(stockId: string): Promise<void> {
  const { supabase } = await requireHousehold();
  await supabase.from('stock').delete().eq('id', stockId);
  revalidatePath('/stock');
}

export async function toggleStockPresenceAction(stockId: string, present: boolean): Promise<void> {
  const { supabase } = await requireHousehold();
  await supabase.from('stock').update({ present }).eq('id', stockId);
  revalidatePath('/stock');
}
