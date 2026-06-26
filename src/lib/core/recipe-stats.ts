import type { DB } from './types';
import { unwrap } from './types';
import { loadRecipeStockScores } from './shopping';

/** Une ligne de classement de recette (nom + valeur : compte, minutes ou %). */
export interface RecipeStatRow {
  recipeId: string;
  name: string;
  value: number;
}

export interface RecipeStats {
  totalRecipes: number;
  /** Nb de repas planifiés rattachés à une recette (toutes dates). */
  totalPlanned: number;
  /** Nb de recettes ayant au moins un tag. */
  withTags: number;
  /** Top recettes par nombre de fois planifiées (« les plus reconduites »). */
  mostPlanned: RecipeStatRow[];
  /** Recettes les plus rapides (prépa + cuisson), croissant. */
  fastest: RecipeStatRow[];
  /** Recettes les plus réalisables avec le stock actuel (% d'ingrédients couverts). */
  realizable: RecipeStatRow[];
  /** Répartition des tags (décroissant). */
  tagDistribution: Array<{ tag: string; count: number }>;
}

/**
 * Statistiques de la bibliothèque de recettes — vue DÉRIVÉE (lecture seule) des
 * données déjà historisées : `recipe`, `planned_meal` (reconductions, scopé foyer
 * par RLS), `recipe_tag`, et la couverture stock (`loadRecipeStockScores`). Aucune
 * écriture, aucune valeur générée.
 */
export async function computeRecipeStats(db: DB, householdId: string): Promise<RecipeStats> {
  const recipes = (unwrap(
    await db.from('recipe').select('id, name, prep_time_min, cook_time_min'),
  ) ?? []) as Array<{ id: string; name: string; prep_time_min: number | null; cook_time_min: number | null }>;
  const nameById = new Map(recipes.map((r) => [r.id, r.name]));

  const planned = (unwrap(
    await db.from('planned_meal').select('recipe_id').not('recipe_id', 'is', null),
  ) ?? []) as Array<{ recipe_id: string | null }>;
  const plannedCount = new Map<string, number>();
  let totalPlanned = 0;
  for (const p of planned) {
    if (!p.recipe_id || !nameById.has(p.recipe_id)) continue;
    plannedCount.set(p.recipe_id, (plannedCount.get(p.recipe_id) ?? 0) + 1);
    totalPlanned += 1;
  }

  const tagRows = (unwrap(
    await db.from('recipe_tag').select('recipe_id, tag'),
  ) ?? []) as Array<{ recipe_id: string; tag: string }>;
  const tagCount = new Map<string, number>();
  const recipesWithTag = new Set<string>();
  for (const t of tagRows) {
    if (!nameById.has(t.recipe_id)) continue;
    tagCount.set(t.tag, (tagCount.get(t.tag) ?? 0) + 1);
    recipesWithTag.add(t.recipe_id);
  }

  const scores = await loadRecipeStockScores(db, householdId);

  const mostPlanned = [...plannedCount.entries()]
    .map(([id, count]) => ({ recipeId: id, name: nameById.get(id) ?? '—', value: count }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .slice(0, 8);

  const fastest = recipes
    .map((r) => ({ recipeId: r.id, name: r.name, value: (r.prep_time_min ?? 0) + (r.cook_time_min ?? 0) }))
    .filter((r) => r.value > 0)
    .sort((a, b) => a.value - b.value || a.name.localeCompare(b.name))
    .slice(0, 8);

  const realizable = [...scores.entries()]
    .filter(([id]) => nameById.has(id))
    .map(([id, score]) => ({ recipeId: id, name: nameById.get(id) ?? '—', value: Math.round(score * 100) }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .slice(0, 8);

  const tagDistribution = [...tagCount.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  return {
    totalRecipes: recipes.length,
    totalPlanned,
    withTags: recipesWithTag.size,
    mostPlanned,
    fastest,
    realizable,
    tagDistribution,
  };
}
