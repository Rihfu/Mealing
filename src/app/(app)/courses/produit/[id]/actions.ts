'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getAuthContext } from '@/lib/auth';
import { fetchAndStoreNutrition, getFoodNutrition, type FoodNutritionValue } from '@/lib/core';

async function requireAuth() {
  const { supabase, userId, profile } = await getAuthContext();
  if (!userId) redirect('/login');
  if (!profile?.household_id) redirect('/onboarding');
  return { supabase };
}

/**
 * Récupère la nutrition d'un aliment auprès du fournisseur (USDA/OFF) et la persiste,
 * puis renvoie les valeurs (garde-fou n°3 : données fournisseur, jamais l'IA).
 */
export async function fetchNutritionAction(foodId: string): Promise<FoodNutritionValue[] | null> {
  const { supabase } = await requireAuth();
  if (!foodId) return null;
  await fetchAndStoreNutrition(supabase, foodId);
  const values = await getFoodNutrition(supabase, foodId);
  revalidatePath(`/courses/produit/${foodId}`);
  return values;
}

/** Conseils indicatifs (IA, best-effort) sur un produit — à la demande. */
export async function getProductTipsAction(foodId: string): Promise<string[]> {
  const { supabase } = await requireAuth();
  const { data: food } = await supabase.from('food').select('name, category').eq('id', foodId).maybeSingle();
  if (!food) return [];
  const { getProductTips } = await import('@/lib/ai/product-tips');
  return getProductTips(food.name, food.category);
}
