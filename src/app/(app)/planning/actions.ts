'use server';

import { revalidatePath } from 'next/cache';
import { getAuthContext } from '@/lib/auth';
import {
  addPlannedMeal,
  markDayOffPlan,
  recordConsumption,
  reassignLeftover,
  setMealLeftover,
  copyPlannedWeek,
  reconductPlannedMeals,
  loadRecipeStockScores,
  loadRecipeImagePaths,
  signRecipeImageUrls,
  findCatalogFoodIdByLabel,
  type MealSlot,
} from '@/lib/core';

async function requireContext() {
  const { supabase, userId, profile } = await getAuthContext();
  if (!userId || !profile?.household_id) {
    throw new Error('Contexte foyer manquant.');
  }
  return { supabase, userId, householdId: profile.household_id as string };
}

export interface AddMealInput {
  date: string;
  slot: MealSlot;
  recipeId?: string;
  freeText?: string;
  servings?: number;
  producesLeftover?: boolean;
  individualProfileId?: string;
}

export async function addMealAction(input: AddMealInput): Promise<void> {
  const { supabase, householdId } = await requireContext();
  await addPlannedMeal(supabase, {
    householdId,
    date: input.date,
    slot: input.slot,
    recipeId: input.recipeId || undefined,
    freeText: input.freeText?.trim() || undefined,
    servings: input.servings && input.servings > 0 ? input.servings : undefined,
    producesLeftover: input.producesLeftover ?? false,
    individualProfileId: input.individualProfileId || undefined,
  });
  revalidatePath('/planning');
}

export async function deleteMealAction(mealId: string): Promise<void> {
  const { supabase } = await requireContext();
  await supabase.from('planned_meal').delete().eq('id', mealId);
  revalidatePath('/planning');
}

/** Déplace un repas vers un autre jour/créneau (glisser-déposer). */
export async function moveMealAction(mealId: string, date: string, slot: MealSlot): Promise<void> {
  const { supabase } = await requireContext();
  await supabase
    .from('planned_meal')
    .update({ meal_date: date, slot, updated_at: new Date().toISOString() })
    .eq('id', mealId);
  revalidatePath('/planning');
}

/** Un plat de l'HISTORIQUE du planning (repas passés, dédupliqués par plat). */
export interface PastMeal {
  /** Nom affiché (recette ou texte libre). */
  name: string;
  recipeId: string | null;
  /** Dernière date où il a été mangé (YYYY-MM-DD). */
  lastDate: string;
  /** Créneau du dernier passage (pour la reconduction). */
  lastSlot: MealSlot;
  /** Nombre de fois planifié sur la fenêtre. */
  count: number;
}

/**
 * Historique des plats (B2) : repas PASSÉS des ~12 dernières semaines, dédupliqués
 * par plat (recette liée, sinon libellé), du plus récent au plus ancien — pour
 * revoir ce qu'on a mangé et RECONDUIRE en 1 geste. Lecture seule, RLS foyer.
 */
export async function pastMealsAction(): Promise<PastMeal[]> {
  const { supabase, householdId } = await requireContext();
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 84);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const { data } = await supabase
    .from('planned_meal')
    .select('meal_date, slot, recipe_id, free_text, leftover_source_meal_id, recipe:recipe_id(name)')
    .eq('household_id', householdId)
    .gte('meal_date', iso(from))
    .lt('meal_date', iso(today))
    .order('meal_date', { ascending: false })
    .limit(400);

  const rows = (data ?? []) as Array<{
    meal_date: string;
    slot: string;
    recipe_id: string | null;
    free_text: string | null;
    leftover_source_meal_id: string | null;
    recipe: { name: string } | { name: string }[] | null;
  }>;

  const byDish = new Map<string, PastMeal>();
  for (const r of rows) {
    const recipeName = Array.isArray(r.recipe) ? r.recipe[0]?.name : r.recipe?.name;
    const name = (recipeName ?? r.free_text ?? '').trim();
    if (!name) continue; // restes sans nom propre : rien d'actionnable
    const key = r.recipe_id ?? `txt:${name.toLowerCase()}`;
    const existing = byDish.get(key);
    if (existing) {
      existing.count += 1; // rows déjà triées du plus récent au plus ancien
    } else {
      byDish.set(key, {
        name,
        recipeId: r.recipe_id,
        lastDate: r.meal_date,
        lastSlot: r.slot as MealSlot,
        count: 1,
      });
    }
  }
  return Array.from(byDish.values());
}

export async function markDayOffAction(date: string): Promise<void> {
  const { supabase, householdId } = await requireContext();
  await markDayOffPlan(supabase, { householdId, date, scope: 'household' });
  revalidatePath('/planning');
}

