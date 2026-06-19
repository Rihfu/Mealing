'use client';

import { useCallback, useEffect, useState } from 'react';
import { CACHE_VERSION, purgeCacheIfStale } from '@/lib/offline/idb';
import { flushQueue, getQueue, QUEUE_EVENT, type QueuedOp } from '@/lib/offline/queue';
import { toggleCheckAction } from './courses/actions';

/** Rejoue une coche mise en file hors-ligne (set d'état idempotent côté serveur). */
const replay = async (op: QueuedOp) => {
  const fd = new FormData();
  fd.set('item_key', op.key);
  fd.set('checked', String(op.checked));
  await toggleCheckAction(fd);
};

/**
 * Gestionnaire de synchro GLOBAL (Phase 4 PWA) — monté dans le shell de l'app :
 * - purge le cache si la version a changé (invalidation aux MAJ de schéma) ;
 * - suit l'état réseau et le nombre de coches en attente de synchro ;
 * - rejoue la file au retour du réseau, où qu'on soit dans l'app (pas seulement
 *   sur la page magasin) — flush partagé/idempotent avec le mode magasin ;
 * - affiche une pastille discrète « Hors-ligne / Synchronisation / Synchronisé ».
 */
export function SyncManager() {
  // Démarre « en ligne » (= rendu serveur) pour éviter un écart d'hydratation ;
  // l'état réel est corrigé juste après le montage (setState différé).
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [justSynced, setJustSynced] = useState(0);

  const refreshCount = useCallback(() => {
    getQueue().then((q) => setPending(q.length));
  }, []);

  const trySync = useCallback(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    getQueue().then(async (q) => {
      if (q.length === 0) return;
      const n = q.length;
      const ok = await flushQueue(replay);
      if (ok) {
        setJustSynced(n);
        setTimeout(() => setJustSynced(0), 2500);
      }
      refreshCount();
    });
  }, [refreshCount]);

  useEffect(() => {
    void purgeCacheIfStale(CACHE_VERSION);
    // setState différés (microtâche) → pas de cascade synchrone dans l'effet.
    queueMicrotask(() => setOnline(typeof navigator === 'undefined' ? true : navigator.onLine));
    refreshCount();
    const onOnline = () => {
      setOnline(true);
      trySync();
    };
    const onOffline = () => setOnline(false);
    const onQueue = () => refreshCount();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener(QUEUE_EVENT, onQueue);
    if (typeof navigator === 'undefined' || navigator.onLine) trySync();
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener(QUEUE_EVENT, onQueue);
    };
  }, [trySync, refreshCount]);

  // Rien à montrer si tout est nominal (en ligne, rien en attente / juste synchronisé).
  if (online && pending === 0 && justSynced === 0) return null;

  let label: string;
  let bg: string;
  let color: string;
  let dot: string;
  if (!online) {
    label = pending > 0 ? `Hors-ligne · ${pending} en attente` : 'Hors-ligne';
    bg = 'var(--color-butter-tint)';
    color = '#8a6d1f';
    dot = '#caa53e';
  } else if (pending > 0) {
    label = `Synchronisation… (${pending})`;
    bg = 'var(--color-sage-tint)';
    color = 'var(--color-sage-deep)';
    dot = 'var(--color-green-strong)';
  } else {
    label = justSynced > 1 ? `${justSynced} coches synchronisées` : 'Synchronisé';
    bg = 'var(--color-sage-tint)';
    color = 'var(--color-sage-deep)';
    dot = 'var(--color-green-strong)';
  }

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-50">
      <div
        className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold shadow-soft ring-1 ring-black/5"
        style={{ background: bg, color }}
        role="status"
        aria-live="polite"
      >
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: dot }} />
        {label}
      </div>
    </div>
  );
}
