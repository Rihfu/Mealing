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

/** Instantané d'un article de stock (pour le retrait RÉVERSIBLE + restauration). */
export interface StockSnapshot {
  household_id: string;
  food_id: string | null;
  label: string | null;
  tracking_mode: string;
  quantity: number | null;
  unit: string | null;
  present: boolean;
  storage_location: string | null;
  date_ouverture: string | null;
  printed_expiry: string | null;
  conservation_rule_id: string | null;
}

/** Retire des articles du stock en renvoyant leur instantané (pour annulation). */
export async function removeStockItems(db: DB, ids: string[]): Promise<StockSnapshot[]> {
  if (ids.length === 0) return [];
  const snapshots = (unwrap(
    await db
      .from('stock')
      .select('household_id, food_id, label, tracking_mode, quantity, unit, present, storage_location, date_ouverture, printed_expiry, conservation_rule_id')
      .in('id', ids),
  ) ?? []) as StockSnapshot[];
  const { error } = await db.from('stock').delete().in('id', ids);
  if (error) throw new Error(error.message);
  return snapshots;
}

/** Restaure des articles de stock à partir de leur instantané (annulation du retrait). */
export async function restoreStockItems(db: DB, snapshots: StockSnapshot[]): Promise<void> {
  if (snapshots.length === 0) return;
  const { error } = await db.from('stock').insert(snapshots);
  if (error) throw new Error(error.message);
}

/**
 * Réordonne (glisser-déposer) les articles d'UN lieu : affecte `sort_index` séquentiel
 * (0..n) dans l'ordre fourni + (ré)affecte le lieu à chacun. Gère le réordre intra-lieu
 * ET l'arrivée d'un article depuis un autre lieu (il figure dans `orderedIds` à sa
 * nouvelle position). Les articles du lieu SOURCE ne sont pas touchés (ordre relatif
 * conservé). `location` = clé prédéfinie / uuid custom / null (« non rangé »).
 */
export async function reorderStockItems(
  db: DB,
  householdId: string,
  location: string | null,
  orderedIds: string[],
): Promise<void> {
  if (orderedIds.length === 0) return;
  await Promise.all(
    orderedIds.map((id, i) =>
      db
        .from('stock')
        .update({ sort_index: i, storage_location: location })
        .eq('id', id)
        .eq('household_id', householdId)
        .then(({ error }) => {
          if (error) throw new Error(error.message);
        }),
    ),
  );
}
