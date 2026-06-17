import type { DB } from './types';
import { unwrap } from './types';

export type ShoppingSource = 'recipe' | 'recurring' | 'manual';

export interface ShoppingLine {
  key: string; // clé stable d'état coché (ex. 'food:<id>', 'recipe-label:<txt>', 'manual:<id>')
  name: string;
  quantity?: number;
  unit?: string;
  checked: boolean;
  source: ShoppingSource;
  manualId?: string;
}

/**
 * Liste de courses calculée dynamiquement (specs 3.5), jamais stockée en dur :
 *   besoins des repas à venir - stock disponible + récurrents + manuels.
 *
 * Les recettes liées à des aliments (food_id) sont calculées précisément.
 * Les recettes générées par IA peuvent contenir des ingrédients libres : on les
 * traite aussi par libellé pour éviter qu'un ingrédient évident disparaisse des
 * courses tant qu'il n'a pas encore été lié à la base nutritionnelle.
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

  const needByFood = new Map<string, { qty: number; unit?: string }>();
  const needByLabel = new Map<string, { label: string; qty?: number; unit?: string }>();

  if (activeRecipeIds.length > 0) {
    const ingredients = (unwrap(
      await db
        .from('recipe_ingredient')
        .select('recipe_id, food_id, free_text, quantity, unit')
        .in('recipe_id', activeRecipeIds),
    ) ?? []) as Array<{
      recipe_id: string;
      food_id: string | null;
      free_text: string | null;
      quantity: number | null;
      unit: string | null;
    }>;

    const occ = new Map<string, number>();
    for (const id of activeRecipeIds) occ.set(id, (occ.get(id) ?? 0) + 1);

    for (const ing of ingredients) {
      const times = occ.get(ing.recipe_id) ?? 1;

      if (ing.food_id) {
        if (ing.quantity == null) continue;
        const cur = needByFood.get(ing.food_id) ?? { qty: 0, unit: ing.unit ?? undefined };
        cur.qty += ing.quantity * times;
        if (!cur.unit && ing.unit) cur.unit = ing.unit;
        needByFood.set(ing.food_id, cur);
        continue;
      }

      const label = ing.free_text?.trim();
      if (!label) continue;
      const key = normalizeLabel(label);
      const cur = needByLabel.get(key) ?? { label, qty: undefined, unit: ing.unit ?? undefined };
      if (ing.quantity != null) cur.qty = (cur.qty ?? 0) + ing.quantity * times;
      if (!cur.unit && ing.unit) cur.unit = ing.unit;
      needByLabel.set(key, cur);
    }
  }

  const stock = (unwrap(
    await db
      .from('stock')
      .select('food_id, label, tracking_mode, quantity, unit, present')
      .eq('household_id', params.householdId),
  ) ?? []) as Array<{
    food_id: string | null;
    label: string | null;
    tracking_mode: string;
    quantity: number | null;
    unit: string | null;
    present: boolean;
  }>;

  // Stock agrégé par aliment, converti dans une unité de base (cf. helpers d'unités plus bas).
  // `undefined` = pas de stock quantifié ; `null` = stock quantifié mais en unité non
  // convertible / dimensions mêlées → on ne peut pas vérifier la couverture, donc on ne déduit pas.
  const stockBaseByFood = new Map<string, Quantity | null>();
  const presentFoods = new Set<string>();
  const stockByLabel = new Map<string, { qty?: number; unit?: string; present: boolean }>();

  for (const s of stock) {
    if (s.food_id) {
      if (s.tracking_mode === 'quantity') {
        addStockBase(stockBaseByFood, s.food_id, toBase(s.quantity ?? 0, s.unit));
      } else if (s.present) {
        presentFoods.add(s.food_id);
      }
    }

    const label = s.label?.trim();
    if (label) {
      const key = normalizeLabel(label);
      const cur = stockByLabel.get(key) ?? { present: false, unit: s.unit ?? undefined };
      cur.present = cur.present || s.present || (s.quantity ?? 0) > 0;
      if (s.quantity != null) cur.qty = (cur.qty ?? 0) + s.quantity;
      if (!cur.unit && s.unit) cur.unit = s.unit;
      stockByLabel.set(key, cur);
    }
  }

  const neededFoodIds: string[] = [];
  const netNeed = new Map<string, { qty: number; unit?: string }>();
  for (const [foodId, need] of needByFood) {
    if (presentFoods.has(foodId)) continue; // stock en présence → on suppose la couverture
    const remaining = remainingAfterStock(need.qty, need.unit, stockBaseByFood.get(foodId));
    if (remaining > 0) {
      netNeed.set(foodId, { qty: remaining, unit: need.unit });
      neededFoodIds.push(foodId);
    }
  }

  const netLabelNeed = new Map<string, { label: string; qty?: number; unit?: string }>();
  for (const [key, need] of needByLabel) {
    const stockItem = stockByLabel.get(key);
    if (!stockItem?.present) {
      netLabelNeed.set(key, need); // pas en stock → besoin entier
      continue;
    }

    // Présent mais sans quantité chiffrée (suivi présence, ou besoin sans qté) :
    // on suppose la couverture (principe « précision approximative assumée »).
    if (need.qty == null || stockItem.qty == null) continue;

    // Stock quantifié : on déduit en unités réconciliées. En cas d'unités incompatibles,
    // `remainingAfterStock` renvoie le besoin entier — on ne masque jamais un besoin réel.
    const remaining = remainingAfterStock(need.qty, need.unit, toBase(stockItem.qty, stockItem.unit));
    if (remaining > 0) netLabelNeed.set(key, { ...need, qty: remaining });
  }

  const recurring = (unwrap(
    await db
      .from('shopping_recurring_item')
      .select('id, food_id, label, default_quantity, unit')
      .eq('household_id', params.householdId),
  ) ?? []) as Array<{
    id: string;
    food_id: string | null;
    label: string | null;
    default_quantity: number | null;
    unit: string | null;
  }>;

  const recurringFoodIds = recurring.map((r) => r.food_id).filter((x): x is string => !!x);
  const allFoodIds = Array.from(new Set([...neededFoodIds, ...recurringFoodIds]));
  const foodNames = new Map<string, string>();
  if (allFoodIds.length > 0) {
    const foods = (unwrap(await db.from('food').select('id, name').in('id', allFoodIds)) ?? []) as Array<{
      id: string;
      name: string;
    }>;
    for (const f of foods) foodNames.set(f.id, f.name);
  }

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
      quantity: roundQty(need.qty),
      unit: need.unit,
      checked: checkedKeys.has(key),
      source: 'recipe',
    });
  }

  for (const [labelKey, need] of netLabelNeed) {
    const key = `recipe-label:${labelKey}`;
    lines.push({
      key,
      name: need.label,
      quantity: need.qty == null ? undefined : roundQty(need.qty),
      unit: need.unit,
      checked: checkedKeys.has(key),
      source: 'recipe',
    });
  }

  for (const r of recurring) {
    if (r.food_id && presentFoods.has(r.food_id)) continue;
    if (!r.food_id && r.label && stockByLabel.get(normalizeLabel(r.label))?.present) continue;

    const key = r.food_id
      ? `recurring-food:${r.food_id}`
      : `recurring-label:${normalizeLabel(r.label ?? '')}`;
    lines.push({
      key,
      name: r.food_id ? (foodNames.get(r.food_id) ?? '(aliment)') : (r.label ?? ''),
      quantity: r.default_quantity ?? undefined,
      unit: r.unit ?? undefined,
      checked: checkedKeys.has(key),
      source: 'recurring',
    });
  }

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

function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .replaceAll('œ', 'oe')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/s$/, '');
}

function roundQty(value: number): number {
  return Math.round(value * 100) / 100;
}

// --- Unités ---------------------------------------------------------------
// Réconciliation d'unités pour comparer besoins et stock. On regroupe par
// dimension (masse, volume, comptage) avec une unité de base par dimension.
// Précision approximative assumée : on ne couvre que les unités usuelles ;
// une unité inconnue est traitée comme non réconciliable (on ne déduit pas,
// plutôt que de masquer un besoin réel).

type Dim = 'mass' | 'volume' | 'count';
interface Quantity {
  dim: Dim;
  value: number; // exprimée dans l'unité de base de la dimension (g, ml, ou pièce)
}

const UNIT_TO_BASE: Record<string, { dim: Dim; factor: number }> = {
  mg: { dim: 'mass', factor: 0.001 },
  g: { dim: 'mass', factor: 1 },
  gramme: { dim: 'mass', factor: 1 },
  kg: { dim: 'mass', factor: 1000 },
  ml: { dim: 'volume', factor: 1 },
  cl: { dim: 'volume', factor: 10 },
  dl: { dim: 'volume', factor: 100 },
  l: { dim: 'volume', factor: 1000 },
  litre: { dim: 'volume', factor: 1000 },
  piece: { dim: 'count', factor: 1 },
  u: { dim: 'count', factor: 1 },
  unite: { dim: 'count', factor: 1 },
};

function normalizeUnit(unit?: string | null): string {
  return (unit ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z]/g, '') // retire aussi les marques combinantes (accents) après NFD
    .replace(/s$/, '');
}

function toBase(qty: number, unit?: string | null): Quantity | null {
  const entry = UNIT_TO_BASE[normalizeUnit(unit)];
  if (!entry) return null;
  return { dim: entry.dim, value: qty * entry.factor };
}

function fromBase(value: number, unit?: string | null): number | null {
  const entry = UNIT_TO_BASE[normalizeUnit(unit)];
  if (!entry) return null;
  return value / entry.factor;
}

function addStockBase(map: Map<string, Quantity | null>, foodId: string, base: Quantity | null): void {
  const prev = map.get(foodId);
  if (prev === undefined) {
    map.set(foodId, base);
    return;
  }
  if (prev === null || base === null || prev.dim !== base.dim) {
    map.set(foodId, null); // unité non convertible ou dimensions mêlées
    return;
  }
  map.set(foodId, { dim: prev.dim, value: prev.value + base.value });
}

/**
 * Reste à acheter après déduction du stock, exprimé dans l'unité du besoin.
 * - `stockBase` undefined (aucun stock quantifié) ou null (unité non réconciliable)
 *   → besoin entier (on ne masque jamais un besoin sur une incompatibilité d'unité).
 * - unités de dimensions différentes → besoin entier.
 * - sinon : besoin − stock, converti dans l'unité du besoin.
 */
function remainingAfterStock(
  needQty: number,
  needUnit: string | undefined,
  stockBase: Quantity | null | undefined,
): number {
  if (stockBase == null) return needQty;
  const needBase = toBase(needQty, needUnit);
  if (needBase == null || needBase.dim !== stockBase.dim) return needQty;
  const remainingBase = needBase.value - stockBase.value;
  if (remainingBase <= 0) return 0;
  return fromBase(remainingBase, needUnit) ?? remainingBase;
}
