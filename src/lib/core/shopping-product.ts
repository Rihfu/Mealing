import type { DB } from './types';
import { unwrap } from './types';

/**
 * Fiche produit : statistiques d'UN aliment (par food_id) dérivées de l'historique
 * des courses (prix payés, fréquence d'achat, habitudes). Lecture seule, limité aux
 * courses. La nutrition (fournisseur) et la conservation (FoodKeeper) sont chargées
 * à part par la page ; les conseils IA sont à la demande.
 */

const DAY = 86_400_000;

export interface PricePoint {
  date: string; // ISO
  price: number;
}

export interface ProductDetail {
  foodId: string;
  name: string;
  category: string | null; // clé de rayon
  iconSlug: string | null; // external_id ('cat:<slug>') pour ProductIcon
  // habitudes
  count: number;
  firstPurchasedAt: string | null;
  lastPurchasedAt: string | null;
  daysSinceLast: number | null;
  medianIntervalDays: number | null;
  dueInDays: number | null;
  avgQuantity: number | null;
  unit: string | null;
  provenance: { repas: number; essentiel: number; manual: number; total: number };
  // prix
  priceHistory: PricePoint[];
  lastPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  avgPrice: number | null;
}

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Fiche d'un aliment de catalogue : prix + habitudes depuis l'historique du foyer. */
export async function computeProductStats(
  db: DB,
  householdId: string,
  foodId: string,
): Promise<ProductDetail | null> {
  const { data: food } = await db
    .from('food')
    .select('id, name, category, external_id')
    .eq('id', foodId)
    .maybeSingle();
  if (!food) return null;

  const rows = (unwrap(
    await db
      .from('shopping_trip_item')
      .select('quantity, unit, price, source, shopping_trip!inner(household_id, purchased_at)')
      .eq('food_id', foodId)
      .eq('shopping_trip.household_id', householdId),
  ) ?? []) as Array<{
    quantity: number | null;
    unit: string | null;
    price: number | null;
    source: string | null;
    shopping_trip: { purchased_at: string } | { purchased_at: string }[] | null;
  }>;

  const provenance = { repas: 0, essentiel: 0, manual: 0, total: 0 };
  const dates: number[] = [];
  const qtys: number[] = [];
  const prices: number[] = [];
  const priceHistory: PricePoint[] = [];
  let unit: string | null = null;

  for (const r of rows) {
    const trip = Array.isArray(r.shopping_trip) ? r.shopping_trip[0] : r.shopping_trip;
    const at = trip?.purchased_at ?? null;
    if (at) dates.push(new Date(at).getTime());
    if (r.source === 'recipe') provenance.repas++;
    else if (r.source === 'recurring') provenance.essentiel++;
    else provenance.manual++;
    provenance.total++;
    if (r.quantity != null) qtys.push(r.quantity);
    if (!unit && r.unit) unit = r.unit;
    if (r.price != null && at) {
      prices.push(r.price);
      priceHistory.push({ date: at, price: r.price });
    }
  }

  dates.sort((a, b) => a - b);
  priceHistory.sort((a, b) => a.date.localeCompare(b.date));

  const uniqDays = [...new Set(dates.map((d) => Math.floor(d / DAY)))].sort((a, b) => a - b);
  const intervals: number[] = [];
  for (let i = 1; i < uniqDays.length; i++) intervals.push(uniqDays[i] - uniqDays[i - 1]);
  const med = median(intervals);
  const now = Date.now();
  const lastMs = dates.length ? dates[dates.length - 1] : null;
  const dueInDays = med != null && lastMs != null ? Math.round((lastMs + med * DAY - now) / DAY) : null;
  const round2 = (n: number) => Math.round(n * 100) / 100;

  return {
    foodId: food.id,
    name: food.name,
    category: food.category,
    iconSlug: food.external_id,
    count: uniqDays.length,
    firstPurchasedAt: dates.length ? new Date(dates[0]).toISOString() : null,
    lastPurchasedAt: lastMs != null ? new Date(lastMs).toISOString() : null,
    daysSinceLast: lastMs != null ? Math.floor((now - lastMs) / DAY) : null,
    medianIntervalDays: med,
    dueInDays,
    avgQuantity: qtys.length ? round2(qtys.reduce((a, b) => a + b, 0) / qtys.length) : null,
    unit,
    provenance,
    priceHistory,
    lastPrice: prices.length ? priceHistory[priceHistory.length - 1].price : null,
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
    avgPrice: prices.length ? round2(prices.reduce((a, b) => a + b, 0) / prices.length) : null,
  };
}
