'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ProductIcon } from '@/lib/product-assets';
import { addProductToListAction } from '../actions';
import { promoteToEssentialAction } from '../../actions';

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

/**
 * « À racheter bientôt » : chaque produit récurrent détecté peut être ajouté une
 * fois (+ Ajouter) OU promu en essentiel permanent (★ Toujours → revient tout seul).
 */
export function DueSoon({ items }: { items: DueItem[] }) {
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [promoted, setPromoted] = useState<Set<string>>(new Set());
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [, start] = useTransition();

  function run(d: DueItem, kind: 'add' | 'promote') {
    setPendingKey(d.key);
    start(async () => {
      if (kind === 'add') {
        await addProductToListAction({ label: d.label, foodId: d.foodId, quantity: d.avgQuantity, unit: d.unit });
        setAdded((s) => new Set(s).add(d.key));
      } else {
        await promoteToEssentialAction({ label: d.label, foodId: d.foodId, quantity: d.avgQuantity, unit: d.unit });
        setPromoted((s) => new Set(s).add(d.key));
      }
      setPendingKey(null);
    });
  }

  return (
    <ul className="divide-y divide-line">
      {items.map((d) => {
        const isAdded = added.has(d.key);
        const isPromoted = promoted.has(d.key);
        const busy = pendingKey === d.key;
        return (
          <li key={d.key} className="flex items-center gap-3 py-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sage-tint text-sage-deep">
              <ProductIcon slug={d.iconSlug} size={20} />
            </span>
            <span className="min-w-0 flex-1">
              {d.foodId ? (
                <Link href={`/courses/produit/${d.foodId}`} className="block truncate text-sm font-semibold text-ink hover:text-green-strong hover:underline">
                  {d.label}
                </Link>
              ) : (
                <span className="block truncate text-sm font-semibold">{d.label}</span>
              )}
              <span className="block text-xs text-ink-soft">{dueLabel(d)}</span>
            </span>
            {isPromoted ? (
              <span className="shrink-0 text-xs font-semibold text-green-strong">★ Essentiel</span>
            ) : (
              <span className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => run(d, 'promote')}
                  disabled={busy}
                  title="En faire un essentiel (reviendra tout seul)"
                  className="rounded-full border border-line px-2.5 py-1.5 text-xs font-semibold text-ink-soft hover:border-amber-500 hover:text-amber-500 disabled:opacity-60"
                >
                  ★ Toujours
                </button>
                <button
                  type="button"
                  onClick={() => run(d, 'add')}
                  disabled={busy || isAdded}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${isAdded ? 'text-green-strong' : 'btn-secondary'} disabled:opacity-60`}
                >
                  {isAdded ? '✓ Ajouté' : '+ Ajouter'}
                </button>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
