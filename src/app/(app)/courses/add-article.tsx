'use client';

import { useEffect, useRef, useState } from 'react';
import { addManualAction, searchCatalogAction } from './actions';
import { UNIT_OPTIONS } from '@/lib/units';
import { ProductIcon } from '@/lib/product-assets';
import type { FoodSuggestion } from '@/lib/core';

/**
 * Ajout d'un article avec autocomplétion (catalogue + fournisseurs), formats
 * courants en 1 clic et unité normalisée (chantiers B + D). La mutation finale
 * passe par la server action addManualAction (convention : logique en core/).
 */
export function AddArticle() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<FoodSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<FoodSuggestion | null>(null);
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  // Recherche débouncée tant qu'aucune suggestion n'est sélectionnée.
  useEffect(() => {
    if (selected || query.trim().length < 2) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await searchCatalogAction(query);
        if (!cancelled) {
          setSuggestions(res);
          setOpen(true);
        }
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, selected]);

  function pick(s: FoodSuggestion) {
    setSelected(s);
    setQuery(s.name);
    setOpen(false);
    setSuggestions([]);
    if (s.defaultUnit) setUnit(s.defaultUnit);
    const def = s.packages.find((p) => p.isDefault) ?? s.packages[0];
    if (def) {
      setQuantity(String(def.quantity));
      if (def.unit) setUnit(def.unit);
    }
  }

  function reset() {
    setQuery('');
    setSelected(null);
    setSuggestions([]);
    setQuantity('');
    setUnit('');
    formRef.current?.reset();
  }

  async function handleSubmit(formData: FormData) {
    if (!String(formData.get('label') ?? '').trim()) return;
    await addManualAction(formData);
    reset();
  }

  return (
    <form ref={formRef} action={handleSubmit} className="flex flex-col gap-2.5 text-sm">
      <div className="relative">
        <input
          name="label"
          value={query}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            setSelected(null);
            if (v.trim().length < 2) {
              setSuggestions([]);
              setOpen(false);
            }
          }}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder="Article (ex. riz, lait…)"
          autoComplete="off"
          required
          className="field-input w-full"
        />
        {/* Champs d'identité produit transmis à l'action. */}
        <input type="hidden" name="food_id" value={selected?.foodId ?? ''} />
        <input type="hidden" name="source" value={selected?.foodId ? '' : (selected?.source ?? '')} />
        <input type="hidden" name="external_id" value={selected?.foodId ? '' : (selected?.externalId ?? '')} />

        {open && suggestions.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-line bg-surface py-1 shadow-soft">
            {suggestions.map((s) => (
              <li key={`${s.source}:${s.foodId ?? s.externalId ?? s.name}`}>
                <button
                  type="button"
                  onClick={() => pick(s)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-sage-tint/40"
                >
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-soft"
                    style={{ background: 'var(--color-sage-tint)' }}
                  >
                    <ProductIcon slug={s.foodId ? s.externalId : null} size={18} />
                  </span>
                  <span className="flex-1 text-sm">{s.name}</span>
                  {s.category && <span className="text-xs text-ink-soft">{s.category}</span>}
                  {!s.foodId && <span className="text-xs text-ink-soft">importer</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Formats courants en 1 clic (D.4). */}
      {selected && selected.packages.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.packages.map((p) => {
            const active = quantity === String(p.quantity) && unit === (p.unit ?? '');
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setQuantity(String(p.quantity));
                  setUnit(p.unit ?? '');
                }}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  active ? 'border-green-strong bg-sage-tint text-green-strong' : 'border-line text-ink-soft'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <input
          name="quantity"
          type="number"
          step="any"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="Qté"
          className="field-input"
        />
        <select
          name="unit"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          className="field-input"
          aria-label="Unité"
        >
          {UNIT_OPTIONS.map((u) => (
            <option key={u.code} value={u.code}>
              {u.label}
            </option>
          ))}
        </select>
      </div>

      <button className="btn-primary py-2.5">Ajouter à la liste</button>
    </form>
  );
}
