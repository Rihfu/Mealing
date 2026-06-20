'use client';

import { useEffect, useRef, useState } from 'react';
import { ProductIcon, categoryLabel } from '@/lib/product-assets';
import { UNIT_OPTIONS } from '@/lib/units';
import type { FoodSuggestion } from '@/lib/core';
import { addStockAction, searchCatalogAction, estimateItemConservationAction } from './actions';
import { useStockRefresh } from './stock-refresh';

type Mode = 'quantity' | 'presence';

/**
 * Ajout au stock avec AUTOCOMPLÉTION (catalogue + USDA/OFF). Le texte libre est rattaché
 * au catalogue côté serveur → fiche + conservation intelligente. Design aligné sur
 * l'ajout d'article de Courses : lieu de conservation en CHIPS (pas de select natif),
 * suivi en bouton segmenté, quantité/unité affichées seulement en mode « quantité ».
 */
export function AddStock({ locationOptions }: { locationOptions: Array<{ key: string; label: string }> }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<FoodSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<FoodSuggestion | null>(null);
  const [location, setLocation] = useState('');
  const [mode, setMode] = useState<Mode>('quantity');
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const refresh = useStockRefresh();

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
    setLocation('');
    setMode('quantity');
    formRef.current?.reset();
  }
  async function handleSubmit(formData: FormData) {
    if (!String(formData.get('label') ?? '').trim()) return;
    setSubmitting(true);
    setOpen(false);
    setSuggestions([]);
    try {
      const stockId = await addStockAction(formData);
      reset();
      await refresh();
      // Lieu choisi → estimation auto de conservation en arrière-plan (best-effort, auto-gardée).
      if (stockId) estimateItemConservationAction(stockId).then((r) => { if (r.status === 'estimated') void refresh(); }).catch(() => {});
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form ref={formRef} action={handleSubmit} className="flex flex-col gap-3 text-sm">
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

      {/* Lieu de conservation — chips (au lieu d'un select natif). */}
      {locationOptions.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold text-ink-soft">Où le ranger&nbsp;?</p>
          <div className="flex flex-wrap gap-1.5">
            {locationOptions.map((l) => {
              const active = location === l.key;
              return (
                <button
                  key={l.key}
                  type="button"
                  onClick={() => setLocation(active ? '' : l.key)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                    active ? 'border-green-strong bg-sage-tint text-green-strong' : 'border-line text-ink-soft hover:border-green-strong/50'
                  }`}
                >
                  {l.label}
                </button>
              );
            })}
          </div>
          <input type="hidden" name="storage_location" value={location} />
        </div>
      )}

      {/* Suivi — bouton segmenté. */}
      <div>
        <p className="mb-1.5 text-xs font-semibold text-ink-soft">Suivi</p>
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-line p-1">
          {(['quantity', 'presence'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                mode === m ? 'bg-sage-tint text-green-strong' : 'text-ink-soft hover:bg-sage-tint/40'
              }`}
            >
              {m === 'quantity' ? 'Quantité' : 'Présence'}
            </button>
          ))}
        </div>
        <input type="hidden" name="tracking_mode" value={mode} />
      </div>

      {mode === 'quantity' && (
        <div className="grid grid-cols-2 gap-2">
          <input name="quantity" type="number" step="any" placeholder="Qté" className="field-input" />
          <select name="unit" className="field-input" defaultValue="" aria-label="Unité">
            <option value="">unité</option>
            {UNIT_OPTIONS.map((u) => (
              <option key={u.code} value={u.code}>{u.label}</option>
            ))}
          </select>
        </div>
      )}

      <button type="submit" disabled={submitting} className="btn-primary py-2.5 disabled:opacity-60">
        {submitting ? 'Ajout…' : 'Ajouter au stock'}
      </button>
    </form>
  );
}
