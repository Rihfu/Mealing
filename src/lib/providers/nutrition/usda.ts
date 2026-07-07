import { serverEnv } from '@/lib/env.server';
import type { FoodDetail, FoodSummary, NutrientAmount, NutritionProvider } from './types';

/**
 * Fournisseur USDA FoodData Central — aliments bruts (légumes, viande, poisson…).
 * Doc API : https://fdc.nal.usda.gov/api-guide.html
 *
 * Mapping numéro de nutriment USDA -> code de notre référentiel nutrient_type.
 * Ce mapping est LOCAL au fournisseur (principe n°5) : le référentiel en base
 * reste agnostique de la source.
 */
const USDA_API_BASE = 'https://api.nal.usda.gov/fdc/v1';

const USDA_NUTRIENT_MAP: Record<string, string> = {
  '208': 'energy_kcal', // Energy (kcal)
  '203': 'protein',
  '204': 'fat',
  '205': 'carbs', // Carbohydrate, by difference
  '269': 'sugars', // Sugars, total
  '291': 'fiber', // Fiber, total dietary
  '307': 'sodium', // Sodium, Na (mg)
  '303': 'iron', // Iron, Fe (mg)
  '301': 'calcium', // Calcium, Ca (mg)
  '328': 'vitamin_d', // Vitamin D (D2 + D3) (µg)
  '418': 'vitamin_b12', // Vitamin B-12 (µg)
  '304': 'magnesium', // Magnesium, Mg (mg)
  '309': 'zinc', // Zinc, Zn (mg)
  // Longue traîne (nutriments étendus is_base=false, migration 0035)
  '306': 'potassium', // Potassium, K (mg)
  '401': 'vitamin_c', // Vitamin C (mg)
  '323': 'vitamin_e', // Vitamin E, alpha-tocopherol (mg)
  '430': 'vitamin_k', // Vitamin K, phylloquinone (µg)
  '320': 'vitamin_a', // Vitamin A, RAE (µg)
  '415': 'vitamin_b6', // Vitamin B-6 (mg)
  '417': 'folate', // Folate, total (µg)
  '317': 'selenium', // Selenium, Se (µg)
  '314': 'iodine', // Iodine, I (µg)
  '312': 'copper', // Copper, Cu (mg)
  '315': 'manganese', // Manganese, Mn (mg)
  '305': 'phosphorus', // Phosphorus, P (mg)
  '606': 'saturated_fat', // Fatty acids, total saturated (g)
  '601': 'cholesterol', // Cholesterol (mg)
};

/** Normalise les unités USDA ('KCAL','G','MG','UG') vers les nôtres. */
function normalizeUnit(usdaUnit: string | undefined): string {
  switch ((usdaUnit ?? '').toUpperCase()) {
    case 'KCAL':
      return 'kcal';
    case 'G':
      return 'g';
    case 'MG':
      return 'mg';
    case 'UG':
    case 'µG':
      return 'µg';
    default:
      return (usdaUnit ?? '').toLowerCase();
  }
}

async function usdaFetch(path: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(`${USDA_API_BASE}${path}`);
  url.searchParams.set('api_key', serverEnv.USDA_API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`USDA FoodData Central a répondu ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export const usdaProvider: NutritionProvider = {
  source: 'usda',

  async searchByName(query, options) {
    const data = (await usdaFetch('/foods/search', {
      query,
      pageSize: String(options?.limit ?? 10),
    })) as { foods?: Array<{ fdcId: number; description: string; brandName?: string }> };

    return (data.foods ?? []).map<FoodSummary>((f) => ({
      source: 'usda',
      externalId: String(f.fdcId),
      name: f.description,
      brand: f.brandName,
    }));
  },

  async getByExternalId(externalId) {
    const data = (await usdaFetch(`/food/${encodeURIComponent(externalId)}`, {})) as {
      fdcId?: number;
      description?: string;
      foodNutrients?: Array<{
        amount?: number;
        nutrient?: { number?: string; unitName?: string };
      }>;
    } | null;

    if (!data || !data.fdcId) return null;

    const nutrients: NutrientAmount[] = [];
    for (const fn of data.foodNutrients ?? []) {
      const number = fn.nutrient?.number;
      const code = number ? USDA_NUTRIENT_MAP[number] : undefined;
      if (!code || typeof fn.amount !== 'number') continue;
      nutrients.push({ code, amount: fn.amount, unit: normalizeUnit(fn.nutrient?.unitName) });
    }

    return {
      source: 'usda',
      externalId: String(data.fdcId),
      name: data.description ?? '',
      baseAmount: 100, // USDA : valeurs pour 100 g
      baseUnit: 'g',
      nutrients,
    } satisfies FoodDetail;
  },
};
