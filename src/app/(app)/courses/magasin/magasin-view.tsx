'use client';

import Link from 'next/link';
import { useCachedResource } from '@/lib/offline/cache';
import { getMagasinSnapshotAction, type MagasinSnapshot } from './actions';
import { StoreList } from './store-list';

/**
 * Vue « En magasin » alimentée par le cache (Phase 2) : affichage INSTANTANÉ depuis
 * IndexedDB (cache d'abord), revalidation réseau en arrière-plan, et **lecture
 * hors-ligne** de la liste (essentiel en supermarché sans réseau). Les coches restent
 * optimistes ; leur synchro hors-ligne viendra en Phase 3 (file d'attente).
 */
export function MagasinView() {
  const { data, loading, offline, refresh } = useCachedResource<MagasinSnapshot | null>(
    'magasin:snapshot',
    getMagasinSnapshotAction,
  );
  const groups = data?.groups ?? [];

  return (
    <div className="mx-auto w-full max-w-md pb-28">
      <div className="flex items-center justify-between gap-3">
        <Link href="/courses" className="flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Liste
        </Link>
        <h1 className="font-display text-2xl font-semibold">En magasin</h1>
        {offline ? (
          <span
            className="rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{ background: 'var(--color-butter-tint)', color: '#8a6d1f' }}
            title="Affichage depuis le cache — pas de réseau"
          >
            hors-ligne
          </span>
        ) : (
          <span className="w-14" />
        )}
      </div>

      {loading && !data ? (
        <p className="mt-10 text-center text-sm text-ink-soft">Chargement de ta liste…</p>
      ) : (
        <StoreList groups={groups} refresh={refresh} />
      )}
    </div>
  );
}
