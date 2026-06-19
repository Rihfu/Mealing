'use client';

import { useCallback, useEffect, useState } from 'react';
import { idbGet, idbSet } from './idb';

export interface CachedResource<T> {
  data: T | undefined;
  /** true tant qu'on n'a NI cache NI réponse réseau (premier chargement sans cache). */
  loading: boolean;
  /** true si la revalidation réseau a échoué (on affiche alors le cache). */
  offline: boolean;
  /** force une revalidation réseau (ex. après une mutation). */
  refresh: () => void;
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

  const run = useCallback(() => {
    let cancelled = false;
    // 1) cache d'abord (instantané)
    idbGet<T>(key).then((cached) => {
      if (!cancelled && cached !== undefined) {
        setData(cached);
        setLoading(false);
      }
    });
    // 2) revalidation réseau (si en ligne)
    const online = typeof navigator === 'undefined' || navigator.onLine;
    if (online) {
      loader()
        .then((fresh) => {
          if (cancelled) return;
          setData(fresh);
          setLoading(false);
          setOffline(false);
          void idbSet(key, fresh);
        })
        .catch(() => {
          if (!cancelled) {
            setOffline(true);
            setLoading(false);
          }
        });
    } else {
      // hors-ligne : on reste sur le cache (déjà lu ci-dessus)
      idbGet<T>(key).then(() => {
        if (!cancelled) {
          setOffline(true);
          setLoading(false);
        }
      });
    }
    return () => {
      cancelled = true;
    };
  }, [key, loader]);

  useEffect(() => {
    const cleanup = run();
    // Revalide automatiquement au retour de connexion.
    const onOnline = () => run();
    window.addEventListener('online', onOnline);
    return () => {
      cleanup();
      window.removeEventListener('online', onOnline);
    };
  }, [run]);

  return { data, loading, offline, refresh: run };
}
