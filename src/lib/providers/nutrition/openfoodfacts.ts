import type {
  BarcodeNutritionProvider,
  FoodDetail,
  FoodSummary,
  NutrientAmount,
} from './types';

/**
 * Fournisseur Open Food Facts — produits emballés (scan de code-barres).
 * API publique, sans clé. Doc : https://openfoodfacts.github.io/openfoodfacts-server/api/
 *
 * Open Food Facts exprime les valeurs pour 100 g sous des clés `*_100g`, le plus
 * souvent en grammes. On convertit vers les unités de notre référentiel.
 * La couverture des micronutriments y est partielle : on n'inclut que ce qui existe.
 */
const OFF_BASE = 'https://world.openfoodfacts.org';
const USER_AGENT = 'Mealing/0.1 (https://github.com/wrasamoelina/Mealing)';

interface OffNutrientMapEntry {
  /** Clé OFF dans l'objet `nutriments`, sans le suffixe `_100g`. */
  offKey: string;
  /** Code de notre nutrient_type. */
  code: string;
  /** Multiplicateur pour passer de l'unité OFF à la nôtre. */
  factor: number;
  unit: string;
}

const OFF_NUTRIENT_MAP: OffNutrientMapEntry[] = [
  { offKey: 'energy-kcal', code: 'energy_kcal', factor: 1, unit: 'kcal' },
  { offKey: 'proteins', code: 'protein', factor: 1, unit: 'g' },
  { offKey: 'fat', code: 'fat', factor: 1, unit: 'g' },
  { offKey: 'carbohydrates', code: 'carbs', factor: 1, unit: 'g' },
  { offKey: 'sugars', code: 'sugars', factor: 1, unit: 'g' },
  { offKey: 'fiber', code: 'fiber', factor: 1, unit: 'g' },
  { offKey: 'sodium', code: 'sodium', factor: 1000, unit: 'mg' }, // OFF en g -> mg
  { offKey: 'iron', code: 'iron', factor: 1000, unit: 'mg' }, // OFF en g -> mg
  { offKey: 'calcium', code: 'calcium', factor: 1000, unit: 'mg' }, // OFF en g -> mg
  { offKey: 'vitamin-d', code: 'vitamin_d', factor: 1_000_000, unit: 'µg' }, // OFF en g -> µg
  { offKey: 'vitamin-b12', code: 'vitamin_b12', factor: 1_000_000, unit: 'µg' }, // OFF en g -> µg
];

interface OffProduct {
  code?: string;
  product_name?: string;
  brands?: string;
  nutriments?: Record<string, number | string | undefined>;
}

function toNutrients(nutriments: OffProduct['nutriments']): NutrientAmount[] {
  if (!nutriments) return [];
  const out: NutrientAmount[] = [];
  for (const entry of OFF_NUTRIENT_MAP) {
    const raw = nutriments[`${entry.offKey}_100g`];
    const value = typeof raw === 'string' ? Number(raw) : raw;
    if (typeof value !== 'number' || Number.isNaN(value)) continue;
    out.push({ code: entry.code, amount: value * entry.factor, unit: entry.unit });
  }
  return out;
}

function toDetail(product: OffProduct): FoodDetail | null {
  if (!product.code) return null;
  return {
    source: 'openfoodfacts',
    externalId: product.code,
    barcode: product.code,
    name: product.product_name ?? '',
    brand: product.brands,
    baseAmount: 100,
    baseUnit: 'g',
    nutrients: toNutrients(product.nutriments),
  };
}

async function offFetch(url: URL): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`Open Food Facts a répondu ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export const openFoodFactsProvider: BarcodeNutritionProvider = {
  source: 'openfoodfacts',

  async searchByName(query, options) {
    const url = new URL(`${OFF_BASE}/cgi/search.pl`);
    url.searchParams.set('search_terms', query);
    url.searchParams.set('search_simple', '1');
    url.searchParams.set('action', 'process');
    url.searchParams.set('json', '1');
    url.searchParams.set('page_size', String(options?.limit ?? 10));
    url.searchParams.set('fields', 'code,product_name,brands');

    const data = (await offFetch(url)) as { products?: OffProduct[] };
    return (data.products ?? [])
      .filter((p) => p.code)
      .map<FoodSummary>((p) => ({
        source: 'openfoodfacts',
        externalId: p.code as string,
        barcode: p.code,
        name: p.product_name ?? '',
        brand: p.brands,
      }));
  },

  async getByExternalId(externalId) {
    return this.getByBarcode(externalId);
  },

  async getByBarcode(barcode) {
    const url = new URL(`${OFF_BASE}/api/v2/product/${encodeURIComponent(barcode)}.json`);
    url.searchParams.set('fields', 'code,product_name,brands,nutriments');

    const data = (await offFetch(url)) as { status?: number; product?: OffProduct };
    if (data.status !== 1 || !data.product) return null;
    return toDetail(data.product);
  },
};
