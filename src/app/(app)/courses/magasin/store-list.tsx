'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { toggleCheckAction } from '../actions';
import { PurchaseCheckout, type ExtraDraft } from '../purchase-checkout';
import { AddExpress, type ExpressDraft } from './add-express';
import { UNIT_OPTIONS } from '@/lib/units';
import { idbGet, idbSet } from '@/lib/offline/idb';
import { clearQueue, enqueueOp, flushQueue, getQueue } from '@/lib/offline/queue';
import { replayOp } from '../sync-replay';

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

/** Pastille « ⓘ » → fiche produit (n'avale pas le geste cocher : élément distinct). */
function InfoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

/**
 * Liste « En magasin » : taper une tuile coche/décoche l'article (état serveur partagé
 * avec la liste). Dès qu'un article est coché, un champ PRIX apparaît pour le saisir
 * SUR PLACE (devant le rayon) plutôt que tout d'un coup au rangement. Les prix saisis
 * sont partagés avec la modale « J'ai fait mes courses » (prix contrôlés).
 *
 * « Ajout express » : on peut ajouter un article repéré en rayon (hors liste) ; il part
 * directement au passage en caisse → stock (extras), sans rejoindre la liste de courses.
 * Une pastille « ⓘ » par tuile ouvre la fiche produit (geste distinct du cocher).
 */
