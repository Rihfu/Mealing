import type { DB } from './types';
import { unwrap } from './types';
import { computeRecipeNutrition } from './recipes';
import { loadRecipeStockScores } from './shopping';
import { mapLimit } from '@/lib/async';

/**
 * N3 Nutrition — boucle ACTIONNABLE : d'un constat (« un peu en dessous en
 * protéines », « 0/2 poisson gras ») vers une action en 1 clic (« le dahl de
 * lentilles apporte +18 g/portion — planifie-le »).
 *
 * Tout est DÉRIVÉ : nutrition des recettes = base (n°3), réalisabilité = stock
 * (loadRecipeStockScores), habitudes = tags du catalogue. Aucune invention.
 */

export interface RecipeSuggestion {
  id: string;
  name: string;
  /** Apport par portion du nutriment visé (suggestion « gap »). */
  amountPerServing?: number;
  /** Aliments taggés contenus (suggestion « habitude »). */
  matchedFoods?: string[];
  /** Réalisable avec le stock actuel (0-100). */
  stockPct: number;
}

/** Recettes du foyer les plus riches en un nutriment (par portion), stock annoté. */
export async function suggestRecipesForNutrient(
  db: DB,
  params: { householdId: string; nutrientCode: string; limit?: number },
): Promise<RecipeSuggestion[]> {
  const limit = params.limit ?? 3;
  const [recipesRes, scores] = await Promise.all([
    db.from('recipe').select('id, name'),
    loadRecipeStockScores(db, params.householdId),
  ]);
  const recipes = (unwrap(recipesRes) ?? []) as Array<{ id: string; name: string }>;
  if (recipes.length === 0) return [];

  // Nutrition par recette (bornée en concurrence — chaque calcul = 4 requêtes batchées).
  const nutritions = await mapLimit(recipes, 4, async (r) => ({
    recipe: r,
    amount: (await computeRecipeNutrition(db, r.id)).perServing[params.nutrientCode] ?? 0,
  }));

  return nutritions
    .filter((n) => n.amount > 0)
    .sort(
      (a, b) =>
        b.amount - a.amount ||
        (scores.get(b.recipe.id) ?? 0) - (scores.get(a.recipe.id) ?? 0) ||
        a.recipe.name.localeCompare(b.recipe.name),
    )
    .slice(0, limit)
    .map((n) => ({
      id: n.recipe.id,
      name: n.recipe.name,
      amountPerServing: Math.round(n.amount * 10) / 10,
      stockPct: Math.round((scores.get(n.recipe.id) ?? 0) * 100),
    }));
}

/** Recettes du foyer contenant ≥ 1 aliment taggé (ou explicitement listé) — pour une habitude. */
export async function suggestRecipesForHabit(
  db: DB,
  params: { householdId: string; matchTags: string[]; matchFoodIds?: string[]; limit?: number },
): Promise<RecipeSuggestion[]> {
  const limit = params.limit ?? 3;
  const explicit = new Set(params.matchFoodIds ?? []);

  // Aliments correspondant aux tags de l'habitude.
  const taggedFoodIds = new Set<string>(explicit);
  if (params.matchTags.length > 0) {
    const tagRows = (unwrap(await db.from('food_tag').select('food_id').in('tag', params.matchTags)) ?? []) as Array<{
      food_id: string;
    }>;
    for (const t of tagRows) taggedFoodIds.add(t.food_id);
  }
  if (taggedFoodIds.size === 0) return [];

  const ings = (unwrap(
    await db
      .from('recipe_ingredient')
      .select('recipe_id, food_id')
      .in('food_id', Array.from(taggedFoodIds)),
  ) ?? []) as Array<{ recipe_id: string; food_id: string }>;
  if (ings.length === 0) return [];

  const recipeIds = Array.from(new Set(ings.map((i) => i.recipe_id)));
  const [recipesRes, foodsRes, scores] = await Promise.all([
    db.from('recipe').select('id, name').in('id', recipeIds),
    db.from('food').select('id, name').in('id', Array.from(new Set(ings.map((i) => i.food_id)))),
    loadRecipeStockScores(db, params.householdId),
  ]);
  const foodName = new Map(((unwrap(foodsRes) ?? []) as Array<{ id: string; name: string }>).map((f) => [f.id, f.name]));
  const foodsByRecipe = new Map<string, string[]>();
  for (const i of ings) {
    const list = foodsByRecipe.get(i.recipe_id) ?? [];
    const nm = foodName.get(i.food_id);
    if (nm && !list.includes(nm)) list.push(nm);
    foodsByRecipe.set(i.recipe_id, list);
  }

  return ((unwrap(recipesRes) ?? []) as Array<{ id: string; name: string }>)
    .map((r) => ({
      id: r.id,
      name: r.name,
      matchedFoods: foodsByRecipe.get(r.id) ?? [],
      stockPct: Math.round((scores.get(r.id) ?? 0) * 100),
    }))
    .sort((a, b) => b.stockPct - a.stockPct || a.name.localeCompare(b.name))
    .slice(0, limit);
}
