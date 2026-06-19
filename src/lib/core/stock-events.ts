import type { DB } from './types';
import { unwrap } from './types';

/**
 * Journal de mouvements de stock (refonte Stock). Le stock reste l'instantané ;
 * ce journal l'HISTORISE pour débloquer : évolution dans le temps, rythme de
 * consommation, prédiction de rupture, suivi du gaspillage (principe n°8).
 *
 * `kind` : 'in' (entrée, ex. courses) · 'out' (sortie, ex. consommation) ·
 *          'adjust' (correction manuelle) · 'discard' (jeté / périmé).
 * `source` : d'où vient le mouvement (traçabilité).
 */
export type StockEventKind = 'in' | 'out' | 'adjust' | 'discard';
export type StockEventSource = 'courses' | 'consumption' | 'manual' | 'expiry';

export interface StockEventInput {
  householdId: string;
  stockId?: string | null;
  foodId?: string | null;
  label?: string | null;
  kind: StockEventKind;
  quantity?: number | null;
  unit?: string | null;
  source?: StockEventSource;
}

/** Enregistre un mouvement de stock. Best-effort : à appeler depuis les fonctions
 *  qui modifient le stock (entrée courses, décrément consommation, ajustement, jeté). */
export async function recordStockEvent(db: DB, input: StockEventInput): Promise<void> {
  const { error } = await db.from('stock_event').insert({
    household_id: input.householdId,
    stock_id: input.stockId ?? null,
    food_id: input.foodId ?? null,
    label: input.label ?? null,
    kind: input.kind,
    quantity: input.quantity ?? null,
    unit: input.unit ?? null,
    source: input.source ?? 'manual',
  });
  if (error) throw new Error(error.message);
}

export interface StockEvent {
  id: string;
  foodId: string | null;
  label: string | null;
  kind: StockEventKind;
  quantity: number | null;
  unit: string | null;
  source: string | null;
  occurredAt: string;
}

/** Historique des mouvements (récents d'abord), filtrable par aliment. */
export async function listStockEvents(
  db: DB,
  householdId: string,
  opts?: { foodId?: string; limit?: number },
): Promise<StockEvent[]> {
  let q = db
    .from('stock_event')
    .select('id, food_id, label, kind, quantity, unit, source, occurred_at')
    .eq('household_id', householdId)
    .order('occurred_at', { ascending: false })
    .limit(opts?.limit ?? 100);
  if (opts?.foodId) q = q.eq('food_id', opts.foodId);

  const rows = (unwrap(await q) ?? []) as Array<{
    id: string;
    food_id: string | null;
    label: string | null;
    kind: StockEventKind;
    quantity: number | null;
    unit: string | null;
    source: string | null;
    occurred_at: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    foodId: r.food_id,
    label: r.label,
    kind: r.kind,
    quantity: r.quantity,
    unit: r.unit,
    source: r.source,
    occurredAt: r.occurred_at,
  }));
}
