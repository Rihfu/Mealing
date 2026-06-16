import type { DB, StockTrackingMode } from './types';
import { unwrap } from './types';

export interface UpsertStockInput {
  householdId: string;
  foodId?: string;
  label?: string;
  trackingMode: StockTrackingMode;
  quantity?: number;
  unit?: string;
  present?: boolean;
  conservationRuleId?: string;
}

/** Ajoute ou met à jour un article de stock du foyer. */
export async function upsertStockItem(db: DB, input: UpsertStockInput): Promise<string> {
  const row = unwrap(
    await db
      .from('stock')
      .insert({
        household_id: input.householdId,
        food_id: input.foodId ?? null,
        label: input.label ?? null,
        tracking_mode: input.trackingMode,
        quantity: input.quantity ?? null,
        unit: input.unit ?? null,
        present: input.present ?? true,
        conservation_rule_id: input.conservationRuleId ?? null,
      })
      .select('id')
      .single(),
  ) as { id: string };
  return row.id;
}

/**
 * Décrémente le stock suite à une CONSOMMATION RÉELLE (jamais par le planning seul
 * — principe specs 3.4, sinon le stock se dérègle dès qu'un plan change).
 *
 * - Mode `quantity` : soustrait `amount` (borné à 0).
 * - Mode `presence` : ne modifie pas la quantité (présence/absence à faible enjeu).
 * - Effet de bord déterministe : la `date_ouverture` est déduite automatiquement à
 *   la première décrémentation si elle est nulle (specs 3.4, zéro saisie utilisateur).
 *
 * @returns la nouvelle quantité (ou null en mode présence).
 */
export async function decrementStock(
  db: DB,
  params: { stockId: string; amount: number },
): Promise<number | null> {
  const stock = unwrap(
    await db
      .from('stock')
      .select('tracking_mode, quantity, date_ouverture')
      .eq('id', params.stockId)
      .single(),
  ) as { tracking_mode: StockTrackingMode; quantity: number | null; date_ouverture: string | null };

  const patch: Record<string, unknown> = {};

  // Déduction automatique de la date d'ouverture à la 1re consommation partielle.
  if (!stock.date_ouverture) {
    patch.date_ouverture = new Date().toISOString();
  }

  let newQuantity: number | null = stock.quantity;
  if (stock.tracking_mode === 'quantity') {
    newQuantity = Math.max(0, (stock.quantity ?? 0) - params.amount);
    patch.quantity = newQuantity;
  }

  const { error } = await db.from('stock').update(patch).eq('id', params.stockId);
  if (error) throw new Error(error.message);

  return newQuantity;
}
