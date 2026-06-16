import type { DB } from './types';
import { unwrap } from './types';

export interface RecipeIngredientInput {
  foodId?: string;
  freeText?: string;
  quantity?: number;
  unit?: string;
}

export interface CreateRecipeInput {
  name: string;
  description?: string;
  instructions?: string;
  prepTimeMin?: number;
  cookTimeMin?: number;
  servings?: number;
  ingredients: RecipeIngredientInput[];
  tags?: string[];
}

/** Crée une recette avec ses ingrédients structurés et ses tags. */
export async function createRecipe(db: DB, input: CreateRecipeInput): Promise<string> {
  const {
    data: { user },
  } = await db.auth.getUser();

  const recipe = unwrap(
    await db
      .from('recipe')
      .insert({
        name: input.name,
        description: input.description,
        instructions: input.instructions,
        prep_time_min: input.prepTimeMin,
        cook_time_min: input.cookTimeMin,
        servings: input.servings ?? 1,
        created_by: user?.id ?? null,
      })
      .select('id')
      .single(),
  ) as { id: string };

  if (input.ingredients.length > 0) {
    const rows = input.ingredients.map((ing, position) => ({
      recipe_id: recipe.id,
      food_id: ing.foodId ?? null,
      free_text: ing.freeText ?? null,
      quantity: ing.quantity ?? null,
      unit: ing.unit ?? null,
      position,
    }));
    const { error } = await db.from('recipe_ingredient').insert(rows);
    if (error) throw new Error(error.message);
  }

  if (input.tags && input.tags.length > 0) {
    const tagRows = input.tags.map((tag) => ({ recipe_id: recipe.id, tag }));
    const { error } = await db.from('recipe_tag').insert(tagRows);
    if (error) throw new Error(error.message);
  }

  return recipe.id;
}

export interface RecipeNutrition {
  /** Total pour la recette entière, par code de nutriment. */
  total: Record<string, number>;
  /** Par portion (total / servings). */
  perServing: Record<string, number>;
  servings: number;
}

/**
 * Calcule la nutrition d'une recette À PARTIR de ses ingrédients (principe n°3 :
 * jamais saisi à la main, jamais généré par IA — toujours dérivé de la base).
 *
 * Approximation assumée (principe n°2) : on suppose que l'unité de l'ingrédient
 * correspond à l'unité de base de l'aliment (g/ml) ; le facteur d'échelle est
 * quantité / food.base_amount. Les ingrédients libres (sans food lié) sont ignorés.
 */
export async function computeRecipeNutrition(db: DB, recipeId: string): Promise<RecipeNutrition> {
  const recipe = unwrap(
    await db.from('recipe').select('servings').eq('id', recipeId).single(),
  ) as { servings: number };

  const ingredients = (unwrap(
    await db
      .from('recipe_ingredient')
      .select('food_id, quantity')
      .eq('recipe_id', recipeId),
  ) ?? []) as Array<{ food_id: string | null; quantity: number | null }>;

  const total: Record<string, number> = {};

  for (const ing of ingredients) {
    if (!ing.food_id || ing.quantity == null) continue;

    const food = unwrap(
      await db.from('food').select('base_amount').eq('id', ing.food_id).single(),
    ) as { base_amount: number };

    const values = (unwrap(
      await db
        .from('nutrient_value')
        .select('amount, nutrient_type:nutrient_type_id(code)')
        .eq('food_id', ing.food_id),
    ) ?? []) as unknown as Array<{
      amount: number;
      // Supabase peut renvoyer la relation comme objet ou tableau selon l'inférence.
      nutrient_type: { code: string } | { code: string }[] | null;
    }>;

    const factor = food.base_amount > 0 ? ing.quantity / food.base_amount : 0;

    for (const v of values) {
      const nt = v.nutrient_type;
      const code = Array.isArray(nt) ? nt[0]?.code : nt?.code;
      if (!code) continue;
      total[code] = (total[code] ?? 0) + v.amount * factor;
    }
  }

  const servings = recipe.servings > 0 ? recipe.servings : 1;
  const perServing: Record<string, number> = {};
  for (const [code, amount] of Object.entries(total)) {
    perServing[code] = amount / servings;
  }

  return { total, perServing, servings };
}
