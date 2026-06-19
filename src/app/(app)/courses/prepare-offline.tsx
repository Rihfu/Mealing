'use client';

import { useState } from 'react';
import { idbSet } from '@/lib/offline/idb';
import { prefetchListFichesAction } from './produit/[id]/actions';

/**
 * « Préparer pour le magasin » (Phase 3 PWA) : un appel groupé pré-charge les fiches
 * (prix + habitudes + nutrition) de TOUS les articles de la liste et les persiste en
 * IndexedDB (clé `fiche:<foodId>`). Une fois préparées, elles sont consultables
 * HORS-LIGNE en rayon (supermarché sans réseau). À lancer quand la liste est prête.
 */
export function PrepareOffline() {
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [count, setCount] = useState(0);

  function run() {
    if (state === 'working') return;
    setState('working');
    prefetchListFichesAction()
      .then(async (bundles) => {
        const ids = Object.keys(bundles);
        await Promise.all(ids.map((id) => idbSet(`fiche:${id}`, bundles[id])));
        setCount(ids.length);
        setState('done');
      })
      .catch(() => setState('error'));
  }

  const label =
    state === 'working'
      ? 'Préparation…'
      : state === 'done'
        ? `Prêt hors-ligne (${count})`
        : state === 'error'
          ? 'Réessayer'
          : 'Préparer pour le magasin';

  return (
    <button
      type="button"
      onClick={run}
      disabled={state === 'working'}
      className="btn-secondary flex items-center gap-2 py-2 text-sm disabled:opacity-60"
      title="Pré-charge les fiches produits pour les consulter sans réseau en magasin"
    >
      {state === 'done' ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v12" />
          <path d="m8 11 4 4 4-4" />
          <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
      )}
      {label}
    </button>
  );
}
