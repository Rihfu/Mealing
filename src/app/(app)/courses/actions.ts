'use server';

import { revalidatePath } from 'next/cache';
import { getAuthContext } from '@/lib/auth';
import {
  searchFoodCatalog,
  importFoodByRef,
  findCatalogFoodIdByLabel,
  getOrCreateCatalogFood,
  checkoutPurchasedToStock,
  getShoppingWindow,
  setFoodPref,
  clearFoodPref,
  createHouseholdCategory,
  deleteHouseholdCategory,
  listHouseholdCategories,
  loadRayonOrder,
  saveRayonOrder,
  saveShoppingLineOrder,
  dismissShoppingItems,
  restoreShoppingItems,
  type FoodSuggestion,
} from '@/lib/core';
import type { NutritionSource } from '@/lib/providers/nutrition';
import { normalizeLabel } from '@/lib/text';
import { orderRayonKeys } from './rayons';

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

/** Décoche toutes les lignes (fin d'une session de courses). Ne supprime rien et
 *  préserve les lignes retirées de la liste (dismissed) — on ne touche qu'au coché. */
export async function clearCheckedAction(): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  // État coché unifié par identité (shopping_item_state) — cf. fusion inter-sources.
  await supabase
    .from('shopping_item_state')
    .update({ checked: false, checked_at: null })
    .eq('household_id', householdId);
  revalidatePath('/courses');
}

/** Autocomplétion d'aliments (catalogue local + fournisseurs). */
export async function searchCatalogAction(query: string): Promise<FoodSuggestion[]> {
  const { supabase } = await requireHousehold();
  return searchFoodCatalog(supabase, query, { limit: 8 });
}

