import Link from 'next/link';
import { RecipeForm } from './recipe-form';

export default async function NouvelleRecettePage({
  searchParams,
}: {
  searchParams: Promise<{ return?: string }>;
}) {
  const { return: ret } = await searchParams;
  // On n'accepte qu'un chemin interne (anti open-redirect).
  const returnTo = ret && /^\/(?!\/)/.test(ret) ? ret : undefined;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Nouvelle recette</h1>
        <Link href={returnTo ?? '/recettes'} className="text-sm text-ink-soft underline">
          Retour
        </Link>
      </div>
      <RecipeForm returnTo={returnTo} />
    </div>
  );
}
