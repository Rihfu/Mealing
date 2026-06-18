'use client';

import { useState, useTransition } from 'react';
import { ProductIcon } from '@/lib/product-assets';
import { addProductToListAction } from '../actions';

export interface DueItem {
  key: string;
  label: string;
  foodId: string | null;
  unit: string | null;
  avgQuantity: number | null;
  medianIntervalDays: number | null;
  dueInDays: number | null;
  iconSlug: string | null;
}

function dueLabel(d: DueItem): string {
  const every = d.medianIntervalDays != null ? `tous les ~${Math.round(d.medianIntervalDays)} j` : '';
  if (d.dueInDays == null) return every;
  if (d.dueInDays < 0) return `${every} · en retard de ${-d.dueInDays} j`;
  if (d.dueInDays === 0) return `${every} · à racheter aujourd’hui`;
  return `${every} · d’ici ${d.dueInDays} j`;
}

/** Liste « À racheter bientôt » : chaque produit s'ajoute à la liste en un clic. */
export function DueSoon({ items }: { items: DueItem[] }) {
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [, start] = useTransition();

  function add(d: DueItem) {
    setPendingKey(d.key);
    start(async () => {
      await addProductToListAction({ label: d.label, foodId: d.foodId, quantity: d.avgQuantity, unit: d.unit });
      setAdded((s) => new Set(s).add(d.key));
      setPendingKey(null);
    });
  }

  return (
    <ul className="divide-y divide-line">
      {items.map((d) => {
        const done = added.has(d.key);
        return (
          <li key={d.key} className="flex items-center gap-3 py-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sage-tint text-sage-deep">
              <ProductIcon slug={d.iconSlug} size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{d.label}</span>
              <span className="block text-xs text-ink-soft">{dueLabel(d)}</span>
            </span>
            <button
              type="button"
              onClick={() => add(d)}
              disabled={done || pendingKey === d.key}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                done ? 'text-green-strong' : 'btn-secondary'
              } disabled:opacity-60`}
            >
              {done ? '✓ Ajouté' : pendingKey === d.key ? '…' : '+ Ajouter'}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
