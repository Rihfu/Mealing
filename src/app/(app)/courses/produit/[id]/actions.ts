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
  ensureFoodConservation,
  type FoodNutritionValue,
  type ProductDetail,
} from '@/lib/core';

/** Libellés des lieux (alignés sur le Stock) pour l'affichage de la conservation. */
const STORAGE_LABEL: Record<'placard' | 'frigo' | 'congelateur', string> = {
  placard: 'Placard',
  frigo: 'Réfrigérateur',
  congelateur: 'Congélateur',
};

/** Conservation d'un lieu : valeur FIXE en jours (pas d'intervalle). */
export interface ConservationDaysItem {
  storage: 'placard' | 'frigo' | 'congelateur';
  label: string;
  unopenedDays: number;
  openedDays: number | null;
}

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

/** map avec concurrence bornée (évite de saturer USDA/OFF + le budget temps de l'action). */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Pré-charge les fiches de TOUS les articles de la liste (un appel groupé) pour les
 * consulter HORS-LIGNE en magasin. Renvoie un dictionnaire foodId → bundle ; le client
 * le persiste en IndexedDB. **Complète la nutrition jamais stockée** (USDA/OFF,
 * best-effort, concurrence limitée) pour que les fiches soient complètes hors-ligne —
 * garde-fou n°3 respecté : valeurs du FOURNISSEUR, jamais l'IA.
 */
export async function prefetchListFichesAction(): Promise<Record<string, ProductBundle>> {
  const { supabase, userId, profile } = await getAuthContext();
  if (!userId || !profile?.household_id) return {};
  const hh = profile.household_id as string;
  const { from, to } = await getShoppingWindow(supabase, hh);
  const lines = await generateShoppingList(supabase, { householdId: hh, from, to });
  const foodIds = Array.from(new Set(lines.map((l) => l.foodId).filter((x): x is string => !!x)));

  const out: Record<string, ProductBundle> = {};
  await mapLimit(foodIds, 4, async (id) => {
    let nutrition = await getFoodNutrition(supabase, id);
    // Nutrition jamais stockée → on la récupère une fois auprès du fournisseur (best-effort).
    if (!nutrition || nutrition.length === 0) {
      try {
        await fetchAndStoreNutrition(supabase, id);
        nutrition = await getFoodNutrition(supabase, id);
      } catch {
        // best-effort : si le fournisseur ne renvoie rien, on garde un bundle sans nutrition.
      }
    }
    const detail = await computeProductStats(supabase, hh, id);
    out[id] = { detail, nutrition: nutrition ?? [] };
  });
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

/**
 * Conservation par lieu — valeurs FIXES en jours (source UNIQUE partagée avec le Stock).
 * Dérivé de `ensureFoodConservation` (même cache `food_conservation` que le Stock) → la
 * fiche et le Stock affichent EXACTEMENT la même estimation. Plus d'intervalles : une
 * valeur définie par lieu (requis pour les futures notifications de péremption). À la demande.
 */
export async function getConservationAction(foodId: string): Promise<ConservationDaysItem[]> {
  const { supabase } = await requireAuth();
  const { data: food } = await supabase.from('food').select('name, category').eq('id', foodId).maybeSingle();
  if (!food) return [];
  const days = await ensureFoodConservation(supabase, foodId, food.name, food.category);
  if (!days) return [];
  return (['placard', 'frigo', 'congelateur'] as const)
    .map((k): ConservationDaysItem | null => {
      const v = days[k];
      if (!v || v.unopened == null) return null;
      return { storage: k, label: STORAGE_LABEL[k], unopenedDays: v.unopened, openedDays: v.opened ?? null };
    })
    .filter((x): x is ConservationDaysItem => x != null);
}