/** Annule un jour hors-plan (réversible). */
export async function unmarkDayOffAction(date: string): Promise<void> {
  const { supabase, householdId } = await requireContext();
  await supabase.from('day_off_plan').delete().eq('household_id', householdId).eq('off_date', date).eq('scope', 'household');
  revalidatePath('/planning');
}

export async function recordDeviationAction(
  mealId: string,
  status: 'skipped' | 'different',
  actualFreeText?: string,
): Promise<void> {
  const { supabase, userId } = await requireContext();
  // Écart au niveau du REPAS (foyer) : on ne garde qu'une ligne, pour que le statut
  // affiché soit cohérent (pas d'empilement de lignes à chaque clic / par profil).
  await supabase.from('real_consumption').delete().eq('planned_meal_id', mealId);
  await recordConsumption(supabase, {
    profileId: userId,
    plannedMealId: mealId,
    status,
    actualFreeText: actualFreeText?.trim() || undefined,
  });
  revalidatePath('/planning');
}

/** Efface l'écart signalé sur un repas (retour à « conforme » par défaut, niveau foyer). */
export async function clearDeviationAction(mealId: string): Promise<void> {
  const { supabase } = await requireContext();
  await supabase.from('real_consumption').delete().eq('planned_meal_id', mealId);
  revalidatePath('/planning');
}

/**
 * Replanifie un reste vers un créneau. `name` → plat improvisé (« reste + … »), sinon
 * « tel quel ». `extraCourse` → un petit complément à acheter (« riz ») ajouté à la liste
 * de courses comme article manuel (la part reste, elle, ne génère aucun besoin).
 */
export async function reassignLeftoverAction(
  sourceMealId: string,
  date: string,
  slot: MealSlot,
  name?: string,
  extraCourse?: string,
): Promise<void> {
  const { supabase, householdId } = await requireContext();
  await reassignLeftover(supabase, { sourceMealId, date, slot, householdId, name });
  const extra = extraCourse?.trim();
  if (extra) {
    const foodId = await findCatalogFoodIdByLabel(supabase, extra);
    await supabase.from('shopping_manual_item').insert({ household_id: householdId, label: extra, food_id: foodId });
    revalidatePath('/courses');
  }
  revalidatePath('/planning');
}

/** Marque (ou annule) un repas comme produisant un reste — excès non prévu, après coup. */
export async function setMealLeftoverAction(mealId: string, value: boolean): Promise<void> {
  const { supabase } = await requireContext();
  await setMealLeftover(supabase, mealId, value);
  revalidatePath('/planning');
}

/**
 * Reconduit (copie) une SÉLECTION de repas vers le lendemain (+1 j), la semaine
 * suivante (+7 j) ou une date choisie — créneau conservé. @returns nb copiés.
 */
export async function reconductMealsAction(
  mealIds: string[],
  target: { days: number } | { date: string },
): Promise<number> {
  const { supabase, householdId } = await requireContext();
  const n = await reconductPlannedMeals(supabase, {
    householdId,
    mealIds,
    offsetDays: 'days' in target ? target.days : undefined,
    date: 'date' in target ? target.date : undefined,
  });
  revalidatePath('/planning');
  return n;
}

/** Duplique une semaine vers une autre (réutilisation, anti-feuille-blanche). @returns nb copiés. */
export async function copyWeekAction(fromWeekStart: string, toWeekStart: string): Promise<number> {
  const { supabase, householdId } = await requireContext();
  const n = await copyPlannedWeek(supabase, { householdId, fromWeekStart, toWeekStart });
  revalidatePath('/planning');
  return n;
}

export interface RecipeSuggestion {
  id: string;
  name: string;
  score: number;
  imageUrl: string | null;
}

/**
 * Suggestions « cuisiner avec mon stock » (anti-gaspi) : les recettes les plus
 * réalisables avec le stock actuel (score de couverture via `loadRecipeStockScores`).
 * Lecture seule. @returns jusqu'à 6 recettes triées par score décroissant.
 */
export async function suggestRecipesAction(): Promise<RecipeSuggestion[]> {
  const { supabase, householdId } = await requireContext();
  const scores = await loadRecipeStockScores(supabase, householdId);
  const { data: recipes } = await supabase.from('recipe').select('id, name');
  const nameById = new Map((recipes ?? []).map((r) => [r.id, r.name]));
  const imagePaths = await loadRecipeImagePaths(supabase, householdId);
  const signed = await signRecipeImageUrls(supabase, [...imagePaths.values()]);

  return [...scores.entries()]
    .filter(([id]) => nameById.has(id) && id)
    .map(([id, score]) => {
      const path = imagePaths.get(id);
      return { id, name: nameById.get(id) ?? 'Recette', score: Math.round(score * 100), imageUrl: path ? signed.get(path) ?? null : null };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 6);
}
