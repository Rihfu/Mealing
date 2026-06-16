'use client';

import { useActionState } from 'react';
import { generateRecipeAction, saveGeneratedRecipeAction, type GenerateState } from './actions';

export function GenerateForm() {
  const [state, formAction, pending] = useActionState<GenerateState | undefined, FormData>(
    generateRecipeAction,
    undefined,
  );
  const draft = state?.draft;

  return (
    <div className="flex flex-col gap-5">
      <form action={formAction} className="flex flex-col gap-2">
        <textarea
          name="request"
          rows={3}
          required
          placeholder="Ex. un curry de pois chiches rapide pour 4, végétarien, sans noix"
          className="rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
        />
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {pending ? 'Génération…' : 'Générer'}
        </button>
      </form>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      {draft && (
        <div className="flex flex-col gap-3 rounded border border-gray-200 p-4 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-semibold">{draft.name}</h2>
            {draft.description && <p className="text-sm text-gray-500">{draft.description}</p>}
            <p className="text-xs text-gray-500">
              {(draft.prepTimeMin ?? 0) + (draft.cookTimeMin ?? 0)} min · {draft.servings ?? 1}{' '}
              portion(s)
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Ingrédients</h3>
            <ul className="list-inside list-disc text-sm">
              {draft.ingredients.map((i, idx) => (
                <li key={idx}>
                  {i.quantity ?? ''} {i.unit ?? ''} {i.name}
                </li>
              ))}
            </ul>
          </div>

          {draft.steps.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold">Étapes</h3>
              <ol className="list-inside list-decimal text-sm">
                {draft.steps.map((s, idx) => (
                  <li key={idx}>{s}</li>
                ))}
              </ol>
            </div>
          )}

          {draft.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {draft.tags.map((t) => (
                <span key={t} className="rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-800">
                  {t}
                </span>
              ))}
            </div>
          )}

          <p className="text-xs text-gray-500">
            Les ingrédients sont enregistrés en texte libre. Liez-les à des aliments importés (page
            Aliments) pour activer le calcul nutritionnel — l’IA ne fournit aucune valeur
            nutritionnelle.
          </p>

          <form action={saveGeneratedRecipeAction}>
            <input type="hidden" name="draft" value={JSON.stringify(draft)} />
            <button className="rounded bg-black px-4 py-2 text-sm text-white dark:bg-white dark:text-black">
              Enregistrer cette recette
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
