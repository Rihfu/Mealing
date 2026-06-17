'use client';

import { useState, useTransition } from 'react';
import { checkoutToStockAction } from './actions';

export interface CheckoutItem {
  name: string;
  qty: string;
  category: string | null;
}

/**
 * « J'ai fait mes courses » (chantier E) : confirme puis range les articles cochés
 * dans le stock (datés du jour). Action réversible côté stock.
 */
export function PurchaseCheckout({ items }: { items: CheckoutItem[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const n = items.length;
  const s = n > 1 ? 's' : '';

  function confirm() {
    startTransition(async () => {
      await checkoutToStockAction();
      setOpen(false);
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-primary py-2">
        J’ai fait mes courses
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(40,38,34,0.32)' }}
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-soft"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-xl font-semibold">Bien joué — on range ?</h3>
            <p className="mt-1 text-sm text-ink-soft">
              {n} article{s} coché{s} entre{n > 1 ? 'nt' : ''} dans ton stock, daté{s} d’aujourd’hui.
            </p>

            <ul className="my-4 max-h-60 divide-y divide-line overflow-auto rounded-xl border border-line px-3">
              {items.map((it, i) => (
                <li key={i} className="flex items-center gap-2 py-2 text-sm">
                  <span className="flex-1 font-semibold">
                    {it.name}
                    {it.qty && <span className="font-normal text-ink-soft"> · {it.qty}</span>}
                  </span>
                  {it.category && <span className="text-xs text-ink-soft">{it.category}</span>}
                </li>
              ))}
            </ul>

            <p className="mb-4 text-xs text-ink-soft">
              La date d’achat fixe la péremption estimée. Tu pourras tout ajuster dans le stock — c’est
              réversible.
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
