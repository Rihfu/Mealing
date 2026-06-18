import type { DB } from './types';
import { unwrap } from './types';
import { normalizeLabel } from '@/lib/text';

/**
 * Statistiques de l'historique des courses (lecture seule, dérivées des relevés
 * de la fenêtre de rétention — cf. shopping-history). LIMITÉES AUX COURSES : aucune
 * donnée de stock. Les stats de dépenses ne sont calculées que si des prix existent.
 * Tout est approximatif (principe « précision approximative assumée »).
 */

const DAY = 86_400_000;

export interface ProductStat {
  key: string; // food_id ou libellé normalisé (identité produit)
  label: string;
  foodId: string | null;
  iconSlug: string | null;
  unit: string | null;
  count: number; // nombre de relevés (dates) où le produit apparaît
  lastPurchasedAt: string;
  medianIntervalDays: number | null; // intervalle médian de rachat (≥ 2 achats)
  dueInDays: number | null; // jours avant rachat estimé (négatif = en retard)
  avgQuantity: number | null;
}

export interface RayonStat {
  key: string; // clé de rayon (intégrée ou uuid custom)
  count: number;
  spend: number | null; // dépense cumulée si des prix existent
}

export interface WeekBucket {
  start: string; // ISO (lundi de la semaine)
  label: string; // « 16 juin »
  trips: number;
}

export interface ShoppingStats {
  totalTrips: number;
  totalItems: number;
  firstPurchasedAt: string | null;
  lastPurchasedAt: string | null;
  daysSinceLast: number | null;
  avgDaysBetween: number | null;
  tripsPerWeek: number | null;
  avgItemsPerTrip: number | null;
  basketSeries: number[]; // nb d'articles par relevé (chronologique) — sparkline
  topProducts: ProductStat[];
  rayons: RayonStat[];
  provenance: { repas: number; essentiel: number; manual: number; total: number };
  dueSoon: ProductStat[];
  weeks: WeekBucket[];
  oneShots: ProductStat[];
  // Dépenses (uniquement si des prix sont saisis) :
  hasPrices: boolean;
  totalSpend: number | null;
  avgBasketSpend: number | null;
  spendByRayon: RayonStat[];
}

type TripRow = {
  id: string;
  purchased_at: string;
  shopping_trip_item: Array<{
    label: string;
    quantity: number | null;
    unit: string | null;
    price: number | null;
    category_key: string | null;
    food_id: string | null;
    icon_slug: string | null;
    source: string | null;
  }> | null;
};

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const startOfWeek = (d: Date): Date => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7; // lundi = 0
  x.setDate(x.getDate() - day);
  return x;
};

const WEEK_FMT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

