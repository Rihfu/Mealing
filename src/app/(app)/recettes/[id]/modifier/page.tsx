import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth';
import { RecipeForm, type RecipeFormInitial } from '../../nouvelle/recipe-form';

export default async function ModifierRecettePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, userId } = await getAuthContext();
  if (!userId) redirect('/login');

  const { data: recipe } = await supabase
    .from('recipe')
    .select('id, name, description, instructions, prep_time_min, cook_time_min, servings, created_by')
    .eq('id', id)
    .maybeSingle();
  if (!recipe) notFound();
  // Seul le créateur peut éditer (RLS update = created_by) → on évite un échec silencieux.
  if (recipe.created_by !== userId) redirect(`/recettes/${id}`);

  const { data: ingredients } = await supabase
    .from('recipe_ingredient')
    .select('free_text, quantity, unit, food_id, food:food_id(name)')
    .eq('recipe_id', id)
    .order('position', { ascending: true });

  const { data: tags } = await supabase.from('recipe_tag').select('tag').eq('recipe_id', id);

  const initial: RecipeFormInitial = {
    name: recipe.name,
    description: recipe.description ?? '',
    instructions: recipe.instructions ?? '',
    prepTimeMin: recipe.prep_time_min != null ? String(recipe.prep_time_min) : '',
    cookTimeMin: recipe.cook_time_min != null ? String(recipe.cook_time_min) : '',
    servings: recipe.servings != null ? String(recipe.servings) : '1',
    tags: (tags ?? []).map((t) => t.tag).join(', '),
    ingredients: (ingredients ?? []).map((ing) => {
      const food = Array.isArray(ing.food) ? ing.food[0] : ing.food;
      return {
        foodId: ing.food_id,
        name: food?.name ?? ing.free_text ?? '',
        quantity: ing.quantity != null ? String(ing.quantity) : '',
        unit: ing.unit ?? '',
      };
    }),
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Modifier la recette</h1>
        <Link href={`/recettes/${id}`} className="text-sm text-ink-soft underline">
          Retour
        </Link>
      </div>
      <RecipeForm mode="edit" recipeId={id} initial={initial} />
    </div>
  );
}
