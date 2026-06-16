'use server';

import { revalidatePath } from 'next/cache';
import { getAuthContext } from '@/lib/auth';
import {
  getNutritionProvider,
  searchAllSources,
  type FoodSummary,
  type NutritionSource,
} from '@/lib/providers/nutrition';
import { importFood } from '@/lib/core';

export interface FoodSearchState {
  results?: FoodSummary[];
  error?: string;
}

export async function searchFoodsAction(
  _prevState: FoodSearchState | undefined,
  formData: FormData,
): Promise<FoodSearchState> {
  const query = String(formData.get('q') ?? '').trim();
  if (!query) return { results: [] };
  try {
    const results = await searchAllSources(query, { limit: 8 });
    return { results };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erreur de recherche.' };
  }
}

export async function importFoodAction(formData: FormData): Promise<void> {
  const source = String(formData.get('source') ?? '') as NutritionSource;
  const externalId = String(formData.get('external_id') ?? '');
  if (!source || !externalId) return;

  const { supabase, userId } = await getAuthContext();
  if (!userId) return;

  const detail = await getNutritionProvider(source).getByExternalId(externalId);
  if (!detail) return;

  await importFood(supabase, detail);
  revalidatePath('/aliments');
}
