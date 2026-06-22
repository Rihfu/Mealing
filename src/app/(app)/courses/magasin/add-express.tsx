'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { searchCatalogAction, resolveCatalogFoodAction, ensureCatalogFoodAction } from '../actions';
import { UNIT_OPTIONS } from '@/lib/units';
import { ProductIcon, categoryLabel } from '@/lib/product-assets';
import type { FoodSuggestion } from '@/lib/core';

/** Brouillon d'un « ajout express » remonté au parent (qui lui attribue une clé locale). */
export interface ExpressDraft {
  label: string;
  quantity: number | null;
  unit: string | null;
  price: number | null;
}

function InfoIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

/**
 * « Ajout express » du mode magasin : ajouter un article découvert en rayon (promo,
 * oubli) SANS quitter le mode ni passer par la liste. L'article part directement au
 * passage en caisse → stock (cf. extras de PurchaseCheckout / checkoutPurchasedToStock).
 * Saisie nom + quantité + unité + prix. « ⓘ » ouvre la fiche produit pour décider
 * (EN LIGNE uniquement — création/résolution de l'identité catalogue). Hors-ligne :
 * pas d'autocomplétion ni de fiche, mais l'ajout en texte libre fonctionne (généralisé
 * au passage en caisse, au retour réseau).
 */
