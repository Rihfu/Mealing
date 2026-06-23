import Link from 'next/link';
import { RecipeForm } from './recipe-form';

export default function NouvelleRecettePage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Nouvelle recette</h1>
        <Link href="/recettes" className="text-sm text-ink-soft underline">
          Retour
        </Link>
      </div>
      <RecipeForm />
    </div>
  );
}
