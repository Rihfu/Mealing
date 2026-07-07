'use server';

import { revalidatePath } from 'next/cache';
import { getAuthContext } from '@/lib/auth';
import {
  backfillRecipeIngredientLinks,
  completeMissingFoodNutrition,
  computeNutritionTargets,
  applyNutritionSetup,
  recommendTracking,
  setProfileFacets,
  addProfileHabit,
  addCustomHabit,
  removeProfileHabit,
  getProfileHabits,
  getNutritionProfile,
  trackNutrient,
  suggestRecipesForNutrient,
  suggestRecipesForHabit,
  searchFoodCatalog,
  listExtras,
  addFoodExtra,
  removeExtra,
  type ComputeTargetsInput,
  type NutritionSetupInput,
  type TargetZone,
  type TrackingSuggestion,
  type RecipeSuggestion,
  type ExtraItem,
  type Sex,
} from '@/lib/core';
import { isoDate } from '@/lib/dates';

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

/* ----------------------- N1.5 — flux facettes ----------------------- */

const ageFromYear = (birthYear: number | null) =>
  birthYear ? Math.max(1, new Date().getFullYear() - birthYear) : null;

/** Une suggestion enrichie d'une zone proposée (éditable) pour les nutriments. */
export type EnrichedSuggestion = TrackingSuggestion & { proposedMin?: number | null; proposedMax?: number | null };

export interface RecommendActionInput {
  facets: string[];
  birthYear: number | null;
  sex: Sex | null;
  weightKg: number | null;
  heightCm: number | null;
  isChild: boolean;
  excludeNutrients?: string[];
  excludeHabits?: string[];
}

/**
 * Recommande un plan de suivi depuis les facettes (moteur curé) et attache aux
 * suggestions NUTRIMENT une zone proposée (référence/formule — jamais inventée).
 */
export async function recommendAction(input: RecommendActionInput): Promise<EnrichedSuggestion[]> {
  const { supabase, userId } = await getAuthContext();
  if (!userId) return [];

  const suggestions = await recommendTracking(supabase, {
    facets: input.facets,
    age: ageFromYear(input.birthYear),
    sex: input.sex,
    isChild: input.isChild,
    excludeNutrients: input.excludeNutrients,
    excludeHabits: input.excludeHabits,
  });

  // Zones proposées pour les nutriments : base « équilibre » (référence/formule).
  const zones = await computeNutritionTargets(supabase, {
    persona: 'equilibre',
    birthYear: input.birthYear,
    sex: input.sex,
    weightKg: input.weightKg,
    heightCm: input.heightCm,
    activityLevel: null,
  });
  const zoneByCode = new Map(zones.map((z) => [z.code, z]));

  return suggestions.map((s) =>
    s.kind === 'nutrient'
      ? { ...s, proposedMin: zoneByCode.get(s.code)?.min ?? null, proposedMax: zoneByCode.get(s.code)?.max ?? null }
      : s,
  );
}

export interface ApplyFacetPlanInput {
  facets: string[];
  birthYear: number | null;
  sex: Sex | null;
  weightKg: number | null;
  heightCm: number | null;
  isChild: boolean;
  /** Nutriments retenus + leurs zones finales (éditées ou non). */
  nutrientTargets: Array<{ code: string; min: number | null; max: number | null }>;
  /** Clés d'habitudes retenues. */
  habitKeys: string[];
}

/** Applique un plan de suivi issu des facettes : facettes + nutriments + habitudes. */
export async function applyFacetPlanAction(input: ApplyFacetPlanInput): Promise<{ ok: boolean }> {
  const { supabase, userId } = await getAuthContext();
  if (!userId) return { ok: false };

  await setProfileFacets(supabase, userId, input.facets);
  await applyNutritionSetup(supabase, userId, {
    isChild: input.isChild,
    birthYear: input.birthYear,
    sex: input.sex,
    weightKg: input.weightKg,
    heightCm: input.heightCm,
    activityLevel: null,
    tracked: input.nutrientTargets.map((t) => t.code),
    targets: input.nutrientTargets,
  });
  for (const key of input.habitKeys) await addProfileHabit(supabase, userId, key);

  // PAS de revalidatePath ici : il re-rendrait la route courante (/nutrition/activer),
  // dont le garde « déjà activé » redirigerait vers /nutrition — la cérémonie de fin
  // (écran couverture) serait sautée. /nutrition est dynamique : rendu frais au push.
  return { ok: true };
}

/** Met à jour les facettes (onglet Profil) sans toucher aux suivis existants. */
export async function setFacetsAction(facets: string[]): Promise<{ ok: boolean }> {
  const { supabase, userId } = await getAuthContext();
  if (!userId) return { ok: false };
  await setProfileFacets(supabase, userId, facets);
  revalidatePath('/nutrition');
  return { ok: true };
}

