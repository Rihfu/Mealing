'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { DndContext, closestCenter, type CollisionDetection, type DragStartEvent, type DragOverEvent, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDndSensors } from '@/components/sortable';
import { ProductIcon } from '@/lib/product-assets';
import { FoodLink } from '@/components/food-link';
import { TrashIcon } from '../courses/shopping-list';
import { pushUndoToast } from '../courses/undo-toast';
import { useStockRefresh } from './stock-refresh';
import type { LocationView } from './locations';
import {
  decrementStockAction,
  discardStockAction,
  undoDiscardStockAction,
  estimateItemConservationAction,
  setOpenedAction,
  setPrintedExpiryAction,
  setStockLocationAction,
  reorderStockAction,
  reorderLocationsAction,
  toggleStockPresenceAction,
  removeStockItemsAction,
  undoRemoveStockAction,
  bulkSetStockLocationAction,
  bulkSetOpenedAction,
} from './actions';

export interface SItem {
  id: string;
  name: string;
  foodId: string | null;
  iconSlug: string | null;
  trackingMode: 'presence' | 'quantity';
  quantity: number | null;
  unit: string | null;
  present: boolean;
  storageLocation: string | null;
  opened: boolean;
  printedExpiry: string | null;
  daysRemaining: number | null;
  expirySource: 'printed' | 'estimate' | 'rule' | null;
}

export interface SGroup {
  view: LocationView;
  items: SItem[];
}

type LocOption = { key: string; label: string };

const UNSORTED = '__unsorted__'; // clé interne du groupe « Non rangé » (la vraie valeur = null)

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

/**
 * Détection de collision qui NE MÉLANGE PAS les deux niveaux : quand on glisse un ARTICLE,
 * on ne considère que les autres articles (pas les grandes zones d'en-tête de lieu, qui
 * sinon « gagneraient » et empêcheraient de viser une ligne précise) ; quand on glisse un
 * EN-TÊTE de lieu, on ne considère que les en-têtes. Corrige le « impossible de placer
 * au milieu ». (En-têtes = ids préfixés `grp:`.)
 */
const collisionStrategy: CollisionDetection = (args) => {
  const isGroup = String(args.active.id).startsWith('grp:');
  const containers = args.droppableContainers.filter((c) => String(c.id).startsWith('grp:') === isGroup);
  return closestCenter({ ...args, droppableContainers: containers });
};

/**
 * Pastille « estimer ? » pour un article sans date de péremption : déclenche l'estimation
 * IA (par lieu, mise en cache) et donne un retour CLAIR — l'article n'a pas de lieu
 * exploitable (range-le d'abord) ou l'IA est indisponible (rate-limit Groq → réessaie).
 */
type ChipState =
  | { k: 'idle' | 'pending' | 'no-location' | 'failed' }
  | { k: 'elsewhere'; where: string };

function EstimateChip({ item }: { item: SItem }) {
  const [state, setState] = useState<ChipState>({ k: 'idle' });
  const refresh = useStockRefresh();

  async function run() {
    setState({ k: 'pending' });
    try {
      const res = await estimateItemConservationAction(item.id);
      if (res.status === 'estimated') { await refresh(); return; } // une date remplace la pastille
      if (res.status === 'no-location') setState({ k: 'no-location' });
      else if (res.status === 'no-estimate-here') setState({ k: 'elsewhere', where: (res.suggested ?? []).join(' ou ') });
      else setState({ k: 'failed' });
    } catch {
      setState({ k: 'failed' });
    }
  }

  if (state.k === 'no-location') {
    return (
      <span className="pill bg-line text-ink-soft" title="Range-le dans un lieu (placard, frigo, congélateur…) pour estimer sa conservation.">
        range-le d’abord
      </span>
    );
  }
  if (state.k === 'elsewhere') {
    return (
      <span className="pill bg-butter-tint text-ink-soft" title={`Cet aliment ne se conserve pas bien dans ce lieu. Range-le plutôt dans ${state.where} pour une estimation.`}>
        plutôt {state.where}
      </span>
    );
  }
  if (state.k === 'failed') {
    return (
      <button type="button" onClick={run} className="pill bg-clay-tint text-clay-deep transition-colors hover:bg-clay-tint/70" title="L’estimation IA n’a pas répondu (souvent la limite gratuite). Réessaie dans un moment.">
        réessayer
      </button>
    );
  }
  return (
    <button type="button" disabled={state.k === 'pending'} onClick={run} className="pill bg-sage-tint/60 text-green-strong transition-colors hover:bg-sage-tint disabled:opacity-60" title="Estimer la durée de conservation (IA, indicatif).">
      {state.k === 'pending' ? 'estimation…' : 'estimer ?'}
    </button>
  );
}

