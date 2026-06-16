import Link from 'next/link';
import { getAuthContext } from '@/lib/auth';
import { RecipeForm } from './recipe-form';

export default async function NouvelleRecettePage() {
  const { supabase } = await getAuthContext();
  const { data: foods } = await supabase
    .from('food')
    .select('id, name')
    .order('name', { ascending: true })
    .limit(500);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Nouvelle recette</h1>
        <Link href="/recettes" className="text-sm text-ink-soft underline">
          Retour
        </Link>
      </div>
      <RecipeForm foods={foods ?? []} />
    </div>
  );
}
