'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getAuthContext } from '@/lib/auth';
import { createRecipe, findCatalogFoodIdByLabel } from '@/lib/core';
import {
  analyzeIngredientAvailability,
  draftToCreateInput,
  generateRecipeDraft,
  parseDraft,
  type IngredientAvailability,
  type RecipeDraft,
  type RecipeGenerationStockItem,
} from '@/lib/ai/generate-recipe';

export interface GenerateState {
  draft?: RecipeDraft;
  availability?: IngredientAvailability[];
  error?: string;
}

async function getRecipeGenerationStock(): Promise<RecipeGenerationStockItem[]> {
  const { supabase, profile } = await getAuthContext();
  const householdId = profile?.household_id as string | undefined;
  if (!householdId) return [];

  const { data } = await supabase
    .from('stock')
    .select('label, tracking_mode, quantity, unit, present')
    .eq('household_id', householdId)
    .order('updated_at', { ascending: false })
    .limit(80);

  return (data ?? [])
    .map((item) => ({
      name: item.label ?? '',
      quantity: item.quantity,
      unit: item.unit,
      present: item.present,
      trackingMode: item.tracking_mode,
    }))
    .filter((item) => item.name.trim());
}

export async function generateRecipeAction(
  _prevState: GenerateState | undefined,
  formData: FormData,
): Promise<GenerateState> {
  const request = String(formData.get('request') ?? '').trim();
  if (!request) return { error: 'Décrivez la recette souhaitée.' };

  try {
    const stockItems = await getRecipeGenerationStock();
    const draft = await generateRecipeDraft(request, { stockItems });
    return { draft, availability: analyzeIngredientAvailability(draft, stockItems) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Échec de la génération.' };
  }
}

/**
 * Envoie les ingrédients manquants du BROUILLON vers la liste de courses —
 * SANS redirection : le brouillon n'est pas encore enregistré, quitter la page
 * le perdrait. Le client affiche simplement « ajouté ». Lignes reliées au
 * catalogue par libellé (rayon + icône), comme les autres ajouts manuels.
 */
export async function addMissingToShoppingAction(
  items: IngredientAvailability[],
): Promise<{ added: number }> {
  const { supabase, userId, profile } = await getAuthContext();
  const householdId = profile?.household_id as string | undefined;
  if (!userId || !householdId) return { added: 0 };

  const rows = await Promise.all(
    items
      .filter((item) => !item.covered && item.name.trim())
      .map(async (item) => ({
        household_id: householdId,
        label: item.name.trim(),
        food_id: await findCatalogFoodIdByLabel(supabase, item.name),
        quantity: item.quantity ?? null,
        unit: item.unit || null,
      })),
  );

  if (rows.length > 0) {
    const { error } = await supabase.from('shopping_manual_item').insert(rows);
    if (error) throw new Error(error.message);
  }
  revalidatePath('/courses');
  return { added: rows.length };
}

export async function saveGeneratedRecipeAction(formData: FormData): Promise<void> {
  const { supabase, userId } = await getAuthContext();
  if (!userId) redirect('/login');

  let draft: RecipeDraft;
  try {
    draft = parseDraft(JSON.parse(String(formData.get('draft') ?? '{}')));
  } catch {
    redirect('/recettes/generer?error=1');
  }

  const id = await createRecipe(supabase, draftToCreateInput(draft));
  revalidatePath('/recettes');
  redirect(`/recettes/${id}`);
}