/** Pastille de péremption colorée selon l'urgence ; le libellé indique la provenance. */
function ExpiryPill({ item }: { item: SItem }) {
  const d = item.daysRemaining;
  // key = lieu : si l'article est rangé ailleurs, le chip se réinitialise (nouvelle tentative).
  if (d == null) return <EstimateChip key={item.storageLocation ?? '∅'} item={item} />;
  const srcLabel = item.expirySource === 'printed' ? 'DLC' : item.expirySource === 'estimate' ? 'estimé' : 'repère';
  const cls = d < 0 ? 'bg-red text-white' : d <= 3 ? 'bg-orange text-white' : 'bg-sage-tint text-green-strong';
  const text = d < 0 ? `périmé (${-d} j)` : d === 0 ? "aujourd'hui" : `${d} j`;
  return (
    <span className={`pill ${cls}`} title={item.expirySource === 'printed' ? 'DLC saisie' : item.expirySource === 'estimate' ? 'estimée par lieu' : 'indicative'}>
      {text} · {srcLabel}
    </span>
  );
}

/** Bouton « Jeter » (poubelle, pastille clay) : rebut/périmé → compte dans le GASPILLAGE.
 *  Distinct de « Retirer » (qui ne compte pas). Réversible (toast d'annulation). */
function DiscardButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Jeter (périmé)"
      title="Jeter (périmé / gaspillage) — compte dans les statistiques"
      className="flex h-7 w-7 items-center justify-center rounded-full bg-clay-tint/60 text-clay-deep transition-colors hover:bg-clay-tint"
    >
      <TrashIcon size={15} />
    </button>
  );
}

/** Bouton « Retirer du stock » (croix, neutre) : sort l'article SANS le compter comme
 *  gaspillage (correction, doublon…). Réversible. Icône ✕ pour le distinguer de « Jeter ». */
function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Retirer du stock"
      title="Retirer du stock (sans gaspillage)"
      className="flex h-7 w-7 items-center justify-center rounded-full bg-line/60 text-ink-soft transition-colors hover:bg-line"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
    </button>
  );
}