/** Calcule les statistiques de courses d'un foyer sur la fenêtre de rétention. */
export async function computeShoppingStats(db: DB, householdId: string): Promise<ShoppingStats> {
  const trips = (unwrap(
    await db
      .from('shopping_trip')
      .select('id, purchased_at, shopping_trip_item(label, quantity, unit, price, category_key, food_id, icon_slug, source)')
      .eq('household_id', householdId)
      .order('purchased_at', { ascending: true }),
  ) ?? []) as TripRow[];

  const empty: ShoppingStats = {
    totalTrips: 0, totalItems: 0, firstPurchasedAt: null, lastPurchasedAt: null, daysSinceLast: null,
    avgDaysBetween: null, tripsPerWeek: null, avgItemsPerTrip: null, basketSeries: [],
    topProducts: [], rayons: [], provenance: { repas: 0, essentiel: 0, manual: 0, total: 0 },
    dueSoon: [], weeks: [], oneShots: [], hasPrices: false, totalSpend: null,
    avgBasketSpend: null, spendByRayon: [],
  };
  if (trips.length === 0) return empty;

  const dates = trips.map((t) => new Date(t.purchased_at).getTime());
  const firstAt = trips[0].purchased_at;
  const lastAt = trips[trips.length - 1].purchased_at;

  // Cadence : intervalle moyen entre relevés + courses/semaine.
  let avgDaysBetween: number | null = null;
  if (trips.length >= 2) {
    let sum = 0;
    for (let i = 1; i < dates.length; i++) sum += (dates[i] - dates[i - 1]) / DAY;
    avgDaysBetween = sum / (dates.length - 1);
  }
  const spanDays = Math.max((dates[dates.length - 1] - dates[0]) / DAY, 0);
  const tripsPerWeek = spanDays > 0 ? (trips.length / spanDays) * 7 : null;

  // Panier + provenance + prix + agrégats produit/rayon.
  const basketSeries: number[] = [];
  const provenance = { repas: 0, essentiel: 0, manual: 0, total: 0 };
  const rayonMap = new Map<string, { count: number; spend: number }>();
  const products = new Map<string, {
    label: string; foodId: string | null; iconSlug: string | null; unit: string | null;
    dates: number[]; qtys: number[];
  }>();
  let totalItems = 0;
  let totalSpend = 0;
  let hasPrices = false;
  let tripsWithPrice = 0;

  for (const t of trips) {
    const items = t.shopping_trip_item ?? [];
    basketSeries.push(items.length);
    totalItems += items.length;
    const ts = new Date(t.purchased_at).getTime();
    let tripSpend = 0;
    let tripHasPrice = false;

    for (const it of items) {
      // Provenance
      if (it.source === 'recipe') provenance.repas++;
      else if (it.source === 'recurring') provenance.essentiel++;
      else provenance.manual++;
      provenance.total++;

      // Rayon (count + dépense)
      const rk = it.category_key ?? '__other__';
      const r = rayonMap.get(rk) ?? { count: 0, spend: 0 };
      r.count++;
      if (it.price != null) r.spend += it.price;
      rayonMap.set(rk, r);

      // Dépense
      if (it.price != null) {
        hasPrices = true;
        tripHasPrice = true;
        tripSpend += it.price;
        totalSpend += it.price;
      }

      // Identité produit
      const key = it.food_id ?? `l:${normalizeLabel(it.label)}`;
      const p = products.get(key) ?? { label: it.label, foodId: it.food_id, iconSlug: it.icon_slug, unit: it.unit, dates: [], qtys: [] };
      p.label = it.label; // dernier libellé connu
      if (it.icon_slug) p.iconSlug = it.icon_slug;
      p.dates.push(ts);
      if (it.quantity != null) p.qtys.push(it.quantity);
      products.set(key, p);
    }
    if (tripHasPrice) tripsWithPrice++;
    void tripSpend;
  }

  // Produits → stats (fréquence de rachat, quantité moyenne).
  const now = Date.now();
  const productStats: ProductStat[] = [...products.entries()].map(([key, p]) => {
    const uniqDays = [...new Set(p.dates.map((d) => Math.floor(d / DAY)))].sort((a, b) => a - b);
    const intervals: number[] = [];
    for (let i = 1; i < uniqDays.length; i++) intervals.push(uniqDays[i] - uniqDays[i - 1]);
    const med = median(intervals);
    const lastMs = Math.max(...p.dates);
    const dueInDays = med != null ? Math.round((lastMs + med * DAY - now) / DAY) : null;
    return {
      key,
      label: p.label,
      foodId: p.foodId,
      iconSlug: p.iconSlug,
      unit: p.unit,
      count: uniqDays.length,
      lastPurchasedAt: new Date(lastMs).toISOString(),
      medianIntervalDays: med,
      dueInDays,
      avgQuantity: p.qtys.length ? Math.round((p.qtys.reduce((a, b) => a + b, 0) / p.qtys.length) * 100) / 100 : null,
    };
  });

  const topProducts = [...productStats].sort((a, b) => b.count - a.count || b.lastPurchasedAt.localeCompare(a.lastPurchasedAt)).slice(0, 8);
  const oneShots = productStats.filter((p) => p.count === 1).sort((a, b) => b.lastPurchasedAt.localeCompare(a.lastPurchasedAt)).slice(0, 12);
  // « À racheter bientôt » : rachat récurrent (≥ 2 achats) dont l'échéance estimée approche / est dépassée.
  const dueSoon = productStats
    .filter((p) => p.medianIntervalDays != null && p.count >= 2 && p.dueInDays != null && p.dueInDays <= 3)
    .sort((a, b) => (a.dueInDays ?? 0) - (b.dueInDays ?? 0))
    .slice(0, 8);

  const rayons: RayonStat[] = [...rayonMap.entries()]
    .map(([key, v]) => ({ key, count: v.count, spend: hasPrices ? v.spend : null }))
    .sort((a, b) => b.count - a.count);
  const spendByRayon: RayonStat[] = hasPrices
    ? [...rayonMap.entries()].map(([key, v]) => ({ key, count: v.count, spend: v.spend })).filter((r) => (r.spend ?? 0) > 0).sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0))
    : [];

  // Évolution : courses par semaine (≤ 12 dernières semaines avec données).
  const weekMap = new Map<number, number>();
  for (const ms of dates) {
    const wk = startOfWeek(new Date(ms)).getTime();
    weekMap.set(wk, (weekMap.get(wk) ?? 0) + 1);
  }
  const weeks: WeekBucket[] = [...weekMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(-12)
    .map(([ms, n]) => ({ start: new Date(ms).toISOString(), label: WEEK_FMT.format(new Date(ms)), trips: n }));

  return {
    totalTrips: trips.length,
    totalItems,
    firstPurchasedAt: firstAt,
    lastPurchasedAt: lastAt,
    daysSinceLast: Math.floor((now - dates[dates.length - 1]) / DAY),
    avgDaysBetween,
    tripsPerWeek,
    avgItemsPerTrip: Math.round((totalItems / trips.length) * 10) / 10,
    basketSeries,
    topProducts,
    rayons,
    provenance,
    dueSoon,
    weeks,
    oneShots,
    hasPrices,
    totalSpend: hasPrices ? Math.round(totalSpend * 100) / 100 : null,
    avgBasketSpend: hasPrices && tripsWithPrice > 0 ? Math.round((totalSpend / tripsWithPrice) * 100) / 100 : null,
    spendByRayon,
  };
}
