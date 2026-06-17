import Link from 'next/link';
import { GenerateForm } from './generate-form';

export default function GenererRecettePage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Générer une recette</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Décris ce que tu veux ; l’IA propose une recette structurée que tu peux relire avant de
            l’enregistrer.
          </p>
        </div>
        <Link href="/recettes" className="text-sm font-bold text-sage-deep hover:underline">
          Retour
        </Link>
      </div>
      <GenerateForm />
    </div>
  );
}
