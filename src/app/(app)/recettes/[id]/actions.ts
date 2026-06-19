'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getAuthContext } from '@/lib/auth';
import { recipeMissingIngredients, findCatalogFoodIdByLabel } from '@/lib/core';
import { normalizeLabel } from '@/lib/text';

/**
 * Ajoute à la liste de courses les ingrédients de la recette NON couverts par le
 * stock. Chaque ligne est liée au catalogue (food_id de l'ingrédient, sinon
 * rapprochement par libellé) → rayon + icône ; les libellés inconnus sont classés
 * par l'auto-catégorisation au rendu de la liste. Insertion en `shopping_manual_item`.
 *
 * Anti-doublon (constat juin 2026) : on N'ajoute PAS un ingrédient déjà présent sur
 * la liste comme article manuel (même aliment lié OU même libellé normalisé), pour
 * qu'un re-clic ne re-crée pas les mêmes lignes / ne double pas la quantité fusionnée.
 * @returns le nombre d'articles réellement ajoutés.
 */
export async function addRecipeMissingToShoppingAction(recipeId: string): Promise<number> {
  const { supabase, userId, profile } = await getAuthContext();
  if (!userId) redirect('/login');
  const householdId = profile?.household_id as string | undefined;
  if (!householdId) redirect('/onboarding');
  if (!recipeId) return 0;

  // Déjà sur la liste (articles manuels) : on s'en sert pour le dédoublonnage.
  const { data: existing } = await supabase
    .from('shopping_manual_item')
    .select('food_id, label')
    .eq('household_id', householdId);
  const existingFoodIds = new Set((existing ?? []).map((e) => e.food_id).filter((x): x is string => !!x));
  const existingLabels = new Set((existing ?? []).map((e) => normalizeLabel(e.label)));

  const missing = await recipeMissingIngredients(supabase, householdId, recipeId);
  const rows: Array<{ household_id: string; label: string; food_id: string | null; quantity: number | null; unit: string | null }> = [];
  for (const m of missing) {
    const label = m.label.trim();
    if (!label) continue;
    const foodId = m.foodId ?? (await findCatalogFoodIdByLabel(supabase, label));
    // Déjà présent (par aliment lié ou par libellé) → on saute (pas de doublon).
    if (foodId ? existingFoodIds.has(foodId) : existingLabels.has(normalizeLabel(label))) continue;
    rows.push({ household_id: householdId, label, food_id: foodId, quantity: m.quantity, unit: m.unit || null });
    // Évite aussi un doublon intra-lot (deux ingrédients résolus au même aliment).
    if (foodId) existingFoodIds.add(foodId);
    else existingLabels.add(normalizeLabel(label));
  }

  if (rows.length > 0) await supabase.from('shopping_manual_item').insert(rows);
  revalidatePath('/courses');
  return rows.length;
}