/** Ajoute une habitude référencée au plan de suivi. */
export async function addHabitAction(habitKey: string): Promise<{ ok: boolean }> {
  const { supabase, userId } = await getAuthContext();
  if (!userId) return { ok: false };
  await addProfileHabit(supabase, userId, habitKey);
  revalidatePath('/nutrition');
  return { ok: true };
}

/** Retire une habitude du plan de suivi (par id). */
export async function removeHabitAction(id: string): Promise<{ ok: boolean }> {
  const { supabase, userId } = await getAuthContext();
  if (!userId) return { ok: false };
  await removeProfileHabit(supabase, userId, id);
  revalidatePath('/nutrition');
  return { ok: true };
}

/** Crée une habitude 100 % custom (constructeur « Mon repère à moi »). */
export async function addCustomHabitAction(input: {
  label: string;
  direction: 'min' | 'max';
  targetCount: number;
  period: 'day' | 'week';
  matchTags: string[];
}): Promise<{ ok: boolean }> {
  const { supabase, userId } = await getAuthContext();
  if (!userId) return { ok: false };
  await addCustomHabit(supabase, userId, input);
  revalidatePath('/nutrition');
  return { ok: true };
}

/**
 * Suit un nutriment depuis la recherche du catalogue (longue traîne § 5 bis) :
 * zone proposée depuis la RÉFÉRENCE curée (âge/sexe du profil privé) quand elle
 * existe — sinon mode observation (pas de zone). Jamais de valeur inventée.
 */
export async function trackNutrientAction(code: string): Promise<{ ok: boolean }> {
  const { supabase, userId } = await getAuthContext();
  if (!userId) return { ok: false };
  const profile = await getNutritionProfile(supabase, userId);
  const zones = await computeNutritionTargets(supabase, {
    persona: 'equilibre',
    birthYear: profile?.birthYear ?? null,
    sex: profile?.sex ?? null,
    weightKg: profile?.weightKg ?? null,
    heightCm: profile?.heightCm ?? null,
    activityLevel: profile?.activityLevel ?? null,
  });
  const z = zones.find((t) => t.code === code);
  await trackNutrient(supabase, userId, { code, min: z?.min ?? null, max: z?.max ?? null });
  revalidatePath('/nutrition');
  return { ok: true };
}

/* ----------------- N3 — boucle actionnable & extras ----------------- */

/** Idées de recettes pour combler un GAP de nutriment (riches par portion + stock). */
export async function suggestForGapAction(nutrientCode: string): Promise<RecipeSuggestion[]> {
  const { supabase, userId, profile } = await getAuthContext();
  if (!userId || !profile?.household_id) return [];
  return suggestRecipesForNutrient(supabase, { householdId: profile.household_id, nutrientCode });
}

/** Idées de recettes pour remplir une HABITUDE (contenant un aliment taggé). */
export async function suggestForHabitAction(habitId: string): Promise<RecipeSuggestion[]> {
  const { supabase, userId, profile } = await getAuthContext();
  if (!userId || !profile?.household_id) return [];
  const habit = (await getProfileHabits(supabase, userId)).find((h) => h.id === habitId);
  if (!habit) return [];
  return suggestRecipesForHabit(supabase, {
    householdId: profile.household_id,
    matchTags: habit.matchTags,
    matchFoodIds: habit.matchFoodIds,
  });
}

/** Recherche d'aliments pour la saisie d'un extra (catalogue LOCAL — rapide).
 *  L'unité affichée est TOUJOURS g/ml : la quantité est interprétée en unité de
 *  base (base_amount = 100), comme les ingrédients de recette. */
export async function searchExtraFoodsAction(
  query: string,
): Promise<Array<{ foodId: string; name: string; unit: string }>> {
  const { userId, supabase } = await getAuthContext();
  if (!userId) return [];
  const res = await searchFoodCatalog(supabase, query, { limit: 8, includeExternal: false });
  return res
    .filter((s): s is typeof s & { foodId: string } => !!s.foodId)
    .map((s) => ({ foodId: s.foodId, name: s.name, unit: 'g / ml' }));
}

/** Extras du jour (liste de la feuille « + Extra »). */
export async function listTodayExtrasAction(): Promise<ExtraItem[]> {
  const { supabase, userId } = await getAuthContext();
  if (!userId) return [];
  const today = isoDate(new Date());
  return listExtras(supabase, userId, { from: today, to: today });
}

/** Ajoute un extra hors-plan (aliment + quantité en unité de base, aujourd'hui). */
export async function addExtraAction(input: { foodId: string; quantity: number }): Promise<{ ok: boolean }> {
  const { supabase, userId } = await getAuthContext();
  if (!userId) return { ok: false };
  await addFoodExtra(supabase, userId, input);
  revalidatePath('/nutrition');
  return { ok: true };
}

/** Retire un extra. */
export async function removeExtraAction(id: string): Promise<{ ok: boolean }> {
  const { supabase, userId } = await getAuthContext();
  if (!userId) return { ok: false };
  await removeExtra(supabase, userId, id);
  revalidatePath('/nutrition');
  return { ok: true };
}
