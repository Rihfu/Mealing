'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { addManualAction, searchCatalogAction } from './actions';
import { UNIT_OPTIONS } from '@/lib/units';
import { normalizeLabel } from '@/lib/text';
import { ProductIcon, categoryLabel } from '@/lib/product-assets';
import type { FoodSuggestion } from '@/lib/core';

/** Contexte (anti-doublon / anti-surplus) : ce qui est déjà sur la liste / en stock. */
export interface ListRef {
  foodId: string | null;
  name: string;
  qty: string;
}
export interface StockRef {
  foodId: string | null;
  label: string | null;
  qty: string;
  present: boolean;
}

/**
 * Ajout d'un article avec autocomplétion (catalogue + fournisseurs), formats
 * courants en 1 clic et unité normalisée (chantiers B + D). La mutation finale
 * passe par la server action addManualAction (convention : logique en core/).
 */
export function AddArticle({ onList = [], inStock = [] }: { onList?: ListRef[]; inStock?: StockRef[] }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<FoodSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<FoodSuggestion | null>(null);
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Anti-doublon / anti-surplus (G) : avertir si l'article est déjà sur la liste ou en stock.
  const warning = useMemo(() => {
    const name = (selected?.name ?? query).trim();
    if (name.length < 2) return null;
    const fid = selected?.foodId ?? null;
    const n = normalizeLabel(name);
    const listed = onList.find((x) => (fid && x.foodId === fid) || normalizeLabel(x.name) === n);
    if (listed) return { kind: 'list' as const, qty: listed.qty };
    const stocked = inStock.find(
      (x) => x.present && ((fid && x.foodId === fid) || (x.label != null && normalizeLabel(x.label) === n)),
    );
    if (stocked) return { kind: 'stock' as const, qty: stocked.qty };
    return null;
  }, [query, selected, onList, inStock]);

  // Recherche débouncée tant qu'aucune suggestion n'est sélectionnée. On NE lance
  // PAS (et on n'applique PAS) de recherche pendant la soumission : sinon des
  // résultats arrivant en retard rouvraient la liste / décalaient le clic (constat).
  useEffect(() => {
    if (selected || submitting || query.trim().length < 2) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await searchCatalogAction(query);
        if (!cancelled && !submitting) {
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
  }, [query, selected, submitting]);

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

  // « Utiliser mon texte » : confirme le libellé libre (ferme la liste, garde le nom)
  // SANS soumettre — l'utilisateur règle ensuite la quantité puis « Ajouter à la liste ».
  function chooseFreeText() {
    const v = query.trim();
    if (v.length < 2) return;
    setSelected({ foodId: null, name: v, defaultUnit: null, category: null, source: '', externalId: null, packages: [] });
    setOpen(false);
    setSuggestions([]);
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
    // Verrou : on fige la liste de suggestions avant de soumettre, pour qu'un
    // résultat tardif ne change pas la sélection / ne décale pas le clic.
    setSubmitting(true);
    setOpen(false);
    setSuggestions([]);
    try {
      await addManualAction(formData);
      reset();
    } finally {
      setSubmitting(false);
    }
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
            } else {
              setOpen(true);
            }
          }}
          onFocus={() => query.trim().length >= 2 && !selected && setOpen(true)}
          placeholder="Article (ex. riz, lait…)"
          autoComplete="off"
          required
          className="field-input w-full"
        />
        {/* Champs d'identité produit transmis à l'action. */}
        <input type="hidden" name="food_id" value={selected?.foodId ?? ''} />
        <input type="hidden" name="source" value={selected?.foodId ? '' : (selected?.source ?? '')} />
        <input type="hidden" name="external_id" value={selected?.foodId ? '' : (selected?.externalId ?? '')} />

        {open && query.trim().length >= 2 && !selected && !submitting && (
          <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-line bg-surface py-1 shadow-soft">
            {/* Toujours en tête : garder le texte saisi tel quel (article hors catalogue). */}
            <li>
              <button
                type="button"
                onClick={chooseFreeText}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-sage-tint/40"
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-green-strong"
                  style={{ background: 'var(--color-sage-tint)' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
                <span className="flex-1 text-sm">
                  Utiliser <span className="font-semibold">«&nbsp;{query.trim()}&nbsp;»</span>
                </span>
                <span className="text-xs text-ink-soft">texte libre</span>
              </button>
            </li>

            {suggestions.length > 0 && (
              <li className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                Suggestions
              </li>
            )}
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
                  {categoryLabel(s.category) && (
                    <span className="text-xs text-ink-soft">{categoryLabel(s.category)}</span>
                  )}
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

      {warning && (
        <p
          className="flex items-start gap-2 rounded-xl px-3 py-2 text-xs leading-snug"
          style={{ background: 'var(--color-butter-tint)', color: '#7a5e12' }}
        >
          <span>
            {warning.kind === 'list'
              ? `« ${(selected?.name ?? query).trim()} » est déjà sur ta liste${warning.qty ? ` (${warning.qty})` : ''}. Ajouter quand même ?`
              : `Tu as déjà « ${(selected?.name ?? query).trim()} » en stock${warning.qty ? ` (${warning.qty})` : ''}. Ajouter quand même ?`}
          </span>
        </p>
      )}

      <button className="btn-primary py-2.5 disabled:opacity-60" disabled={submitting}>
        {submitting ? 'Ajout…' : 'Ajouter à la liste'}
      </button>
    </form>
  );
}
