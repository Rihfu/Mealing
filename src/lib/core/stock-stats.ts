import type { DB } from './types';
import { unwrap } from './types';
import { getStockWithExpiry } from './conservation';
import { listStorageLocations, storageLabel } from './storage';
import type { StockEventKind } from './stock-events';

/**
 * Statistiques de la section Stock (dérivées, lecture seule) : état courant + journal
 * `stock_event` (in/out/discard). Gaspillage, consommation, entrées, répartition par
 * lieu, activité récente. Les vues se garnissent à l'usage (le journal est historisé
 * à chaque mouvement — entrée au checkout, décrément à la conso, jeté à la péremption).
 */
export interface StockStatRow {
  foodId: string | null;
  label: string;
  iconSlug: string | null;
  count: number;
}

export interface ShelfLifeRow {
  foodId: string | null;
  label: string;
  iconSlug: string | null;
  avgDays: number; // âge moyen (achat → consommation/rebut)
  samples: number; // nb de sorties observées
}

export interface StockMove {
  label: string;
  foodId: string | null;
  iconSlug: string | null;
  kind: StockEventKind;
  quantity: number | null;
  unit: string | null;
  occurredAt: string;
}

export interface StockStats {
  inStock: number; // articles actuellement en stock
  dueSoon: number; // à consommer bientôt (≤ 3 j)
  expired: number; // périmés (< 0 j)
  byLocation: { key: string; label: string; count: number }[];
  totalMoves: number;
  inCount: number;
  outCount: number;
  wasteCount: number;
  wasteRate: number | null; // jeté / (jeté + consommé)
  avgShelfLifeDays: number | null; // durée de vie moyenne en stock (achat → sortie/rebut)
  shelfLife: ShelfLifeRow[]; // par aliment, du plus court au plus long
  topStocked: StockStatRow[];
  topConsumed: StockStatRow[];
  topDiscarded: StockStatRow[];
  recent: StockMove[];
}

interface EvtRow {
  food_id: string | null;
  label: string | null;
  kind: StockEventKind;
  quantity: number | null;
  unit: string | null;
  source: string | null;
  occurred_at: string;
}

