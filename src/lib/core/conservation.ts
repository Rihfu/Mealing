import type { DB } from './types';
import { unwrap } from './types';
import { isoDate } from '@/lib/dates';
import { storageDef } from './storage';
import { estimateConservationDays, type ConservationDays } from '@/lib/ai/product-conservation';

export interface StockExpiry {
  id: string;
  foodId: string | null; // aliment de catalogue lié (→ fiche produit), si présent
  name: string;
  opened: boolean;
  storageLocation: string | null; // lieu (clé prédéfinie ou uuid custom), null = non rangé
  category: string | null; // rayon de la règle curée (repli d'affichage), si présent
  expiry: string | null; // date ISO estimée, ou null si rien d'applicable
  daysRemaining: number | null; // jours avant péremption (négatif = dépassé)
  /** Provenance de la date : 'printed' (DLC saisie) · 'estimate' (IA par lieu) · 'rule' (table curée). */
  expirySource: 'printed' | 'estimate' | 'rule' | null;
}

interface Rule {
  food_category: string;
  unopened_days: number | null;
  opened_days: number | null;
}

function first<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

/** Nombre de jours (date à date, minuit local) entre aujourd'hui et la cible. */
function daysFromToday(target: Date): number {
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const startTarget = new Date(target);
  startTarget.setHours(0, 0, 0, 0);
  return Math.round((startTarget.getTime() - startToday.getTime()) / 86_400_000);
}

/**
 * Conservation INTELLIGENTE en cache (table `food_conservation`, référence globale) :
 * si l'aliment n'a pas encore d'estimation, on l'estime UNE FOIS (IA, jours par lieu) et
 * on la persiste. Best-effort. À appeler hors du rendu (sur ajout au stock / action
 * « estimer »), JAMAIS dans `getStockWithExpiry` (qui ne lit que le cache).
 */
export async function ensureFoodConservation(
  db: DB,
  foodId: string,
  name: string,
  category?: string | null,
): Promise<ConservationDays | null> {
  const existing = (unwrap(
    await db.from('food_conservation').select('days').eq('food_id', foodId).maybeSingle(),
  ) ?? null) as { days: ConservationDays } | null;
  if (existing?.days && Object.keys(existing.days).length > 0) return existing.days;

  const days = await estimateConservationDays(name, category);
  if (days && Object.keys(days).length > 0) {
    await db
      .from('food_conservation')
      .upsert({ food_id: foodId, days, updated_at: new Date().toISOString() }, { onConflict: 'food_id' });
  }
  return days;
}

/** Estime (best-effort) la conservation des aliments du stock qui n'en ont pas encore.
 *  Deux requêtes simples (stock → food_ids, puis food) : robuste et lisible. */
export async function ensureStockConservation(db: DB, householdId: string): Promise<number> {
  const stockRows = (unwrap(await db.from('stock').select('food_id').eq('household_id', householdId)) ?? []) as Array<{
    food_id: string | null;
  }>;
  const foodIds = Array.from(new Set(stockRows.map((r) => r.food_id).filter((x): x is string => !!x)));
  if (foodIds.length === 0) return 0;

  const foods = (unwrap(await db.from('food').select('id, name, category').in('id', foodIds)) ?? []) as Array<{
    id: string;
    name: string;
    category: string | null;
  }>;
  const results = await Promise.all(
    foods.map((f) => ensureFoodConservation(db, f.id, f.name, f.category).catch(() => null)),
  );
  return results.filter((r) => r != null).length;
}

/** Durée applicable (jours) d'une estimation, selon le lieu et l'état entamé/non. */
function estimatedDays(days: ConservationDays | undefined, locationKey: string | null, opened: boolean): number | null {
  const basis = storageDef(locationKey)?.conservationBasis; // placard | frigo | congelateur | undefined (custom/inconnu)
  if (!basis || !days) return null;
  const b = days[basis];
  if (!b) return null;
  return opened ? (b.opened ?? b.unopened) : b.unopened;
}

/**
 * Estime la péremption de chaque article de stock (specs §9) — AUCUN appel IA ici.
 * Priorité : DLC imprimée (`printed_expiry`, saisie/scannée) > estimation IA en cache
 * (par LIEU + entamé/non, comptée depuis l'ouverture ou l'ajout) > règle curée (repli).
 * Résultat trié par péremption croissante (sans estimation en dernier).
 */
export async function getStockWithExpiry(db: DB, householdId: string): Promise<StockExpiry[]> {
  const rows = (unwrap(
    await db
      .from('stock')
      .select(
        'id, label, date_ouverture, created_at, printed_expiry, storage_location, food_id, food:food_id(name), conservation_rule:conservation_rule_id(food_category, unopened_days, opened_days)',
      )
      .eq('household_id', householdId),
  ) ?? []) as Array<{
    id: string;
    label: string | null;
    date_ouverture: string | null;
    created_at: string;
    printed_expiry: string | null;
    storage_location: string | null;
    food_id: string | null;
    food: { name: string } | { name: string }[] | null;
    conservation_rule: Rule | Rule[] | null;
  }>;

  // Cache de conservation pour les aliments présents (lecture seule, pas d'IA).
  const foodIds = Array.from(new Set(rows.map((r) => r.food_id).filter((x): x is string => !!x)));
  const consById = new Map<string, ConservationDays>();
  if (foodIds.length > 0) {
    const cons = (unwrap(await db.from('food_conservation').select('food_id, days').in('food_id', foodIds)) ?? []) as Array<{
      food_id: string;
      days: ConservationDays;
    }>;
    cons.forEach((c) => consById.set(c.food_id, c.days));
  }

  const result: StockExpiry[] = rows.map((r) => {
    const food = first(r.food);
    const rule = first(r.conservation_rule);
    const opened = r.date_ouverture != null;

    let expiryDate: Date | null = null;
    let source: StockExpiry['expirySource'] = null;

    if (r.printed_expiry) {
      // 1) DLC imprimée — fait foi.
      expiryDate = new Date(r.printed_expiry);
      source = 'printed';
    } else {
      // 2) estimation IA en cache, par lieu + entamé/non.
      const d = estimatedDays(r.food_id ? consById.get(r.food_id) : undefined, r.storage_location, opened);
      if (d != null) {
        const start = opened ? new Date(r.date_ouverture as string) : new Date(r.created_at);
        expiryDate = addDays(start, d);
        source = 'estimate';
      } else if (rule) {
        // 3) règle curée (repli).
        if (opened && rule.opened_days != null) expiryDate = addDays(new Date(r.date_ouverture as string), rule.opened_days);
        else if (rule.unopened_days != null) expiryDate = addDays(new Date(r.created_at), rule.unopened_days);
        else if (rule.opened_days != null) expiryDate = addDays(new Date(r.date_ouverture ?? r.created_at), rule.opened_days);
        if (expiryDate) source = 'rule';
      }
    }

    return {
      id: r.id,
      foodId: r.food_id,
      name: food?.name ?? r.label ?? '(article)',
      opened,
      storageLocation: r.storage_location,
      category: rule?.food_category ?? null,
      expiry: expiryDate ? isoDate(expiryDate) : null,
      daysRemaining: expiryDate ? daysFromToday(expiryDate) : null,
      expirySource: source,
    };
  });

  result.sort((a, b) => {
    if (a.daysRemaining == null && b.daysRemaining == null) return 0;
    if (a.daysRemaining == null) return 1;
    if (b.daysRemaining == null) return -1;
    return a.daysRemaining - b.daysRemaining;
  });

  return result;
}
