'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  ProductIcon,
  ProvenanceBadge,
  categoryDef,
  CATEGORY_ORDER,
  rayonInk,
  type ProvenanceKey,
} from '@/lib/product-assets';
import { UNIT_OPTIONS } from '@/lib/units';
import { FoodLink } from '@/components/food-link';
import {
  toggleTripFavoriteAction,
  renameTripAction,
  deleteTripAction,
  updateTripItemAction,
  deleteTripItemAction,
  deleteTripItemsAction,
  reconductTripAction,
} from './actions';

export interface HItem {
  id: string;
  label: string;
  quantity: number | null;
  unit: string | null;
  price: number | null;
  categoryKey: string | null;
  foodId: string | null;
  iconSlug: string | null;
  source: string | null;
}

export interface HCustomCat {
  id: string;
  label: string;
  tint: string | null;
}

export interface HTrip {
  id: string;
  dateLabel: string; // date formatée côté serveur (évite les écarts d'hydratation)
  isFavorite: boolean;
  name: string | null;
  items: HItem[];
}

const SOURCE_TO_PROV: Record<string, ProvenanceKey> = {
  recipe: 'repas',
  recurring: 'essentiel',
  manual: 'ajoute',
};
const OTHER = '__other__';

function fmtQty(it: { quantity: number | null; unit: string | null }): string {
  return it.quantity != null ? `${it.quantity} ${it.unit ?? ''}`.trim() : '';
}

