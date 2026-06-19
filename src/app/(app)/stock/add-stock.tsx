'use client';

import { useEffect, useRef, useState } from 'react';
import { ProductIcon, categoryLabel } from '@/lib/product-assets';
import { UNIT_OPTIONS } from '@/lib/units';
import type { FoodSuggestion } from '@/lib/core';
import { addStockAction, searchCatalogAction } from './actions';

/**
 * Ajout au stock avec AUTOCOMPLÉTION (catalogue + USDA/OFF) — au lieu du select de 500
 * items. Le texte libre est rattaché au catalogue côté serveur → fiche + conservation
 * intelligente. On choisit le LIEU de conservation à l'ajout.
 */
export function AddStock({ locationOptions }: { locationOptions: Array<{ key: string; label: string }> }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<FoodSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<FoodSuggestion | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

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
  }
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
    formRef.current?.reset();
  }
  async function handleSubmit(formData: FormData) {
    if (!String(formData.get('label') ?? '').trim()) return;
    setSubmitting(true);
    setOpen(false);
    setSuggestions([]);
    try {
      await addStockAction(formData);
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
            setQuery(e.target.value);
            setSelected(null);
            if (e.target.value.trim().length < 2) setOpen(false);
          }}
          onFocus={() => query.trim().length >= 2 && !selected && setOpen(true)}
          placeholder="Article (ex. lait, saumon…)"
          autoComplete="off"
          required
          className="field-input w-full"
        />
        <input type="hidden" name="food_id" value={selected?.foodId ?? ''} />

        {open && query.trim().length >= 2 && !selected && !submitting && (
          <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-line bg-surface py-1 shadow-soft">
            <li>
              <button type="button" onClick={chooseFreeText} className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-sage-tint/40">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-green-strong" style={{ background: 'var(--color-sage-tint)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                </span>
                <span className="flex-1">Utiliser <span className="font-semibold">«&nbsp;{query.trim()}&nbsp;»</span></span>
                <span className="text-xs text-ink-soft">texte libre</span>
              </button>
            </li>
            {suggestions.map((s) => (
              <li key={`${s.source}:${s.foodId ?? s.externalId ?? s.name}`}>
                <button type="button" onClick={() => pick(s)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-sage-tint/40">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-soft" style={{ background: 'var(--color-sage-tint)' }}>
                    <ProductIcon slug={s.foodId ? s.externalId : null} size={18} />
                  </span>
                  <span className="flex-1">{s.name}</span>
                  {categoryLabel(s.category) && <span className="text-xs text-ink-soft">{categoryLabel(s.category)}</span>}
                  {!s.foodId && <span className="text-xs text-ink-soft">importer</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <select name="storage_location" className="field-input" defaultValue="">
        <option value="">— Lieu de conservation —</option>
        {locationOptions.map((l) => (
          <option key={l.key} value={l.key}>{l.label}</option>
        ))}
      </select>

      <div className="flex gap-2">
        <select name="tracking_mode" className="field-input flex-1" defaultValue="quantity">
          <option value="quantity">Suivi : quantité</option>
          <option value="presence">Suivi : présence</option>
        </select>
        <input name="quantity" type="number" step="any" placeholder="Qté" className="field-input w-20" />
        <select name="unit" className="field-input w-24" defaultValue="">
          <option value="">unité</option>
          {UNIT_OPTIONS.map((u) => (
            <option key={u.code} value={u.code}>{u.label}</option>
          ))}
        </select>
      </div>

      <button type="submit" disabled={submitting} className="btn-primary py-2.5 disabled:opacity-60">
        {submitting ? 'Ajout…' : 'Ajouter au stock'}
      </button>
    </form>
  );
}
