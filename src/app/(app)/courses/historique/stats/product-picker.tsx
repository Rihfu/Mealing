'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ProductIcon } from '@/lib/product-assets';
import { searchCatalogAction, resolveCatalogFoodAction } from '../../actions';
import type { FoodSuggestion } from '@/lib/core';

/** Recherche un aliment et ouvre sa fiche produit (« choisir un aliment »). */
export function ProductPicker() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<FoodSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const seq = useRef(0);

  useEffect(() => {
    const query = q.trim();
    const id = ++seq.current;
    const t = setTimeout(async () => {
      if (query.length < 2) {
        if (id === seq.current) {
          setResults([]);
          setOpen(false);
        }
        return;
      }
      const r = await searchCatalogAction(query);
      if (id === seq.current) {
        setResults(r);
        setOpen(true);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  function pick(s: FoodSuggestion) {
    start(async () => {
      const id = await resolveCatalogFoodAction({ foodId: s.foodId, source: s.source, externalId: s.externalId });
      if (id) router.push(`/courses/produit/${id}`);
    });
  }

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Voir la fiche d’un produit…"
        aria-label="Rechercher un produit"
        className="field-input w-full px-3 py-1.5 text-sm"
        disabled={pending}
      />
      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-line bg-surface shadow-soft">
          {results.map((s) => (
            <li key={`${s.source}:${s.foodId ?? s.externalId ?? s.name}`}>
              <button
                type="button"
                onClick={() => pick(s)}
                disabled={pending}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-sage-tint/40 disabled:opacity-60"
              >
                <ProductIcon slug={s.externalId} size={18} />
                <span className="flex-1 truncate">{s.name}</span>
                {s.foodId == null && <span className="text-xs text-ink-soft">importer</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
