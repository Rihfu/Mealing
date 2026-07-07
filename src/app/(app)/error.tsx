'use client';

/**
 * Error boundary du shell applicatif — filet de sécurité UX : sans lui, TOUTE
 * server action qui rejette pendant une transition (réseau coupé, RLS, 429…)
 * affichait l'écran d'erreur brut de Next. Ici : message dans la DA + Réessayer
 * (re-rend le segment — les données serveur sont refetchées).
 */

import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Trace pour le diagnostic (terminal dev / logs Netlify) — jamais montrée brute.
    console.error('[app] erreur non rattrapée :', error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[50vh] w-full max-w-md flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-[96px] w-[96px] items-center justify-center rounded-full bg-clay-tint">
        <RefreshCw className="h-10 w-10 text-sage-deep" strokeWidth={1.75} />
      </div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Oups, ça n’a pas abouti</h1>
      <p className="text-sm leading-relaxed text-ink-soft">
        L’action n’a pas pu être appliquée (connexion instable ou service momentanément saturé). Rien n’a été
        perdu côté données — réessaie.
      </p>
      <button type="button" onClick={reset} className="btn-primary px-6 py-2.5">
        Réessayer
      </button>
      {error.digest && <p className="text-[11px] text-ink-soft/70">Réf. {error.digest}</p>}
    </div>
  );
}
