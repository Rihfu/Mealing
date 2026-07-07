import type { DB } from './types';
import { unwrap } from './types';

/**
 * N3 Nutrition — EXTRAS hors-plan : un aliment mangé en dehors du planning
 * (goûter, yaourt, apéro…), compté dans le « réel estimé » en 2 gestes.
 *
 * Un extra = ligne `real_consumption` avec `planned_meal_id` null, `status='extra'`,
 * `food_id` + quantité dans l'unité de BASE de l'aliment (g/ml — même convention
 * que les ingrédients de recette, principe n°2). Nutrition dérivée des valeurs
 * STOCKÉES de l'aliment (fournisseur, jamais l'IA — n°3), dans l'agrégation.
 * RLS : strictement personnel (real_consumption_modify = profile_id = auth.uid()).
 */

export interface ExtraItem {
  id: string;
  foodId: string;
  foodName: string;
  quantity: number;
  unit: string;
  /** Date (YYYY-MM-DD) dérivée de consumed_at. */
  date: string;
}

/** Extras d'un profil sur une période (bornes de dates INCLUSES). */
export async function listExtras(db: DB, profileId: string, params: { from: string; to: string }): Promise<ExtraItem[]> {
  const rows = (unwrap(
    await db
      .from('real_consumption')
      .select('id, food_id, quantity_consumed, quantity_unit, consumed_at, food:food_id(name)')
      .eq('profile_id', profileId)
      .eq('status', 'extra')
      .is('planned_meal_id', null)
      .gte('consumed_at', params.from)
      .lte('consumed_at', `${params.to}T23:59:59.999`)
      .order('consumed_at', { ascending: false }),
  ) ?? []) as Array<{
    id: string;
    food_id: string | null;
    quantity_consumed: number | null;
    quantity_unit: string | null;
    consumed_at: string;
    food: { name: string } | { name: string }[] | null;
  }>;
  return rows
    .filter((r): r is typeof r & { food_id: string } => !!r.food_id)
    .map((r) => ({
      id: r.id,
      foodId: r.food_id,
      foodName: (Array.isArray(r.food) ? r.food[0]?.name : r.food?.name) ?? 'Aliment',
      quantity: r.quantity_consumed ?? 0,
      unit: r.quantity_unit ?? 'g',
      date: r.consumed_at.slice(0, 10),
    }));
}

/** Ajoute un extra (aliment du catalogue + quantité en g/ml + date, défaut aujourd'hui). */
export async function addFoodExtra(
  db: DB,
  profileId: string,
  input: { foodId: string; quantity: number; date?: string },
): Promise<void> {
  if (!(input.quantity > 0)) throw new Error('Quantité invalide.');
  const insert = await db.from('real_consumption').insert({
    profile_id: profileId,
    planned_meal_id: null,
    status: 'extra',
    food_id: input.foodId,
    quantity_consumed: input.quantity,
    // La quantité est TOUJOURS interprétée en unité de base (g/ml, base_amount=100) —
    // même convention que les ingrédients de recette, quel que soit default_unit.
    quantity_unit: 'g',
    // Midi local : la date compte, pas l'heure (fenêtres jour/semaine).
    consumed_at: input.date ? `${input.date}T12:00:00` : new Date().toISOString(),
  });
  if (insert.error) throw new Error(insert.error.message);

  // Complétion nutrition BEST-EFFORT : un extra sur un aliment sans valeurs stockées
  // compterait 0 en silence. On tente le fournisseur (USDA/OFF — jamais l'IA, n°3) ;
  // l'ajout n'échoue jamais pour ça (pattern completeRecipeNutrition).
  try {
    const { count } = await db
      .from('nutrient_value')
      .select('food_id', { count: 'exact', head: true })
      .eq('food_id', input.foodId);
    if (!count) {
      const { fetchAndStoreNutrition } = await import('./foods');
      await fetchAndStoreNutrition(db, input.foodId);
    }
  } catch {
    // silencieux — la couverture reste honnête, complétable plus tard.
  }
}

/** Retire un extra (uniquement les siens — RLS + garde applicative). */
export async function removeExtra(db: DB, profileId: string, id: string): Promise<void> {
  const del = await db
    .from('real_consumption')
    .delete()
    .eq('id', id)
    .eq('profile_id', profileId)
    .eq('status', 'extra');
  if (del.error) throw new Error(del.error.message);
}

/**
 * Nutrition cumulée des extras d'une période, par code de nutriment — utilisé par
 * `aggregatePeriodNutrition` pour les compter dans le « réel ». Valeurs stockées
 * de l'aliment × quantité / base_amount (approximation assumée, n°2).
 */
export async function computeExtrasNutrition(
  db: DB,
  profileId: string,
  params: { from: string; to: string },
): Promise<Record<string, number>> {
  const extras = await listExtras(db, profileId, params);
  const total: Record<string, number> = {};
  if (extras.length === 0) return total;

  const foodIds = Array.from(new Set(extras.map((e) => e.foodId)));
  const [foodsRes, valuesRes] = await Promise.all([
    db.from('food').select('id, base_amount').in('id', foodIds),
    db.from('nutrient_value').select('food_id, amount, nutrient_type:nutrient_type_id(code)').in('food_id', foodIds),
  ]);
  const baseAmounts = new Map(
    ((unwrap(foodsRes) ?? []) as Array<{ id: string; base_amount: number }>).map((f) => [f.id, f.base_amount]),
  );
  const valuesByFood = new Map<string, Array<{ amount: number; code: string }>>();
  for (const v of (unwrap(valuesRes) ?? []) as unknown as Array<{
    food_id: string;
    amount: number;
    nutrient_type: { code: string } | { code: string }[] | null;
  }>) {
    const code = Array.isArray(v.nutrient_type) ? v.nutrient_type[0]?.code : v.nutrient_type?.code;
    if (!code) continue;
    const list = valuesByFood.get(v.food_id) ?? [];
    list.push({ amount: v.amount, code });
    valuesByFood.set(v.food_id, list);
  }

  for (const e of extras) {
    const base = baseAmounts.get(e.foodId) ?? 0;
    const factor = base > 0 ? e.quantity / base : 0;
    if (factor <= 0) continue;
    for (const v of valuesByFood.get(e.foodId) ?? []) {
      total[v.code] = (total[v.code] ?? 0) + v.amount * factor;
    }
  }
  return total;
}