export function AddExpress({ onAdd }: { onAdd: (d: ExpressDraft) => void }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<FoodSuggestion[]>([]);
  const [showSug, setShowSug] = useState(false);
  const [selected, setSelected] = useState<FoodSuggestion | null>(null);
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [price, setPrice] = useState('');
  const [resolving, setResolving] = useState(false);

  // État réseau (l'autocomplétion + la fiche sont des actions serveur → en ligne seulement).
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(typeof navigator === 'undefined' || navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  // Autocomplétion débouncée (catalogue + fournisseurs), en ligne et tant qu'aucune
  // suggestion n'est figée.
  useEffect(() => {
    if (!open || selected || !online || query.trim().length < 2) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await searchCatalogAction(query);
        if (!cancelled) {
          setSuggestions(res);
          setShowSug(true);
        }
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, query, selected, online]);

  function reset() {
    setQuery('');
    setSelected(null);
    setSuggestions([]);
    setShowSug(false);
    setQuantity('');
    setUnit('');
    setPrice('');
  }
  function close() {
    setOpen(false);
    reset();
  }

  function pick(s: FoodSuggestion) {
    setSelected(s);
    setQuery(s.name);
    setShowSug(false);
    setSuggestions([]);
    if (s.defaultUnit) setUnit(s.defaultUnit);
    const def = s.packages.find((p) => p.isDefault) ?? s.packages[0];
    if (def) {
      setQuantity(String(def.quantity));
      if (def.unit) setUnit(def.unit);
    }
  }

  function chooseFreeText() {
    const v = query.trim();
    if (v.length < 2) return;
    setSelected({ foodId: null, name: v, defaultUnit: null, category: null, source: '', externalId: null, packages: [] });
    setShowSug(false);
    setSuggestions([]);
  }

  // « ⓘ » : ouvre la fiche produit (en ligne). On résout/crée au besoin l'identité
  // catalogue : suggestion liée → directe ; externe → import paresseux ; texte libre →
  // création générique (nom FR + rayon). Navigue vers la fiche (retour « En magasin »).
  async function openFiche(s: FoodSuggestion | null, label: string) {
    if (!online || resolving) return;
    setResolving(true);
    try {
      let foodId = s?.foodId ?? null;
      if (!foodId && s && (s.source === 'usda' || s.source === 'openfoodfacts') && s.externalId) {
        foodId = await resolveCatalogFoodAction({ foodId: null, source: s.source, externalId: s.externalId });
      }
      if (!foodId) foodId = await ensureCatalogFoodAction(label);
      if (foodId) router.push(`/courses/produit/${foodId}?from=/courses/magasin`);
    } finally {
      setResolving(false);
    }
  }

  function submit() {
    const label = (selected?.name ?? query).trim();
    if (label.length < 2) return;
    const q = quantity.trim() !== '' ? Number(quantity.replace(',', '.')) : NaN;
    const p = price.trim() !== '' ? Number(price.replace(',', '.')) : NaN;
    onAdd({
      label,
      quantity: !Number.isNaN(q) && q > 0 ? q : null,
      unit: unit || null,
      price: !Number.isNaN(p) && p > 0 ? p : null,
    });
    close();
  }

  const label = (selected?.name ?? query).trim();
  const canFiche = online && label.length >= 2;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong py-3 text-sm font-semibold text-sage-deep"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Ajout express
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          style={{ background: 'rgba(40,38,34,0.32)' }}
          onClick={close}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-md flex-col rounded-t-2xl border border-line bg-surface p-5 shadow-soft sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl font-semibold">Ajouter en rayon</h3>
              <button type="button" onClick={close} className="text-ink-soft hover:text-ink" aria-label="Fermer">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="mt-1 text-xs text-ink-soft">
              Un article repéré sur place — il ira dans ton stock au passage en caisse.
              {!online && ' (hors-ligne : saisie en texte libre)'}
            </p>

            <div className="relative mt-3">
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelected(null);
                  if (e.target.value.trim().length < 2) setShowSug(false);
                }}
                placeholder="Article (ex. yaourt à la vanille…)"
                autoComplete="off"
                className="field-input w-full"
              />
              {online && showSug && query.trim().length >= 2 && !selected && (
                <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-line bg-surface py-1 shadow-soft">
                  <li className="flex items-center">
                    <button
                      type="button"
                      onClick={chooseFreeText}
                      className="flex flex-1 items-center gap-2.5 px-3 py-2 text-left hover:bg-sage-tint/40"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-green-strong" style={{ background: 'var(--color-sage-tint)' }}>
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
                  {suggestions.map((s) => (
                    <li key={`${s.source}:${s.foodId ?? s.externalId ?? s.name}`} className="flex items-center">
                      <button
                        type="button"
                        onClick={() => pick(s)}
                        className="flex flex-1 items-center gap-2.5 px-3 py-2 text-left hover:bg-sage-tint/40"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-soft" style={{ background: 'var(--color-sage-tint)' }}>
                          <ProductIcon slug={s.foodId ? s.externalId : null} size={18} />
                        </span>
                        <span className="flex-1 text-sm">{s.name}</span>
                        {categoryLabel(s.category) && <span className="text-xs text-ink-soft">{categoryLabel(s.category)}</span>}
                      </button>
                      <button
                        type="button"
                        onClick={() => openFiche(s, s.name)}
                        disabled={resolving}
                        className="px-2 text-ink-soft hover:text-green-strong disabled:opacity-50"
                        aria-label={`Voir la fiche de ${s.name}`}
                        title="Voir la fiche"
                      >
                        <InfoIcon />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <input
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                type="number"
                step="any"
                inputMode="decimal"
                placeholder="Qté"
                className="field-input"
                aria-label="Quantité"
              />
              <select value={unit} onChange={(e) => setUnit(e.target.value)} className="field-input" aria-label="Unité">
                {UNIT_OPTIONS.map((u) => (
                  <option key={u.code} value={u.code}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <label htmlFor="express-price" className="text-xs font-semibold text-ink-soft">
                Prix
              </label>
              <input
                id="express-price"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                type="number"
                step="any"
                inputMode="decimal"
                placeholder="— (facultatif)"
                className="field-input w-32 px-2 py-1 text-right text-sm"
                aria-label="Prix"
              />
              <span className="text-ink-soft">€</span>
            </div>

            <div className="mt-4 flex gap-2">
              <button type="button" onClick={submit} disabled={label.length < 2} className="btn-primary flex-1 py-2.5 disabled:opacity-60">
                Ajouter
              </button>
              <button
                type="button"
                onClick={() => openFiche(selected, label)}
                disabled={!canFiche || resolving}
                className="btn-secondary py-2.5 disabled:opacity-50"
                title={online ? 'Voir la fiche produit' : 'Indisponible hors-ligne'}
              >
                {resolving ? '…' : 'Fiche'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
