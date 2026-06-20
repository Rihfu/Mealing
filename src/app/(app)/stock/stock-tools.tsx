'use client';

import { useState, useTransition } from 'react';
import { estimateConservationAction } from './actions';
import { useStockRefresh } from './stock-refresh';

/** Déclenche l'estimation IA (best-effort, mise en cache) de la conservation des
 *  aliments du stock par lieu. Une fois en cache, les pastilles de péremption « estimé »
 *  apparaissent (pour les articles rangés dans un lieu). Si l'IA ne répond pas (rate-limit
 *  Groq gratuit), le décompte vaut 0 → message explicite + possibilité de réessayer. */
export function EstimateButton() {
  const [pending, start] = useTransition();
  const [done, setDone] = useState<number | null>(null);
  const refresh = useStockRefresh();
  const label = pending
    ? 'Estimation…'
    : done == null
      ? 'Estimer la conservation'
      : done > 0
        ? `Conservation estimée (${done})`
        : 'Indisponible — réessayer';
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => { setDone((await estimateConservationAction()).done); await refresh(); })}
      className="btn-secondary flex items-center gap-2 py-2 text-sm disabled:opacity-60"
      title={done === 0 ? "L’IA n’a rien renvoyé (souvent la limite gratuite Groq). Réessaie dans un moment." : 'Estime la durée de conservation par lieu (IA, indicatif).'}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3a9 9 0 1 0 9 9" /><path d="M12 7v5l3 2" />
      </svg>
      {label}
    </button>
  );
}
