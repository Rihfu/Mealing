import Link from 'next/link';
import { getAuthContext } from '@/lib/auth';
import { listRecipeGroups, loadRecipeGroupAssignments, loadRecipeImagePaths, signRecipeImageUrls } from '@/lib/core';
import { BackfillButton } from './backfill-button';
import { RecipesView } from './recipes-view';
import { groupRecipes, type RecipeTile } from './groups';

export default async function RecettesPage() {
  const { supabase, userId, profile } = await getAuthContext();
  const householdId = profile?.household_id as string | undefined;

  const { data: recipes } = await supabase
    .from('recipe')
    .select('id, name, prep_time_min, cook_time_min, servings, created_by')
    .order('name', { ascending: true });

  const [groups, assignments, imagePaths] = householdId
    ? await Promise.all([
        listRecipeGroups(supabase, householdId),
        loadRecipeGroupAssignments(supabase, householdId),
        loadRecipeImagePaths(supabase, householdId),
      ])
    : [[], new Map(), new Map<string, string>()];

  // URLs signées (bucket privé) pour les photos présentes, en un seul lot.
  const signed = await signRecipeImageUrls(supabase, [...imagePaths.values()]);

  const tiles: RecipeTile[] = (recipes ?? []).map((r) => {
    const path = imagePaths.get(r.id);
    return {
      id: r.id,
      name: r.name,
      prepTimeMin: r.prep_time_min,
      cookTimeMin: r.cook_time_min,
      servings: r.servings,
      isOwner: !!userId && r.created_by === userId,
      imageUrl: path ? signed.get(path) ?? null : null,
    };
  });
  const sections = groupRecipes(tiles, groups, assignments);

  // Ingrédients de MES recettes encore en texte libre (que le backfill peut relier).
  let unlinked = 0;
  if (userId) {
    const mine = (recipes ?? []).filter((r) => r.created_by === userId).map((r) => r.id);
    if (mine.length > 0) {
      const { count } = await supabase
        .from('recipe_ingredient')
        .select('id', { count: 'exact', head: true })
        .is('food_id', null)
        .not('free_text', 'is', null)
        .in('recipe_id', mine);
      unlinked = count ?? 0;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Recettes</h1>
          <p className="mt-1 text-sm text-ink-soft">La bibliotheque de recettes du foyer.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {unlinked > 0 && <BackfillButton count={unlinked} />}
          <Link href="/recettes/generer" className="btn-secondary">
            Generer (IA)
          </Link>
          <Link href="/recettes/nouvelle" className="btn-primary">
            + Nouvelle
          </Link>
        </div>
      </div>

      {(recipes ?? []).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong bg-surface p-6 text-center text-sm text-ink-soft">
          Aucune recette. Creez-en une pour commencer.
        </div>
      ) : (
        <RecipesView sections={sections} />
      )}
    </div>
  );
}
