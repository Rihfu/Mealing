'use server';

import { revalidatePath } from 'next/cache';
import { getAuthContext } from '@/lib/auth';
import {
  addPlannedMeal,
  markDayOffPlan,
  recordConsumption,
  type MealSlot,
} from '@/lib/core';

async function requireContext() {
  const { supabase, userId, profile } = await getAuthContext();
  if (!userId || !profile?.household_id) {
    throw new Error('Contexte foyer manquant.');
  }
  return { supabase, userId, householdId: profile.household_id as string };
}

export async function addMealAction(formData: FormData): Promise<void> {
  const { supabase, householdId } = await requireContext();
  const recipeId = String(formData.get('recipe_id') ?? '');
  const freeText = String(formData.get('free_text') ?? '').trim();

  await addPlannedMeal(supabase, {
    householdId,
    date: String(formData.get('date')),
    slot: String(formData.get('slot')) as MealSlot,
    recipeId: recipeId || undefined,
    freeText: freeText || undefined,
  });
  revalidatePath('/planning');
}

export async function deleteMealAction(formData: FormData): Promise<void> {
  const { supabase } = await requireContext();
  await supabase.from('planned_meal').delete().eq('id', String(formData.get('meal_id')));
  revalidatePath('/planning');
}

export async function markDayOffAction(formData: FormData): Promise<void> {
  const { supabase, householdId } = await requireContext();
  await markDayOffPlan(supabase, {
    householdId,
    date: String(formData.get('date')),
    scope: 'household',
  });
  revalidatePath('/planning');
}

export async function recordDeviationAction(formData: FormData): Promise<void> {
  const { supabase, userId } = await requireContext();
  const status = String(formData.get('status')) as 'skipped' | 'different';
  await recordConsumption(supabase, {
    profileId: userId,
    plannedMealId: String(formData.get('meal_id')),
    status,
    actualFreeText: String(formData.get('actual_free_text') ?? '') || undefined,
  });
  revalidatePath('/planning');
}
