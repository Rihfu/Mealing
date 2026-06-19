'use client';

import { useEffect } from 'react';

/**
 * Enregistre le service worker (PWA). Uniquement en PRODUCTION : en dev, un SW qui
 * cache les assets gêne le rechargement à chaud. Monté dans le layout racine.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* best-effort : l'app marche sans SW, juste sans hors-ligne */
      });
    };
    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register, { once: true });
      return () => window.removeEventListener('load', register);
    }
  }, []);
  return null;
}
