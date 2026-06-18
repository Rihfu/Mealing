'use server';

import { revalidatePath } from 'next/cache';
import { getAuthContext } from '@/lib/auth';
import {
  searchFoodCatalog,
  importFoodByRef,
  findCatalogFoodIdByLabel,
  checkoutPurchasedToStock,
  getShoppingWindow,
  setFoodPref,
  clearFoodPref,
  createHouseholdCategory,
  deleteHouseholdCategory,
  type FoodSuggestion,
} from '@/lib/core';
import type { NutritionSource } from '@/lib/providers/nutrition';
import { normalizeLabel } from '@/lib/text';

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

/** « J'ai fait mes courses » : les articles cochés entrent dans le stock (chantier E).
 *  `prices` (optionnel) = prix saisis au checkout, par clé de ligne → archivés au relevé. */
export async function checkoutToStockAction(prices?: Record<string, number>): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  const { from, to } = await getShoppingWindow(supabase, householdId);
  await checkoutPurchasedToStock(supabase, { householdId, from, to, prices });
  revalidatePath('/courses');
  revalidatePath('/stock');
}

/** Cadence de courses : horizon de calcul de la liste, en jours (chantier H). */
export async function setShoppingHorizonAction(formData: FormData): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  const days = Number(formData.get('days'));
  if (!Number.isInteger(days) || days < 1 || days > 60) return;
  await supabase.from('household').update({ shopping_horizon_days: days }).eq('id', householdId);
  revalidatePath('/courses');
}

/** Décoche toutes les lignes (fin d'une session de courses). Ne supprime rien. */
export async function clearCheckedAction(): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  // État coché unifié par identité (shopping_item_state) — cf. fusion inter-sources.
  await supabase.from('shopping_item_state').delete().eq('household_id', householdId);
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
  // Texte libre non lié : rapprochement automatique du catalogue par libellé normalisé
  // → identité produit (rayon + icône) sans clic de suggestion (cf. findCatalogFoodIdByLabel).
  if (!foodId) {
    foodId = await findCatalogFoodIdByLabel(supabase, label);
  }

  // Si l'article est lié à un aliment, on affiche son nom (générique FR / curé)
  // plutôt que la saisie brute (ex. nom USDA verbeux) — l'app reste générale.
  let displayLabel = label;
  if (foodId) {
    const { data: f } = await supabase.from('food').select('name').eq('id', foodId).maybeSingle();
    if (f?.name) displayLabel = f.name;
  }

  // Texte libre non reconnu (ni catalogue ni import) : on demande à l'IA un rayon
  // (best-effort, liste fermée) et on le MÉMORISE comme préférence foyer → la ligne
  // est classée au lieu de « Autres », et reclassée à la prochaine occurrence.
  // Garde-fou n°3 respecté : le rayon n'est pas une donnée nutritionnelle.
  if (!foodId) {
    let aiCategory: string | null = null;
    try {
      const { classifyImportedFood } = await import('@/lib/ai/categorize-food');
      aiCategory = (await classifyImportedFood(label))?.category ?? null;
    } catch {
      aiCategory = null;
    }
    if (aiCategory) await setFoodPref(supabase, householdId, { label, categoryKey: aiCategory });
  }

  await supabase.from('shopping_manual_item').insert({
    household_id: householdId,
    label: displayLabel,
    food_id: foodId,
    quantity: num(formData.get('quantity')) ?? null,
    unit: String(formData.get('unit') ?? '') || null,
  });
  revalidatePath('/courses');
}

/**
 * Range un article (par libellé) dans un rayon + icône : crée/maj la préférence
 * foyer. Sert à déplacer un article ET à mémoriser le classement d'un ajout libre
 * (re-proposé/reclassé ensuite). `categoryKey` = clé intégrée ou id de rayon custom.
 */
export async function setFoodCategoryAction(input: {
  label: string;
  foodId: string | null;
  categoryKey: string | null;
  iconSlug: string | null;
}): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  if (!input.label.trim()) return;
  await setFoodPref(supabase, householdId, input);
  revalidatePath('/courses');
}

/** Réinitialise le classement personnalisé d'un libellé (retour au défaut). */
export async function clearFoodCategoryAction(label: string): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  if (label.trim()) await clearFoodPref(supabase, householdId, label);
  revalidatePath('/courses');
}

