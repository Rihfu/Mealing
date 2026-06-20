'use client';

import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from 'react';
import { ProductIcon } from '@/lib/product-assets';
import { FoodLink } from '@/components/food-link';
import { TrashIcon } from '../courses/shopping-list';
import { pushUndoToast } from '../courses/undo-toast';
import type { LocationView } from './locations';
import {
  decrementStockAction,
  discardStockAction,
  setOpenedAction,
  setPrintedExpiryAction,
  setStockLocationAction,
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

/** Pastille de péremption colorée selon l'urgence ; le libellé indique la provenance. */
function ExpiryPill({ item }: { item: SItem }) {
  const d = item.daysRemaining;
  if (d == null) return <span className="text-xs text-ink-soft">—</span>;
  const srcLabel = item.expirySource === 'printed' ? 'DLC' : item.expirySource === 'estimate' ? 'estimé' : 'repère';
  const cls = d < 0 ? 'bg-red text-white' : d <= 3 ? 'bg-orange text-white' : 'bg-sage-tint text-green-strong';
  const text = d < 0 ? `périmé (${-d} j)` : d === 0 ? "aujourd'hui" : `${d} j`;
  return (
    <span className={`pill ${cls}`} title={item.expirySource === 'printed' ? 'DLC saisie' : item.expirySource === 'estimate' ? 'estimée par lieu' : 'indicative'}>
      {text} · {srcLabel}
    </span>
  );
}

/** Bouton « retirer » (corbeille travaillée sur pastille rouge pâle), comme Courses. */
function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Retirer du stock"
      title="Retirer du stock"
      className="flex h-7 w-7 items-center justify-center rounded-full bg-clay-tint/50 text-clay-deep transition-colors hover:bg-clay-tint"
    >
      <TrashIcon size={15} />
    </button>
  );
}

