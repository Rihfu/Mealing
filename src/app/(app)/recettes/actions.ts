'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAuthContext } from '@/lib/auth';
import {
  createRecipe,
  updateRecipe,
  deleteRecipe,
  backfillRecipeIngredientLinks,
  searchFoodCatalog,
  createRecipeGroup,
  renameRecipeGroup,
  deleteRecipeGroup,
  reorderRecipeGroups,
  reorderRecipesInGroup,
  bulkSetRecipeGroup,
  sortRecipeGroupItems,
  sortRecipeGroups,
  setRecipeImage,
  removeRecipeImage,
  type RecipeSortBy,
  type GroupSortBy,
  type CreateRecipeInput,
  type RecipeIngredientInput,
  type FoodSuggestion,
} from '@/lib/core';

export interface RecipeFormState {
  error?: string;
}

const ingredientSchema = z.object({
  foodId: z.string().uuid().optional(),
  freeText: z.string().optional(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  source: z.string().optional(),
  externalId: z.string().optional(),
});

/** Parse + valide le formulaire de recette (partagé création / édition). */
function parseRecipeForm(
  formData: FormData,
): { ok: true; input: CreateRecipeInput } | { ok: false; error: string } {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { ok: false, error: 'Le nom de la recette est requis.' };

  let ingredients: RecipeIngredientInput[] = [];
  try {
    const raw = JSON.parse(String(formData.get('ingredients_json') ?? '[]'));
    ingredients = z
      .array(ingredientSchema)
      .parse(raw)
      // Ne garder que les lignes ayant au moins un aliment ou un libellé.
      .filter((i) => i.foodId || (i.freeText && i.freeText.trim()));
  } catch {
    return { ok: false, error: 'Ingrédients invalides.' };
  }

  const tags = String(formData.get('tags') ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const toNum = (v: FormDataEntryValue | null) => {
    const n = Number(v);
    return v != null && v !== '' && !Number.isNaN(n) ? n : undefined;
  };

  return {
    ok: true,
    input: {
      name,
      description: String(formData.get('description') ?? '') || undefined,
      instructions: String(formData.get('instructions') ?? '') || undefined,
      prepTimeMin: toNum(formData.get('prep_time_min')),
      cookTimeMin: toNum(formData.get('cook_time_min')),
      servings: toNum(formData.get('servings')) ?? 1,
      ingredients,
      tags,
    },
  };
}

export async function createRecipeAction(
  _prevState: RecipeFormState | undefined,
  formData: FormData,
): Promise<RecipeFormState> {
  const parsed = parseRecipeForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const { supabase, userId } = await getAuthContext();
  if (!userId) redirect('/login');

  await createRecipe(supabase, parsed.input);
  revalidatePath('/recettes');
  redirect('/recettes');
}

export async function updateRecipeAction(
  _prevState: RecipeFormState | undefined,
  formData: FormData,
): Promise<RecipeFormState> {
  const recipeId = String(formData.get('recipe_id') ?? '');
  if (!recipeId) return { error: 'Recette introuvable.' };

  const parsed = parseRecipeForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const { supabase, userId } = await getAuthContext();
  if (!userId) redirect('/login');

  await updateRecipe(supabase, recipeId, parsed.input);
  revalidatePath('/recettes');
  revalidatePath(`/recettes/${recipeId}`);
  redirect(`/recettes/${recipeId}`);
}

export async function deleteRecipeAction(formData: FormData): Promise<void> {
  const recipeId = String(formData.get('recipe_id') ?? '');
  const { supabase, userId } = await getAuthContext();
  if (!userId) redirect('/login');
  if (recipeId) {
    await deleteRecipe(supabase, recipeId);
    revalidatePath('/recettes');
  }
  redirect('/recettes');
}

/** Relie au catalogue les ingrédients existants en texte libre. @returns le nb lié. */
export async function backfillRecipeLinksAction(): Promise<number> {
  const { supabase, userId } = await getAuthContext();
  if (!userId) redirect('/login');
  const linked = await backfillRecipeIngredientLinks(supabase);
  revalidatePath('/recettes');
  return linked;
}

/** Autocomplétion catalogue (local + USDA/OFF) pour la saisie d'ingrédients. */
export async function searchCatalogAction(query: string): Promise<FoodSuggestion[]> {
  const { supabase } = await getAuthContext();
  return searchFoodCatalog(supabase, query, { limit: 8 });
}

// ----------------------------------------------------------------------------
// Groupes de recettes (parité Courses/Stock) — organisation scopée foyer.
// ----------------------------------------------------------------------------

async function requireHousehold() {
  const { supabase, userId, profile } = await getAuthContext();
  if (!userId) redirect('/login');
  const householdId = profile?.household_id as string | undefined;
  if (!householdId) redirect('/onboarding');
  return { supabase, householdId };
}

export async function createGroupAction(name: string): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  if (name.trim()) await createRecipeGroup(supabase, householdId, name);
  revalidatePath('/recettes');
}

export async function renameGroupAction(id: string, name: string): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  if (name.trim()) await renameRecipeGroup(supabase, householdId, id, name);
  revalidatePath('/recettes');
}

