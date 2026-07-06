'use server';

import { revalidatePath } from 'next/cache';
import { getAuthContext } from '@/lib/auth';
import { backfillRecipeIngredientLinks, completeMissingFoodNutrition } from '@/lib/core';

/** Bilan d'une passe de réparation de la chaîne de données nutrition (N0). */
export interface RepairNutritionResult {
  /** Ingrédients de recettes reliés au catalogue dans cette passe. */
  linked: number;
  /** Aliments dont la nutrition a été récupérée et stockée. */
  completed: number;
  /** Aliments encore sans nutrition après la passe (relancer pour continuer). */
  remaining: number;
}

/**
 * Répare la chaîne de données nutrition (N0) en une passe bornée :
 * 1. relie au catalogue les ingrédients de recettes restés en texte libre
 *    (`backfillRecipeIngredientLinks`, RLS : recettes de l'utilisateur) ;
 * 2. complète la nutrition des aliments référencés par des recettes qui n'ont
 *    AUCUNE valeur stockée (fournisseur USDA/OFF, jamais l'IA — garde-fou n°3).
 * Bornée pour tenir dans le budget serverless — le bouton peut être relancé
 * (idempotent : le déjà-fait est sauté).
 */
export async function repairNutritionDataAction(): Promise<RepairNutritionResult> {
  const { supabase, userId } = await getAuthContext();
  if (!userId) return { linked: 0, completed: 0, remaining: 0 };

  const linked = await backfillRecipeIngredientLinks(supabase);

  const { data: rows } = await supabase
    .from('recipe_ingredient')
    .select('food_id')
    .not('food_id', 'is', null);
  const foodIds = Array.from(new Set((rows ?? []).map((r) => r.food_id as string)));
  const res = await completeMissingFoodNutrition(supabase, foodIds, { max: 12, concurrency: 3 });

  revalidatePath('/nutrition');
  revalidatePath('/recettes');
  return { linked, completed: res.completed, remaining: Math.max(0, res.missing - res.completed) };
}

/**
 * Définit les objectifs nutritionnels quotidiens du profil courant (cible = max),
 * par code de nutriment. Une valeur vide supprime l'objectif. Données strictement
 * personnelles (RLS profile_goal).
 */
export async function setGoalsAction(formData: FormData): Promise<void> {
  const { supabase, userId } = await getAuthContext();
  if (!userId) return;

  const { data: types } = await supabase
    .from('nutrient_type')
    .select('id, code')
    .eq('is_base', true);

  for (const t of types ?? []) {
    const raw = formData.get(`goal_${t.code}`);
    const value = raw != null && String(raw).trim() !== '' ? Number(raw) : null;

    if (value != null && !Number.isNaN(value) && value > 0) {
      await supabase
        .from('profile_goal')
        .upsert(
          { profile_id: userId, nutrient_type_id: t.id, period: 'daily', target_max: value },
          { onConflict: 'profile_id,nutrient_type_id,period' },
        );
    } else {
      await supabase
        .from('profile_goal')
        .delete()
        .eq('profile_id', userId)
        .eq('nutrient_type_id', t.id)
        .eq('period', 'daily');
    }
  }

  revalidatePath('/nutrition');
}
