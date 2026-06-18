import type { DB } from './types';
import { unwrap } from './types';
import { isoDate } from '@/lib/dates';

export interface StockExpiry {
  id: string;
  name: string;
  opened: boolean;
  category: string | null;
  expiry: string | null; // date ISO estimée, ou null si aucune règle applicable
  daysRemaining: number | null; // jours avant péremption (négatif = dépassé)
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
 * Estime la péremption de chaque article de stock (specs §9) à partir d'un tri
 * déterministe simple — AUCUNE IA. La date d'ouverture (déduite automatiquement
 * à la 1re consommation) prime sur la date d'ajout si une durée après ouverture
 * existe ; sinon on se base sur la date d'ajout et la durée non-ouvert.
 *
 * Résultat trié par péremption croissante (les articles sans règle en dernier) :
 * base directe des suggestions anti-gaspillage.
 */
export async function getStockWithExpiry(
  db: DB,
  householdId: string,
): Promise<StockExpiry[]> {
  const rows = (unwrap(
    await db
      .from('stock')
      .select(
        'id, label, date_ouverture, created_at, food:food_id(name), conservation_rule:conservation_rule_id(food_category, unopened_days, opened_days)',
      )
      .eq('household_id', householdId),
  ) ?? []) as Array<{
    id: string;
    label: string | null;
    date_ouverture: string | null;
    created_at: string;
    food: { name: string } | { name: string }[] | null;
    conservation_rule: Rule | Rule[] | null;
  }>;

  const result: StockExpiry[] = rows.map((r) => {
    const food = first(r.food);
    const rule = first(r.conservation_rule);
    const opened = r.date_ouverture != null;

    let expiryDate: Date | null = null;
    if (rule) {
      if (opened && rule.opened_days != null) {
        expiryDate = addDays(new Date(r.date_ouverture as string), rule.opened_days);
      } else if (rule.unopened_days != null) {
        expiryDate = addDays(new Date(r.created_at), rule.unopened_days);
      } else if (rule.opened_days != null) {
        expiryDate = addDays(new Date(r.date_ouverture ?? r.created_at), rule.opened_days);
      }
    }

    return {
      id: r.id,
      name: food?.name ?? r.label ?? '(article)',
      opened,
      category: rule?.food_category ?? null,
      expiry: expiryDate ? isoDate(expiryDate) : null,
      daysRemaining: expiryDate ? daysFromToday(expiryDate) : null,
    };
  });

  // Tri par péremption croissante ; articles sans estimation en dernier.
  result.sort((a, b) => {
    if (a.daysRemaining == null && b.daysRemaining == null) return 0;
    if (a.daysRemaining == null) return 1;
    if (b.daysRemaining == null) return -1;
    return a.daysRemaining - b.daysRemaining;
  });

  return result;
}