export async function computeStockStats(db: DB, householdId: string): Promise<StockStats> {
  const [expiry, eventsRes, customLocs] = await Promise.all([
    getStockWithExpiry(db, householdId),
    db
      .from('stock_event')
      .select('food_id, label, kind, quantity, unit, source, occurred_at')
      .eq('household_id', householdId)
      .order('occurred_at', { ascending: false })
      .limit(2000),
    listStorageLocations(db, householdId),
  ]);
  const evts = (unwrap(eventsRes) ?? []) as EvtRow[];

  // --- État courant ---
  const inStock = expiry.length;
  const dueSoon = expiry.filter((e) => e.daysRemaining != null && (e.daysRemaining as number) >= 0 && (e.daysRemaining as number) <= 3).length;
  const expired = expiry.filter((e) => e.daysRemaining != null && (e.daysRemaining as number) < 0).length;

  const customMap = new Map(customLocs.map((c) => [c.id, c.label]));
  const locCount = new Map<string, number>();
  for (const e of expiry) {
    const k = e.storageLocation ?? '';
    locCount.set(k, (locCount.get(k) ?? 0) + 1);
  }
  const byLocation = [...locCount.entries()]
    .map(([key, count]) => ({ key, label: key === '' ? 'Non rangé' : storageLabel(key, customMap) ?? 'Lieu', count }))
    .sort((a, b) => b.count - a.count);

  // --- Aliments référencés (nom curé + icône) ---
  const foodInfo = new Map<string, { name: string; external: string | null }>();
  const foodIds = [...new Set(evts.map((e) => e.food_id).filter((x): x is string => !!x))];
  if (foodIds.length > 0) {
    const foods = (unwrap(await db.from('food').select('id, name, external_id').in('id', foodIds)) ?? []) as Array<{
      id: string;
      name: string;
      external_id: string | null;
    }>;
    foods.forEach((f) => foodInfo.set(f.id, { name: f.name, external: f.external_id }));
  }
  const displayOf = (e: EvtRow) => (e.food_id ? foodInfo.get(e.food_id)?.name ?? e.label ?? 'aliment' : e.label ?? 'aliment');
  const iconOf = (e: EvtRow) => (e.food_id ? foodInfo.get(e.food_id)?.external ?? null : null);
  const keyOf = (e: EvtRow) => e.food_id ?? `l:${(e.label ?? '').toLowerCase()}`;

  function topBy(kind: StockEventKind, n = 6): StockStatRow[] {
    const m = new Map<string, StockStatRow>();
    for (const e of evts) {
      if (e.kind !== kind) continue;
      const k = keyOf(e);
      const cur = m.get(k) ?? { foodId: e.food_id, label: displayOf(e), iconSlug: iconOf(e), count: 0 };
      cur.count++;
      m.set(k, cur);
    }
    return [...m.values()].sort((a, b) => b.count - a.count).slice(0, n);
  }

  const inCount = evts.filter((e) => e.kind === 'in').length;
  const outCount = evts.filter((e) => e.kind === 'out').length;
  const wasteCount = evts.filter((e) => e.kind === 'discard').length;
  const wasteRate = wasteCount + outCount > 0 ? wasteCount / (wasteCount + outCount) : null;

  // --- Durée de vie en stock ---
  // Pour chaque SORTIE ('out' consommé / 'discard' jeté), on mesure l'âge depuis la
  // DERNIÈRE ENTRÉE du même aliment → « combien de jours il a tenu avant d'être terminé
  // ou jeté ». Les RETRAITS (« retirer ») ne sont pas journalisés → naturellement exclus.
  const sorted = [...evts].sort((a, b) => (a.occurred_at < b.occurred_at ? -1 : a.occurred_at > b.occurred_at ? 1 : 0));
  const byFoodSorted = new Map<string, EvtRow[]>();
  for (const e of sorted) {
    const k = keyOf(e);
    const arr = byFoodSorted.get(k);
    if (arr) arr.push(e);
    else byFoodSorted.set(k, [e]);
  }
  interface Life { foodId: string | null; label: string; iconSlug: string | null; days: number[] }
  const lives = new Map<string, Life>();
  for (const [k, list] of byFoodSorted) {
    let lastIn: number | null = null;
    for (const e of list) {
      const t = new Date(e.occurred_at).getTime();
      if (e.kind === 'in') lastIn = t;
      else if ((e.kind === 'out' || e.kind === 'discard') && lastIn != null) {
        const d = (t - lastIn) / 86_400_000;
        if (d >= 0 && d <= 365) {
          const cur = lives.get(k) ?? { foodId: e.food_id, label: displayOf(e), iconSlug: iconOf(e), days: [] };
          cur.days.push(d);
          lives.set(k, cur);
        }
      }
    }
  }
  const allDays = [...lives.values()].flatMap((l) => l.days);
  const avgShelfLifeDays = allDays.length > 0 ? allDays.reduce((a, b) => a + b, 0) / allDays.length : null;
  const shelfLife: ShelfLifeRow[] = [...lives.values()]
    .map((l) => ({
      foodId: l.foodId,
      label: l.label,
      iconSlug: l.iconSlug,
      avgDays: l.days.reduce((a, b) => a + b, 0) / l.days.length,
      samples: l.days.length,
    }))
    .sort((a, b) => a.avgDays - b.avgDays);

  const recent: StockMove[] = evts.slice(0, 15).map((e) => ({
    label: displayOf(e),
    foodId: e.food_id,
    iconSlug: iconOf(e),
    kind: e.kind,
    quantity: e.quantity,
    unit: e.unit,
    occurredAt: e.occurred_at,
  }));

  return {
    inStock,
    dueSoon,
    expired,
    byLocation,
    totalMoves: evts.length,
    inCount,
    outCount,
    wasteCount,
    wasteRate,
    avgShelfLifeDays,
    shelfLife,
    topStocked: topBy('in'),
    topConsumed: topBy('out'),
    topDiscarded: topBy('discard'),
    recent,
  };
}
