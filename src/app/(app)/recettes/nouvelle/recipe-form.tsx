'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import {
  createRecipeAction,
  updateRecipeAction,
  searchCatalogAction,
  type RecipeFormState,
} from '../actions';
import { UNIT_OPTIONS } from '@/lib/units';
import type { FoodSuggestion } from '@/lib/core';

/** Valeur d'un ingrédient existant pour pré-remplir le formulaire en édition. */
export interface IngredientInitial {
  foodId: string | null;
  /** Libellé affiché (food.name si lié, sinon free_text). */
  name: string;
  quantity: string;
  unit: string;
}

export interface RecipeFormInitial {
  name: string;
  description: string;
  instructions: string;
  prepTimeMin: string;
  cookTimeMin: string;
  servings: string;
  /** Tags séparés par des virgules. */
  tags: string;
  ingredients: IngredientInitial[];
}

interface Row {
  foodId: string | null;
  source: string;
  externalId: string;
  freeText: string;
  quantity: string;
  unit: string;
}

const EMPTY_ROW: Row = { foodId: null, source: '', externalId: '', freeText: '', quantity: '', unit: '' };

/**
 * Une ligne d'ingrédient avec autocomplétion catalogue (local + USDA/OFF), calquée
 * sur l'ajout d'article des Courses (`courses/add-article.tsx`). On lie un aliment
 * pour activer la nutrition de recette ; le texte libre est relié automatiquement à
 * l'enregistrement (résolveur catalogue côté serveur).
 */
