import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAuthContext } from '@/lib/auth';
import {
  computeRecipeNutrition,
  getRecipeIngredientCoverage,
  loadRecipeImagePaths,
  signRecipeImageUrls,
} from '@/lib/core';
import { AddMissingToShopping } from './add-missing-to-shopping';
import { RecipeOwnerActions } from './recipe-actions';
import { RecipePortions } from './recipe-portions';
import { RecipeImageManager } from './recipe-image';

export default async function RecetteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, userId, profile } = await getAuthContext();
  const householdId = profile?.household_id as string | undefined;

  const { data: recipe } = await supabase
    .from('recipe')
    .select('id, name, description, instructions, prep_time_min, cook_time_min, servings, created_by')
    .eq('id', id)
    .maybeSingle();

  if (!recipe) notFound();
  const isOwner = !!userId && recipe.created_by === userId;

  const { data: tagRows } = await supabase.from('recipe_tag').select('tag').eq('recipe_id', id);
  const tags = (tagRows ?? []).map((t) => t.tag).sort((a, b) => a.localeCompare(b));

  // Couverture stock par ingrédient (code couleur + « en stock : X » sur la fiche).
  const coverage = householdId ? await getRecipeIngredientCoverage(supabase, householdId, id) : [];

  // Photo de la recette (bucket privé → URL signée).
  const imagePath = householdId ? (await loadRecipeImagePaths(supabase, householdId)).get(id) ?? null : null;
  const imageUrl = imagePath ? (await signRecipeImageUrls(supabase, [imagePath])).get(imagePath) ?? null : null;

  const nutrition = await computeRecipeNutrition(supabase, id);
  const { data: nutrientTypes } = await supabase
    .from('nutrient_type')
    .select('code, name, unit')
    .order('category', { ascending: true });

  const labelFor = (code: string) =>
    nutrientTypes?.find((n) => n.code === code) ?? { name: code, unit: '' };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/recettes" className="text-sm font-bold text-sage-deep hover:underline">
          Retour aux recettes
        </Link>
        {isOwner && <RecipeOwnerActions recipeId={recipe.id} />}
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-semibold tracking-tight">{recipe.name}</h1>
          {tags.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {tags.map((t) => (
                <span key={t} className="rounded-full bg-sage-tint/70 px-2.5 py-1 text-xs font-semibold text-sage-deep">
                  {t}
                </span>
              ))}
            </div>
          )}
          {recipe.description && (
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">{recipe.description}</p>
          )}

          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- URL signée éphémère (bucket privé)
            <img
              src={imageUrl}
              alt={recipe.name}
              className="mt-5 aspect-video w-full max-w-2xl rounded-2xl border border-line object-cover shadow-soft"
            />
          )}
          {householdId && (
            <div className="mt-3">
              <RecipeImageManager recipeId={recipe.id} householdId={householdId} hasImage={!!imageUrl} />
            </div>
          )}

          <section className="mt-7">
            <h2 className="mb-3 font-display text-xl font-semibold">Ingrédients</h2>
            <RecipePortions
              recipeId={recipe.id}
              baseServings={Number(recipe.servings) > 0 ? Number(recipe.servings) : 1}
              basePrepMin={recipe.prep_time_min}
              baseCookMin={recipe.cook_time_min}
              baseItems={coverage}
            />
            <div className="mt-3">
              <AddMissingToShopping recipeId={recipe.id} />
            </div>
          </section>

          {recipe.instructions && (
            <section className="mt-8">
              <h2 className="mb-3 font-display text-xl font-semibold">Étapes</h2>
              <ol className="flex flex-col gap-3">
                {recipe.instructions.split('\n').filter(Boolean).map((step, index) => (
                  <li key={`${step}-${index}`} className="flex gap-3 text-sm leading-relaxed">
                    <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-sage-tint text-xs font-extrabold text-sage-deep">
                      {index + 1}
                    </span>
                    <span className="pt-1">{step}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
          <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="font-display text-lg font-semibold">Nutrition</h2>
              <span className="text-xs text-ink-soft">par portion</span>
            </div>
            {Object.keys(nutrition.perServing).length === 0 ? (
              <p className="text-sm leading-relaxed text-ink-soft">
                Aucune valeur : liez des aliments importés aux ingrédients pour le calcul.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {Object.entries(nutrition.perServing).map(([code, amount]) => {
                  const l = labelFor(code);
                  return (
                    <li key={code} className="flex justify-between gap-4 py-2 text-sm">
                      <span className="text-ink-soft">{l.name}</span>
                      <span className="font-bold">
                        {Math.round(amount * 10) / 10} {l.unit}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <p className="text-xs leading-relaxed text-ink-soft">
            Valeurs calculées depuis les ingrédients liés, jamais générées par l’IA.
          </p>
        </aside>
      </div>
    </div>
  );
}
