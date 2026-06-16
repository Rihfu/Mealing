'use client';

import { useActionState } from 'react';
import { searchFoodsAction, importFoodAction, type FoodSearchState } from './actions';

const SOURCE_LABEL: Record<string, string> = {
  usda: 'USDA',
  openfoodfacts: 'Open Food Facts',
};

export function FoodSearch() {
  const [state, formAction, pending] = useActionState<FoodSearchState | undefined, FormData>(
    searchFoodsAction,
    undefined,
  );

  return (
    <div className="flex flex-col gap-3">
      <form action={formAction} className="flex gap-2">
        <input
          name="q"
          placeholder="Rechercher un aliment (ex. carotte, lait…)"
          className="flex-1 rounded border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {pending ? '…' : 'Chercher'}
        </button>
      </form>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <ul className="flex flex-col divide-y divide-gray-200 dark:divide-gray-800">
        {(state?.results ?? []).map((r) => (
          <li key={`${r.source}:${r.externalId}`} className="flex items-center justify-between py-2">
            <div className="text-sm">
              <span>{r.name || '(sans nom)'}</span>
              {r.brand && <span className="text-gray-500"> · {r.brand}</span>}
              <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                {SOURCE_LABEL[r.source] ?? r.source}
              </span>
            </div>
            <form action={importFoodAction}>
              <input type="hidden" name="source" value={r.source} />
              <input type="hidden" name="external_id" value={r.externalId} />
              <button type="submit" className="text-sm text-blue-600 underline">
                Importer
              </button>
            </form>
          </li>
        ))}
        {state?.results && state.results.length === 0 && (
          <li className="py-2 text-sm text-gray-500">Aucun résultat.</li>
        )}
      </ul>
    </div>
  );
}
