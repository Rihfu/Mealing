'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { ProductIcon } from '@/lib/product-assets';
import { FoodLink } from '@/components/food-link';
import type { LocationView } from './locations';
import {
  decrementStockAction,
  deleteStockAction,
  discardStockAction,
  setOpenedAction,
  setPrintedExpiryAction,
  setStockLocationAction,
  toggleStockPresenceAction,
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

/** Pastille de péremption colorée selon l'urgence ; le libellé indique la provenance. */
function ExpiryPill({ item }: { item: SItem }) {
  const d = item.daysRemaining;
  if (d == null) return <span className="text-xs text-ink-soft">—</span>;
  const srcLabel = item.expirySource === 'printed' ? 'DLC' : item.expirySource === 'estimate' ? 'estimé' : 'repère';
  const cls = d < 0 ? 'bg-red text-white' : d <= 3 ? 'bg-orange text-white' : 'bg-sage-tint text-green-strong';
  const text = d < 0 ? `périmé (${-d} j)` : d === 0 ? "aujourd'hui" : `${d} j`;
  return (
    <span className={`pill ${cls}`} title={`Péremption ${item.expirySource === 'printed' ? 'saisie (DLC)' : item.expirySource === 'estimate' ? 'estimée par lieu' : 'indicative'}`}>
      {text} · {srcLabel}
    </span>
  );
}

/** Menu « ⋯ » d'actions d'un article (ferme au clic extérieur). */
function RowMenu({ item, locationOptions }: { item: SItem; locationOptions: Array<{ key: string; label: string }> }) {
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState<'none' | 'ranger' | 'dlc'>('none');
  const [date, setDate] = useState(item.printedExpiry ?? '');
  const [, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSub('none');
      }
    };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, [open]);

  const close = () => {
    setOpen(false);
    setSub('none');
  };
  const item_cls = 'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-sage-tint/50';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Plus d’actions"
        className="flex h-8 w-8 items-center justify-center rounded-full text-ink-soft hover:bg-sage-tint/50"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-60 rounded-xl border border-line bg-surface p-1 shadow-soft">
          {sub === 'none' && (
            <>
              <button type="button" className={item_cls} onClick={() => start(() => setOpenedAction(item.id, !item.opened).then(close))}>
                {item.opened ? '↩︎ Marquer non entamé' : '📂 Marquer ouvert / entamé'}
              </button>
              <button type="button" className={item_cls} onClick={() => setSub('dlc')}>
                🗓️ {item.printedExpiry ? 'Modifier la DLC' : 'Saisir la DLC imprimée'}
              </button>
              <button type="button" className={item_cls} onClick={() => setSub('ranger')}>
                📦 Ranger dans un lieu
              </button>
              <button type="button" className={`${item_cls} text-clay-deep`} onClick={() => start(() => discardStockAction(item.id).then(close))}>
                🗑️ Jeter (périmé)
              </button>
              <button type="button" className={`${item_cls} text-ink-soft`} onClick={() => start(() => deleteStockAction(item.id).then(close))}>
                ✕ Retirer du stock
              </button>
            </>
          )}
          {sub === 'dlc' && (
            <div className="p-1.5">
              <p className="mb-1 text-xs font-semibold text-ink-soft">Date limite imprimée (prime sur l’estimation)</p>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field-input w-full text-sm" />
              <div className="mt-2 flex gap-2">
                <button type="button" className="btn-primary flex-1 py-1.5 text-xs" onClick={() => start(() => setPrintedExpiryAction(item.id, date || null).then(close))}>
                  Enregistrer
                </button>
                {item.printedExpiry && (
                  <button type="button" className="btn-secondary py-1.5 text-xs" onClick={() => start(() => setPrintedExpiryAction(item.id, null).then(close))}>
                    Effacer
                  </button>
                )}
              </div>
            </div>
          )}
          {sub === 'ranger' && (
            <div className="max-h-56 overflow-auto p-1">
              {locationOptions.map((l) => (
                <button
                  key={l.key}
                  type="button"
                  className={`${item_cls} ${item.storageLocation === l.key ? 'font-semibold text-green-strong' : ''}`}
                  onClick={() => start(() => setStockLocationAction(item.id, l.key).then(close))}
                >
                  {l.label}
                </button>
              ))}
              {item.storageLocation && (
                <button type="button" className={`${item_cls} text-ink-soft`} onClick={() => start(() => setStockLocationAction(item.id, null).then(close))}>
                  Retirer du lieu
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Une ligne d'article. */
function Row({ item, locationOptions }: { item: SItem; locationOptions: Array<{ key: string; label: string }> }) {
  const [amount, setAmount] = useState('');
  const [, start] = useTransition();
  const expired = item.daysRemaining != null && item.daysRemaining < 0;

  return (
    <li className={`flex flex-wrap items-center gap-2.5 px-1 py-2.5 ${expired ? 'bg-red/5' : ''}`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sage-tint text-sage-deep">
        <ProductIcon slug={item.iconSlug} size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <FoodLink foodId={item.foodId} from="/stock" className="block truncate text-sm font-medium">
          {item.name}
        </FoodLink>
        {item.opened && <span className="text-xs text-ink-soft">entamé</span>}
      </div>

      <ExpiryPill item={item} />

      {item.trackingMode === 'quantity' ? (
        <form
          action={decrementStockAction}
          className="flex items-center gap-1"
          onSubmit={() => setAmount('')}
        >
          <span className="whitespace-nowrap text-sm font-bold">{item.quantity ?? 0} {item.unit ?? ''}</span>
          <input type="hidden" name="stock_id" value={item.id} />
          <input
            name="amount"
            type="number"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="−"
            aria-label="Quantité consommée"
            className="field-input w-14 px-1.5 py-1 text-xs"
          />
          <button className="text-xs font-semibold text-green-strong hover:underline">retirer</button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => start(() => toggleStockPresenceAction(item.id, !item.present))}
          className={`pill ${item.present ? 'bg-sage-tint text-green-strong' : 'bg-line text-ink-soft'}`}
        >
          {item.present ? 'présent' : 'absent'}
        </button>
      )}

      <RowMenu item={item} locationOptions={locationOptions} />
    </li>
  );
}

/** Stock groupé par lieu de conservation. */
export function StockList({ groups, locationOptions }: { groups: SGroup[]; locationOptions: Array<{ key: string; label: string }> }) {
  if (groups.length === 0) {
    return <p className="rounded-2xl border border-line bg-surface px-3.5 py-8 text-center text-sm text-ink-soft">Stock vide.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <section key={g.view.key || 'unsorted'} className="rounded-2xl border border-line bg-surface p-3.5 shadow-soft">
          <div className="mb-1 flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ background: g.view.tint }} />
            <h2 className="font-display text-base font-semibold">{g.view.label}</h2>
            <span className="text-xs text-ink-soft">{g.items.length}</span>
          </div>
          <ul className="divide-y divide-line">
            {g.items.map((it) => (
              <Row key={it.id} item={it} locationOptions={locationOptions} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
