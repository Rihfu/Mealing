'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { applyDueMealsAction, undoMealsAction } from './actions';
import type { MealStockSummary } from '@/lib/core';

/**
 * Boucle consommation → stock (specs 3.4), déclenchée AU MONTAGE (effet client, pas au
 * rendu serveur → pas de décrément au prefetch). Les repas passés (mangés par défaut)
 * décrémentent automatiquement le stock de leurs ingrédients liés. Silencieux, mais un
 * bandeau récapitule + permet d'ANNULER.
 */
export function MealReconcile() {
  const [summary, setSummary] = useState<MealStockSummary | null>(null);
  const [pending, start] = useTransition();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // évite le double-run (StrictMode en dev) ; idempotent côté serveur
    ran.current = true;
    applyDueMealsAction()
      .then((s) => {
        if (s.decrements.length > 0) setSummary(s);
      })
      .catch(() => {});
  }, []);

  if (!summary) return null;
  const n = summary.decrements.length;

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm lg:col-span-2"
      style={{ background: 'var(--color-sage-tint)', color: 'var(--color-sage-deep)' }}
      role="status"
    >
      <span className="font-semibold">
        Stock mis à jour : {n} ingrédient{n > 1 ? 's' : ''} retiré{n > 1 ? 's' : ''} suite à tes repas passés.
      </span>
      <span className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => { await undoMealsAction(summary); setSummary(null); })}
          className="rounded-full border border-sage-deep/30 px-3 py-1 font-semibold hover:bg-white/40 disabled:opacity-60"
        >
          Annuler
        </button>
        <button type="button" onClick={() => setSummary(null)} className="rounded-full px-3 py-1 font-semibold text-ink-soft hover:bg-white/40">
          OK
        </button>
      </span>
    </div>
  );
}
