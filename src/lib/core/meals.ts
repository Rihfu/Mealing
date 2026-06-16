import type { DB, MealSlot } from './types';
import { unwrap } from './types';

export interface AddPlannedMealInput {
  householdId: string;
  date: string; // YYYY-MM-DD
  slot: MealSlot;
  recipeId?: string;
  freeText?: string;
  totalQuantityPrepared?: number;
  totalQuantityUnit?: string;
  /** Repas individuel (une personne mange séparément). */
  individualProfileId?: string;
  producesLeftover?: boolean;
}

/** Ajoute un repas au planning (rattaché au Foyer ; individuel si profil fourni). */
export async function addPlannedMeal(db: DB, input: AddPlannedMealInput): Promise<string> {
  const row = unwrap(
    await db
      .from('planned_meal')
      .insert({
        household_id: input.householdId,
        is_individual: Boolean(input.individualProfileId),
        individual_profile_id: input.individualProfileId ?? null,
        meal_date: input.date,
        slot: input.slot,
        recipe_id: input.recipeId ?? null,
        free_text: input.freeText ?? null,
        total_quantity_prepared: input.totalQuantityPrepared ?? null,
        total_quantity_unit: input.totalQuantityUnit ?? null,
        produces_leftover: input.producesLeftover ?? false,
      })
      .select('id')
      .single(),
  ) as { id: string };
  return row.id;
}

/** Repas planifiés du foyer sur une plage de dates (incluses). */
export async function getMealsByDateRange(
  db: DB,
  params: { householdId: string; from: string; to: string },
) {
  return unwrap(
    await db
      .from('planned_meal')
      .select('*')
      .eq('household_id', params.householdId)
      .gte('meal_date', params.from)
      .lte('meal_date', params.to)
      .order('meal_date', { ascending: true }),
  );
}

/**
 * Réassigne un reste à un nouveau créneau, sans nouvelle recette ni nouveau besoin
 * de courses (specs 3.1). Le repas créé pointe vers le repas d'origine.
 */
export async function reassignLeftover(
  db: DB,
  params: { sourceMealId: string; date: string; slot: MealSlot; householdId: string },
): Promise<string> {
  const row = unwrap(
    await db
      .from('planned_meal')
      .insert({
        household_id: params.householdId,
        meal_date: params.date,
        slot: params.slot,
        leftover_source_meal_id: params.sourceMealId,
      })
      .select('id')
      .single(),
  ) as { id: string };
  return row.id;
}

/**
 * Marque une journée entière comme hors-plan, en un geste (specs 3.1).
 * scope 'household' = tout le foyer ; 'individual' = un seul profil.
 */
export async function markDayOffPlan(
  db: DB,
  params:
    | { householdId: string; date: string; scope: 'household' }
    | { householdId: string; date: string; scope: 'individual'; profileId: string },
): Promise<string> {
  const row = unwrap(
    await db
      .from('day_off_plan')
      .insert({
        household_id: params.householdId,
        off_date: params.date,
        scope: params.scope,
        profile_id: params.scope === 'individual' ? params.profileId : null,
      })
      .select('id')
      .single(),
  ) as { id: string };
  return row.id;
}
