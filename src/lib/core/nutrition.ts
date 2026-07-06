import type { DB } from './types';
import { unwrap } from './types';
import { computeRecipeNutrition, type RecipeNutrition } from './recipes';

/** Couverture des données nutritionnelles d'une période (honnêteté, principe n°2). */
export interface NutritionCoverage {
  /** Repas pertinents de la période (candidats au calcul). */
  mealsTotal: number;
  /** … dont la nutrition est réellement calculable (recette + données). */
  mealsCovered: number;
  /** Ingrédients cumulés des recettes des repas (recette directe ou source du reste). */
  ingredientsTotal: number;
  /** … dont contribuant réellement aux chiffres (liés + quantité + valeurs stockées). */
  ingredientsWithData: number;
}

export interface PeriodNutrition {
  planned: Record<string, number>;
  real: Record<string, number>;
  coverage: NutritionCoverage;
}

function addScaled(target: Record<string, number>, source: Record<string, number>, factor: number) {
  for (const [code, amount] of Object.entries(source)) {
    target[code] = (target[code] ?? 0) + amount * factor;
  }
}

/** L'unité d'une quantité consommée exprime-t-elle des portions ? (vide = oui). */
function isPortionUnit(unit: string | null): boolean {
  return !unit || /portion|part/i.test(unit);
}

/**
 * Agrège la nutrition d'un profil sur une période (specs 3.3 : double suivi
 * planifié / réel).
 *
 * Modèle de portions (approximation assumée, principe n°2 — documentée à l'UI via
 * `coverage`) :
 * - repas de FOYER : chaque profil mange UNE portion de la recette. Les `servings`
 *   du repas dimensionnent la cuisine (courses, stock), pas l'assiette individuelle ;
 *   l'excédent est porté par les RESTES replanifiés (ci-dessous) — pas de double compte.
 * - repas INDIVIDUEL du profil : `planned_meal.servings` portions (le stepper d'un
 *   repas individuel = les parts de cette personne), défaut 1.
 * - RESTE replanifié (`leftover_source_meal_id`, sans recette propre) : compte pour
 *   une portion de la recette du repas SOURCE — avant N0, un reste comptait zéro.
 * - real : applique les écarts — sauté = 0, différent = recette de remplacement si
 *   renseignée ; `real_consumption.quantity_consumed` (en portions) remplace le
 *   nombre de portions quand il est renseigné.
 *
 * Les repas individuels d'AUTRES profils sont exclus ; ceux du profil et les repas
 * de foyer sont inclus.
 */
