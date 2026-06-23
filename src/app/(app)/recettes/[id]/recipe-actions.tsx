'use client';

import Link from 'next/link';
import { useState } from 'react';
import { deleteRecipeAction } from '../actions';

/**
 * Actions réservées au créateur de la recette (RLS) : modifier + supprimer.
 * Suppression confirmée en place (action irréversible).
 */
export function RecipeOwnerActions({ recipeId }: { recipeId: string }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`/recettes/${recipeId}/modifier`} className="btn-secondary">
        Modifier
      </Link>
      {!confirming ? (
        <button type="button" onClick={() => setConfirming(true)} className="btn-danger">
          Supprimer
        </button>
      ) : (
        <form action={deleteRecipeAction} className="flex items-center gap-2">
          <input type="hidden" name="recipe_id" value={recipeId} />
          <span className="text-xs text-ink-soft">Confirmer ?</span>
          <button type="submit" className="btn-danger">
            Oui, supprimer
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="btn-secondary">
            Annuler
          </button>
        </form>
      )}
    </div>
  );
}