function fmtPrice(p: number): string {
  return `${p.toFixed(2).replace('.', ',')} €`;
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

interface RGroup {
  key: string;
  label: string;
  tint: string;
  ink: string;
  iconSlug: string | null;
  items: HItem[];
}

/** Regroupe les articles d'un relevé par rayon (intégré → custom → Autres). */
function groupByRayon(items: HItem[], customCats: HCustomCat[]): RGroup[] {
  const custom = new Map(customCats.map((c) => [c.id, c]));
  const order = (k: string) => {
    const i = CATEGORY_ORDER.indexOf(k as (typeof CATEGORY_ORDER)[number]);
    if (i >= 0) return i; // rayons intégrés en premier (ordre magasin)
    if (k === OTHER) return 999;
    return 500; // rayons custom au milieu
  };
  const groups = new Map<string, RGroup>();
  for (const it of items) {
    const raw = it.categoryKey;
    const key = raw && (categoryDef(raw) || custom.has(raw)) ? raw : OTHER;
    let g = groups.get(key);
    if (!g) {
      const def = categoryDef(key);
      const c = custom.get(key);
      g = {
        key,
        label: def?.label ?? c?.label ?? 'Autres',
        tint: def?.tint ?? c?.tint ?? 'var(--color-line)',
        ink: def?.ink ?? rayonInk(c?.tint),
        iconSlug: c?.id ? null : null,
        items: [],
      };
      groups.set(key, g);
    }
    g.items.push(it);
  }
  return [...groups.values()].sort((a, b) => order(a.key) - order(b.key));
}

/** Une ligne d'article (lecture seule, ou éditable si `editing`). */
function ItemRow({ item, editing, tripId }: { item: HItem; editing: boolean; tripId: string }) {
  const [editingQty, setEditingQty] = useState(false);
  const [q, setQ] = useState('');
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const [pending, start] = useTransition();
  const prov = item.source ? SOURCE_TO_PROV[item.source] : undefined;

  function openQty() {
    setQ(item.quantity != null ? String(item.quantity) : '');
    setU(item.unit ?? '');
    setP(item.price != null ? String(item.price) : '');
    setEditingQty(true);
  }
  function saveQty() {
    const n = q.trim() === '' ? null : Number(q);
    const pr = p.trim() === '' ? null : Number(p.replace(',', '.'));
    start(async () => {
      await updateTripItemAction({
        itemId: item.id,
        quantity: n != null && !Number.isNaN(n) ? n : null,
        unit: u || null,
        price: pr != null && !Number.isNaN(pr) ? pr : null,
      });
      setEditingQty(false);
    });
  }
  function remove() {
    start(async () => {
      await deleteTripItemAction(item.id);
    });
  }

  return (
    <li className={`flex items-center gap-3 rounded-lg px-1 py-2 transition-colors duration-200 hover:bg-sage-tint/40 ${pending ? 'opacity-40' : ''}`}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sage-tint text-sage-deep">
        <ProductIcon slug={item.iconSlug} size={18} />
      </span>
      <FoodLink foodId={item.foodId} from={`/courses/historique?trip=${tripId}`} className="text-sm">{item.label}</FoodLink>
      <span className="ml-auto flex items-center gap-2.5">
        {prov && <ProvenanceBadge kind={prov} />}
        {editing && editingQty ? (
          <span className="flex items-center gap-1">
            <input type="number" step="any" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Qté" aria-label="Quantité" className="field-input w-14 px-2 py-1 text-sm" />
            <select value={u} onChange={(e) => setU(e.target.value)} aria-label="Unité" className="field-input w-[4.5rem] px-1 py-1 text-sm">
              {UNIT_OPTIONS.map((o) => (
                <option key={o.code} value={o.code}>{o.label}</option>
              ))}
            </select>
            <input type="number" step="any" inputMode="decimal" value={p} onChange={(e) => setP(e.target.value)} placeholder="Prix" aria-label="Prix (€)" className="field-input w-16 px-2 py-1 text-right text-sm" />
            <span className="text-xs text-ink-soft">€</span>
            <button type="button" onClick={saveQty} disabled={pending} aria-label="Enregistrer" title="Enregistrer" className="text-green-strong disabled:opacity-60">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
            </button>
          </span>
        ) : editing ? (
          <button type="button" onClick={openQty} title="Modifier quantité / prix" className="text-sm text-ink-soft hover:text-ink hover:underline">
            {fmtQty(item) || '+ qté'}
            {item.price != null && <span className="text-ink-soft"> · {fmtPrice(item.price)}</span>}
          </button>
        ) : (
          (fmtQty(item) || item.price != null) && (
            <span className="text-sm text-ink-soft">
              {fmtQty(item)}
              {item.price != null && <span>{fmtQty(item) ? ' · ' : ''}{fmtPrice(item.price)}</span>}
            </span>
          )
        )}
        {editing &&
          (confirmDel ? (
            <span className="flex items-center gap-1.5 text-xs">
              <span className="text-ink-soft">Retirer&nbsp;?</span>
              <button type="button" onClick={remove} disabled={pending} className="font-bold text-clay-deep disabled:opacity-60">Oui</button>
              <button type="button" onClick={() => setConfirmDel(false)} className="text-ink-soft">Non</button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmDel(true)} aria-label="Retirer" title="Retirer du relevé" className="text-ink-soft hover:text-clay-deep">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m-1 0v14H9V6" /></svg>
            </button>
          ))}
      </span>
    </li>
  );
}

