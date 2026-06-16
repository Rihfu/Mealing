import { usdaProvider } from './usda';
import { openFoodFactsProvider } from './openfoodfacts';
import type { FoodSummary, NutritionProvider, NutritionSource } from './types';

export * from './types';
export { usdaProvider } from './usda';
export { openFoodFactsProvider } from './openfoodfacts';

/** Registre des fournisseurs nutritionnels configurés. */
export const nutritionProviders: Record<NutritionSource, NutritionProvider> = {
  usda: usdaProvider,
  openfoodfacts: openFoodFactsProvider,
};

export function getNutritionProvider(source: NutritionSource): NutritionProvider {
  return nutritionProviders[source];
}

/**
 * Recherche agrégée multi-sources. Par défaut : USDA pour les aliments bruts,
 * Open Food Facts pour les produits emballés. Les erreurs d'une source ne font
 * pas échouer l'autre.
 */
export async function searchAllSources(
  query: string,
  options?: { limit?: number },
): Promise<FoodSummary[]> {
  const results = await Promise.allSettled([
    usdaProvider.searchByName(query, options),
    openFoodFactsProvider.searchByName(query, options),
  ]);

  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}
