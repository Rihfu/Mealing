import type { DB } from './types';
import { unwrap } from './types';
import { toBase, fromBase } from '@/lib/units';

/**
 * Réappro intelligent : seuil de stock minimal par aliment, au niveau du foyer.
 * Quand le stock courant d'un aliment passe sous son seuil, il apparaît dans
 * « À racheter (stock bas) » et peut être ajouté à la liste de courses en 1 clic.
 * Seuil DURABLE (table `restock_threshold`), 1 par aliment ; détection dérivée du stock.
 */
export interface RestockThreshold {
  foodId: string;
  minQuantity: number;
  unit: string | null;
}

export interface LowStockItem {
  foodId: string;
  label: string;
  iconSlug: string | null;
  current: number; // stock courant (dans l'unité du seuil, best-effort)
  threshold: number;
  unit: string | null;
  shortfall: number; // seuil - courant (> 0)
}

interface ThRow { food_id: string; min_quantity: number; unit: string | null }
interface StockRow { food_id: string | null; quantity: number | null; unit: string | null; tracking_mode: string }

/** Somme le stock d'un aliment (mode quantité) exprimée dans l'unité du seuil. */
function sumStockInUnit(stocks: StockRow[], foodId: string, targetQty: number, targetUnit: string | null): number {
  const tb = toBase(targetQty, targetUnit);
  let current = 0;
  for (const s of stocks) {
    if (s.food_id !== foodId || s.tracking_mode !== 'quantity' || s.quantity == null) continue;
    if (tb) {
      const sb = toBase(s.quantity, s.unit);
      if (sb && sb.dim === tb.dim) current += fromBase(sb.value, targetUnit) ?? 0;
      // dimensions incompatibles → ignoré (on ne sait pas comparer)
    } else if ((s.unit ?? '') === (targetUnit ?? '')) {
      current += s.quantity; // unité inconnue → seules les mêmes unités brutes comptent
    }
  }
  return Math.round(current * 100) / 100;
}

/** Définit le seuil de réappro d'un aliment (supprime si <= 0). */
export async function setRestockThreshold(
  db: DB,
  householdId: string,
  foodId: string,
  minQuantity: number,
  unit: string | null,
): Promise<void> {
  if (!Number.isFinite(minQuantity) || minQuantity <= 0) {
    await db.from('restock_threshold').delete().eq('household_id', householdId).eq('food_id', foodId);
    return;
  }
  await db.from('restock_threshold').upsert({
    household_id: householdId,
    food_id: foodId,
    min_quantity: minQuantity,
    unit: unit || null,
    updated_at: new Date().toISOString(),
  });
}

/** Tous les seuils du foyer (map foodId → seuil), pour l'affichage côté UI. */
export async function listRestockThresholds(db: DB, householdId: string): Promise<RestockThreshold[]> {
  const rows = (unwrap(
    await db.from('restock_threshold').select('food_id, min_quantity, unit').eq('household_id', householdId),
  ) ?? []) as ThRow[];
  return rows.map((r) => ({ foodId: r.food_id, minQuantity: r.min_quantity, unit: r.unit }));
}

/** Aliments dont le stock courant est sous leur seuil de réappro (tri par manque décroissant). */
export async function computeLowStock(db: DB, householdId: string): Promise<LowStockItem[]> {
  const [thRes, stockRes] = await Promise.all([
    db.from('restock_threshold').select('food_id, min_quantity, unit').eq('household_id', householdId),
    db.from('stock').select('food_id, quantity, unit, tracking_mode').eq('household_id', householdId),
  ]);
  const thresholds = (unwrap(thRes) ?? []) as ThRow[];
  if (thresholds.length === 0) return [];
  const stocks = (unwrap(stockRes) ?? []) as StockRow[];

  const foodIds = thresholds.map((t) => t.food_id);
  const foods = (unwrap(await db.from('food').select('id, name, external_id').in('id', foodIds)) ?? []) as Array<{
    id: string;
    name: string;
    external_id: string | null;
  }>;
  const foodInfo = new Map(foods.map((f) => [f.id, f]));

  const result: LowStockItem[] = [];
  for (const t of thresholds) {
    const current = sumStockInUnit(stocks, t.food_id, t.min_quantity, t.unit);
    if (current < t.min_quantity) {
      const f = foodInfo.get(t.food_id);
      result.push({
        foodId: t.food_id,
        label: f?.name ?? 'aliment',
        iconSlug: f?.external_id ?? null,
        current,
        threshold: t.min_quantity,
        unit: t.unit,
        shortfall: Math.round((t.min_quantity - current) * 100) / 100,
      });
    }
  }
  return result.sort((a, b) => b.shortfall - a.shortfall);
}

/** Ajoute le manque d'un aliment à la liste de courses (lié au catalogue → rayon + icône). */
export async function addRestockToShopping(
  db: DB,
  householdId: string,
  foodId: string,
  quantity: number,
  unit: string | null,
): Promise<void> {
  const food = unwrap(await db.from('food').select('name').eq('id', foodId).maybeSingle()) as { name: string } | null;
  await db.from('shopping_manual_item').insert({
    household_id: householdId,
    food_id: foodId,
    label: food?.name ?? 'article',
    quantity: quantity > 0 ? quantity : null,
    unit: unit || null,
  });
}
