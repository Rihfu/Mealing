import type { ConsumptionStatus, DB } from './types';
import { unwrap } from './types';
import { decrementStock } from './stock';

export interface RecordConsumptionInput {
  profileId: string;
  plannedMealId?: string;
  status?: ConsumptionStatus;
  quantityConsumed?: number;
  quantityUnit?: string;
  /** Cas "different" : ce qui a réellement été mangé. */
  actualRecipeId?: string;
  actualFreeText?: string;
  /** Décrémentations de stock induites par cette consommation réelle. */
  stockDecrements?: Array<{ stockId: string; amount: number }>;
}

/**
 * Enregistre une consommation réelle pour UN profil (specs 3.3 : chaque participant
 * a sa propre ligne, donc ses propres macros). Le stock n'est décrémenté QUE par la
 * consommation réelle (specs 3.4), via `stockDecrements`.
 *
 * Rappel principe n°1 : un repas planifié est considéré mangé tel que prévu SANS
 * action. On n'enregistre une consommation que pour signaler un écart ou tracer
 * explicitement une quantité — pas pour valider positivement chaque repas.
 */
export async function recordConsumption(db: DB, input: RecordConsumptionInput): Promise<string> {
  const row = unwrap(
    await db
      .from('real_consumption')
      .insert({
        profile_id: input.profileId,
        planned_meal_id: input.plannedMealId ?? null,
        status: input.status ?? 'conforme',
        quantity_consumed: input.quantityConsumed ?? null,
        quantity_unit: input.quantityUnit ?? null,
        actual_recipe_id: input.actualRecipeId ?? null,
        actual_free_text: input.actualFreeText ?? null,
      })
      .select('id')
      .single(),
  ) as { id: string };

  for (const dec of input.stockDecrements ?? []) {
    await decrementStock(db, dec);
  }

  return row.id;
}

/** Raccourci : signaler un repas sauté (écart). */
export async function skipMeal(
  db: DB,
  params: { profileId: string; plannedMealId: string },
): Promise<string> {
  return recordConsumption(db, {
    profileId: params.profileId,
    plannedMealId: params.plannedMealId,
    status: 'skipped',
  });
}
