'use client';

/**
 * N3 — EXTRAS hors-plan : saisie express (2 gestes — chercher un aliment, dire
 * combien) d'un aliment mangé en dehors du planning. Compté dans le « réel
 * estimé » ; visible uniquement par soi (RLS). Les valeurs viennent des données
 * stockées de l'aliment (fournisseur, jamais l'IA — n°3).
 */

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, Trash2, X } from 'lucide-react';
import { addExtraAction, listTodayExtrasAction, removeExtraAction, searchExtraFoodsAction } from './actions';
import type { ExtraItem } from '@/lib/core/nutrition-extras';

interface FoodHit {
  foodId: string;
  name: string;
  unit: string;
}

export function ExtrasButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 items-center gap-2 rounded-xl border-[1.5px] border-sage bg-surface px-4 text-sm font-bold text-sage-deep transition-colors hover:bg-sage-tint/40"
      >
        <Plus className="h-[17px] w-[17px]" strokeWidth={1.75} />
        <span className="hidden sm:inline">Extra</span>
      </button>
      {open && <ExtrasSheet onClose={() => setOpen(false)} />}
    </>
  );
}

function ExtrasSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<FoodHit[]>([]);
  const [selected, setSelected] = useState<FoodHit | null>(null);
  const [qty, setQty] = useState('');
  const [extras, setExtras] = useState<ExtraItem[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshList = () => {
    start(async () => setExtras(await listTodayExtrasAction()));
  };
  // Liste du jour au montage.
  useEffect(refreshList, []);

  const onQuery = (v: string) => {
    setQuery(v);
    setSelected(null);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      start(async () => setHits(await searchExtraFoodsAction(v)));
    }, 250);
  };

  const num = (s: string) => {
    const n = Number(s.replace(',', '.'));
    return !Number.isNaN(n) && n > 0 ? n : null;
  };

  const submit = () => {
    const quantity = num(qty);
    if (!selected || !quantity) return;
    start(async () => {
      const res = await addExtraAction({ foodId: selected.foodId, quantity });
      if (res.ok) {
        setFeedback(`${selected.name} ajouté — compté dans ton réel.`);
        setSelected(null);
        setQuery('');
        setQty('');
        setHits([]);
        setExtras(await listTodayExtrasAction());
        router.refresh();
      } else {
        setFeedback('Ajout impossible — réessaie.');
      }
    });
  };

  const remove = (id: string) =>
    start(async () => {
      await removeExtraAction(id);
      setExtras(await listTodayExtrasAction());
      router.refresh();
    });

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/30 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-t-3xl bg-paper p-6 sm:rounded-3xl" style={{ boxShadow: 'var(--shadow-lg)' }} onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-[5px] w-11 rounded-full bg-line sm:hidden" />
        <div className="mb-1 flex items-center justify-between">
          <div className="font-display text-[23px] font-semibold tracking-tight">Un extra ?</div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="text-ink-soft hover:text-ink">
            <X className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>
        <p className="mb-4 text-[13.5px] leading-snug text-ink-soft">
          Un aliment mangé hors planning — compté dans ton réel estimé, visible par toi seul·e.
        </p>

        <div className="mb-2 flex h-[46px] items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5">
          <Search className="h-[17px] w-[17px] shrink-0 text-ink-soft" strokeWidth={1.75} />
          <input
            value={selected ? selected.name : query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Chercher un aliment… (yaourt, pomme…)"
            className="w-full bg-transparent text-sm font-semibold outline-none"
          />
        </div>
        {!selected && hits.length > 0 && (
          <div className="mb-2 max-h-44 overflow-y-auto rounded-xl border border-line bg-surface">
            {hits.map((h) => (
              <button
                key={h.foodId}
                type="button"
                onClick={() => {
                  setSelected(h);
                  setHits([]);
                }}
                className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm font-semibold hover:bg-sage-tint/40"
              >
                {h.name}
                <span className="text-xs text-ink-soft">{h.unit}</span>
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div className="mb-3 flex items-center gap-2.5">
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              inputMode="decimal"
              placeholder="Quantité"
              className="field-input w-32 py-2.5 text-center font-bold"
              autoFocus
            />
            <span className="text-sm font-semibold text-ink-soft">{selected.unit}</span>
            <button type="button" onClick={submit} disabled={pending || !num(qty)} className="btn-primary ml-auto px-5 py-2.5 disabled:opacity-50">
              {pending ? 'Ajout…' : 'Ajouter'}
            </button>
          </div>
        )}
        {feedback && (
          <p className="mb-3 rounded-[10px] bg-sage-tint px-3 py-2 text-[12.5px] font-semibold text-sage-deep" role="status">
            {feedback}
          </p>
        )}

        <div className="mb-2 text-xs font-extrabold uppercase tracking-wide text-ink-soft">Aujourd’hui</div>
        {extras.length === 0 ? (
          <p className="text-sm text-ink-soft">Aucun extra aujourd’hui.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {extras.map((e) => (
              <div key={e.id} className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm font-bold">{e.foodName}</span>
                <span className="text-xs font-semibold text-ink-soft">
                  {e.quantity} {e.unit}
                </span>
                <button type="button" onClick={() => remove(e.id)} aria-label="Retirer" className="text-ink-soft hover:text-ink">
                  <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