/** Menu « ⋯ » : actions secondaires (DLC, marquer ouvert, ranger lieu, jeter). */
function RowMenu({ item, locationOptions, onRemove }: { item: SItem; locationOptions: LocOption[]; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState<'none' | 'ranger' | 'dlc'>('none');
  const [date, setDate] = useState(item.printedExpiry ?? '');
  const [, start] = useTransition();
  const refresh = useStockRefresh();
  const ref = useRef<HTMLDivElement>(null);
  // Estimation auto en arrière-plan après un rangement via le menu (best-effort, auto-gardée).
  const bgEstimate = () =>
    estimateItemConservationAction(item.id).then((r) => { if (r.status === 'estimated') void refresh(); }).catch(() => {});

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSub('none'); }
    };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, [open]);

  const close = () => { setOpen(false); setSub('none'); };
  const it = 'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-sage-tint/50';

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Plus d’actions" className="flex h-8 w-8 items-center justify-center rounded-full text-ink-soft hover:bg-sage-tint/50">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-60 rounded-xl border border-line bg-surface p-1 shadow-soft">
          {sub === 'none' && (
            <>
              <button type="button" className={it} onClick={() => start(async () => { await setOpenedAction(item.id, !item.opened); close(); await refresh(); })}>
                {item.opened ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.36 2.64L3 8" /><path d="M3 3v5h5" /></svg>
                    Marquer non entamé
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 7 4-4h10l4 4" /><path d="M3 7h18v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z" /><path d="M10 12h4" /></svg>
                    Marquer ouvert / entamé
                  </>
                )}
              </button>
              <button type="button" className={it} onClick={() => setSub('dlc')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M8 2.5v4M16 2.5v4M3 9.5h18" /></svg>
                {item.printedExpiry ? 'Modifier la DLC' : 'Saisir la DLC'}
              </button>
              <button type="button" className={it} onClick={() => setSub('ranger')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" /><path d="M10 12h4" /></svg>
                Ranger dans un lieu
              </button>
              <button type="button" className={`${it} text-ink-soft`} onClick={() => { close(); onRemove(); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
                Retirer du stock <span className="text-ink-soft/70">(sans gaspillage)</span>
              </button>
            </>
          )}
          {sub === 'dlc' && (
            <div className="p-1.5">
              <p className="mb-1 text-xs font-semibold text-ink-soft">DLC imprimée (prime sur l’estimation)</p>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field-input w-full text-sm" />
              <div className="mt-2 flex gap-2">
                <button type="button" className="btn-primary flex-1 py-1.5 text-xs" onClick={() => start(async () => { await setPrintedExpiryAction(item.id, date || null); close(); await refresh(); })}>Enregistrer</button>
                {item.printedExpiry && <button type="button" className="btn-secondary py-1.5 text-xs" onClick={() => start(async () => { await setPrintedExpiryAction(item.id, null); close(); await refresh(); })}>Effacer</button>}
              </div>
            </div>
          )}
          {sub === 'ranger' && (
            <div className="max-h-56 overflow-auto p-1">
              {locationOptions.map((l) => (
                <button key={l.key} type="button" className={`${it} ${item.storageLocation === l.key ? 'font-semibold text-green-strong' : ''}`} onClick={() => start(async () => { await setStockLocationAction(item.id, l.key); close(); await refresh(); bgEstimate(); })}>{l.label}</button>
              ))}
              {item.storageLocation && <button type="button" className={`${it} text-ink-soft`} onClick={() => start(async () => { await setStockLocationAction(item.id, null); close(); await refresh(); })}>Retirer du lieu</button>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Poignée de glisser (⠿) — reçoit les `listeners` @dnd-kit. */
const HandleIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" /><circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" /><circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
  </svg>
);

/** Contenu visuel d'une tuile (sans le <li>) — réutilisé par la ligne triable ET l'aperçu
 *  flottant (DragOverlay). Le handle, fourni en prop, porte les listeners de drag. */
function RowBody({
  item,
  locationOptions,
  selectMode,
  selected,
  onSelectToggle,
  onRemove,
  onDiscard,
  handle,
}: {
  item: SItem;
  locationOptions: LocOption[];
  selectMode: boolean;
  selected: boolean;
  onSelectToggle: () => void;
  onRemove: () => void;
  onDiscard: () => void;
  handle?: React.ReactNode;
}) {
  const [amount, setAmount] = useState('');
  const [, start] = useTransition();
  const refresh = useStockRefresh();

  return (
    <>
      {selectMode && (
        <button type="button" aria-label={selected ? 'Désélectionner' : 'Sélectionner'} onClick={onSelectToggle}>
          <span className={`flex h-5 w-5 items-center justify-center rounded-md border text-xs font-bold ${selected ? 'border-green-strong bg-green-strong text-white' : 'border-line-strong bg-surface text-transparent'}`}>✓</span>
        </button>
      )}
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sage-tint text-sage-deep">
        <ProductIcon slug={item.iconSlug} size={20} />
      </span>
      {selectMode ? (
        <button type="button" onClick={onSelectToggle} className="min-w-0 flex-1 truncate text-left text-sm">{item.name}</button>
      ) : (
        <div className="min-w-0 flex-1">
          <FoodLink foodId={item.foodId} from="/stock" className="block truncate text-sm font-medium">{item.name}</FoodLink>
          {item.opened && <span className="text-xs text-ink-soft">entamé</span>}
        </div>
      )}

      <ExpiryPill item={item} />

      {item.trackingMode === 'quantity' ? (
        <form action={(fd) => start(async () => { await decrementStockAction(fd); setAmount(''); await refresh(); })} className="flex items-center gap-1">
          <span className="whitespace-nowrap text-sm font-bold">{item.quantity ?? 0} {item.unit ?? ''}</span>
          <input type="hidden" name="stock_id" value={item.id} />
          <input name="amount" type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="−" aria-label="Quantité consommée" className="field-input w-14 px-1.5 py-1 text-xs" />
          <button className="text-xs font-semibold text-green-strong hover:underline">retirer</button>
        </form>
      ) : (
        <button type="button" onClick={() => start(async () => { await toggleStockPresenceAction(item.id, !item.present); await refresh(); })} className={`pill ${item.present ? 'bg-sage-tint text-green-strong' : 'bg-line text-ink-soft'}`}>
          {item.present ? 'présent' : 'absent'}
        </button>
      )}

      {!selectMode && (
        <>
          <DiscardButton onClick={onDiscard} />
          <span className="hidden lg:flex"><RemoveButton onClick={onRemove} /></span>
          <RowMenu item={item} locationOptions={locationOptions} onRemove={onRemove} />
          {handle}
        </>
      )}
    </>
  );
}

/** Tuile TRIABLE (@dnd-kit) : le <li> est le nœud sortable, la poignée ⠿ porte les
 *  listeners. Dimmée pendant qu'elle est soulevée (l'aperçu flottant la remplace). */
function SortableRow({
  item,
  locationOptions,
  selectMode,
  selected,
  dragDisabled,
  onSelectToggle,
  onRemove,
  onDiscard,
}: {
  item: SItem;
  locationOptions: LocOption[];
  selectMode: boolean;
  selected: boolean;
  dragDisabled: boolean;
  onSelectToggle: () => void;
  onRemove: () => void;
  onDiscard: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: dragDisabled,
  });
  const expired = item.daysRemaining != null && item.daysRemaining < 0;
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : undefined };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex flex-wrap items-center gap-2.5 rounded-lg px-1 py-2.5 transition-colors duration-200 hover:bg-sage-tint/40 ${selected ? 'bg-sage-tint/60' : ''} ${expired ? 'bg-red/5' : ''} ${isDragging ? 'relative bg-surface shadow-soft ring-1 ring-green-strong' : ''}`}
    >
      <RowBody
        item={item}
        locationOptions={locationOptions}
        selectMode={selectMode}
        selected={selected}
        onSelectToggle={onSelectToggle}
        onRemove={onRemove}
        onDiscard={onDiscard}
        handle={
          <button
            type="button"
            aria-label="Glisser pour réordonner"
            title="Glisser pour réordonner (appui long sur mobile)"
            {...attributes}
            {...listeners}
            className="cursor-grab touch-none text-ink-soft/60 hover:text-ink-soft active:cursor-grabbing"
          >
            {HandleIcon}
          </button>
        }
      />
    </li>
  );
}

/** Bouton « vider le lieu » + pop-over de confirmation (comme « vider le rayon »). */
function ClearLocation({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={`Vider ${label}`} title="Retirer tous les articles de ce lieu" className="flex h-8 w-8 items-center justify-center rounded-full bg-clay-tint/50 text-clay-deep transition-colors hover:bg-clay-tint">
        <TrashIcon size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-56 rounded-xl border border-line bg-surface p-3 text-left shadow-soft">
          <p className="font-display text-sm font-semibold">Vider « {label} » ?</p>
          <p className="mt-0.5 text-xs font-normal text-ink-soft">Les articles seront retirés du stock — annulable.</p>
          <div className="mt-2.5 flex gap-2">
            <button type="button" onClick={() => { setOpen(false); onConfirm(); }} className="btn-danger flex-1 py-2 text-sm">Vider</button>
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary py-2 text-sm">Annuler</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Section d'un lieu : en-tête (poignée de réordre des lieux pour les lieux réels) +
 *  liste TRIABLE des articles de ce lieu. */
function GroupSection({
  g,
  locationOptions,
  selectMode,
  selected,
  collapsed,
  dragDisabled,
  onToggleCollapse,
  onToggleSelect,
  onRemoveItems,
  onDiscardItem,
}: {
  g: SGroup;
  locationOptions: LocOption[];
  selectMode: boolean;
  selected: Set<string>;
  collapsed: boolean;
  dragDisabled: boolean;
  onToggleCollapse: () => void;
  onToggleSelect: (id: string) => void;
  onRemoveItems: (items: SItem[]) => void;
  onDiscardItem: (item: SItem) => void;
}) {
  const isUnsorted = g.view.key === '';
  // Lieu réel = en-tête triable (réordre des lieux). « Non rangé » reste fixe (non triable).
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `grp:${g.view.key}`,
    disabled: dragDisabled || isUnsorted,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : undefined };
  const itemIds = useMemo(() => g.items.map((i) => i.id), [g.items]);

  return (
    <section
      ref={setNodeRef}
      style={style}
      className={`relative rounded-2xl border bg-surface p-3.5 shadow-soft ${isDragging ? 'border-green-strong ring-1 ring-green-strong' : 'border-line'}`}
    >
      <div className="mb-1 flex items-center gap-2">
        {!isUnsorted && !dragDisabled && (
          <button
            type="button"
            aria-label="Glisser pour réordonner les lieux"
            title="Glisser pour réordonner les lieux"
            {...attributes}
            {...listeners}
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink-soft/60 hover:bg-sage-tint/50 hover:text-ink-soft cursor-grab touch-none active:cursor-grabbing"
          >
            {HandleIcon}
          </button>
        )}
        <button type="button" onClick={onToggleCollapse} aria-label={collapsed ? 'Déplier' : 'Replier'} className="flex h-7 w-7 items-center justify-center rounded-md text-ink-soft hover:bg-sage-tint/50">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform ${collapsed ? '-rotate-90' : ''}`}><path d="m6 9 6 6 6-6" /></svg>
        </button>
        <span className="h-3 w-3 rounded-full" style={{ background: g.view.tint }} />
        <h2 className="font-display text-base font-semibold">{g.view.label}</h2>
        <span className="text-xs text-ink-soft">{g.items.length}</span>
        {!selectMode && <span className="ml-auto"><ClearLocation label={g.view.label} onConfirm={() => onRemoveItems(g.items)} /></span>}
      </div>
      {!collapsed && (
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          <ul className="divide-y divide-line">
            {g.items.map((it) => (
              <SortableRow
                key={it.id}
                item={it}
                locationOptions={locationOptions}
                selectMode={selectMode}
                selected={selected.has(it.id)}
                dragDisabled={dragDisabled}
                onSelectToggle={() => onToggleSelect(it.id)}
                onRemove={() => onRemoveItems([it])}
                onDiscard={() => onDiscardItem(it)}
              />
            ))}
          </ul>
        </SortableContext>
      )}
    </section>
  );
}

/** Stock groupé par lieu (parité Courses) : glisser une tuile pour la réordonner dans son
 *  lieu, glisser un en-tête pour réordonner les lieux (@dnd-kit, DragOverlay propre),
 *  multi-sélection, repli, recherche, retrait réversible. */
export function StockList({ groups: serverGroups, locationOptions }: { groups: SGroup[]; locationOptions: LocOption[] }) {
  const refresh = useStockRefresh();
  const sensors = useDndSensors();
  const [, startMove] = useTransition();
  const [, startRemove] = useTransition();
  const [bulkPending, startBulk] = useTransition();

  // Ordre courant affiché. Source de vérité pendant un glisser ; resynchronisé depuis le
  // serveur quand on ne glisse pas (réconciliation après persistance + refresh). Synchro
  // prop→état AU RENDU (pattern React officiel, pas d'effet) : on n'écrase pas l'état de
  // glisser en cours ; au prochain rendu idle où le serveur diffère, on resynchronise.
  const [board, setBoard] = useState<SGroup[]>(serverGroups);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [syncedServer, setSyncedServer] = useState(serverGroups);
  if (!activeId && serverGroups !== syncedServer) {
    setSyncedServer(serverGroups);
    setBoard(serverGroups);
  }

  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRanger, setBulkRanger] = useState(false);

  const allItems = useMemo(() => board.flatMap((g) => g.items), [board]);
  const q = norm(query.trim());
  const dragDisabled = selectMode || q.length > 0;
  const shownGroups = q
    ? board.map((g) => ({ ...g, items: g.items.filter((i) => norm(i.name).includes(q)) })).filter((g) => g.items.length > 0)
    : board;
  const shownItems = useMemo(() => shownGroups.flatMap((g) => g.items), [shownGroups]);
  const selectedItems = useMemo(() => allItems.filter((i) => selected.has(i.id)), [allItems, selected]);
  const allShownSelected = shownItems.length > 0 && shownItems.every((i) => selected.has(i.id));
  const groupSortableIds = useMemo(() => board.filter((g) => g.view.key !== '').map((g) => `grp:${g.view.key}`), [board]);

  function exitSelect() { setSelectMode(false); setSelected(new Set()); }
  function toggleSelect(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleCollapse(key: string) {
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  function removeItems(items: SItem[]) {
    if (items.length === 0) return;
    const ids = items.map((i) => i.id);
    const label = items.length === 1 ? `« ${items[0].name} » retiré` : `${items.length} articles retirés`;
    startRemove(async () => {
      const snapshots = await removeStockItemsAction(ids);
      pushUndoToast(label, async () => { await undoRemoveStockAction(snapshots); await refresh(); });
      await refresh();
    });
  }
  // « Jeter » : rebut/périmé → journalise un gaspillage (distinct de « retirer »). Réversible.
  function discardItem(item: SItem) {
    startRemove(async () => {
      const { snapshot, eventId } = await discardStockAction(item.id);
      pushUndoToast(`« ${item.name} » jeté`, async () => { await undoDiscardStockAction(snapshot, eventId); await refresh(); });
      await refresh();
    });
  }
  function bulkMarkOpened() { startBulk(async () => { await bulkSetOpenedAction([...selected], true); exitSelect(); await refresh(); }); }
  function bulkMove(key: string) {
    const ids = [...selected];
    startBulk(async () => { await bulkSetStockLocationAction(ids, key === UNSORTED ? null : key); exitSelect(); await refresh(); });
    if (key !== UNSORTED) ids.forEach((id) => autoEstimate(id)); // estimation auto en fond
  }
  function bulkRemove() { const items = selectedItems; exitSelect(); removeItems(items); }

  // Estimation auto de conservation EN ARRIÈRE-PLAN après un rangement dans un lieu : ne
  // bloque pas le geste ; l'action s'auto-garde (no-location / 429 → rien) + cache par
  // aliment. La date apparaît au refresh (~1 s après).
  const dragFromLieu = useRef<string | null>(null);
  function autoEstimate(stockId: string) {
    estimateItemConservationAction(stockId)
      .then((r) => { if (r.status === 'estimated') void refresh(); })
      .catch(() => {});
  }

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    setActiveId(id);
    dragFromLieu.current = id.startsWith('grp:') ? null : (board.find((g) => g.items.some((i) => i.id === id))?.view.key ?? null);
  }

  // Glisser un ARTICLE au-dessus d'un AUTRE lieu : on l'y déplace EN DIRECT (le trou s'ouvre
  // dans le lieu d'arrivée). Le réordre DANS un lieu, lui, est géré par la stratégie dnd-kit
  // (visuel) puis figé au dépôt — on ne le touche pas ici (comportement déjà validé).
  function onDragOver(e: DragOverEvent) {
    const aId = String(e.active.id);
    if (aId.startsWith('grp:')) return; // réordre de lieux : géré au dépôt
    const oId = e.over ? String(e.over.id) : null;
    if (!oId || oId.startsWith('grp:') || oId === aId) return;
    setBoard((prev) => {
      const aGroup = prev.find((g) => g.items.some((i) => i.id === aId))?.view.key;
      const oGroup = prev.find((g) => g.items.some((i) => i.id === oId))?.view.key;
      if (aGroup == null || oGroup == null || aGroup === oGroup) return prev; // même lieu : stratégie
      const item = prev.find((g) => g.view.key === aGroup)!.items.find((i) => i.id === aId)!;
      const moved: SItem = { ...item, storageLocation: oGroup || null };
      return prev.map((g) => {
        if (g.view.key === aGroup) return { ...g, items: g.items.filter((i) => i.id !== aId) };
        if (g.view.key === oGroup) {
          const items = g.items.filter((i) => i.id !== aId);
          const idx = items.findIndex((i) => i.id === oId);
          items.splice(idx < 0 ? items.length : idx, 0, moved);
          return { ...g, items };
        }
        return g;
      });
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const aId = String(e.active.id);
    setActiveId(null);
    const oId = e.over ? String(e.over.id) : null;
    const cur = board;

    if (aId.startsWith('grp:')) {
      // Réordre des LIEUX (en-têtes). Le « Non rangé » reste en dernier.
      if (!oId || !oId.startsWith('grp:') || aId === oId) return;
      const keys = cur.filter((g) => g.view.key !== '').map((g) => g.view.key);
      const from = keys.indexOf(aId.slice(4));
      const to = keys.indexOf(oId.slice(4));
      if (from < 0 || to < 0 || from === to) return;
      const newKeys = arrayMove(keys, from, to);
      const byKey = new Map(cur.map((g) => [g.view.key, g]));
      const unsorted = cur.find((g) => g.view.key === '');
      setBoard([...(unsorted ? [unsorted] : []), ...newKeys.map((k) => byKey.get(k)!)]);
      startMove(async () => { await reorderLocationsAction(newKeys); await refresh(); });
      return;
    }

    // Article : il a pu changer de lieu via onDragOver. On le replace à la position du dépôt
    // dans son lieu COURANT, puis on persiste ce lieu (lieu + sort_index séquentiel).
    const grp = cur.find((g) => g.items.some((i) => i.id === aId));
    if (!grp) return;
    let items = grp.items;
    if (oId && !oId.startsWith('grp:') && oId !== aId && items.some((i) => i.id === oId)) {
      const ids = items.map((i) => i.id);
      const from = ids.indexOf(aId);
      const to = ids.indexOf(oId);
      if (from >= 0 && to >= 0 && from !== to) {
        items = arrayMove(items, from, to);
        setBoard(cur.map((g) => (g.view.key === grp.view.key ? { ...g, items } : g)));
      }
    }
    const orderedIds = items.map((i) => i.id);
    const key = grp.view.key;
    const changedLieu = dragFromLieu.current != null && dragFromLieu.current !== key;
    dragFromLieu.current = null;
    startMove(async () => { await reorderStockAction(key || null, orderedIds); await refresh(); });
    if (changedLieu) autoEstimate(aId); // estimation auto si le lieu a changé
  }

  if (board.length === 0) {
    return <p className="rounded-2xl border border-line bg-surface px-3.5 py-8 text-center text-sm text-ink-soft">Stock vide.</p>;
  }

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {allItems.length > 6 && (
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher dans le stock…" aria-label="Rechercher" className="field-input min-w-0 flex-1 px-3 py-1.5 text-sm" />
        )}
        {selectMode ? (
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => setSelected(allShownSelected ? new Set() : new Set(shownItems.map((i) => i.id)))} className="text-xs font-semibold text-green-strong">
              {allShownSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
            </button>
            <button type="button" onClick={exitSelect} className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink-soft">Terminé</button>
          </div>
        ) : (
          <button type="button" onClick={() => setSelectMode(true)} className="ml-auto rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink-soft hover:border-green-strong hover:text-green-strong">Sélectionner</button>
        )}
      </div>

      {q && shownGroups.length === 0 && <p className="py-4 text-center text-sm text-ink-soft">Aucun article ne correspond à « {query} ».</p>}

      <DndContext sensors={sensors} collisionDetection={collisionStrategy} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <SortableContext items={groupSortableIds} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-4">
            {shownGroups.map((g) => (
              <GroupSection
                key={g.view.key || 'unsorted'}
                g={g}
                locationOptions={locationOptions}
                selectMode={selectMode}
                selected={selected}
                collapsed={collapsed.has(g.view.key)}
                dragDisabled={dragDisabled}
                onToggleCollapse={() => toggleCollapse(g.view.key)}
                onToggleSelect={toggleSelect}
                onRemoveItems={removeItems}
                onDiscardItem={discardItem}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {selectMode && selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2.5 text-sm text-paper shadow-soft ring-1 ring-black/10" style={{ background: 'var(--color-ink)' }}>
            <span className="px-1 font-semibold">{selected.size} sélectionné{selected.size > 1 ? 's' : ''}</span>
            <button type="button" onClick={() => setBulkRanger(true)} disabled={bulkPending} className="rounded-full bg-white/10 px-3 py-1.5 font-semibold ring-1 ring-white/20 hover:bg-white/20 disabled:opacity-60">Ranger…</button>
            <button type="button" onClick={bulkMarkOpened} disabled={bulkPending} className="rounded-full bg-white/10 px-3 py-1.5 font-semibold ring-1 ring-white/20 hover:bg-white/20 disabled:opacity-60">Marquer ouvert</button>
            <button type="button" onClick={bulkRemove} disabled={bulkPending} className="rounded-full bg-white/10 px-3 py-1.5 font-semibold text-clay-tint ring-1 ring-white/20 hover:bg-white/20 disabled:opacity-60">Retirer</button>
          </div>
        </div>
      )}

      {bulkRanger && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(40,38,34,0.32)' }} onClick={() => setBulkRanger(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-soft" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg font-semibold">Ranger {selected.size} article{selected.size > 1 ? 's' : ''}</h3>
            <p className="mt-0.5 text-sm text-ink-soft">Choisis le lieu de conservation.</p>
            <div className="mt-3 flex flex-col gap-1">
              {locationOptions.map((l) => (
                <button key={l.key} type="button" className="rounded-lg px-3 py-2 text-left text-sm hover:bg-sage-tint/50" onClick={() => { setBulkRanger(false); bulkMove(l.key); }}>{l.label}</button>
              ))}
            </div>
            <button type="button" onClick={() => setBulkRanger(false)} className="mt-3 w-full py-2 text-sm text-ink-soft">Annuler</button>
          </div>
        </div>
      )}
    </>
  );
}
