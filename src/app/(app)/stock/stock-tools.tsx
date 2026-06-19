'use client';

import { useState, useTransition } from 'react';
import { estimateConservationAction } from './actions';

/** Déclenche l'estimation IA (best-effort, mise en cache) de la conservation des
 *  aliments du stock par lieu. Une fois en cache, les pastilles de péremption « estimé »
 *  apparaissent. */
export function EstimateButton() {
  const [pending, start] = useTransition();
  const [done, setDone] = useState<number | null>(null);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => setDone((await estimateConservationAction()).done))}
      className="btn-secondary flex items-center gap-2 py-2 text-sm disabled:opacity-60"
      title="Estime la durée de conservation par lieu (IA, indicatif)"
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3a9 9 0 1 0 9 9" /><path d="M12 7v5l3 2" />
      </svg>
      {pending ? 'Estimation…' : done != null ? `Conservation estimée (${done})` : 'Estimer la conservation'}
    </button>
  );
}