export function StoreList({ groups, refresh }: { groups: StoreGroup[]; refresh?: () => void }) {
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
    // Persisté en IndexedDB : les prix saisis en rayon survivent à un rechargement
    // hors-ligne et restent pré-remplis jusqu'au passage en caisse (au retour réseau).
    setPrices((p) => {
      const next = { ...p, [key]: v };
      void idbSet('magasin:prices', next);
      return next;
    });
  }

  // Cochage OPTIMISTE + HORS-LIGNE : l'état bascule instantanément en local, est
  // PERSISTÉ (IndexedDB) pour survivre à un rechargement sans réseau, et synchronisé
  // au serveur tout de suite si en ligne, sinon mis en file (rejouée au retour réseau).
  const [localChecked, setLocalChecked] = useState<Record<string, boolean>>({});
  const [pendingSync, setPendingSync] = useState(0);
  const isChecked = (it: StoreItem) => localChecked[it.key] ?? it.checked;

  // Articles « ajout express » (hors liste) ajoutés EN MAGASIN → rangés au stock au
  // passage en caisse. État purement local, persisté (survit à un rechargement
  // hors-ligne), vidé après checkout. Les prix sont gérés dans la même map `prices`
  // (clé = clé locale de l'extra).
  const [extras, setExtras] = useState<ExtraDraft[]>([]);
  function addExtra(d: ExpressDraft) {
    const key = `x:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
    setExtras((xs) => {
      const next = [...xs, { key, label: d.label, quantity: d.quantity, unit: d.unit }];
      void idbSet('magasin:extra', next);
      return next;
    });
    if (d.price != null) setPrice(key, String(d.price));
  }
  function removeExtra(key: string) {
    setExtras((xs) => {
      const next = xs.filter((x) => x.key !== key);
      void idbSet('magasin:extra', next);
      return next;
    });
    setPrices((p) => {
      const next = { ...p };
      delete next[key];
      void idbSet('magasin:prices', next);
      return next;
    });
  }
  function updateExtra(key: string, patch: Partial<Pick<ExtraDraft, 'quantity' | 'unit'>>) {
    setExtras((xs) => {
      const next = xs.map((x) => (x.key === key ? { ...x, ...patch } : x));
      void idbSet('magasin:extra', next);
      return next;
    });
  }

  // Au montage : recharge les coches/prix/extras persistés (reprise d'une session
  // hors-ligne) et le nombre d'opérations en attente de synchro.
  useEffect(() => {
    let cancelled = false;
    idbGet<Record<string, boolean>>('magasin:checks').then((c) => {
      if (!cancelled && c && Object.keys(c).length) setLocalChecked(c);
    });
    idbGet<Record<string, string>>('magasin:prices').then((p) => {
      if (!cancelled && p && Object.keys(p).length) setPrices((prev) => ({ ...prev, ...p }));
    });
    idbGet<ExtraDraft[]>('magasin:extra').then((x) => {
      if (!cancelled && x && x.length) setExtras(x);
    });
    getQueue().then((q) => {
      if (!cancelled) setPendingSync(q.length);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggle(it: StoreItem) {
    const next = !isChecked(it);
    setLocalChecked((m) => {
      const nm = { ...m, [it.key]: next };
      void idbSet('magasin:checks', nm);
      return nm;
    });
    // À la coche : pré-remplir le dernier prix connu (modifiable) pour aller vite.
    if (next && prices[it.key] == null && it.suggestedPrice != null) setPrice(it.key, String(it.suggestedPrice));

    const fd = new FormData();
    fd.set('item_key', it.key);
    fd.set('checked', String(next));
    const online = typeof navigator === 'undefined' || navigator.onLine;
    if (!online) {
      void enqueueOp({ kind: 'toggle', key: it.key, checked: next }).then((n) => setPendingSync(n));
      return;
    }
    startTransition(async () => {
      try {
        await toggleCheckAction(fd);
      } catch {
        // Réseau coupé en cours de route → on met en file pour synchro ultérieure.
        const n = await enqueueOp({ kind: 'toggle', key: it.key, checked: next });
        setPendingSync(n);
      }
    });
  }

  // Synchro : rejoue la file (FIFO) au retour du réseau via le flush PARTAGÉ (garde
  // anti-concurrence avec le SyncManager global). Si quelque chose a été synchronisé,
  // on rafraîchit l'instantané du magasin.
  const flush = useCallback(() => {
    startTransition(async () => {
      const ok = await flushQueue(replayOp);
      const q = await getQueue();
      setPendingSync(q.length);
      if (ok) refresh?.();
    });
  }, [refresh]);

  useEffect(() => {
    const onOnline = () => flush();
    window.addEventListener('online', onOnline);
    if (typeof navigator !== 'undefined' && navigator.onLine) flush();
    return () => window.removeEventListener('online', onOnline);
  }, [flush]);

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

  const allItems = groups.flatMap((g) => g.items);
  const checked = allItems.filter((i) => isChecked(i));
  const total = allItems.length;
  const doneCount = checked.length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  // Après un passage en caisse réussi : la session magasin est terminée → on efface
  // l'état hors-ligne (coches/prix/extras/file) et on rafraîchit la liste.
  function afterCheckout() {
    setLocalChecked({});
    setPrices({});
    setExtras([]);
    setPendingSync(0);
    void idbSet('magasin:checks', {});
    void idbSet('magasin:prices', {});
    void idbSet('magasin:extra', []);
    void clearQueue();
    refresh?.();
  }

  return (
    <>
      {/* Progression (suit les coches optimistes, pas l'état serveur). */}
      {total > 0 && (
        <div className="mt-3 flex items-center gap-3">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-green-strong transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="whitespace-nowrap text-sm font-bold">
            {doneCount} / {total}
          </span>
        </div>
      )}
      {pendingSync > 0 && (
        <p className="mt-2 rounded-xl px-3 py-2 text-center text-xs font-semibold" style={{ background: 'var(--color-butter-tint)', color: '#8a6d1f' }}>
          {pendingSync} opération{pendingSync > 1 ? 's' : ''} en attente — synchro auto au retour du réseau.
        </p>
      )}
      {total > 0 && (
        <div className="mb-1 mt-2 flex items-center justify-end">
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
            Tri auto
          </button>
        </div>
      )}

      {/* Ajout express : article repéré en rayon, hors liste → stock au passage en caisse. */}
      <div className="mb-4 mt-2">
        <AddExpress onAdd={addExtra} />
        {total === 0 && extras.length === 0 && (
          <p className="mt-3 text-center text-sm text-ink-soft">
            Rien sur ta liste — ajoute ce que tu prends en rayon, ou{' '}
            <Link href="/courses" className="font-semibold text-green-strong">
              reviens à la liste
            </Link>
            .
          </p>
        )}
      </div>

      {/* Articles ajoutés en magasin (éditables / retirables avant le passage en caisse). */}
      {extras.length > 0 && (
        <div className="mb-5">
          <h2 className="mb-2 px-1 font-display text-[15px] font-semibold text-sage-deep">Ajoutés en magasin</h2>
          <div className="flex flex-col gap-2.5">
            {extras.map((ex) => (
              <div key={ex.key} className="rounded-2xl border border-line bg-surface px-4 py-3 shadow-soft">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[16px] font-semibold">{ex.label}</span>
                  <button
                    type="button"
                    onClick={() => removeExtra(ex.key)}
                    className="shrink-0 text-ink-soft hover:text-clay"
                    aria-label={`Retirer ${ex.label}`}
                    title="Retirer"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={ex.quantity ?? ''}
                    onChange={(e) =>
                      updateExtra(ex.key, {
                        quantity: e.target.value.trim() === '' ? null : Number(e.target.value.replace(',', '.')),
                      })
                    }
                    placeholder="Qté"
                    aria-label="Quantité"
                    className="field-input w-20 px-2 py-1 text-sm"
                  />
                  <select
                    value={ex.unit ?? ''}
                    onChange={(e) => updateExtra(ex.key, { unit: e.target.value || null })}
                    aria-label="Unité"
                    className="field-input w-28 px-2 py-1 text-sm"
                  >
                    {UNIT_OPTIONS.map((u) => (
                      <option key={u.code} value={u.code}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                  <span className="ml-auto flex items-center gap-1">
                    <input
                      type="number"
                      step="any"
                      inputMode="decimal"
                      enterKeyHint="done"
                      value={prices[ex.key] ?? ''}
                      onChange={(e) => setPrice(ex.key, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                      }}
                      placeholder="Prix"
                      aria-label={`Prix de ${ex.label}`}
                      className="field-input w-24 px-2 py-1 text-right text-sm"
                    />
                    <span className="text-ink-soft">€</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
                  <div className="flex items-stretch">
                    <button
                      type="button"
                      onClick={() => toggle(it)}
                      className="flex flex-1 items-center gap-3.5 px-4 text-left"
                      style={{ minHeight: 64 }}
                    >
                      <BigCheck checked={isChecked(it)} />
                      <span className={`flex-1 text-[17px] font-semibold ${isChecked(it) ? 'text-ink-soft line-through' : ''}`}>{it.name}</span>
                      {it.qty && <span className={`text-sm text-ink-soft ${isChecked(it) ? 'line-through' : ''}`}>{it.qty}</span>}
                    </button>
                    {it.foodId && (
                      <Link
                        href={`/courses/produit/${it.foodId}?from=/courses/magasin`}
                        className="flex shrink-0 items-center px-3.5 text-ink-soft hover:text-green-strong"
                        aria-label={`Fiche de ${it.name}`}
                        title="Voir la fiche"
                      >
                        <InfoIcon />
                      </Link>
                    )}
                  </div>
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
          dans la modale (prix contrôlés), modifiables une dernière fois. Les extras
          (ajout express) sont rangés au stock en plus des articles cochés. */}
      {(checked.length > 0 || extras.length > 0) && (
        <div className="fixed inset-x-0 bottom-0 z-20">
          <div className="mx-auto max-w-md px-4 pb-6 pt-4" style={{ background: 'linear-gradient(to top, var(--color-paper) 72%, transparent)' }}>
            <PurchaseCheckout
              fullWidth
              prices={prices}
              onPriceChange={setPrice}
              onDone={afterCheckout}
              extras={extras}
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
