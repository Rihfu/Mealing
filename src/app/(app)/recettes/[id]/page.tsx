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
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{recipe.name}</h1>
        <Link href="/recettes" className="text-sm text-gray-500 underline">
          Retour
        </Link>
      </div>

      <p className="text-sm text-gray-500">
        {(recipe.prep_time_min ?? 0) + (recipe.cook_time_min ?? 0)} min · {recipe.servings}{' '}
        portion(s)
      </p>

      <section>
        <h2 className="mb-1 text-sm font-semibold">Ingrédients</h2>
        <ul className="list-inside list-disc text-sm">
          {(ingredients ?? []).map((ing) => {
            const food = Array.isArray(ing.food) ? ing.food[0] : ing.food;
            return (
              <li key={ing.id}>
                {ing.quantity ?? ''} {ing.unit ?? ''} {food?.name ?? ing.free_text}
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold">Nutrition par portion</h2>
        {Object.keys(nutrition.perServing).length === 0 ? (
          <p className="text-sm text-gray-500">
            Aucune valeur : liez des aliments importés aux ingrédients pour le calcul.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-1 text-sm sm:grid-cols-3">
            {Object.entries(nutrition.perServing).map(([code, amount]) => {
              const l = labelFor(code);
              return (
                <li key={code} className="flex justify-between rounded bg-gray-50 px-2 py-1 dark:bg-gray-900">
                  <span>{l.name}</span>
                  <span className="font-medium">
                    {Math.round(amount * 10) / 10} {l.unit}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {recipe.instructions && (
        <section>
          <h2 className="mb-1 text-sm font-semibold">Étapes</h2>
          <p className="whitespace-pre-wrap text-sm">{recipe.instructions}</p>
        </section>
      )}
    </div>
  );
}