function IngredientRow({
  value,
  onChange,
  onRemove,
  canRemove,
}: {
  value: Row;
  onChange: (patch: Partial<Row>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const [query, setQuery] = useState(value.freeText);
  const [suggestions, setSuggestions] = useState<FoodSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  // La liste de suggestions n'apparaît QUE si le champ a le focus → aucune recherche
  // ni aucun dropdown au montage (corrige l'encombrement à l'ouverture d'une recette,
  // robuste même au double-montage StrictMode en dev).
  const [focused, setFocused] = useState(false);
  const justPicked = useRef(false);

  // Recherche débouncée pendant la saisie (sautée juste après un choix de suggestion,
  // et seulement quand le champ a le focus). Pas de setState synchrone dans l'effet
  // (règle react-hooks/set-state-in-effect) : le nettoyage se fait dans `typeText`.
  useEffect(() => {
    if (justPicked.current) {
      justPicked.current = false;
      return;
    }
    if (!focused || query.trim().length < 2) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await searchCatalogAction(query);
        if (!cancelled) {
          setSuggestions(res);
          setOpen(true);
        }
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, focused]);

  function typeText(v: string) {
    setQuery(v);
    // Saisie libre → on délie (sera résolu au catalogue à l'enregistrement).
    onChange({ freeText: v, foodId: null, source: '', externalId: '' });
    if (v.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
    }
  }

  function pick(s: FoodSuggestion) {
    justPicked.current = true;
    setQuery(s.name);
    setOpen(false);
    setSuggestions([]);
    onChange({
      freeText: s.name,
      foodId: s.foodId,
      source: s.foodId ? '' : s.source,
      externalId: s.foodId ? '' : (s.externalId ?? ''),
      ...(s.defaultUnit ? { unit: s.defaultUnit } : {}),
    });
  }

  const linked = !!value.foodId || (!!value.source && !!value.externalId);

  return (
    <div className="flex flex-wrap items-start gap-2">
      <div className="relative min-w-44 flex-1">
        <input
          value={query}
          onChange={(e) => typeText(e.target.value)}
          onFocus={() => {
            setFocused(true);
            if (suggestions.length > 0) setOpen(true);
          }}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          placeholder="Ingrédient (ex. poulet, riz…)"
          autoComplete="off"
          className="field-input w-full"
        />
        {focused && open && suggestions.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-line bg-surface py-1 shadow-soft">
            {suggestions.map((s) => (
              <li key={`${s.source}:${s.foodId ?? s.externalId ?? s.name}`}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(s);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-sage-tint/40"
                >
                  <span className="flex-1">{s.name}</span>
                  {!s.foodId && <span className="text-xs text-ink-soft">importer</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        {query.trim().length >= 2 && (
          <p className="mt-1 text-[11px] text-ink-soft">
            {linked ? '✓ lié au catalogue' : 'texte libre — relié automatiquement à l’enregistrement'}
          </p>
        )}
      </div>
      <input
        type="number"
        step="any"
        value={value.quantity}
        onChange={(e) => onChange({ quantity: e.target.value })}
        placeholder="Qté"
        className="field-input w-20"
      />
      <select
        value={value.unit}
        onChange={(e) => onChange({ unit: e.target.value })}
        className="field-input w-24"
        aria-label="Unité"
      >
        {UNIT_OPTIONS.map((u) => (
          <option key={u.code} value={u.code}>
            {u.label}
          </option>
        ))}
      </select>
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="px-2 py-2 text-sm font-bold text-clay"
          aria-label="Retirer l’ingrédient"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export function RecipeForm({
  mode = 'create',
  recipeId,
  initial,
  returnTo,
}: {
  mode?: 'create' | 'edit';
  recipeId?: string;
  initial?: RecipeFormInitial;
  /** Chemin de retour après création (ex. revenir au planning et rattacher la recette). */
  returnTo?: string;
}) {
  const [rows, setRows] = useState<Row[]>(
    initial && initial.ingredients.length > 0
      ? initial.ingredients.map((i) => ({
          foodId: i.foodId,
          source: '',
          externalId: '',
          freeText: i.name,
          quantity: i.quantity,
          unit: i.unit,
        }))
      : [{ ...EMPTY_ROW }],
  );

  const action = mode === 'edit' ? updateRecipeAction : createRecipeAction;
  const [state, formAction, pending] = useActionState<RecipeFormState | undefined, FormData>(action, undefined);

  const updateRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const ingredientsJson = JSON.stringify(
    rows
      .filter((r) => r.foodId || r.freeText.trim())
      .map((r) => ({
        foodId: r.foodId || undefined,
        freeText: r.freeText.trim() || undefined,
        quantity: r.quantity ? Number(r.quantity) : undefined,
        unit: r.unit || undefined,
        source: r.source || undefined,
        externalId: r.externalId || undefined,
      })),
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="ingredients_json" value={ingredientsJson} />
      {mode === 'edit' && recipeId && <input type="hidden" name="recipe_id" value={recipeId} />}
      {mode === 'create' && returnTo && <input type="hidden" name="return_to" value={returnTo} />}

      <label className="flex flex-col gap-1 text-sm font-semibold">
        Nom
        <input name="name" required defaultValue={initial?.name} className="field-input font-normal" />
      </label>

      <label className="flex flex-col gap-1 text-sm font-semibold">
        Description
        <textarea name="description" rows={2} defaultValue={initial?.description} className="field-input font-normal" />
      </label>

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-1 flex-col gap-1 text-sm font-semibold">
          Préparation (min)
          <input name="prep_time_min" type="number" min="0" defaultValue={initial?.prepTimeMin} className="field-input font-normal" />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm font-semibold">
          Cuisson (min)
          <input name="cook_time_min" type="number" min="0" defaultValue={initial?.cookTimeMin} className="field-input font-normal" />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm font-semibold">
          Portions
          <input name="servings" type="number" min="1" defaultValue={initial?.servings ?? '1'} className="field-input font-normal" />
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">Ingrédients</legend>
        {rows.map((row, i) => (
          <IngredientRow
            key={i}
            value={row}
            onChange={(patch) => updateRow(i, patch)}
            onRemove={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
            canRemove={rows.length > 1}
          />
        ))}
        <button
          type="button"
          onClick={() => setRows((rs) => [...rs, { ...EMPTY_ROW }])}
          className="self-start text-sm font-semibold text-sage-deep hover:underline"
        >
          + Ajouter un ingrédient
        </button>
        <p className="text-xs text-ink-soft">
          Lie un aliment pour activer le calcul nutritionnel et le suivi du stock. La quantité est
          interprétée dans l’unité de base de l’aliment (g/ml).
        </p>
      </fieldset>

      <label className="flex flex-col gap-1 text-sm font-semibold">
        Étapes
        <textarea name="instructions" rows={5} defaultValue={initial?.instructions} className="field-input font-normal" />
      </label>

      <label className="flex flex-col gap-1 text-sm font-semibold">
        Tags (séparés par des virgules)
        <input name="tags" placeholder="végétarien, rapide" defaultValue={initial?.tags} className="field-input font-normal" />
      </label>

      {state?.error && <p className="text-sm font-semibold text-clay">{state.error}</p>}

      <button type="submit" disabled={pending} className="btn-primary self-start disabled:opacity-50">
        {pending ? '…' : mode === 'edit' ? 'Enregistrer les modifications' : 'Enregistrer la recette'}
      </button>
    </form>
  );
}
