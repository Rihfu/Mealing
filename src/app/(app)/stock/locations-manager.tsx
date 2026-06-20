'use client';

import { useState, useTransition } from 'react';
import { createLocationAction, deleteLocationAction, moveLocationAction } from './actions';
import { useStockRefresh } from './stock-refresh';

export interface OrderedLocation {
  key: string;
  label: string;
  isCustom: boolean;
}

/**
 * Gestion des lieux de conservation : créer/supprimer des lieux PERSONNALISÉS et
 * RÉORDONNER tous les lieux (flèches ↑/↓), comme « Ordre des rayons » en Courses.
 */
export function ManageLocations({ ordered }: { ordered: OrderedLocation[] }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [pending, start] = useTransition();
  const refresh = useStockRefresh();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line py-2.5 text-sm font-semibold text-green-strong hover:border-green-strong hover:bg-sage-tint/30"
        title="Créer un lieu / réordonner / supprimer"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Ajouter un lieu
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(40,38,34,0.32)' }} onClick={() => !pending && setOpen(false)}>
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-line bg-surface shadow-soft" onClick={(e) => e.stopPropagation()}>
            <div className="max-h-[85vh] overflow-y-auto p-5">
              <h3 className="font-display text-lg font-semibold">Lieux de conservation</h3>
              <p className="mt-0.5 text-sm text-ink-soft">Range-les dans l’ordre de ton choix ; crée tes propres lieux.</p>

              <ul className="mt-3 divide-y divide-line">
                {ordered.map((l, i) => (
                  <li key={l.key} className="flex items-center gap-2 py-1.5">
                    <span className="flex-1 truncate text-sm">
                      {l.label}
                      {l.isCustom && <span className="ml-1.5 text-xs text-ink-soft">perso</span>}
                    </span>
                    <button type="button" disabled={pending || i === 0} onClick={() => start(async () => { await moveLocationAction({ key: l.key, dir: 'up' }); await refresh(); })} aria-label="Monter" className="rounded-md border border-line p-1 text-ink-soft hover:border-green-strong hover:text-green-strong disabled:opacity-30">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m18 15-6-6-6 6" /></svg>
                    </button>
                    <button type="button" disabled={pending || i === ordered.length - 1} onClick={() => start(async () => { await moveLocationAction({ key: l.key, dir: 'down' }); await refresh(); })} aria-label="Descendre" className="rounded-md border border-line p-1 text-ink-soft hover:border-green-strong hover:text-green-strong disabled:opacity-30">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                    </button>
                    {l.isCustom && (
                      <button type="button" disabled={pending} onClick={() => start(async () => { await deleteLocationAction(l.key); await refresh(); })} className="text-xs font-semibold text-clay-deep hover:underline disabled:opacity-50">
                        supprimer
                      </button>
                    )}
                  </li>
                ))}
              </ul>

              <h4 className="mt-5 font-display text-sm font-semibold">Créer un lieu perso</h4>
              <p className="mt-0.5 text-sm text-ink-soft">Ex. garde-manger, cellier, mini-bar…</p>
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nom du lieu" className="field-input mt-2 w-full" />
              <button
                type="button"
                disabled={pending || !label.trim()}
                onClick={() => start(async () => { await createLocationAction(label.trim()); setLabel(''); await refresh(); })}
                className="btn-primary mt-3 w-full py-2.5 disabled:opacity-60"
              >
                {pending ? 'On crée…' : 'Créer le lieu'}
              </button>

              <button type="button" onClick={() => setOpen(false)} disabled={pending} className="mt-3 w-full py-2 text-sm text-ink-soft">Fermer</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
