'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getAuthContext } from '@/lib/auth';
import { createRecipe } from '@/lib/core';
import {
  draftToCreateInput,
  generateRecipeDraft,
  parseDraft,
  type RecipeDraft,
} from '@/lib/ai/generate-recipe';

export interface GenerateState {
  draft?: RecipeDraft;
  error?: string;
}

export async function generateRecipeAction(
  _prevState: GenerateState | undefined,
  formData: FormData,
): Promise<GenerateState> {
  const request = String(formData.get('request') ?? '').trim();
  if (!request) return { error: 'Décrivez la recette souhaitée.' };

  try {
    const draft = await generateRecipeDraft(request);
    return { draft };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Échec de la génération.' };
  }
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