/** Modale de reconduction : cocher/décocher (avec tout cocher/décocher) avant de ré-ajouter. */
function ReconductModal({ trip, onClose }: { trip: HTrip; onClose: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(trip.items.map((i) => i.id)));
  const [pending, start] = useTransition();
  const [added, setAdded] = useState<number | null>(null);
  const allSelected = selected.size === trip.items.length;

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(trip.items.map((i) => i.id)));
  }
  function confirm() {
    start(async () => setAdded(await reconductTripAction([...selected])));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(40,38,34,0.32)' }} onClick={() => !pending && onClose()}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-line bg-surface shadow-soft" onClick={(e) => e.stopPropagation()}>
        <div className="max-h-[85vh] overflow-y-auto p-5">
          <h3 className="font-display text-lg font-semibold">Reconduire cette liste</h3>
          {added == null ? (
            <>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <p className="text-sm text-ink-soft">Coche les articles à remettre dans ta liste.</p>
                <button type="button" onClick={toggleAll} className="shrink-0 text-xs font-semibold text-green-strong">
                  {allSelected ? 'Tout décocher' : 'Tout cocher'}
                </button>
              </div>
              <ul className="mt-3 divide-y divide-line">
                {trip.items.map((it) => (
                  <li key={it.id} className="flex items-center gap-3 py-2">
                    <input type="checkbox" checked={selected.has(it.id)} onChange={() => toggle(it.id)} className="h-4 w-4 accent-green-strong" aria-label={it.label} />
                    <ProductIcon slug={it.iconSlug} size={18} />
                    <span className="text-sm">{it.label}</span>
                    {fmtQty(it) && <span className="ml-auto text-sm text-ink-soft">{fmtQty(it)}</span>}
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center gap-2">
                <button type="button" onClick={confirm} disabled={pending || selected.size === 0} className="btn-primary flex-1 py-2.5 disabled:opacity-60">
                  {pending ? 'On ajoute…' : `Ajouter à ma liste (${selected.size})`}
                </button>
                <button type="button" onClick={onClose} disabled={pending} className="px-2 text-sm text-ink-soft">Annuler</button>
              </div>
            </>
          ) : (
            <div className="mt-3">
              <p className="text-sm text-ink-soft">
                {added > 0 ? `${added} article${added > 1 ? 's' : ''} ajouté${added > 1 ? 's' : ''} à ta liste.` : 'Rien n’a été ajouté.'}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <Link href="/courses" className="btn-primary py-2.5">Voir la liste de courses</Link>
                <button type="button" onClick={onClose} className="px-2 text-sm text-ink-soft">Fermer</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Carte d'un relevé : dépliable, groupé par rayon, lecture seule + mode Éditer. */
export function TripCard({ trip, customCats, defaultOpen = false }: { trip: HTrip; customCats: HCustomCat[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [editing, setEditing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // Retour de la fiche produit (?trip=<id>) : on ré-ouvre le relevé consulté et on le
  // ramène à vue — l'utilisateur ne perd pas le fil de son parcours article par article.
  useEffect(() => {
    if (defaultOpen) rootRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [defaultOpen]);
  const [query, setQuery] = useState('');
  const [pending, start] = useTransition();
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(trip.name ?? '');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [reconducting, setReconducting] = useState(false);
  const [confirmGroup, setConfirmGroup] = useState<string | null>(null);

  function clearGroup(g: RGroup) {
    start(async () => {
      await deleteTripItemsAction(g.items.map((i) => i.id));
      setConfirmGroup(null);
    });
  }

  const q = norm(query.trim());
  const filtered = q ? trip.items.filter((it) => norm(it.label).includes(q)) : trip.items;
  const groups = useMemo(() => groupByRayon(filtered, customCats), [filtered, customCats]);

  function toggleFavorite() {
    start(async () => toggleTripFavoriteAction({ tripId: trip.id, isFavorite: !trip.isFavorite }));
  }
  function saveName() {
    start(async () => {
      await renameTripAction({ tripId: trip.id, name: nameDraft });
      setRenaming(false);
    });
  }
  function remove() {
    start(async () => deleteTripAction(trip.id));
  }

  return (
    <div ref={rootRef} className="scroll-mt-24 rounded-2xl border border-line bg-surface shadow-soft">
      <div className="flex items-center gap-3 p-4">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex flex-1 items-center gap-3 text-left">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 text-ink-soft transition-transform ${open ? 'rotate-90' : ''}`}>
            <path d="m9 18 6-6-6-6" />
          </svg>
          <span className="min-w-0">
            <span className="block truncate font-display font-semibold">{trip.name || trip.dateLabel}</span>
            {trip.name && <span className="block text-xs text-ink-soft">{trip.dateLabel}</span>}
          </span>
        </button>
        <span className="whitespace-nowrap rounded-full bg-sage-tint px-2.5 py-0.5 text-xs font-semibold text-sage-deep">
          {trip.items.length} article{trip.items.length > 1 ? 's' : ''}
        </span>
        <button type="button" onClick={toggleFavorite} disabled={pending} aria-label={trip.isFavorite ? 'Retirer des favoris' : 'Marquer favori'} title={trip.isFavorite ? 'Favori' : 'Marquer favori'} className={`${trip.isFavorite ? 'text-amber-500' : 'text-ink-soft hover:text-amber-500'} disabled:opacity-60`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill={trip.isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 17.3 6.2 20.6l1.1-6.5L2.5 9.5l6.5-.9L12 2.7l3 5.9 6.5.9-4.8 4.6 1.1 6.5z" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="border-t border-line px-4 pb-4 pt-3">
          {/* Barre d'outils : recherche (relevés longs) + bascule Éditer. */}
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {trip.items.length > 6 && (
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher un article…"
                aria-label="Rechercher dans ce relevé"
                className="field-input min-w-0 flex-1 px-3 py-1.5 text-sm"
              />
            )}
            <button
              type="button"
              onClick={() => setEditing((e) => !e)}
              className={`ml-auto rounded-full border px-3 py-1 text-xs font-semibold ${editing ? 'border-green-strong bg-sage-tint text-green-strong' : 'border-line text-ink-soft'}`}
            >
              {editing ? '✓ Terminé' : '✎ Éditer'}
            </button>
          </div>

          {trip.items.length === 0 ? (
            <p className="py-3 text-sm text-ink-soft">Aucun article dans ce relevé.</p>
          ) : groups.length === 0 ? (
            <p className="py-3 text-sm text-ink-soft">Aucun article ne correspond à « {query} ».</p>
          ) : (
            <div className="flex flex-col">
              {groups.map((g) => (
                <details key={g.key} open className="border-t border-line first:border-t-0">
                  <summary className="flex cursor-pointer list-none items-center gap-2 py-2 font-display text-sm font-semibold">
                    <span className="h-3 w-3 rounded-full" style={{ background: g.tint }} />
                    <span className="flex-1">{g.label}</span>
                    <span className="text-xs font-normal text-ink-soft">{g.items.length}</span>
                    {editing &&
                      (confirmGroup === g.key ? (
                        <span className="flex items-center gap-1.5 text-xs" onClick={(e) => e.preventDefault()}>
                          <span className="text-ink-soft">Vider&nbsp;?</span>
                          <button type="button" onClick={() => clearGroup(g)} disabled={pending} className="font-bold text-clay-deep disabled:opacity-60">
                            Oui
                          </button>
                          <button type="button" onClick={() => setConfirmGroup(null)} className="text-ink-soft">
                            Non
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            setConfirmGroup(g.key);
                          }}
                          aria-label={`Vider le rayon ${g.label}`}
                          title="Retirer tous les articles de ce rayon"
                          className="text-xs font-semibold text-ink-soft/70 hover:text-clay-deep"
                        >
                          vider
                        </button>
                      ))}
                  </summary>
                  <ul className="divide-y divide-line pl-1">
                    {g.items.map((it) => (
                      <ItemRow key={it.id} item={it} editing={editing} tripId={trip.id} />
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <button type="button" onClick={() => setReconducting(true)} className="btn-secondary flex items-center gap-1.5 py-2 text-xs">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></svg>
              Reconduire
            </button>
            {renaming ? (
              <span className="flex items-center gap-1">
                <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="Nom du relevé" aria-label="Nom du relevé" className="field-input w-48 px-2 py-1 text-sm" />
                <button type="button" onClick={saveName} disabled={pending} className="text-xs font-bold text-green-strong disabled:opacity-60">Enregistrer</button>
                <button type="button" onClick={() => setRenaming(false)} className="text-xs text-ink-soft">Annuler</button>
              </span>
            ) : (
              <button type="button" onClick={() => { setNameDraft(trip.name ?? ''); setRenaming(true); }} className="text-xs font-semibold text-ink-soft hover:text-ink">
                ✎ Renommer
              </button>
            )}
            {confirmingDelete ? (
              <span className="ml-auto flex items-center gap-2 text-xs">
                <span className="text-ink-soft">Supprimer le relevé&nbsp;?</span>
                <button type="button" onClick={remove} disabled={pending} className="font-bold text-clay-deep disabled:opacity-60">Oui</button>
                <button type="button" onClick={() => setConfirmingDelete(false)} className="text-ink-soft">Non</button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmingDelete(true)} className="ml-auto text-xs font-semibold text-ink-soft hover:text-clay-deep">
                Supprimer
              </button>
            )}
          </div>
        </div>
      )}

      {reconducting && <ReconductModal trip={trip} onClose={() => setReconducting(false)} />}
    </div>
  );
}
