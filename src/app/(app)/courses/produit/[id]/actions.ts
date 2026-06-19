'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getAuthContext } from '@/lib/auth';
import {
  fetchAndStoreNutrition,
  getFoodNutrition,
  computeProductStats,
  generateShoppingList,
  getShoppingWindow,
  type FoodNutritionValue,
  type ProductDetail,
} from '@/lib/core';

async function requireAuth() {
  const { supabase, userId, profile } = await getAuthContext();
  if (!userId) redirect('/login');
  if (!profile?.household_id) redirect('/onboarding');
  return { supabase };
}

/** Données « fiche produit » regroupées (sérialisables) : prix + habitudes + nutrition
 *  STOCKÉE (pas d'appel fournisseur ici). Sert au rendu cache-first + au pré-chargement
 *  hors-ligne. La conservation / les conseils (IA) restent à la demande (en ligne). */
export interface ProductBundle {
  detail: ProductDetail | null;
  nutrition: FoodNutritionValue[];
}

/** Bundle d'un produit (revalidation de la fiche en cache-first). */
export async function getProductBundleAction(foodId: string): Promise<ProductBundle | null> {
  const { supabase, userId, profile } = await getAuthContext();
  if (!userId || !profile?.household_id || !foodId) return null;
  const hh = profile.household_id as string;
  const [detail, nutrition] = await Promise.all([
    computeProductStats(supabase, hh, foodId),
    getFoodNutrition(supabase, foodId),
  ]);
  return { detail, nutrition: nutrition ?? [] };
}

/**
 * Pré-charge les fiches de TOUS les articles de la liste (un appel groupé) pour les
 * consulter HORS-LIGNE en magasin. Renvoie un dictionnaire foodId → bundle ; le client
 * le persiste en IndexedDB. (Nutrition : valeurs déjà stockées ; le complément
 * fournisseur reste à la demande à l'ouverture d'une fiche en ligne.)
 */
export async function prefetchListFichesAction(): Promise<Record<string, ProductBundle>> {
  const { supabase, userId, profile } = await getAuthContext();
  if (!userId || !profile?.household_id) return {};
  const hh = profile.household_id as string;
  const { from, to } = await getShoppingWindow(supabase, hh);
  const lines = await generateShoppingList(supabase, { householdId: hh, from, to });
  const foodIds = Array.from(new Set(lines.map((l) => l.foodId).filter((x): x is string => !!x)));

  const out: Record<string, ProductBundle> = {};
  await Promise.all(
    foodIds.map(async (id) => {
      const [detail, nutrition] = await Promise.all([
        computeProductStats(supabase, hh, id),
        getFoodNutrition(supabase, id),
      ]);
      out[id] = { detail, nutrition: nutrition ?? [] };
    }),
  );
  return out;
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

/** Estimation IA (indicative, par lieu de stockage) de la conservation — à la demande. */
export async function getConservationAction(foodId: string) {
  const { supabase } = await requireAuth();
  const { data: food } = await supabase.from('food').select('name, category').eq('id', foodId).maybeSingle();
  if (!food) return [];
  const { getProductConservation } = await import('@/lib/ai/product-conservation');
  return getProductConservation(food.name, food.category);
}
