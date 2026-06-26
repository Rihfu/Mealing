'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getAuthContext } from '@/lib/auth';
import {
  recipeMissingIngredients,
  findCatalogFoodIdByLabel,
  computeIngredientCoverage,
  type CoverageIngredient,
  type RecipeIngredientCoverage,
} from '@/lib/core';
import { scaleRecipeForServings, type ScalableIngredient } from '@/lib/ai/scale-recipe';
import { normalizeLabel } from '@/lib/text';

export interface ScaledRecipeView {
  /** Couverture stock recalculée avec les quantités adaptées aux portions cibles. */
  items: RecipeIngredientCoverage[];
  prepTimeMin: number | null;
  cookTimeMin: number | null;
  /** Remarque culinaire de l'IA (ajustements non-évidents), ou null. */
  note: string | null;
  /** L'IA a-t-elle adapté (true) ou repli sur un scaling linéaire (false) ? */
  usedAI: boolean;
}

/**
 * Adapte une recette à un nombre de portions cible : quantités d'ingrédients + temps
 * recalculés par l'IA (jugement culinaire non-linéaire — cf. `ai/scale-recipe`), avec
 * repli sur un scaling LINÉAIRE si l'IA est indisponible. Recalcule aussi la couverture
 * stock pour les quantités adaptées (code couleur cohérent). Lecture seule (n'enregistre
 * rien — l'adaptation est éphémère, côté fiche).
 */
export async function scaleRecipeAction(recipeId: string, targetServings: number): Promise<ScaledRecipeView | null> {
  const { supabase, userId, profile } = await getAuthContext();
  if (!userId) redirect('/login');
  const householdId = profile?.household_id as string | undefined;
  if (!householdId) redirect('/onboarding');
  if (!recipeId || !Number.isFinite(targetServings) || targetServings <= 0) return null;

  const { data: recipe } = await supabase
    .from('recipe')
    .select('name, servings, prep_time_min, cook_time_min')
    .eq('id', recipeId)
    .maybeSingle();
  if (!recipe) return null;

  const { data: rows } = await supabase
    .from('recipe_ingredient')
    .select('food_id, free_text, quantity, unit, position, food:food_id(name)')
    .eq('recipe_id', recipeId)
    .order('position', { ascending: true });
  const ingredients = (rows ?? []) as CoverageIngredient[];

  const baseServings = Number(recipe.servings) > 0 ? Number(recipe.servings) : 1;
  const ratio = targetServings / baseServings;

  const nameOf = (ing: CoverageIngredient) => {
    const f = Array.isArray(ing.food) ? ing.food[0] : ing.food;
    return f?.name ?? ing.free_text ?? '';
  };

  // Essai IA (jugement culinaire) ; repli linéaire si indispo.
  const scalable: ScalableIngredient[] = ingredients.map((ing) => ({ name: nameOf(ing), quantity: ing.quantity, unit: ing.unit }));
  const ai = await scaleRecipeForServings({
    name: recipe.name,
    baseServings,
    targetServings,
    ingredients: scalable,
    prepTimeMin: recipe.prep_time_min,
    cookTimeMin: recipe.cook_time_min,
  });

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const scaledQty: Array<number | null> = ingredients.map((ing, idx) => {
    if (ing.quantity == null) return null;
    const q = ai ? ai.quantities[idx] : ing.quantity * ratio;
    return q != null ? round2(q) : round2(ing.quantity * ratio);
  });

  const scaledIngredients: CoverageIngredient[] = ingredients.map((ing, idx) => ({ ...ing, quantity: scaledQty[idx] }));
  const items = await computeIngredientCoverage(supabase, householdId, scaledIngredients);

  return {
    items,
    prepTimeMin: ai ? ai.prepTimeMin : recipe.prep_time_min,
    cookTimeMin: ai ? ai.cookTimeMin : recipe.cook_time_min,
    note: ai?.note ?? null,
    usedAI: !!ai,
  };
}

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
