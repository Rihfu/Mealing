'use client';

import { useState, useTransition } from 'react';
import { toggleCheckAction } from '../actions';
import { PurchaseCheckout } from '../purchase-checkout';

/** Article du mode magasin (sérialisable, dérivé d'une ShoppingLine). */
export interface StoreItem {
  key: string;
  name: string;
  qty: string;
  checked: boolean;
  foodId: string | null;
  suggestedPrice: number | null; // dernier prix connu → pré-rempli quand on coche
}

export interface StoreGroup {
  key: string;
  label: string;
  items: StoreItem[];
}

/** Grosse case à cocher (mode magasin). */
function BigCheck({ checked }: { checked: boolean }) {
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 ${
        checked ? 'border-green-strong bg-green-strong text-white' : 'border-line-strong text-transparent'
      }`}
    >
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>
  );
}

/**
 * Liste « En magasin » : taper une tuile coche/décoche l'article (état serveur partagé
 * avec la liste). Dès qu'un article est coché, un champ PRIX apparaît pour le saisir
 * SUR PLACE (devant le rayon) plutôt que tout d'un coup au rangement. Les prix saisis
 * sont partagés avec la modale « J'ai fait mes courses » (prix contrôlés).
 */
export function StoreList({ groups }: { groups: StoreGroup[] }) {
  const [, startTransition] = useTransition();
  // Prix saisis (client) ; pré-remplis depuis le dernier prix connu pour les articles déjà cochés.
  const [prices, setPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      groups
        .flatMap((g) => g.items)
        .filter((i) => i.checked && i.suggestedPrice != null)
        .map((i) => [i.key, String(i.suggestedPrice)]),
    ),
  );
  function setPrice(key: string, v: string) {
    setPrices((p) => ({ ...p, [key]: v }));
  }

  // Cochage OPTIMISTE : l'état bascule instantanément en local (la confirmation
  // serveur + revalidation arrive après) → pas d'attente du round-trip Netlify/Supabase.
  const [localChecked, setLocalChecked] = useState<Record<string, boolean>>({});
  const isChecked = (it: StoreItem) => localChecked[it.key] ?? it.checked;

  function toggle(it: StoreItem) {
    const next = !isChecked(it);
    setLocalChecked((m) => ({ ...m, [it.key]: next }));
    // À la coche : pré-remplir le dernier prix connu (modifiable) pour aller vite.
    if (next && prices[it.key] == null && it.suggestedPrice != null) setPrice(it.key, String(it.suggestedPrice));
    startTransition(async () => {
      const fd = new FormData();
      fd.set('item_key', it.key);
      fd.set('checked', String(next));
      await toggleCheckAction(fd);
    });
  }

  // Option : faire descendre les articles cochés (et les rayons terminés) pour garder
  // en haut ce qu'il reste à prendre. Désactivable via l'interrupteur → positions fixes.
  const [sortChecked, setSortChecked] = useState(true);

  const fullyChecked = (g: StoreGroup) => g.items.length > 0 && g.items.every((i) => isChecked(i));
  const displayGroups = sortChecked
    ? // tri.sort est stable → l'ordre utilisateur est préservé au sein de chaque groupe.
      [...groups]
        .map((g) => ({ ...g, items: [...g.items].sort((a, b) => Number(isChecked(a)) - Number(isChecked(b))) }))
        .sort((a, b) => Number(fullyChecked(a)) - Number(fullyChecked(b)))
    : groups;

  const checked = groups.flatMap((g) => g.items).filter((i) => isChecked(i));

  return (
    <>
      <div className="mb-1 mt-4 flex items-center justify-end">
        <button
          type="button"
          onClick={() => setSortChecked((s) => !s)}
          role="switch"
          aria-checked={sortChecked}
          className="flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft"
          title="Faire descendre les articles cochés et les rayons terminés"
        >
          <span className={`flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors ${sortChecked ? 'bg-green-strong' : 'bg-line-strong'}`}>
            <span className={`block h-3 w-3 rounded-full bg-white transition-transform ${sortChecked ? 'translate-x-3' : ''}`} />
          </span>
          Cochés en bas
        </button>
      </div>
      <div className="flex flex-col gap-5">
        {displayGroups.map((g) => (
          <div key={g.key}>
            <h2 className="mb-2 px-1 font-display text-[15px] font-semibold text-sage-deep">{g.label}</h2>
            <div className="flex flex-col gap-2.5">
              {g.items.map((it) => (
                <div
                  key={it.key}
                  className={`overflow-hidden rounded-2xl border ${isChecked(it) ? 'border-line bg-paper' : 'border-line bg-surface shadow-soft'}`}
                >
                  <button
                    type="button"
                    onClick={() => toggle(it)}
                    className="flex w-full items-center gap-3.5 px-4 text-left"
                    style={{ minHeight: 64 }}
                  >
                    <BigCheck checked={isChecked(it)} />
                    <span className={`flex-1 text-[17px] font-semibold ${isChecked(it) ? 'text-ink-soft line-through' : ''}`}>{it.name}</span>
                    {it.qty && <span className={`text-sm text-ink-soft ${isChecked(it) ? 'line-through' : ''}`}>{it.qty}</span>}
                  </button>
                  {isChecked(it) && (
                    <div className="flex items-center gap-2 border-t border-line bg-surface px-4 py-2.5">
                      <label htmlFor={`price-${it.key}`} className="text-xs font-semibold text-ink-soft">
                        Prix
                      </label>
                      <input
                        id={`price-${it.key}`}
                        type="number"
                        step="any"
                        inputMode="decimal"
                        enterKeyHint="done"
                        value={prices[it.key] ?? ''}
                        onChange={(e) => setPrice(it.key, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.currentTarget.blur();
                        }}
                        placeholder="— (facultatif)"
                        aria-label={`Prix de ${it.name}`}
                        className="field-input w-32 px-2 py-1 text-right text-sm"
                      />
                      <span className="text-ink-soft">€</span>
                      {/* « OK » ferme le clavier numérique (blur) — la touche « suivant » ne le fait pas. */}
                      <button
                        type="button"
                        onClick={() => (document.activeElement as HTMLElement | null)?.blur()}
                        className="ml-auto rounded-full border border-line px-3 py-1 text-xs font-semibold text-green-strong"
                      >
                        OK
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* CTA collant : ranger au stock. Les prix saisis en rayon sont déjà pré-remplis
          dans la modale (prix contrôlés), modifiables une dernière fois. */}
      {checked.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20">
          <div className="mx-auto max-w-md px-4 pb-6 pt-4" style={{ background: 'linear-gradient(to top, var(--color-paper) 72%, transparent)' }}>
            <PurchaseCheckout
              fullWidth
              prices={prices}
              onPriceChange={setPrice}
              items={checked.map((it) => ({
                key: it.key,
                name: it.name,
                qty: it.qty,
                category: null,
                suggestedPrice: it.suggestedPrice,
              }))}
            />
          </div>
        </div>
      )}
    </>
  );
}