/** Menu « ⋯ » : actions secondaires (DLC, marquer ouvert, ranger lieu, jeter). */
function RowMenu({ item, locationOptions, onRemove }: { item: SItem; locationOptions: LocOption[]; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState<'none' | 'ranger' | 'dlc'>('none');
  const [date, setDate] = useState(item.printedExpiry ?? '');
  const [, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

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
              <button type="button" className={it} onClick={() => start(() => setOpenedAction(item.id, !item.opened).then(close))}>
                {item.opened ? '↩︎ Marquer non entamé' : '📂 Marquer ouvert / entamé'}
              </button>
              <button type="button" className={it} onClick={() => setSub('dlc')}>🗓️ {item.printedExpiry ? 'Modifier la DLC' : 'Saisir la DLC'}</button>
              <button type="button" className={it} onClick={() => setSub('ranger')}>📦 Ranger dans un lieu</button>
              <button type="button" className={`${it} text-clay-deep`} onClick={() => start(() => discardStockAction(item.id).then(close))}>🗑️ Jeter (périmé)</button>
              <button type="button" className={`${it} text-ink-soft`} onClick={() => { close(); onRemove(); }}>✕ Retirer du stock</button>
            </>
          )}
          {sub === 'dlc' && (
            <div className="p-1.5">
              <p className="mb-1 text-xs font-semibold text-ink-soft">DLC imprimée (prime sur l’estimation)</p>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field-input w-full text-sm" />
              <div className="mt-2 flex gap-2">
                <button type="button" className="btn-primary flex-1 py-1.5 text-xs" onClick={() => start(() => setPrintedExpiryAction(item.id, date || null).then(close))}>Enregistrer</button>
                {item.printedExpiry && <button type="button" className="btn-secondary py-1.5 text-xs" onClick={() => start(() => setPrintedExpiryAction(item.id, null).then(close))}>Effacer</button>}
              </div>
            </div>
          )}
          {sub === 'ranger' && (
            <div className="max-h-56 overflow-auto p-1">
              {locationOptions.map((l) => (
                <button key={l.key} type="button" className={`${it} ${item.storageLocation === l.key ? 'font-semibold text-green-strong' : ''}`} onClick={() => start(() => setStockLocationAction(item.id, l.key).then(close))}>{l.label}</button>
              ))}
              {item.storageLocation && <button type="button" className={`${it} text-ink-soft`} onClick={() => start(() => setStockLocationAction(item.id, null).then(close))}>Retirer du lieu</button>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({
  item,
  locationOptions,
  selectMode,
  selected,
  onSelectToggle,
  onRemove,
  onPressStart,
  dragHandle,
}: {
  item: SItem;
  locationOptions: LocOption[];
  selectMode: boolean;
  selected: boolean;
  onSelectToggle: () => void;
  onRemove: () => void;
  onPressStart?: (e: React.PointerEvent) => void;
  dragHandle?: React.ReactNode;
}) {
  const [amount, setAmount] = useState('');
  const [, start] = useTransition();
  const expired = item.daysRemaining != null && item.daysRemaining < 0;

  return (
    <li
      onPointerDown={!selectMode ? onPressStart : undefined}
      onContextMenu={!selectMode ? (e) => e.preventDefault() : undefined}
      style={!selectMode ? { WebkitTouchCallout: 'none' } : undefined}
      className={`flex flex-wrap items-center gap-2.5 rounded-lg px-1 py-2.5 transition-all duration-200 hover:bg-sage-tint/40 ${selected ? 'bg-sage-tint/60' : ''} ${expired ? 'bg-red/5' : ''}`}
    >
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
        <form action={decrementStockAction} className="flex items-center gap-1" onSubmit={() => setAmount('')}>
          <span className="whitespace-nowrap text-sm font-bold">{item.quantity ?? 0} {item.unit ?? ''}</span>
          <input type="hidden" name="stock_id" value={item.id} />
          <input name="amount" type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="−" aria-label="Quantité consommée" className="field-input w-14 px-1.5 py-1 text-xs" />
          <button className="text-xs font-semibold text-green-strong hover:underline">retirer</button>
        </form>
      ) : (
        <button type="button" onClick={() => start(() => toggleStockPresenceAction(item.id, !item.present))} className={`pill ${item.present ? 'bg-sage-tint text-green-strong' : 'bg-line text-ink-soft'}`}>
          {item.present ? 'présent' : 'absent'}
        </button>
      )}

      {!selectMode && (
        <>
          <span className="hidden lg:flex"><RemoveButton onClick={onRemove} /></span>
          <RowMenu item={item} locationOptions={locationOptions} onRemove={onRemove} />
          {dragHandle}
        </>
      )}
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

const HANDLE = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" /><circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" /><circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
  </svg>
);

/** Stock groupé par lieu, avec parité ergonomique Courses : glisser une tuile vers un
 *  autre lieu, multi-sélection, repli, recherche, survol, retrait réversible. */
export function StockList({ groups: serverGroups, locationOptions }: { groups: SGroup[]; locationOptions: LocOption[] }) {
  // État optimiste : déplacer une tuile la fait changer de lieu tout de suite.
  const [groups, applyOptimistic] = useOptimistic(
    serverGroups,
    (gs: SGroup[], a: { id: string; to: string }) => {
      let moved: SItem | undefined;
      const without = gs.map((g) => {
        const f = g.items.find((i) => i.id === a.id);
        if (f) moved = f;
        return { ...g, items: g.items.filter((i) => i.id !== a.id) };
      });
      if (!moved) return gs;
      const toKey = a.to === UNSORTED ? '' : a.to;
      const line = { ...moved, storageLocation: toKey || null };
      return without.map((g) => (g.view.key === toKey ? { ...g, items: [...g.items, line] } : g)).filter((g) => g.items.length > 0);
    },
  );

  const [, startMove] = useTransition();
  const [, startRemove] = useTransition();
  const [bulkPending, startBulk] = useTransition();
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRanger, setBulkRanger] = useState(false);

  const [drag, setDrag] = useState<{ item: SItem; from: string } | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [overKey, setOverKey] = useState<string | null>(null);
  const overRef = useRef<string | null>(null);
  const posRef = useRef({ x: 0, y: 0 });
  const justDragged = useRef(false);

  const allItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const q = norm(query.trim());
  const shownGroups = q
    ? groups.map((g) => ({ ...g, items: g.items.filter((i) => norm(i.name).includes(q)) })).filter((g) => g.items.length > 0)
    : groups;
  const shownItems = useMemo(() => shownGroups.flatMap((g) => g.items), [shownGroups]);
  const selectedItems = useMemo(() => allItems.filter((i) => selected.has(i.id)), [allItems, selected]);
  const allShownSelected = shownItems.length > 0 && shownItems.every((i) => selected.has(i.id));

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
      pushUndoToast(label, () => undoRemoveStockAction(snapshots));
    });
  }
  function bulkMarkOpened() { startBulk(async () => { await bulkSetOpenedAction([...selected], true); exitSelect(); }); }
  function bulkMove(key: string) { startBulk(async () => { await bulkSetStockLocationAction([...selected], key === UNSORTED ? null : key); exitSelect(); }); }
  function bulkRemove() { const items = selectedItems; exitSelect(); removeItems(items); }

  // Appui long (tactile + souris) → arme le glisser ; un mouvement/scroll annule.
  function armLongPress(e: React.PointerEvent, activate: () => void) {
    if (e.button != null && e.button !== 0) return;
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    const clear = () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      window.removeEventListener('contextmenu', onCtx);
    };
    const onMove = (ev: PointerEvent) => { if (Math.abs(ev.clientX - sx) > 8 || Math.abs(ev.clientY - sy) > 8) { moved = true; clear(); } };
    const onEnd = () => clear();
    const onCtx = (ev: Event) => ev.preventDefault();
    const timer = window.setTimeout(() => { clear(); if (!moved) activate(); }, 350);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
    window.addEventListener('contextmenu', onCtx);
  }

  function startDrag(item: SItem, from: string, x: number, y: number) {
    justDragged.current = true;
    overRef.current = null;
    setOverKey(null);
    posRef.current = { x, y };
    setPos({ x, y });
    setDrag({ item, from });
  }

  useEffect(() => {
    if (!drag) return;
    const bodyStyle = document.body.style;
    const prevTouch = bodyStyle.getPropertyValue('touch-action');
    const prevSelect = bodyStyle.getPropertyValue('user-select');
    bodyStyle.setProperty('touch-action', 'none');
    bodyStyle.setProperty('user-select', 'none');

    const updateOver = (x: number, y: number) => {
      const sec = document.elementFromPoint(x, y)?.closest('[data-location]') as HTMLElement | null;
      const k = sec?.dataset.location ?? null;
      overRef.current = k;
      setOverKey(k);
    };
    const EDGE = 96;
    let raf = 0;
    const autoScroll = () => {
      const { x, y } = posRef.current;
      const vh = window.innerHeight;
      let dy = 0;
      if (y < EDGE) dy = -Math.ceil(((EDGE - y) / EDGE) * 24) - 3;
      else if (y > vh - EDGE) dy = Math.ceil(((y - (vh - EDGE)) / EDGE) * 24) + 3;
      if (dy !== 0) { window.scrollBy(0, dy); updateOver(x, y); }
      raf = requestAnimationFrame(autoScroll);
    };
    raf = requestAnimationFrame(autoScroll);

    const onMove = (e: PointerEvent) => { e.preventDefault(); posRef.current = { x: e.clientX, y: e.clientY }; setPos({ x: e.clientX, y: e.clientY }); updateOver(e.clientX, e.clientY); };
    const onTouchMove = (e: TouchEvent) => e.preventDefault();
    const onCtx = (e: Event) => e.preventDefault();
    const onUp = () => {
      const target = overRef.current;
      const d = drag;
      setDrag(null); setOverKey(null); overRef.current = null;
      if (d && target && target !== d.from) {
        const to = target;
        startMove(async () => {
          applyOptimistic({ id: d.item.id, to });
          await setStockLocationAction(d.item.id, to === UNSORTED ? null : to);
        });
      }
      setTimeout(() => { justDragged.current = false; }, 0);
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('contextmenu', onCtx);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      cancelAnimationFrame(raf);
      bodyStyle.setProperty('touch-action', prevTouch);
      bodyStyle.setProperty('user-select', prevSelect);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('contextmenu', onCtx);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [drag, applyOptimistic]);

  if (groups.length === 0) {
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

      <div className="flex flex-col gap-4">
        {shownGroups.map((g) => {
          const dropKey = g.view.key || UNSORTED;
          const isCollapsed = collapsed.has(g.view.key);
          const over = overKey === dropKey && drag && drag.from !== dropKey;
          return (
            <section
              key={g.view.key || 'unsorted'}
              data-location={dropKey}
              className={`rounded-2xl border bg-surface p-3.5 shadow-soft ${over ? 'border-green-strong ring-1 ring-green-strong bg-sage-tint/30' : 'border-line'}`}
            >
              <div className="mb-1 flex items-center gap-2">
                <button type="button" onClick={() => toggleCollapse(g.view.key)} aria-label={isCollapsed ? 'Déplier' : 'Replier'} className="flex h-7 w-7 items-center justify-center rounded-md text-ink-soft hover:bg-sage-tint/50">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform ${isCollapsed ? '-rotate-90' : ''}`}><path d="m6 9 6 6 6-6" /></svg>
                </button>
                <span className="h-3 w-3 rounded-full" style={{ background: g.view.tint }} />
                <h2 className="font-display text-base font-semibold">{g.view.label}</h2>
                <span className="text-xs text-ink-soft">{g.items.length}</span>
                {!selectMode && <span className="ml-auto"><ClearLocation label={g.view.label} onConfirm={() => removeItems(g.items)} /></span>}
              </div>
              {!isCollapsed && (
                <ul className="divide-y divide-line">
                  {g.items.map((it) => (
                    <Row
                      key={it.id}
                      item={it}
                      locationOptions={locationOptions}
                      selectMode={selectMode}
                      selected={selected.has(it.id)}
                      onSelectToggle={() => toggleSelect(it.id)}
                      onRemove={() => removeItems([it])}
                      onPressStart={(e) => armLongPress(e, () => startDrag(it, dropKey, e.clientX, e.clientY))}
                      dragHandle={
                        <button
                          type="button"
                          aria-label="Déplacer vers un lieu"
                          title="Glisser pour changer de lieu"
                          onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); startDrag(it, dropKey, e.clientX, e.clientY); }}
                          className="hidden cursor-grab text-ink-soft/60 hover:text-ink-soft active:cursor-grabbing lg:block"
                          style={{ touchAction: 'none' }}
                        >
                          {HANDLE}
                        </button>
                      }
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {drag && (
        <div className="pointer-events-none fixed z-[60] flex items-center gap-2 rounded-xl border border-green-strong bg-surface px-3 py-2 text-sm font-semibold shadow-soft" style={{ left: pos.x + 12, top: pos.y - 8, transform: 'rotate(-2deg)' }}>
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sage-tint text-sage-deep"><ProductIcon slug={drag.item.iconSlug} size={18} /></span>
          {drag.item.name}
        </div>
      )}

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
