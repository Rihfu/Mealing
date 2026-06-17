'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  deleteManualItem,
  recreateManualItem,
  deleteRecurringItem,
  recreateRecurringItem,
} from './actions';

/**
 * Annulation (UX-13) : un toast « … supprimé · Annuler » après une suppression
 * destructive. Petit store module-singleton (un seul hôte monté dans la page) ;
 * le bouton de suppression émet le toast après que l'action serveur a renvoyé les
 * données restaurables.
 */
interface Toast {
  id: number;
  message: string;
  onUndo: () => Promise<void>;
}

let emit: ((t: Toast) => void) | null = null;
let seq = 0;
function pushToast(message: string, onUndo: () => Promise<void>) {
  emit?.({ id: ++seq, message, onUndo });
}

export function UndoToastHost() {
  const [toast, setToast] = useState<Toast | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    emit = (t) => setToast(t);
    return () => {
      emit = null;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;

  return (
    <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-4 rounded-full border border-line bg-surface px-4 py-2 text-sm shadow-soft">
        <span>{toast.message}</span>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await toast.onUndo();
              setToast(null);
            })
          }
          className="font-bold text-green-strong disabled:opacity-60"
        >
          {pending ? '…' : 'Annuler'}
        </button>
      </div>
    </div>
  );
}

export function DeleteWithUndo({
  kind,
  id,
  label,
}: {
  kind: 'manual' | 'recurring';
  id: string;
  label: string;
}) {
  const [pending, startTransition] = useTransition();

  function onDelete() {
    startTransition(async () => {
      if (kind === 'manual') {
        const snap = await deleteManualItem(id);
        if (snap) pushToast(`« ${label} » supprimé`, () => recreateManualItem(snap));
      } else {
        const snap = await deleteRecurringItem(id);
        if (snap) pushToast(`« ${label} » supprimé`, () => recreateRecurringItem(snap));
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={pending}
      className="text-xs font-bold text-red-strong disabled:opacity-50"
    >
      supprimer
    </button>
  );
}
