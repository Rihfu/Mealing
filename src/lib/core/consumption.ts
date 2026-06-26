import type { ConsumptionStatus, DB } from './types';
import { unwrap } from './types';
import { decrementStock } from './stock';
import { recordStockEvent } from './stock-events';
import { toBase, fromBase, normalizeUnit } from '@/lib/units';
import { isoDate } from '@/lib/dates';

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

/* --------------------- Boucle consommation → stock (specs 3.4) -------------- */
/*
 * Réconcilie les repas PASSÉS (confirmation par défaut : mangés sans action) en
 * décrémentant le stock de leurs ingrédients liés au catalogue. CONSERVATEUR + SÛR :
 * uniquement les ingrédients liés par `food_id` à un article de stock en mode quantité,
 * et seulement si les unités sont compatibles (sinon on saute — pas de fausse déduction,
 * principe n°2). Idempotent via `planned_meal.stock_applied_at`. Annulable.
 */
export interface MealStockDecrement {
  stockId: string;
  label: string;
  amount: number;
  unit: string | null;
}
export interface MealStockSummary {
  decrements: MealStockDecrement[];
  meals: number; // nombre de repas appliqués (ayant décrémenté quelque chose)
}

/** Quantité d'ingrédient convertie dans l'unité du stock ; null si incompatible. */
function reconcileAmount(ingQty: number, ingUnit: string | null, stockUnit: string | null): number | null {
  if (normalizeUnit(ingUnit) === normalizeUnit(stockUnit)) return ingQty;
  const a = toBase(ingQty, ingUnit);
  const probe = toBase(1, stockUnit);
  if (!a || !probe || a.dim !== probe.dim) return null;
  return fromBase(a.value, stockUnit);
}

export async function applyDueMealsToStock(db: DB, householdId: string): Promise<MealStockSummary> {
  const today = isoDate(new Date());
  const meals = (unwrap(
    await db
      .from('planned_meal')
      .select('id, recipe_id, servings')
      .eq('household_id', householdId)
      .lt('meal_date', today)
      .not('recipe_id', 'is', null)
      .is('stock_applied_at', null),
  ) ?? []) as Array<{ id: string; recipe_id: string; servings: number | null }>;
  if (meals.length === 0) return { decrements: [], meals: 0 };

  const mealIds = meals.map((m) => m.id);

  // Portions de base des recettes → pour scaler le décrément quand le repas a été
  // planifié pour un nombre de portions différent (cohérent avec la liste de courses).
  const baseServings = new Map<string, number>();
  for (const r of (unwrap(
    await db.from('recipe').select('id, servings').in('id', Array.from(new Set(meals.map((m) => m.recipe_id)))),
  ) ?? []) as Array<{ id: string; servings: number | null }>) {
    baseServings.set(r.id, Number(r.servings) > 0 ? Number(r.servings) : 1);
  }
  // Repas explicitement sautés → on les marque appliqués sans décrémenter.
  const skipped = new Set(
    ((unwrap(
      await db.from('real_consumption').select('planned_meal_id').in('planned_meal_id', mealIds).eq('status', 'skipped'),
    ) ?? []) as Array<{ planned_meal_id: string | null }>).map((r) => r.planned_meal_id),
  );

  // Stock matchable : mode quantité, lié au catalogue, quantité connue (1 article/aliment).
  const stockRows = (unwrap(
    await db
      .from('stock')
      .select('id, food_id, label, quantity, unit')
      .eq('household_id', householdId)
      .eq('tracking_mode', 'quantity')
      .not('food_id', 'is', null),
  ) ?? []) as Array<{ id: string; food_id: string; label: string | null; quantity: number | null; unit: string | null }>;
  const stockByFood = new Map<string, { id: string; label: string | null; quantity: number; unit: string | null }>();
  for (const s of stockRows) {
    if (s.food_id && s.quantity != null && !stockByFood.has(s.food_id)) {
      stockByFood.set(s.food_id, { id: s.id, label: s.label, quantity: s.quantity, unit: s.unit });
    }
  }

  const decrements: MealStockDecrement[] = [];
  let appliedMeals = 0;
  const now = new Date().toISOString();

  for (const meal of meals) {
    if (skipped.has(meal.id)) {
      await db.from('planned_meal').update({ stock_applied_at: now }).eq('id', meal.id);
      continue;
    }
    const ingredients = (unwrap(
      await db.from('recipe_ingredient').select('food_id, quantity, unit').eq('recipe_id', meal.recipe_id).not('food_id', 'is', null),
    ) ?? []) as Array<{ food_id: string | null; quantity: number | null; unit: string | null }>;

    const base = baseServings.get(meal.recipe_id) ?? 1;
    const factor = meal.servings != null && meal.servings > 0 ? meal.servings / base : 1;
    let touched = false;
    for (const ing of ingredients) {
      if (!ing.food_id || ing.quantity == null) continue;
      const s = stockByFood.get(ing.food_id);
      if (!s) continue;
      const dec = reconcileAmount(ing.quantity * factor, ing.unit, s.unit);
      if (dec == null || dec <= 0) continue;
      const newQty = Math.max(0, s.quantity - dec);
      await db.from('stock').update({ quantity: newQty }).eq('id', s.id);
      await recordStockEvent(db, { householdId, stockId: s.id, foodId: ing.food_id, label: s.label, kind: 'out', quantity: dec, unit: s.unit, source: 'consumption' });
      decrements.push({ stockId: s.id, label: s.label ?? '(article)', amount: dec, unit: s.unit });
      s.quantity = newQty; // évite de sur-décrémenter le même article par plusieurs repas
      touched = true;
    }
    await db.from('planned_meal').update({ stock_applied_at: now }).eq('id', meal.id);
    if (touched) appliedMeals += 1;
  }

  return { decrements, meals: appliedMeals };
}

/** Annule une application : ré-incrémente le stock (les repas restent « appliqués »). */
export async function undoMealStockApplication(db: DB, householdId: string, summary: MealStockSummary): Promise<void> {
  for (const d of summary.decrements) {
    // maybeSingle() peut renvoyer data=null si l'article a été supprimé entre-temps →
    // PAS d'unwrap (qui jette sur null) : on saute simplement la ré-incrémentation.
    const { data: cur } = await db.from('stock').select('quantity').eq('id', d.stockId).maybeSingle();
    if (cur) await db.from('stock').update({ quantity: ((cur as { quantity: number | null }).quantity ?? 0) + d.amount }).eq('id', d.stockId);
    await recordStockEvent(db, { householdId, stockId: d.stockId, label: d.label, kind: 'adjust', quantity: d.amount, unit: d.unit, source: 'manual' });
  }
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
