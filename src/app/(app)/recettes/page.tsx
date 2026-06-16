import Link from 'next/link';
import { getAuthContext } from '@/lib/auth';

export default async function RecettesPage() {
  const { supabase } = await getAuthContext();
  const { data: recipes } = await supabase
    .from('recipe')
    .select('id, name, prep_time_min, cook_time_min, servings')
    .order('name', { ascending: true });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Recettes</h1>
        <Link
          href="/recettes/nouvelle"
          className="rounded bg-black px-3 py-1.5 text-sm text-white dark:bg-white dark:text-black"
        >
          + Nouvelle
        </Link>
      </div>

      <ul className="flex flex-col divide-y divide-gray-200 dark:divide-gray-800">
        {(recipes ?? []).map((r) => (
          <li key={r.id} className="py-2">
            <Link href={`/recettes/${r.id}`} className="font-medium hover:underline">
              {r.name}
            </Link>
            <span className="ml-2 text-xs text-gray-500">
              {(r.prep_time_min ?? 0) + (r.cook_time_min ?? 0)} min · {r.servings} portion(s)
            </span>
          </li>
        ))}
        {(!recipes || recipes.length === 0) && (
          <li className="py-2 text-sm text-gray-500">
            Aucune recette. Créez-en une pour commencer.
          </li>
        )}
      </ul>
    </div>
  );
}
