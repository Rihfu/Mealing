import type { DB } from './types';
import { unwrap } from './types';
import { computeRecipeNutrition } from './recipes';

export interface PeriodNutrition {
  planned: Record<string, number>;
  real: Record<string, number>;
}

function addInto(target: Record<string, number>, source: Record<string, number>) {
  for (const [code, amount] of Object.entries(source)) {
    target[code] = (target[code] ?? 0) + amount;
  }
}

/**
 * Agrège la nutrition d'un profil sur une période (specs 3.3 : double suivi
 * planifié / réel).
 *
 * Approximation assumée (principe n°2) : on compte une portion par repas planifié.
 * - planned : somme des recettes planifiées (hors journées hors-plan).
 * - real    : applique les écarts enregistrés — sauté = 0, différent = recette de
 *   remplacement si renseignée, sinon (conforme/non signalé) = repas planifié.
 *
 * Les repas individuels d'AUTRES profils sont exclus ; ceux du profil et les repas
 * de foyer sont inclus.
 */
export async function aggregatePeriodNutrition(
  db: DB,
  params: { householdId: string; profileId: string; from: string; to: string },
): Promise<PeriodNutrition> {
  const meals = (unwrap(
    await db
      .from('planned_meal')
      .select('id, meal_date, recipe_id, is_individual, individual_profile_id')
      .eq('household_id', params.householdId)
      .gte('meal_date', params.from)
      .lte('meal_date', params.to),
  ) ?? []) as Array<{
    id: string;
    meal_date: string;
    recipe_id: string | null;
    is_individual: boolean;
    individual_profile_id: string | null;
  }>;

  const offDays = (unwrap(
    await db
      .from('day_off_plan')
      .select('off_date, scope, profile_id')
      .gte('off_date', params.from)
      .lte('off_date', params.to),
  ) ?? []) as Array<{ off_date: string; scope: string; profile_id: string | null }>;

  const offDates = new Set(
    offDays
      .filter((o) => o.scope === 'household' || o.profile_id === params.profileId)
      .map((o) => o.off_date),
  );

  const relevant = meals.filter(
    (m) =>
      !offDates.has(m.meal_date) &&
      (!m.is_individual || m.individual_profile_id === params.profileId),
  );

  const consumptions = (unwrap(
    await db
      .from('real_consumption')
      .select('planned_meal_id, status, actual_recipe_id')
      .eq('profile_id', params.profileId)
      .in('planned_meal_id', relevant.length ? relevant.map((m) => m.id) : ['']),
  ) ?? []) as Array<{
    planned_meal_id: string | null;
    status: string;
    actual_recipe_id: string | null;
  }>;
  const consByMeal = new Map(consumptions.filter((c) => c.planned_meal_id).map((c) => [c.planned_meal_id as string, c]));

  // Cache des nutritions par recette (par portion).
  const cache = new Map<string, Record<string, number>>();
  const perServing = async (recipeId: string) => {
    if (!cache.has(recipeId)) {
      cache.set(recipeId, (await computeRecipeNutrition(db, recipeId)).perServing);
    }
    return cache.get(recipeId) as Record<string, number>;
  };

  const planned: Record<string, number> = {};
  const real: Record<string, number> = {};

  for (const meal of relevant) {
    if (meal.recipe_id) addInto(planned, await perServing(meal.recipe_id));

    const cons = consByMeal.get(meal.id);
    if (cons?.status === 'skipped') continue;
    if (cons?.status === 'different') {
      if (cons.actual_recipe_id) addInto(real, await perServing(cons.actual_recipe_id));
      continue;
    }
    if (meal.recipe_id) addInto(real, await perServing(meal.recipe_id));
  }

  return { planned, real };
}
