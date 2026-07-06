'use server';

import { revalidatePath } from 'next/cache';
import { getAuthContext } from '@/lib/auth';
import {
  backfillRecipeIngredientLinks,
  completeMissingFoodNutrition,
  computeNutritionTargets,
  applyNutritionSetup,
  type ComputeTargetsInput,
  type NutritionSetupInput,
  type TargetZone,
} from '@/lib/core';

/** Calcule les cibles PROPOSÉES pour l'écran 3 du wizard (référence curée / formule — jamais l'IA). */
export async function computeTargetsAction(input: ComputeTargetsInput): Promise<TargetZone[]> {
  const { supabase, userId } = await getAuthContext();
  if (!userId) return [];
  return computeNutritionTargets(supabase, input);
}

/** Applique la configuration nutrition (profil privé + nutriments suivis + objectifs). */
export async function applyNutritionSetupAction(input: NutritionSetupInput): Promise<{ ok: boolean }> {
  const { supabase, userId } = await getAuthContext();
  if (!userId) return { ok: false };
  await applyNutritionSetup(supabase, userId, input);
  revalidatePath('/nutrition');
  return { ok: true };
}

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

// NB : l'ancienne `setGoalsAction` (formulaire manuel, max/jour uniquement) a été
// remplacée par le wizard N1 (`applyNutritionSetupAction` : zones min/max + suivis).
