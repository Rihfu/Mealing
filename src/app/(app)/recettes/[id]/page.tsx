import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAuthContext } from '@/lib/auth';
import { computeRecipeNutrition } from '@/lib/core';

export default async function RecetteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await getAuthContext();

  const { data: recipe } = await supabase
    .from('recipe')
    .select('id, name, description, instructions, prep_time_min, cook_time_min, servings')
    .eq('id', id)
    .maybeSingle();

  if (!recipe) notFound();

  const { data: ingredients } = await supabase
    .from('recipe_ingredient')
    .select('id, free_text, quantity, unit, food:food_id(name)')
    .eq('recipe_id', id)
    .order('position', { ascending: true });

  const nutrition = await computeRecipeNutrition(supabase, id);
  const { data: nutrientTypes } = await supabase
    .from('nutrient_type')
    .select('code, name, unit')
    .order('category', { ascending: true });

  const labelFor = (code: string) =>
    nutrientTypes?.find((n) => n.code === code) ?? { name: code, unit: '' };

  return (
    <div className="flex flex-col gap-6">
      <Link href="/recettes" className="w-fit text-sm font-bold text-sage-deep hover:underline">
        Retour aux recettes
      </Link>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-semibold tracking-tight">{recipe.name}</h1>
          {recipe.description && (
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">{recipe.description}</p>
          )}

          <section className="mt-7">
            <h2 className="mb-3 font-display text-xl font-semibold">Ingrédients</h2>
            <ul className="overflow-hidden rounded-2xl border border-line bg-surface px-4 shadow-soft">
              {(ingredients ?? []).map((ing) => {
                const food = Array.isArray(ing.food) ? ing.food[0] : ing.food;
                return (
                  <li key={ing.id} className="flex items-center justify-between gap-4 border-b border-line py-3 last:border-b-0">
                    <span className="text-sm font-medium">{food?.name ?? ing.free_text}</span>
                    <span className="whitespace-nowrap text-sm font-bold">
                      {ing.quantity ?? ''} {ing.unit ?? ''}
                    </span>
                  </li>
                );
              })}
            </ul>
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
          <section className="grid grid-cols-3 divide-x divide-line rounded-2xl border border-line bg-surface p-4 text-center shadow-soft">
            <div>
              <div className="text-xs text-ink-soft">Prépa</div>
              <div className="font-bold">{recipe.prep_time_min ?? 0} min</div>
            </div>
            <div>
              <div className="text-xs text-ink-soft">Cuisson</div>
              <div className="font-bold">{recipe.cook_time_min ?? 0} min</div>
            </div>
            <div>
              <div className="text-xs text-ink-soft">Portions</div>
              <div className="font-bold">{recipe.servings}</div>
            </div>
          </section>

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
