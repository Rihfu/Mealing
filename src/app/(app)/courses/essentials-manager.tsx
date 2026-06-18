'use client';

import { useState, useTransition } from 'react';
import { removeEssentialAction } from './actions';

export interface EssentialView {
  id: string;
  label: string;
}

/**
 * « Mes essentiels » : puces des produits récurrents, avec désépinglage (×).
 * Réutilisé sur la page Statistiques et en accès rapide dans la liste de courses.
 */
export function EssentialsManager({ items }: { items: EssentialView[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, start] = useTransition();

  function remove(id: string) {
    setPendingId(id);
    start(async () => {
      await removeEssentialAction(id);
      setPendingId(null);
    });
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-ink-soft">
        Aucun essentiel pour l’instant. Marque tes basiques depuis « À racheter bientôt » ou via l’épingle ★ d’un
        article — ils reviendront tout seuls dans ta liste.
      </p>
    );
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((e) => (
        <li
          key={e.id}
          className={`flex items-center gap-1.5 rounded-full border border-line bg-paper py-1 pl-3 pr-1 text-sm ${pendingId === e.id ? 'opacity-50' : ''}`}
        >
          <span className="text-amber-500">★</span>
          <span>{e.label}</span>
          <button
            type="button"
            onClick={() => remove(e.id)}
            disabled={pendingId === e.id}
            aria-label={`Retirer ${e.label} des essentiels`}
            title="Retirer des essentiels"
            className="flex h-5 w-5 items-center justify-center rounded-full text-ink-soft hover:bg-line hover:text-clay-deep"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </li>
      ))}
    </ul>
  );
}