/** Résout un aliment vers un food_id (import paresseux d'un externe) pour ouvrir sa fiche. */
export async function resolveCatalogFoodAction(input: {
  foodId: string | null;
  source: string;
  externalId: string | null;
}): Promise<string | null> {
  const { supabase } = await requireHousehold();
  if (input.foodId) return input.foodId;
  if ((input.source === 'usda' || input.source === 'openfoodfacts') && input.externalId) {
    return importFoodByRef(supabase, input.source as NutritionSource, input.externalId);
  }
  return null;
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

  // Toujours pas d'identité ? On en CRÉE une (catalogue) : nom générique + rayon via
  // l'IA (best-effort, liste fermée), nutrition NON touchée (garde-fou n°3). Ainsi
  // tout article ajouté a une fiche produit cliquable (corrige Morue/Truffe & co.).
  if (!foodId) {
    let cls: { name: string; category: string | null } | null = null;
    try {
      const { classifyImportedFood } = await import('@/lib/ai/categorize-food');
      cls = await classifyImportedFood(label);
    } catch {
      cls = null;
    }
    foodId = await getOrCreateCatalogFood(supabase, { label, name: cls?.name ?? null, category: cls?.category ?? null });
  }

  // Si l'article est lié à un aliment, on affiche son nom (générique FR / curé)
  // plutôt que la saisie brute (ex. nom USDA verbeux) — l'app reste générale.
  let displayLabel = label;
  if (foodId) {
    const { data: f } = await supabase.from('food').select('name').eq('id', foodId).maybeSingle();
    if (f?.name) displayLabel = f.name;
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

/** Données d'un article manuel restaurable (pour l'undo des retraits — cf. removeLinesAction). */
export interface ManualSnapshot {
  label: string;
  quantity: number | null;
  unit: string | null;
  food_id: string | null;
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

// ---------------------------------------------------------------------------
// Retrait de lignes de la liste courante (constat n°3 + suppression de rayon +
// multi-sélection). Une ligne 100 % manuelle est réellement SUPPRIMÉE
// (shopping_manual_item) ; une ligne générée (repas/essentiel/catalogue) est
// RETIRÉE de la liste courante via le marqueur `dismissed` (réversible, remis à
// zéro au passage en caisse). Un seul couple action/undo sert le retrait d'une
// ligne, d'un rayon entier ou d'une sélection.
// ---------------------------------------------------------------------------

/** Une ligne à retirer : ses articles manuels (à supprimer) + faut-il masquer la clé générée. */
export interface RemoveLineInput {
  key: string;
  manualIds: string[];
  dismiss: boolean; // true si la ligne a une provenance générée (repas/essentiel/catalogue)
}

/** Données restaurables d'un retrait (pour l'annulation). */
export interface RemovedLines {
  manualSnapshots: Array<ManualSnapshot>;
  dismissedKeys: string[];
}

export async function removeLinesAction(lines: RemoveLineInput[]): Promise<RemovedLines> {
  const { supabase, householdId } = await requireHousehold();
  const allManualIds = lines.flatMap((l) => l.manualIds).filter(Boolean);
  let manualSnapshots: ManualSnapshot[] = [];
  if (allManualIds.length > 0) {
    const { data } = await supabase
      .from('shopping_manual_item')
      .select('label, quantity, unit, food_id')
      .in('id', allManualIds);
    manualSnapshots = (data as ManualSnapshot[] | null) ?? [];
    await supabase.from('shopping_manual_item').delete().in('id', allManualIds);
  }
  const dismissedKeys = lines.filter((l) => l.dismiss).map((l) => l.key);
  await dismissShoppingItems(supabase, householdId, dismissedKeys);
  revalidatePath('/courses');
  revalidatePath('/courses/magasin');
  return { manualSnapshots, dismissedKeys };
}

/** Annule un retrait (recrée les articles manuels + ramène les lignes générées). */
export async function undoRemoveLinesAction(data: RemovedLines): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  if (data.manualSnapshots.length > 0) {
    await supabase
      .from('shopping_manual_item')
      .insert(data.manualSnapshots.map((s) => ({ household_id: householdId, ...s })));
  }
  await restoreShoppingItems(supabase, householdId, data.dismissedKeys);
  revalidatePath('/courses');
  revalidatePath('/courses/magasin');
}

/**
 * Multi-sélection → promotion en ESSENTIELS. Anti-doublon par aliment / libellé
 * normalisé (un seul chargement des récurrents existants). @returns le nombre ajouté.
 */
export async function bulkPromoteEssentialsAction(
  items: Array<{ label: string; foodId: string | null; quantity: number | null; unit: string | null }>,
): Promise<number> {
  const { supabase, householdId } = await requireHousehold();
  const { data: existing } = await supabase
    .from('shopping_recurring_item')
    .select('food_id, label')
    .eq('household_id', householdId);
  const haveFood = new Set((existing ?? []).map((r) => r.food_id).filter((x): x is string => !!x));
  const haveLabel = new Set((existing ?? []).map((r) => (r.label ? normalizeLabel(r.label) : '')).filter(Boolean));

  const rows: Array<{ household_id: string; food_id: string | null; label: string | null; default_quantity: number | null; unit: string | null }> = [];
  for (const it of items) {
    const label = it.label.trim();
    if (!label && !it.foodId) continue;
    const dup = it.foodId ? haveFood.has(it.foodId) : haveLabel.has(normalizeLabel(label));
    if (dup) continue;
    rows.push({ household_id: householdId, food_id: it.foodId, label: label || null, default_quantity: it.quantity, unit: it.unit || null });
    if (it.foodId) haveFood.add(it.foodId);
    else haveLabel.add(normalizeLabel(label));
  }
  if (rows.length > 0) await supabase.from('shopping_recurring_item').insert(rows);
  revalidatePath('/courses');
  revalidatePath('/courses/historique');
  return rows.length;
}

/** Multi-sélection → ranger plusieurs articles dans un même rayon (mémorisé par libellé). */
export async function bulkSetCategoryAction(
  items: Array<{ label: string; foodId: string | null; iconSlug: string | null }>,
  categoryKey: string | null,
): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  for (const it of items) {
    if (!it.label.trim()) continue;
    await setFoodPref(supabase, householdId, { label: it.label, foodId: it.foodId, categoryKey, iconSlug: it.iconSlug });
  }
  revalidatePath('/courses');
  revalidatePath('/courses/magasin');
}

/**
 * Réordonne les rayons d'un cran (mode magasin + liste). L'univers des rayons
 * (intégrés + customs) et l'ordre courant sont résolus côté serveur ; on permute
 * la clé avec son voisin puis on enregistre l'ordre complet.
 */
export async function moveRayonAction(input: { key: string; dir: 'up' | 'down' }): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  const [customCats, orderMap] = await Promise.all([
    listHouseholdCategories(supabase, householdId),
    loadRayonOrder(supabase, householdId),
  ]);
  const universe = orderRayonKeys(customCats, orderMap);
  const i = universe.indexOf(input.key);
  if (i < 0) return;
  const j = input.dir === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= universe.length) return;
  [universe[i], universe[j]] = [universe[j], universe[i]];
  await saveRayonOrder(supabase, householdId, universe);
  revalidatePath('/courses');
  revalidatePath('/courses/magasin');
}

/** Enregistre un ordre complet de rayons (réordonnancement par glisser-déposer). */
export async function reorderRayonsAction(orderedKeys: string[]): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  await saveRayonOrder(supabase, householdId, orderedKeys);
  revalidatePath('/courses');
  revalidatePath('/courses/magasin');
}

/** Enregistre l'ordre des lignes d'un rayon (glisser-déposer). `orderedKeys` = clés
 *  canoniques des lignes de ce rayon, dans le nouvel ordre. */
export async function reorderShoppingLinesAction(orderedKeys: string[]): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  await saveShoppingLineOrder(supabase, householdId, orderedKeys);
  revalidatePath('/courses');
}
