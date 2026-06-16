/**
 * Interface commune des fournisseurs de données nutritionnelles.
 *
 * Toute la logique applicative dépend de CETTE interface, jamais d'un fournisseur
 * concret (principe directeur n°5). Changer/ajouter une source (USDA, Open Food
 * Facts, future API payante) ne doit toucher que le module du fournisseur.
 *
 * Règle de fiabilité (principe n°3) : les valeurs nutritionnelles proviennent
 * TOUJOURS d'une de ces sources, jamais d'une génération par IA.
 */

export type NutritionSource = 'usda' | 'openfoodfacts';

/** Quantité d'un nutriment, exprimée avec le `code` de notre table nutrient_type. */
export interface NutrientAmount {
  /** Code de nutrient_type, ex. 'energy_kcal', 'protein', 'iron'. */
  code: string;
  amount: number;
  unit: string;
}

/** Résultat de recherche : juste de quoi identifier et choisir un aliment. */
export interface FoodSummary {
  source: NutritionSource;
  externalId: string;
  name: string;
  barcode?: string;
  brand?: string;
}

/** Détail complet d'un aliment, valeurs ramenées à `baseAmount` `baseUnit`. */
export interface FoodDetail extends FoodSummary {
  baseAmount: number; // typiquement 100
  baseUnit: string; // 'g' ou 'ml'
  nutrients: NutrientAmount[];
}

export interface NutritionProvider {
  readonly source: NutritionSource;
  searchByName(query: string, options?: { limit?: number }): Promise<FoodSummary[]>;
  getByExternalId(externalId: string): Promise<FoodDetail | null>;
}

/** Capacité additionnelle des fournisseurs basés sur le code-barres (Open Food Facts). */
export interface BarcodeNutritionProvider extends NutritionProvider {
  getByBarcode(barcode: string): Promise<FoodDetail | null>;
}
