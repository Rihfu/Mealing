'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ProductIcon, ProvenanceBadge, categoryDef, categoryLabel, type ProvenanceKey } from '@/lib/product-assets';
import { UNIT_OPTIONS } from '@/lib/units';
import {
  toggleTripFavoriteAction,
  renameTripAction,
  deleteTripAction,
  updateTripItemAction,
  deleteTripItemAction,
  reconductTripAction,
} from './actions';

export interface HItem {
  id: string;
  label: string;
  quantity: number | null;
  unit: string | null;
  categoryKey: string | null;
  iconSlug: string | null;
  source: string | null;
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

function fmtQty(it: { quantity: number | null; unit: string | null }): string {
  return it.quantity != null ? `${it.quantity} ${it.unit ?? ''}`.trim() : '';
}

/** Étoile favori. */
function Star({ filled }: { filled: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 17.3 6.2 20.6l1.1-6.5L2.5 9.5l6.5-.9L12 2.7l3 5.9 6.5.9-4.8 4.6 1.1 6.5z" />
    </svg>
  );
}

/** Une ligne d'article d'un relevé : icône + libellé + rayon + qté éditable + retrait. */
function ItemRow({ item }: { item: HItem }) {
  const def = categoryDef(item.categoryKey);
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState('');
  const [u, setU] = useState('');
  const [pending, start] = useTransition();
  const prov = item.source ? SOURCE_TO_PROV[item.source] : undefined;

  function open() {
    setQ(item.quantity != null ? String(item.quantity) : '');
    setU(item.unit ?? '');
    setEditing(true);
  }
  function save() {
    const n = q.trim() === '' ? null : Number(q);
    start(async () => {
      await updateTripItemAction({ itemId: item.id, quantity: n != null && !Number.isNaN(n) ? n : null, unit: u || null });
      setEditing(false);
    });
  }
  function remove() {
    start(async () => {
      await deleteTripItemAction(item.id);
    });
  }

  return (
    <li className={`flex items-center gap-3 py-2 ${pending ? 'opacity-40' : ''}`}>
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{ background: def?.tint ?? 'var(--color-sage-tint)', color: def?.ink ?? 'var(--color-sage-deep)' }}
      >
        <ProductIcon slug={item.iconSlug} size={20} />
      </span>
      <span className="text-sm">{item.label}</span>
      <span className="ml-auto flex items-center gap-2.5">
        {categoryLabel(item.categoryKey) && (
          <span className="hidden rounded-full px-2 py-0.5 text-xs font-semibold sm:inline" style={{ background: def?.tint ?? 'var(--color-line)', color: def?.ink ?? 'var(--color-ink-soft)' }}>
            {categoryLabel(item.categoryKey)}
          </span>
        )}
        {prov && <ProvenanceBadge kind={prov} />}
        {editing ? (
          <span className="flex items-center gap-1">
            <input type="number" step="any" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Qté" aria-label="Quantité" className="field-input w-16 px-2 py-1 text-sm" />
            <select value={u} onChange={(e) => setU(e.target.value)} aria-label="Unité" className="field-input w-[5.5rem] px-1 py-1 text-sm">
              {UNIT_OPTIONS.map((o) => (
                <option key={o.code} value={o.code}>{o.label}</option>
              ))}
            </select>
            <button type="button" onClick={save} disabled={pending} aria-label="Enregistrer" title="Enregistrer" className="text-green-strong disabled:opacity-60">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
            </button>
          </span>
        ) : (
          <button type="button" onClick={open} title="Modifier la quantité" className="text-sm text-ink-soft hover:text-ink hover:underline">
            {fmtQty(item) || '+ qté'}
          </button>
        )}
        <button type="button" onClick={remove} disabled={pending} aria-label="Retirer" title="Retirer du relevé" className="text-ink-soft hover:text-clay-deep disabled:opacity-60">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m-1 0v14H9V6" /></svg>
        </button>
      </span>
    </li>
  );
}

/** Modale de reconduction : cocher/décocher avant de ré-ajouter à la liste. */
function ReconductModal({ trip, onClose }: { trip: HTrip; onClose: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(trip.items.map((i) => i.id)));
  const [pending, start] = useTransition();
  const [added, setAdded] = useState<number | null>(null);

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
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
              <p className="mt-0.5 text-sm text-ink-soft">Décoche ce que tu ne veux pas reprendre, puis ajoute le reste à ta liste de courses.</p>
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

/** Carte d'un relevé de courses : dépliable, avec favori / renommer / supprimer / reconduire. */
export function TripCard({ trip }: { trip: HTrip }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(trip.name ?? '');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [reconducting, setReconducting] = useState(false);

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
    <div className="rounded-2xl border border-line bg-surface shadow-soft">
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
          <Star filled={trip.isFavorite} />
        </button>
      </div>

      {open && (
        <div className="border-t border-line px-4 pb-4 pt-2">
          {trip.items.length === 0 ? (
            <p className="py-3 text-sm text-ink-soft">Aucun article dans ce relevé.</p>
          ) : (
            <ul className="divide-y divide-line">
              {trip.items.map((it) => (
                <ItemRow key={it.id} item={it} />
              ))}
            </ul>
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
                <span className="text-ink-soft">Supprimer&nbsp;?</span>
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
