'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getAuthContext } from '@/lib/auth';
import { createRecipe } from '@/lib/core';
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

export async function addMissingIngredientsToShoppingAction(formData: FormData): Promise<void> {
  const { supabase, userId, profile } = await getAuthContext();
  if (!userId) redirect('/login');
  const householdId = profile?.household_id as string | undefined;
  if (!householdId) redirect('/onboarding');

  let items: IngredientAvailability[] = [];
  try {
    items = JSON.parse(String(formData.get('items') ?? '[]')) as IngredientAvailability[];
  } catch {
    items = [];
  }

  const rows = items
    .filter((item) => !item.covered && item.name.trim())
    .map((item) => ({
      household_id: householdId,
      label: item.name.trim(),
      quantity: item.quantity ?? null,
      unit: item.unit || null,
    }));

  if (rows.length > 0) await supabase.from('shopping_manual_item').insert(rows);
  revalidatePath('/courses');
  redirect('/courses');
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
