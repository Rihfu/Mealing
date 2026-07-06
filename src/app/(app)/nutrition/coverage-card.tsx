'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { repairNutritionDataAction, type RepairNutritionResult } from './actions';
import type { NutritionCoverage } from '@/lib/core';

/**
 * Indicateur d'honnêteté des chiffres (N0, principe n°2) : « X % de la semaine
 * couvert par des données nutritionnelles » + bouton de réparation de la chaîne
 * (liaison ingrédients→catalogue puis complétion nutrition fournisseur).
 */
export function CoverageCard({ coverage }: { coverage: NutritionCoverage }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<RepairNutritionResult | null>(null);

  const pct =
    coverage.mealsTotal > 0 ? Math.round((coverage.mealsCovered / coverage.mealsTotal) * 100) : null;
  // « Complet » = tous les repas calculables ET tous les ingrédients avec données —
  // sinon on laisse le bouton (une relance peut compléter les aliments restants).
  const full = pct === 100 && coverage.ingredientsWithData >= coverage.ingredientsTotal;

  const repair = () =>
    startTransition(async () => {
      const r = await repairNutritionDataAction();
      setResult(r);
      router.refresh();
    });

  return (
    <section
      className={`rounded-2xl border p-4 shadow-soft ${full ? 'border-line bg-surface' : 'border-orange/40 bg-sage-tint/30'}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Couverture des données</h2>
          <p className="mt-0.5 text-sm text-ink-soft">
            {pct == null
              ? 'Aucun repas planifié cette semaine — les chiffres s’activeront avec le planning.'
              : `Cette semaine : ${pct} % des repas couverts (${coverage.mealsCovered}/${coverage.mealsTotal})` +
                (coverage.ingredientsTotal > 0
                  ? ` · ${coverage.ingredientsWithData}/${coverage.ingredientsTotal} ingrédients avec données`
                  : '')}
          </p>
        </div>
        {!full && coverage.mealsTotal > 0 && (
          <button type="button" onClick={repair} disabled={pending} className="btn-secondary shrink-0 px-4 py-2 text-sm">
            {pending ? 'Complétion en cours…' : 'Compléter les données'}
          </button>
        )}
      </div>
      {result && (
        <p className="mt-2 text-xs text-ink-soft" role="status">
          {result.linked} ingrédient(s) relié(s) au catalogue · {result.completed} aliment(s) complété(s)
          {result.remaining > 0
            ? ` · ${result.remaining} restant(s) — relance pour continuer.`
            : ' · chaîne à jour.'}
        </p>
      )}
      {!full && coverage.mealsTotal > 0 && !result && (
        <p className="mt-2 text-xs leading-relaxed text-ink-soft">
          Les valeurs viennent toujours d’une base nutritionnelle (USDA / Open Food Facts), jamais d’une estimation
          IA. Compléter relie les ingrédients au catalogue puis récupère leurs valeurs.
        </p>
      )}
    </section>
  );
}
