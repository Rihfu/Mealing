'use client';

import { useEffect, useRef, useState } from 'react';
import type { RecipeIngredientCoverage } from '@/lib/core';
import { IngredientCoverageList } from './ingredient-coverage';
import { scaleRecipeAction, type ScaledRecipeView } from './actions';

const round2 = (n: number) => Math.round(n * 100) / 100;

const Spinner = (
  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

/**
 * Sélecteur de portions sur la fiche recette : on change le nombre de portions et les
 * quantités d'ingrédients + les temps sont recalculés (par l'IA, cf. `ai/scale-recipe`).
 *
 * UX : recalcul AUTOMATIQUE au changement (pas de bouton), mais **débouncé** (~0,7 s →
 * les clics rapides se regroupent en un seul appel) et **mis en cache** par nombre de
 * portions (revenir à une valeur déjà calculée = instantané). Pendant que l'IA réfléchit,
 * on affiche un **aperçu linéaire** (× ratio) pour que l'écran ne soit jamais figé ; en
 * cas d'indispo IA, l'action retombe d'elle-même sur un scaling linéaire. L'adaptation est
 * ÉPHÉMÈRE (ne modifie pas la recette enregistrée).
 */
export function RecipePortions({
  recipeId,
  baseServings,
  basePrepMin,
  baseCookMin,
  baseItems,
}: {
  recipeId: string;
  baseServings: number;
  basePrepMin: number | null;
  baseCookMin: number | null;
  baseItems: RecipeIngredientCoverage[];
}) {
  const [target, setTarget] = useState(baseServings);
  const [view, setView] = useState<ScaledRecipeView | null>(null);
  const [viewTarget, setViewTarget] = useState<number | null>(null);
  const cacheRef = useRef<Map<number, ScaledRecipeView>>(new Map());

  useEffect(() => {
    if (target === baseServings) return;
    const cached = cacheRef.current.get(target);
    let cancelled = false;
    const t = setTimeout(
      async () => {
        if (cached) {
          if (!cancelled) {
            setView(cached);
            setViewTarget(target);
          }
          return;
        }
        try {
          const res = await scaleRecipeAction(recipeId, target);
          if (cancelled || !res) return;
          cacheRef.current.set(target, res);
          setView(res);
          setViewTarget(target);
        } catch {
          /* on garde l'aperçu linéaire affiché */
        }
      },
      cached ? 0 : 700,
    );
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [target, baseServings, recipeId]);

  const isBase = target === baseServings;
  const hasView = !!view && viewTarget === target;
  const loading = !isBase && !hasView;
  const ratio = baseServings > 0 ? target / baseServings : 1;

  const items: RecipeIngredientCoverage[] = isBase
    ? baseItems
    : hasView
      ? view!.items
      : // Aperçu linéaire transitoire (le statut/stock reste celui de base le temps de l'IA).
        baseItems.map((it) => ({ ...it, requiredQty: it.requiredQty != null ? round2(it.requiredQty * ratio) : null }));

  const prep = isBase ? basePrepMin : hasView ? view!.prepTimeMin : basePrepMin;
  const cook = isBase ? baseCookMin : hasView ? view!.cookTimeMin : baseCookMin;
  const note = hasView ? view!.note : null;
  const approx = !isBase; // « ~ » dès qu'on adapte
  const fallbackLinear = hasView && !view!.usedAI;

  const dec = () => setTarget((n) => Math.max(1, n - 1));
  const inc = () => setTarget((n) => Math.min(99, n + 1));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-3 shadow-soft">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">Portions</span>
          <div className="flex items-center gap-1">
            <button type="button" onClick={dec} disabled={target <= 1} aria-label="Moins de portions" className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-lg leading-none text-ink-soft hover:border-green-strong hover:text-green-strong disabled:opacity-40">−</button>
            <span className="w-8 text-center font-display text-lg font-semibold">{target}</span>
            <button type="button" onClick={inc} disabled={target >= 99} aria-label="Plus de portions" className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-lg leading-none text-ink-soft hover:border-green-strong hover:text-green-strong disabled:opacity-40">+</button>
          </div>
          {!isBase && (
            <button type="button" onClick={() => setTarget(baseServings)} className="text-xs font-semibold text-ink-soft hover:text-clay">
              base : {baseServings}
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-ink-soft">Prépa <span className="font-bold text-ink">{approx && prep != null ? '~' : ''}{prep ?? 0} min</span></span>
          <span className="text-ink-soft">Cuisson <span className="font-bold text-ink">{approx && cook != null ? '~' : ''}{cook ?? 0} min</span></span>
          {loading && <span className="text-green-strong" title="Adaptation en cours…">{Spinner}</span>}
        </div>
      </div>

      {note && <p className="px-1 text-xs italic text-ink-soft">{note}</p>}
      {fallbackLinear && !note && (
        <p className="px-1 text-xs text-ink-soft">Adapté proportionnellement (IA momentanément indisponible).</p>
      )}

      <IngredientCoverageList items={items} recipeId={recipeId} />
    </div>
  );
}