/** Crée un rayon personnalisé. @returns son id (pour l'assigner dans la foulée). */
export async function createCategoryAction(input: {
  label: string;
  iconSlug: string | null;
  tint: string | null;
}): Promise<string | null> {
  const { supabase, householdId } = await requireHousehold();
  if (!input.label.trim()) return null;
  const id = await createHouseholdCategory(supabase, householdId, input);
  revalidatePath('/courses');
  return id;
}

/** Supprime un rayon personnalisé (ses articles retombent en « Autres »). */
export async function deleteCategoryAction(id: string): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  if (id) await deleteHouseholdCategory(supabase, householdId, id);
  revalidatePath('/courses');
}

/** Modifie la quantité / l'unité d'un article manuel (sans le supprimer/re-ajouter). */
export async function updateManualItemAction(input: {
  id: string;
  quantity: number | null;
  unit: string | null;
}): Promise<void> {
  const { supabase } = await requireHousehold();
  if (!input.id) return;
  await supabase
    .from('shopping_manual_item')
    .update({ quantity: input.quantity, unit: input.unit || null })
    .eq('id', input.id);
  revalidatePath('/courses');
}

/** Données d'un article manuel restaurable (pour l'undo). */
export interface ManualSnapshot {
  label: string;
  quantity: number | null;
  unit: string | null;
  food_id: string | null;
}

/** Supprime un article manuel et renvoie ses données (pour permettre l'annulation). */
export async function deleteManualItem(id: string): Promise<ManualSnapshot | null> {
  const { supabase } = await requireHousehold();
  const { data } = await supabase
    .from('shopping_manual_item')
    .select('label, quantity, unit, food_id')
    .eq('id', id)
    .maybeSingle();
  await supabase.from('shopping_manual_item').delete().eq('id', id);
  revalidatePath('/courses');
  return (data as ManualSnapshot | null) ?? null;
}

/** Recrée un article manuel supprimé (annulation). */
export async function recreateManualItem(item: ManualSnapshot): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  await supabase.from('shopping_manual_item').insert({ household_id: householdId, ...item });
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

/** Données d'un essentiel restaurable (pour l'undo). */
export interface RecurringSnapshot {
  food_id: string | null;
  label: string | null;
  default_quantity: number | null;
  unit: string | null;
}

export async function deleteRecurringItem(id: string): Promise<RecurringSnapshot | null> {
  const { supabase } = await requireHousehold();
  const { data } = await supabase
    .from('shopping_recurring_item')
    .select('food_id, label, default_quantity, unit')
    .eq('id', id)
    .maybeSingle();
  await supabase.from('shopping_recurring_item').delete().eq('id', id);
  revalidatePath('/courses');
  return (data as RecurringSnapshot | null) ?? null;
}

export async function recreateRecurringItem(item: RecurringSnapshot): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  await supabase.from('shopping_recurring_item').insert({ household_id: householdId, ...item });
  revalidatePath('/courses');
}

/**
 * Promeut un produit en ESSENTIEL (modèle hybride) : il reviendra tout seul dans la
 * liste chaque cycle (badge « essentiel »). Anti-doublon par aliment / libellé normalisé.
 * Appelé depuis « À racheter bientôt » et l'épingle d'une ligne de courses.
 */
export async function promoteToEssentialAction(input: {
  label: string;
  foodId: string | null;
  quantity: number | null;
  unit: string | null;
}): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  const label = input.label.trim();
  if (!label && !input.foodId) return;

  const { data: existing } = await supabase
    .from('shopping_recurring_item')
    .select('id, food_id, label')
    .eq('household_id', householdId);
  const dup = (existing ?? []).some((r) =>
    input.foodId
      ? r.food_id === input.foodId
      : !r.food_id && !!r.label && normalizeLabel(r.label) === normalizeLabel(label),
  );
  if (!dup) {
    await supabase.from('shopping_recurring_item').insert({
      household_id: householdId,
      food_id: input.foodId,
      label: label || null,
      default_quantity: input.quantity,
      unit: input.unit || null,
    });
  }
  revalidatePath('/courses');
  revalidatePath('/courses/historique');
}

/** Retire un essentiel (désépinglage depuis « Mes essentiels »). */
export async function removeEssentialAction(id: string): Promise<void> {
  const { supabase } = await requireHousehold();
  if (id) await supabase.from('shopping_recurring_item').delete().eq('id', id);
  revalidatePath('/courses');
  revalidatePath('/courses/historique');
}
