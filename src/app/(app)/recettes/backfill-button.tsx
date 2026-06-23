'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { backfillRecipeLinksAction } from './actions';

/**
 * Relie au catalogue les ingrédients de recettes encore en texte libre (one-shot,
 * idempotent). Débloque la nutrition de recette + la boucle conso→stock.
 */
export function BackfillButton({ count }: { count: number }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState<number | null>(null);
  const router = useRouter();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const n = await backfillRecipeLinksAction();
          setDone(n);
          router.refresh();
        })
      }
      className="btn-secondary disabled:opacity-50"
      title="Relie les ingrédients en texte libre à un aliment du catalogue"
    >
      {pending ? 'Liaison…' : done != null ? `${done} relié(s)` : `Relier les ingrédients (${count})`}
    </button>
  );
}
