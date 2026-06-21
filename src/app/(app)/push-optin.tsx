'use client';

import { useCallback, useEffect, useState } from 'react';
import { subscribePushAction, unsubscribePushAction, sendTestPushAction } from './push-actions';

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

/** Convertit la clé VAPID publique (base64url) en Uint8Array pour applicationServerKey. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

type State = 'loading' | 'unsupported' | 'unconfigured' | 'idle' | 'subscribed' | 'denied' | 'working';

/**
 * Opt-in aux notifications push (Phase B), rendu dans le panneau de la cloche.
 * Détecte le support + l'abonnement existant ; gère activer / désactiver / tester.
 * Sans clé VAPID publique (prod non configurée) ou navigateur non compatible → masqué.
 * ⚠️ Le service worker n'est enregistré qu'en PROD (cf. sw-register.tsx) → l'activation
 * ne fonctionne pas sous `next dev`, seulement en build de prod (npm start) ou en ligne.
 */
export function PushOptIn() {
  const [state, setState] = useState<State>('loading');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supported =
        typeof window !== 'undefined' &&
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window;
      if (!supported) {
        if (!cancelled) setState('unsupported');
        return;
      }
      if (!VAPID_PUBLIC) {
        if (!cancelled) setState('unconfigured');
        return;
      }
      if (Notification.permission === 'denied') {
        if (!cancelled) setState('denied');
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setState(sub ? 'subscribed' : 'idle');
      } catch {
        if (!cancelled) setState('idle');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    setState('working');
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'denied' : 'idle');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
        });
      }
      const json = sub.toJSON();
      const res = await subscribePushAction(
        { endpoint: sub.endpoint, p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
        typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 80) : undefined,
      );
      setState(res.ok ? 'subscribed' : 'idle');
    } catch {
      setMsg("Échec de l'activation.");
      setState('idle');
    }
  }, []);

  const disable = useCallback(async () => {
    setState('working');
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubscribePushAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setState('idle');
    } catch {
      setState('subscribed');
    }
  }, []);

  const test = useCallback(async () => {
    setMsg('Envoi…');
    const res = await sendTestPushAction();
    setMsg(
      !res.configured
        ? 'Push non configuré côté serveur'
        : res.sent > 0
          ? 'Notification envoyée 📨'
          : 'Aucun appareil abonné',
    );
  }, []);

  if (state === 'loading' || state === 'unconfigured') return null;

  return (
    <div className="mt-2 border-t border-line pt-2.5 px-1">
      {state === 'unsupported' && (
        <p className="text-xs text-ink-soft">Notifications non supportées par ce navigateur.</p>
      )}

      {state === 'denied' && (
        <p className="text-xs text-ink-soft">
          Notifications bloquées. Autorise-les pour ce site dans les réglages du navigateur.
        </p>
      )}

      {state === 'idle' && (
        <button
          type="button"
          onClick={enable}
          className="btn-secondary flex w-full items-center justify-center gap-2 py-1.5 text-xs"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          Activer les notifications push
        </button>
      )}

      {state === 'working' && <p className="text-center text-xs text-ink-soft">…</p>}

      {state === 'subscribed' && (
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-strong">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            Notifications activées
          </span>
          <span className="flex items-center gap-1">
            <button type="button" onClick={test} className="rounded-lg px-2 py-1 text-xs font-medium text-ink-soft hover:bg-sage-tint/60">
              Tester
            </button>
            <button type="button" onClick={disable} className="rounded-lg px-2 py-1 text-xs font-medium text-ink-soft hover:bg-clay-tint">
              Désactiver
            </button>
          </span>
        </div>
      )}

      {msg && <p className="mt-1.5 text-center text-xs text-ink-soft">{msg}</p>}
    </div>
  );
}
