'use client';

import { useState, useTransition } from 'react';
import { checkoutToStockAction } from './actions';
import { enqueueOp } from '@/lib/offline/queue';

export interface CheckoutItem {
  key: string; // clé d'identité de la ligne (pour rattacher le prix au relevé)
  name: string;
  qty: string;
  category: string | null;
  suggestedPrice?: number | null; // dernier prix payé connu → pré-rempli (modifiable)
}

/**
 * « J'ai fait mes courses » (chantier E) : confirme puis range les articles cochés
 * dans le stock (datés du jour). Saisie de prix OPTIONNELLE par article → archivée
 * dans l'historique pour les stats de dépenses. Action réversible côté stock.
 */
export function PurchaseCheckout({
  items,
  fullWidth = false,
  prices: ctrlPrices,
  onPriceChange,
  onDone,
}: {
  items: CheckoutItem[];
  fullWidth?: boolean;
  /** Prix CONTRÔLÉS par le parent (mode magasin : saisis en rayon, partagés avec la modale). */
  prices?: Record<string, string>;
  onPriceChange?: (key: string, value: string) => void;
  /** Appelé après un passage en caisse réussi (ex. rafraîchir le cache du mode magasin). */
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  // Passage en caisse mis en file HORS-LIGNE (synchronisé au retour réseau).
  const [queuedOffline, setQueuedOffline] = useState(false);
  // Pré-remplissage du dernier prix payé connu (modifiable). En mode contrôlé,
  // c'est le parent qui détient les prix (saisie en rayon en mode magasin).
  const [internalPrices, setInternalPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      items.filter((it) => it.suggestedPrice != null).map((it) => [it.key, String(it.suggestedPrice)]),
    ),
  );
  const prices = ctrlPrices ?? internalPrices;
  const hasSuggested = items.some((it) => it.suggestedPrice != null);
  const n = items.length;
  const s = n > 1 ? 's' : '';

  function setPrice(key: string, v: string) {
    if (onPriceChange) onPriceChange(key, v);
    else setInternalPrices((p) => ({ ...p, [key]: v }));
  }

  function confirm() {
    // Prix valides (> 0) uniquement, indexés par clé de ligne.
    const map: Record<string, number> = {};
    for (const it of items) {
      const raw = prices[it.key];
      const v = raw != null && raw.trim() !== '' ? Number(raw.replace(',', '.')) : NaN;
      if (!Number.isNaN(v) && v > 0) map[it.key] = v;
    }
    // Hors-ligne (ou si l'appel échoue) → on met le passage en caisse EN FILE : il sera
    // rejoué au retour du réseau, APRÈS les coches (ordre FIFO), rangeant les achats au
    // stock. On NE déclenche PAS onDone (qui, en magasin, viderait la file).
    const queue = async () => {
      await enqueueOp({ kind: 'checkout', prices: map });
      setOpen(false);
      setQueuedOffline(true);
    };
    const online = typeof navigator === 'undefined' || navigator.onLine;
    if (!online) {
      startTransition(queue);
      return;
    }
    startTransition(async () => {
      try {
        await checkoutToStockAction(Object.keys(map).length > 0 ? map : undefined);
        setOpen(false);
        onDone?.();
      } catch {
        await queue();
      }
    });
  }

  // Confirmation hors-ligne : le passage en caisse est mémorisé, il sera enregistré
  // (achats rangés au stock) automatiquement dès le retour du réseau.
  if (queuedOffline) {
    return (
      <div
        className={`flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold ${fullWidth ? 'w-full' : ''}`}
        style={{ background: 'var(--color-sage-tint)', color: 'var(--color-sage-deep)' }}
        role="status"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        Achats enregistrés — synchro au retour du réseau
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={fullWidth ? 'btn-primary flex w-full items-center justify-center gap-2 py-4 text-base' : 'btn-primary py-2'}
      >
        {fullWidth && (
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}
        J’ai fait mes courses
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(40,38,34,0.32)' }}
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="flex max-h-[88vh] w-full max-w-md flex-col rounded-2xl border border-line bg-surface p-6 shadow-soft"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-xl font-semibold">Bien joué — on range ?</h3>
            <p className="mt-1 text-sm text-ink-soft">
              {n} article{s} coché{s} entre{n > 1 ? 'nt' : ''} dans ton stock, daté{s} d’aujourd’hui.{' '}
              {hasSuggested
                ? 'Les prix de la dernière fois sont pré-remplis — ajuste si besoin (optionnel).'
                : 'Ajoute le prix si tu veux suivre tes dépenses (optionnel).'}
            </p>

            <ul className="my-4 flex-1 divide-y divide-line overflow-auto rounded-xl border border-line px-3">
              {items.map((it) => (
                <li key={it.key} className="flex items-center gap-2 py-2 text-sm">
                  <span className="min-w-0 flex-1 font-semibold">
                    <span className="block truncate">{it.name}</span>
                    {it.qty && <span className="text-xs font-normal text-ink-soft">{it.qty}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <input
                      type="number"
                      step="any"
                      inputMode="decimal"
                      value={prices[it.key] ?? ''}
                      onChange={(e) => setPrice(it.key, e.target.value)}
                      placeholder="—"
                      aria-label={`Prix de ${it.name}`}
                      className="field-input w-20 px-2 py-1 text-right text-sm"
                    />
                    <span className="text-ink-soft">€</span>
                  </span>
                </li>
              ))}
            </ul>

            <p className="mb-4 text-xs text-ink-soft">
              La date d’achat fixe la péremption estimée. Tu pourras tout ajuster (et compléter les prix) dans le
              stock et l’historique — c’est réversible.
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={confirm}
                disabled={pending}
                className="btn-primary flex-1 py-2.5 disabled:opacity-60"
              >
                {pending ? 'On range…' : 'Ranger dans le stock'}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="btn-secondary py-2.5"
              >
                Plus tard
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
