'use client';

import { useActionState, useState } from 'react';
import { createRecipeAction, type RecipeFormState } from '../actions';

interface FoodOption {
  id: string;
  name: string;
}

interface IngredientRow {
  foodId: string;
  freeText: string;
  quantity: string;
  unit: string;
}

const EMPTY_ROW: IngredientRow = { foodId: '', freeText: '', quantity: '', unit: '' };

export function RecipeForm({ foods }: { foods: FoodOption[] }) {
  const [rows, setRows] = useState<IngredientRow[]>([{ ...EMPTY_ROW }]);
  const [state, formAction, pending] = useActionState<RecipeFormState | undefined, FormData>(
    createRecipeAction,
    undefined,
  );

  const update = (i: number, patch: Partial<IngredientRow>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const ingredientsJson = JSON.stringify(
    rows.map((r) => ({
      foodId: r.foodId || undefined,
      freeText: r.freeText || undefined,
      quantity: r.quantity ? Number(r.quantity) : undefined,
      unit: r.unit || undefined,
    })),
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="ingredients_json" value={ingredientsJson} />

      <label className="flex flex-col gap-1 text-sm">
        Nom
        <input name="name" required className="rounded border border-line-strong px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
      </label>

      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Préparation (min)
          <input name="prep_time_min" type="number" min="0" className="rounded border border-line-strong px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Cuisson (min)
          <input name="cook_time_min" type="number" min="0" className="rounded border border-line-strong px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Portions
          <input name="servings" type="number" min="1" defaultValue="1" className="rounded border border-line-strong px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">Ingrédients</legend>
        {rows.map((row, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select
              value={row.foodId}
              onChange={(e) => update(i, { foodId: e.target.value })}
              className="min-w-40 flex-1 rounded border border-line-strong px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
            >
              <option value="">— aliment libre —</option>
              {foods.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            {!row.foodId && (
              <input
                placeholder="libellé"
                value={row.freeText}
                onChange={(e) => update(i, { freeText: e.target.value })}
                className="flex-1 rounded border border-line-strong px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
            )}
            <input
              placeholder="qté"
              type="number"
              step="any"
              value={row.quantity}
              onChange={(e) => update(i, { quantity: e.target.value })}
              className="w-20 rounded border border-line-strong px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
            />
            <input
              placeholder="unité"
              value={row.unit}
              onChange={(e) => update(i, { unit: e.target.value })}
              className="w-20 rounded border border-line-strong px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
            />
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
                className="text-sm text-red-strong"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setRows((rs) => [...rs, { ...EMPTY_ROW }])}
          className="self-start text-sm text-green-strong underline"
        >
          + Ajouter un ingrédient
        </button>
        <p className="text-xs text-ink-soft">
          Liez un aliment importé pour que la nutrition soit calculée (la quantité est interprétée
          dans l’unité de base de l’aliment, en g/ml).
        </p>
      </fieldset>

      <label className="flex flex-col gap-1 text-sm">
        Étapes
        <textarea name="instructions" rows={4} className="rounded border border-line-strong px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Tags (séparés par des virgules)
        <input name="tags" placeholder="végétarien, rapide" className="rounded border border-line-strong px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
      </label>

      {state?.error && <p className="text-sm text-red-strong">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-green-strong px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {pending ? '…' : 'Enregistrer la recette'}
      </button>
    </form>
  );
}
