'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAuthContext } from '@/lib/auth';
import { createRecipe, type RecipeIngredientInput } from '@/lib/core';

export interface RecipeFormState {
  error?: string;
}

const ingredientSchema = z.object({
  foodId: z.string().uuid().optional(),
  freeText: z.string().optional(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
});

export async function createRecipeAction(
  _prevState: RecipeFormState | undefined,
  formData: FormData,
): Promise<RecipeFormState> {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: 'Le nom de la recette est requis.' };

  let ingredients: RecipeIngredientInput[] = [];
  try {
    const raw = JSON.parse(String(formData.get('ingredients_json') ?? '[]'));
    ingredients = z
      .array(ingredientSchema)
      .parse(raw)
      // Ne garder que les lignes ayant au moins un aliment ou un libellé.
      .filter((i) => i.foodId || (i.freeText && i.freeText.trim()));
  } catch {
    return { error: 'Ingrédients invalides.' };
  }

  const tags = String(formData.get('tags') ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const toNum = (v: FormDataEntryValue | null) => {
    const n = Number(v);
    return v != null && v !== '' && !Number.isNaN(n) ? n : undefined;
  };

  const { supabase, userId } = await getAuthContext();
  if (!userId) redirect('/login');

  await createRecipe(supabase, {
    name,
    description: String(formData.get('description') ?? '') || undefined,
    instructions: String(formData.get('instructions') ?? '') || undefined,
    prepTimeMin: toNum(formData.get('prep_time_min')),
    cookTimeMin: toNum(formData.get('cook_time_min')),
    servings: toNum(formData.get('servings')) ?? 1,
    ingredients,
    tags,
  });

  revalidatePath('/recettes');
  redirect('/recettes');
}