export async function aggregatePeriodNutrition(
  db: DB,
  params: { householdId: string; profileId: string; from: string; to: string },
): Promise<PeriodNutrition> {
  // Repas + journées hors-plan en PARALLÈLE (indépendants) ; seules les consommations
  // (qui dépendent des repas) restent séquentielles.
  const [mealsRes, offDaysRes] = await Promise.all([
    db
      .from('planned_meal')
      .select('id, meal_date, recipe_id, is_individual, individual_profile_id, servings, leftover_source_meal_id')
      .eq('household_id', params.householdId)
      .gte('meal_date', params.from)
      .lte('meal_date', params.to),
    db
      .from('day_off_plan')
      .select('off_date, scope, profile_id')
      .gte('off_date', params.from)
      .lte('off_date', params.to),
  ]);
  type MealRow = {
    id: string;
    meal_date: string;
    recipe_id: string | null;
    is_individual: boolean;
    individual_profile_id: string | null;
    servings: number | null;
    leftover_source_meal_id: string | null;
  };
  const meals = (unwrap(mealsRes) ?? []) as MealRow[];

  const offDays = (unwrap(offDaysRes) ?? []) as Array<{ off_date: string; scope: string; profile_id: string | null }>;

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

  // Recette SOURCE des restes replanifiés : un reste n'a pas de recipe_id propre —
  // sa nutrition est celle du repas d'origine. Les sources hors période sont
  // récupérées à part (un seul niveau : la source d'un reste porte la recette).
  const recipeBySourceMeal = new Map<string, string | null>(meals.map((m) => [m.id, m.recipe_id]));
  const missingSourceIds = Array.from(
    new Set(
      relevant
        .filter((m) => !m.recipe_id && m.leftover_source_meal_id && !recipeBySourceMeal.has(m.leftover_source_meal_id))
        .map((m) => m.leftover_source_meal_id as string),
    ),
  );
  if (missingSourceIds.length > 0) {
    const sources = (unwrap(
      await db.from('planned_meal').select('id, recipe_id').in('id', missingSourceIds),
    ) ?? []) as Array<{ id: string; recipe_id: string | null }>;
    for (const s of sources) recipeBySourceMeal.set(s.id, s.recipe_id);
  }

  /** Recette effective d'un repas : la sienne, sinon celle de la source du reste. */
  const effectiveRecipeId = (m: MealRow): string | null =>
    m.recipe_id ?? (m.leftover_source_meal_id ? (recipeBySourceMeal.get(m.leftover_source_meal_id) ?? null) : null);

  /** Portions planifiées pour CE profil (voir modèle en tête de fonction). */
  const plannedPortions = (m: MealRow): number =>
    m.is_individual && m.servings != null && m.servings > 0 ? m.servings : 1;

  const consumptions = (unwrap(
    await db
      .from('real_consumption')
      .select('planned_meal_id, status, actual_recipe_id, quantity_consumed, quantity_unit')
      .eq('profile_id', params.profileId)
      .in('planned_meal_id', relevant.length ? relevant.map((m) => m.id) : ['']),
  ) ?? []) as Array<{
    planned_meal_id: string | null;
    status: string;
    actual_recipe_id: string | null;
    quantity_consumed: number | null;
    quantity_unit: string | null;
  }>;
  const consByMeal = new Map(consumptions.filter((c) => c.planned_meal_id).map((c) => [c.planned_meal_id as string, c]));

  // Cache des nutritions par recette (objet complet : perServing + couverture).
  const cache = new Map<string, RecipeNutrition>();
  const nutritionOf = async (recipeId: string) => {
    if (!cache.has(recipeId)) {
      cache.set(recipeId, await computeRecipeNutrition(db, recipeId));
    }
    return cache.get(recipeId) as RecipeNutrition;
  };

  // Préchauffe le cache : toutes les recettes DISTINCTES de la période calculées en
  // PARALLÈLE (chacune = 4 requêtes batchées) au lieu d'une par une dans la boucle —
  // c'était le N+1 principal de la page Nutrition.
  const distinctRecipeIds = new Set<string>();
  for (const meal of relevant) {
    const rid = effectiveRecipeId(meal);
    if (rid) distinctRecipeIds.add(rid);
    const cons = consByMeal.get(meal.id);
    if (cons?.status === 'different' && cons.actual_recipe_id) distinctRecipeIds.add(cons.actual_recipe_id);
  }
  await Promise.all(Array.from(distinctRecipeIds).map((id) => nutritionOf(id)));

  const planned: Record<string, number> = {};
  const real: Record<string, number> = {};
  const coverage: NutritionCoverage = { mealsTotal: 0, mealsCovered: 0, ingredientsTotal: 0, ingredientsWithData: 0 };

  for (const meal of relevant) {
    const recipeId = effectiveRecipeId(meal);
    const portions = plannedPortions(meal);
    const nut = recipeId ? await nutritionOf(recipeId) : null;

    coverage.mealsTotal += 1;
    if (nut) {
      coverage.ingredientsTotal += nut.ingredientsTotal;
      coverage.ingredientsWithData += nut.ingredientsWithData;
      if (Object.keys(nut.perServing).length > 0) coverage.mealsCovered += 1;
      addScaled(planned, nut.perServing, portions);
    }

    const cons = consByMeal.get(meal.id);
    if (cons?.status === 'skipped') continue;
    const realPortions =
      cons && cons.quantity_consumed != null && cons.quantity_consumed > 0 && isPortionUnit(cons.quantity_unit)
        ? cons.quantity_consumed
        : portions;
    if (cons?.status === 'different') {
      if (cons.actual_recipe_id) addScaled(real, (await nutritionOf(cons.actual_recipe_id)).perServing, realPortions);
      continue;
    }
    if (nut) addScaled(real, nut.perServing, realPortions);
  }

  return { planned, real, coverage };
}
