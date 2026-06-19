'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { idbGet, idbSet } from './idb';

export interface CachedResource<T> {
  data: T | undefined;
  /** true tant qu'on n'a NI cache NI réponse réseau (premier chargement sans cache). */
  loading: boolean;
  /** true si la revalidation réseau a échoué (on affiche alors le cache). */
  offline: boolean;
  /**
   * Force une revalidation réseau (ex. après une mutation). La promesse se résout APRÈS
   * la mise à jour des données → on peut l'`await` dans une transition pour que les états
   * optimistes (useOptimistic) se réconcilient sans clignotement.
   */
  refresh: () => Promise<void>;
}

/**
 * Lecture « cache d'abord » : renvoie INSTANTANÉMENT la valeur IndexedDB si présente,
 * puis revalide via `loader` (server action) en arrière-plan quand on est en ligne et
 * réécrit le cache. Hors-ligne, on se contente du cache. `loader` DOIT être stable
 * (passer la référence d'une server action importée, pas une closure recréée).
 */
export function useCachedResource<T>(key: string, loader: () => Promise<T>): CachedResource<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  // Garde anti-course : seule la réponse de la dernière revalidation est appliquée.
  const reqId = useRef(0);

  // setState toujours dans des callbacks de promesse (différés) → pas de cascade de
  // rendus synchrone dans l'effet. Renvoie une promesse résolue après mise à jour.
  const revalidate = useCallback((): Promise<void> => {
    const my = ++reqId.current;
    const online = typeof navigator === 'undefined' || navigator.onLine;
    if (!online) {
      return idbGet<T>(key).then((cached) => {
        if (my !== reqId.current) return;
        if (cached !== undefined) setData(cached);
        setOffline(true);
        setLoading(false);
      });
    }
    return loader()
      .then((fresh) => {
        if (my !== reqId.current) return;
        setData(fresh);
        setLoading(false);
        setOffline(false);
        void idbSet(key, fresh);
      })
      .catch(() => {
        if (my !== reqId.current) return;
        setOffline(true);
        setLoading(false);
      });
  }, [key, loader]);

  useEffect(() => {
    let cancelled = false;
    // 1) cache d'abord (instantané)
    idbGet<T>(key).then((cached) => {
      if (!cancelled && cached !== undefined) {
        setData(cached);
        setLoading(false);
      }
    });
    // 2) revalidation réseau (en arrière-plan)
    void revalidate();
    // Revalide automatiquement au retour de connexion.
    const onOnline = () => void revalidate();
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
    };
  }, [key, revalidate]);

  return { data, loading, offline, refresh: revalidate };
}