export async function deleteGroupAction(id: string): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  await deleteRecipeGroup(supabase, householdId, id);
  revalidatePath('/recettes');
}

export async function reorderGroupsAction(orderedIds: string[]): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  await reorderRecipeGroups(supabase, householdId, orderedIds);
  revalidatePath('/recettes');
}

/** Range une liste ORDONNÉE de recettes dans un groupe (déplacement + réordre, glisser). */
export async function reorderRecipesAction(groupId: string | null, orderedIds: string[]): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  await reorderRecipesInGroup(supabase, householdId, groupId, orderedIds);
  revalidatePath('/recettes');
}

export async function bulkMoveRecipesAction(ids: string[], groupId: string | null): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  await bulkSetRecipeGroup(supabase, householdId, ids, groupId);
  revalidatePath('/recettes');
}

/** Supprime une recette par id (tuile / sélection). RLS : seules celles du créateur partent. */
export async function removeRecipeAction(id: string): Promise<void> {
  const { supabase } = await requireHousehold();
  await deleteRecipe(supabase, id);
  revalidatePath('/recettes');
}

export async function bulkDeleteRecipesAction(ids: string[]): Promise<void> {
  const { supabase } = await requireHousehold();
  // RLS : seules les recettes créées par l'utilisateur sont réellement supprimées.
  for (const id of ids) await deleteRecipe(supabase, id);
  revalidatePath('/recettes');
}

/**
 * Trie les recettes dans leur groupe (one-shot, écrit l'ordre). `recipeIds` fourni →
 * ne réordonne que la sélection ; sinon → toutes.
 */
export async function sortRecipesAction(by: RecipeSortBy, recipeIds?: string[]): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  await sortRecipeGroupItems(supabase, householdId, by, recipeIds);
  revalidatePath('/recettes');
}

/** Trie les groupes (par nombre de recettes contenues, ou alphabétique). */
export async function sortGroupsAction(by: GroupSortBy): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  await sortRecipeGroups(supabase, householdId, by);
  revalidatePath('/recettes');
}

// ----------------------------------------------------------------------------
// Photo de recette (Storage privé, scopée foyer) — l'upload se fait côté client ;
// ces actions n'enregistrent/retirent que la référence (+ suppression de l'objet).
// ----------------------------------------------------------------------------

export async function setRecipeImageAction(recipeId: string, path: string): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  await setRecipeImage(supabase, householdId, recipeId, path);
  revalidatePath('/recettes');
  revalidatePath(`/recettes/${recipeId}`);
}

export async function removeRecipeImageAction(recipeId: string): Promise<void> {
  const { supabase, householdId } = await requireHousehold();
  await removeRecipeImage(supabase, householdId, recipeId);
  revalidatePath('/recettes');
  revalidatePath(`/recettes/${recipeId}`);
}
