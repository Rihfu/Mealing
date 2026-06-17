'use server';

import { revalidatePath } from 'next/cache';
import { getAuthContext } from '@/lib/auth';
import { searchFoodCatalog, importFoodByRef, checkoutPurchasedToStock, type FoodSuggestion } from '@/lib/core';
import { addDays, isoDate } from '@/lib/dates';
import type { NutritionSource } from '@/lib/providers/nutrition';

async function requireHousehold() {
  const { supabase, userId, profile } = await getAuthContext();
  if (!userId || !profile?.household_id) throw new Error('Contexte foyer manquant.');
  return { supabase, householdId: profile.household_id as string };
}

const num = (v: FormDataEntryValue | null) => {
  const n = Number(v);
  return v != null && v !== '' && !Number.isNaN(n) ? n : undefined;
};

/** Coche/décoche une ligne générée (recette/récurrent) via shopping_item_state. */
export async function toggleCheckAction(formData: FormData): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  const itemKey = String(formData.get('item_key'));
  const checked = formData.get('checked') === 'true';
  await supabase.from('shopping_item_state').upsert(
    { household_id: householdId, item_key: itemKey, checked, checked_at: checked ? new Date().toISOString() : null },
    { onConflict: 'household_id,item_key' },
  );
  revalidatePath('/courses');
}

/** « J'ai fait mes courses » : les articles cochés entrent dans le stock (chantier E). */
export async function checkoutToStockAction(): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  const from = isoDate(new Date());
  const to = isoDate(addDays(new Date(), 13));
  await checkoutPurchasedToStock(supabase, { householdId, from, to });
  revalidatePath('/courses');
  revalidatePath('/stock');
}

/** Décoche toutes les lignes (fin d'une session de courses). Ne supprime rien. */
export async function clearCheckedAction(): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  await Promise.all([
    supabase.from('shopping_item_state').delete().eq('household_id', householdId),
    supabase.from('shopping_manual_item').update({ checked: false }).eq('household_id', householdId),
  ]);
  revalidatePath('/courses');
}

export async function toggleManualCheckAction(formData: FormData): Promise<void> {
  const { supabase } = await requireHousehold();
  await supabase
    .from('shopping_manual_item')
    .update({ checked: formData.get('checked') === 'true' })
    .eq('id', String(formData.get('id')));
  revalidatePath('/courses');
}

/** Autocomplétion d'aliments (catalogue local + fournisseurs). */
export async function searchCatalogAction(query: string): Promise<FoodSuggestion[]> {
  const { supabase } = await requireHousehold();
  return searchFoodCatalog(supabase, query, { limit: 8 });
}

export async function addManualAction(formData: FormData): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  const label = String(formData.get('label') ?? '').trim();
  if (!label) return;

  // Identité produit (D) : food_id direct, ou import paresseux d'une suggestion externe.
  let foodId = String(formData.get('food_id') ?? '') || null;
  const source = String(formData.get('source') ?? '') as NutritionSource | '';
  const externalId = String(formData.get('external_id') ?? '');
  if (!foodId && (source === 'usda' || source === 'openfoodfacts') && externalId) {
    foodId = await importFoodByRef(supabase, source, externalId);
  }

  await supabase.from('shopping_manual_item').insert({
    household_id: householdId,
    label,
    food_id: foodId,
    quantity: num(formData.get('quantity')) ?? null,
    unit: String(formData.get('unit') ?? '') || null,
  });
  revalidatePath('/courses');
}

export async function deleteManualAction(formData: FormData): Promise<void> {
  const { supabase } = await requireHousehold();
  await supabase.from('shopping_manual_item').delete().eq('id', String(formData.get('id')));
  revalidatePath('/courses');
}

export async function addRecurringAction(formData: FormData): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  const foodId = String(formData.get('food_id') ?? '');
  const label = String(formData.get('label') ?? '').trim();
  if (!foodId && !label) return;
  await supabase.from('shopping_recurring_item').insert({
    household_id: householdId,
    food_id: foodId || null,
    label: label || null,
    default_quantity: num(formData.get('quantity')) ?? null,
    unit: String(formData.get('unit') ?? '') || null,
  });
  revalidatePath('/courses');
}

export async function deleteRecurringAction(formData: FormData): Promise<void> {
  const { supabase } = await requireHousehold();
  await supabase.from('shopping_recurring_item').delete().eq('id', String(formData.get('id')));
  revalidatePath('/courses');
}
