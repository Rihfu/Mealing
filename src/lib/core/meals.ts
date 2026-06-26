import type { DB, MealSlot } from './types';
import { unwrap } from './types';
import { addDays, isoDate } from '@/lib/dates';

export interface AddPlannedMealInput {
  householdId: string;
  date: string; // YYYY-MM-DD
  slot: MealSlot;
  recipeId?: string;
  freeText?: string;
  /** Nombre de portions planifiées (recette dimensionnée pour ce repas). */
  servings?: number;
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
        servings: input.servings ?? null,
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
 * Duplique les repas d'une semaine source vers une semaine cible (specs 3.1 :
 * réutiliser une semaine passée pour éviter la feuille blanche). Décale chaque date
 * du même nombre de jours (jour de la semaine + créneau préservés). Les RESTES
 * (lignes pointant vers un repas-source, sans recette/texte propre) ne sont PAS
 * copiés — ils dérivent d'un repas précis. @returns le nombre de repas copiés.
 */
export async function copyPlannedWeek(
  db: DB,
  params: { householdId: string; fromWeekStart: string; toWeekStart: string },
): Promise<number> {
  const fromStart = new Date(`${params.fromWeekStart}T00:00:00`);
  const toStart = new Date(`${params.toWeekStart}T00:00:00`);
  const offset = Math.round((toStart.getTime() - fromStart.getTime()) / 86_400_000);
  if (offset === 0) return 0;

  const fromIso = isoDate(fromStart);
  const toIso = isoDate(addDays(fromStart, 6));
  const meals = (unwrap(
    await db
      .from('planned_meal')
      .select('meal_date, slot, recipe_id, free_text, servings, produces_leftover, is_individual, individual_profile_id, leftover_source_meal_id')
      .eq('household_id', params.householdId)
      .gte('meal_date', fromIso)
      .lte('meal_date', toIso),
  ) ?? []) as Array<{
    meal_date: string;
    slot: MealSlot;
    recipe_id: string | null;
    free_text: string | null;
    servings: number | null;
    produces_leftover: boolean;
    is_individual: boolean;
    individual_profile_id: string | null;
    leftover_source_meal_id: string | null;
  }>;

  const rows = meals
    .filter((m) => !m.leftover_source_meal_id) // pas les restes (dérivés)
    .map((m) => ({
      household_id: params.householdId,
      meal_date: isoDate(addDays(new Date(`${m.meal_date}T00:00:00`), offset)),
      slot: m.slot,
      recipe_id: m.recipe_id,
      free_text: m.free_text,
      servings: m.servings,
      produces_leftover: m.produces_leftover,
      is_individual: m.is_individual,
      individual_profile_id: m.individual_profile_id,
    }));
  if (rows.length === 0) return 0;
  const { error } = await db.from('planned_meal').insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

/**
 * Réassigne un reste à un nouveau créneau, sans nouvelle recette ni nouveau besoin
 * de courses pour la part « reste » (specs 3.1). Le repas créé pointe vers le repas
 * d'origine (`leftover_source_meal_id`) et n'a PAS de `recipe_id` → exclu de la liste
 * de courses et de la décrémentation de stock (la portion a déjà été cuisinée).
 *
 * Deux usages : (1) « tel quel » → `name` vide, affiché « Reste : <source> » ;
 * (2) « en faire un plat » (reste + un peu de riz…) → `name` = le plat improvisé, stocké
 * en `free_text` ; l'éventuel complément de courses est géré par l'appelant (article
 * manuel), pas ici.
 */
export async function reassignLeftover(
  db: DB,
  params: { sourceMealId: string; date: string; slot: MealSlot; householdId: string; name?: string },
): Promise<string> {
  const row = unwrap(
    await db
      .from('planned_meal')
      .insert({
        household_id: params.householdId,
        meal_date: params.date,
        slot: params.slot,
        leftover_source_meal_id: params.sourceMealId,
        free_text: params.name?.trim() || null,
      })
      .select('id')
      .single(),
  ) as { id: string };
  return row.id;
}

/** Marque/dé-marque un repas comme produisant un reste (excès non prévu, après coup). */
export async function setMealLeftover(db: DB, mealId: string, value: boolean): Promise<void> {
  const { error } = await db.from('planned_meal').update({ produces_leftover: value }).eq('id', mealId);
  if (error) throw new Error(error.message);
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
