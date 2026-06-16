import type { DB } from './types';
import { unwrap } from './types';

export type ShoppingSource = 'recipe' | 'recurring' | 'manual';

export interface ShoppingLine {
  key: string; // clé stable d'état coché (ex. 'food:<id>', 'label:<txt>', 'manual:<id>')
  name: string;
  quantity?: number;
  unit?: string;
  checked: boolean;
  source: ShoppingSource;
  manualId?: string;
}

/**
 * Liste de courses CALCULÉE dynamiquement (specs 3.5), jamais stockée en dur :
 *   besoins des repas à venir  −  stock disponible  +  récurrents  +  manuels.
 *
 * Approximation assumée (principe n°2) : une occurrence de recette = une fois ses
 * quantités d'ingrédients. Les articles en mode « présence » présents au stock sont
 * considérés couverts. L'état coché vit dans shopping_item_state (+ colonne checked
 * pour les manuels).
 */
export async function generateShoppingList(
  db: DB,
  params: { householdId: string; from: string; to: string },
): Promise<ShoppingLine[]> {
  const meals = (unwrap(
    await db
      .from('planned_meal')
      .select('recipe_id, meal_date')
      .eq('household_id', params.householdId)
      .gte('meal_date', params.from)
      .lte('meal_date', params.to)
      .not('recipe_id', 'is', null),
  ) ?? []) as Array<{ recipe_id: string; meal_date: string }>;

  const offDates = new Set(
    ((unwrap(
      await db
        .from('day_off_plan')
        .select('off_date, scope')
        .eq('household_id', params.householdId)
        .gte('off_date', params.from)
        .lte('off_date', params.to),
    ) ?? []) as Array<{ off_date: string; scope: string }>)
      .filter((o) => o.scope === 'household')
      .map((o) => o.off_date),
  );

  const activeRecipeIds = meals.filter((m) => !offDates.has(m.meal_date)).map((m) => m.recipe_id);

  // Besoins agrégés par aliment (food_id) à partir des ingrédients de recette.
  const needByFood = new Map<string, { qty: number; unit?: string }>();
  if (activeRecipeIds.length > 0) {
    const ingredients = (unwrap(
      await db
        .from('recipe_ingredient')
        .select('recipe_id, food_id, quantity, unit')
        .in('recipe_id', activeRecipeIds)
        .not('food_id', 'is', null),
    ) ?? []) as Array<{ recipe_id: string; food_id: string; quantity: number | null; unit: string | null }>;

    // Une recette peut apparaître plusieurs fois (plusieurs repas) -> compter les occurrences.
    const occ = new Map<string, number>();
    for (const id of activeRecipeIds) occ.set(id, (occ.get(id) ?? 0) + 1);

    for (const ing of ingredients) {
      if (ing.quantity == null) continue;
      const times = occ.get(ing.recipe_id) ?? 1;
      const cur = needByFood.get(ing.food_id) ?? { qty: 0, unit: ing.unit ?? undefined };
      cur.qty += ing.quantity * times;
      if (!cur.unit && ing.unit) cur.unit = ing.unit;
      needByFood.set(ing.food_id, cur);
    }
  }

  // Stock disponible.
  const stock = (unwrap(
    await db
      .from('stock')
      .select('food_id, tracking_mode, quantity, present')
      .eq('household_id', params.householdId),
  ) ?? []) as Array<{ food_id: string | null; tracking_mode: string; quantity: number | null; present: boolean }>;

  const stockQtyByFood = new Map<string, number>();
  const presentFoods = new Set<string>();
  for (const s of stock) {
    if (!s.food_id) continue;
    if (s.tracking_mode === 'quantity') {
      stockQtyByFood.set(s.food_id, (stockQtyByFood.get(s.food_id) ?? 0) + (s.quantity ?? 0));
    } else if (s.present) {
      presentFoods.add(s.food_id);
    }
  }

  // Soustraire le stock des besoins.
  const neededFoodIds: string[] = [];
  const netNeed = new Map<string, { qty: number; unit?: string }>();
  for (const [foodId, need] of needByFood) {
    if (presentFoods.has(foodId)) continue; // couvert par présence
    const remaining = need.qty - (stockQtyByFood.get(foodId) ?? 0);
    if (remaining > 0) {
      netNeed.set(foodId, { qty: remaining, unit: need.unit });
      neededFoodIds.push(foodId);
    }
  }

  // Récurrents (toujours utiles ; on exclut ceux présents au stock).
  const recurring = (unwrap(
    await db
      .from('shopping_recurring_item')
      .select('id, food_id, label, default_quantity, unit')
      .eq('household_id', params.householdId),
  ) ?? []) as Array<{ id: string; food_id: string | null; label: string | null; default_quantity: number | null; unit: string | null }>;

  // Noms des aliments référencés (besoins + récurrents).
  const recurringFoodIds = recurring.map((r) => r.food_id).filter((x): x is string => !!x);
  const allFoodIds = Array.from(new Set([...neededFoodIds, ...recurringFoodIds]));
  const foodNames = new Map<string, string>();
  if (allFoodIds.length > 0) {
    const foods = (unwrap(await db.from('food').select('id, name').in('id', allFoodIds)) ??
      []) as Array<{ id: string; name: string }>;
    for (const f of foods) foodNames.set(f.id, f.name);
  }

  // État coché des lignes générées.
  const checkedKeys = new Set(
    ((unwrap(
      await db
        .from('shopping_item_state')
        .select('item_key, checked')
        .eq('household_id', params.householdId),
    ) ?? []) as Array<{ item_key: string; checked: boolean }>)
      .filter((c) => c.checked)
      .map((c) => c.item_key),
  );

  const lines: ShoppingLine[] = [];

  for (const [foodId, need] of netNeed) {
    const key = `food:${foodId}`;
    lines.push({
      key,
      name: foodNames.get(foodId) ?? '(aliment)',
      quantity: Math.round(need.qty * 100) / 100,
      unit: need.unit,
      checked: checkedKeys.has(key),
      source: 'recipe',
    });
  }

  for (const r of recurring) {
    if (r.food_id && presentFoods.has(r.food_id)) continue; // déjà au stock
    const key = r.food_id ? `food:${r.food_id}` : `label:${r.label}`;
    lines.push({
      key,
      name: r.food_id ? (foodNames.get(r.food_id) ?? '(aliment)') : (r.label ?? ''),
      quantity: r.default_quantity ?? undefined,
      unit: r.unit ?? undefined,
      checked: checkedKeys.has(key),
      source: 'recurring',
    });
  }

  // Articles manuels (état coché propre).
  const manual = (unwrap(
    await db
      .from('shopping_manual_item')
      .select('id, label, quantity, unit, checked')
      .eq('household_id', params.householdId),
  ) ?? []) as Array<{ id: string; label: string; quantity: number | null; unit: string | null; checked: boolean }>;

  for (const m of manual) {
    lines.push({
      key: `manual:${m.id}`,
      name: m.label,
      quantity: m.quantity ?? undefined,
      unit: m.unit ?? undefined,
      checked: m.checked,
      source: 'manual',
      manualId: m.id,
    });
  }

  return lines;
}
