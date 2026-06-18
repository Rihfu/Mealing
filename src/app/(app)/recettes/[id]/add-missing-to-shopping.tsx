'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { addRecipeMissingToShoppingAction } from './actions';

/**
 * CTA « Ajouter les ingrédients manquants à ma liste de courses » sur le détail
 * recette : compare la recette au stock et ajoute ce qui manque (rangé par rayon).
 * Reste sur la page et affiche le résultat (+ lien vers la liste).
 */
export function AddMissingToShopping({ recipeId }: { recipeId: string }) {
  const [pending, start] = useTransition();
  const [added, setAdded] = useState<number | null>(null);

  function run() {
    setAdded(null);
    start(async () => {
      setAdded(await addRecipeMissingToShoppingAction(recipeId));
    });
  }

  return (
    <div className="mt-4">
      <button type="button" onClick={run} disabled={pending} className="btn-primary py-2.5 disabled:opacity-60">
        {pending ? 'On ajoute…' : 'Ajouter les ingrédients manquants à ma liste de courses'}
      </button>
      {added != null && (
        <p className="mt-2 text-sm text-ink-soft">
          {added > 0 ? (
            <>
              {added} ingrédient{added > 1 ? 's' : ''} ajouté{added > 1 ? 's' : ''} à ta liste.{' '}
              <Link href="/courses" className="font-bold text-green-strong hover:underline">
                Voir la liste de courses
              </Link>
            </>
          ) : (
            <>
              Tout est déjà en stock — rien à ajouter.{' '}
              <Link href="/courses" className="font-bold text-green-strong hover:underline">
                Voir la liste
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}
