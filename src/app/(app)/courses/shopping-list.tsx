'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { ProductIcon, ProvenanceBadge, type ProvenanceKey } from '@/lib/product-assets';
import { UNIT_OPTIONS } from '@/lib/units';
import { RangerButton, type CustomCategory } from './category-controls';
import { DeleteWithUndo } from './undo-toast';
import { catView } from './rayons';
import { toggleCheckAction, toggleManualCheckAction, setFoodCategoryAction, updateManualItemAction } from './actions';

export interface SLine {
  key: string;
  name: string;
  qty: string; // libellé d'affichage (« 1 L »)
  quantity: number | null; // valeur brute (pour l'édition)
  unit: string | null;
  source: 'recipe' | 'recurring' | 'manual';
  manualId: string | null;
  foodId: string | null;
  category: string | null;
  iconSlug: string | null;
  checked: boolean;
  alreadyStocked: boolean;
  stockedLabel: string | null;
}

export interface SGroup {
  key: string;
  label: string;
  tint: string;
  ink: string;
  iconSlug: string | null; // emblème (rayon custom)
  items: SLine[];
}

const SOURCE_TO_PROV: Record<SLine['source'], ProvenanceKey> = {
  recipe: 'repas',
  recurring: 'essentiel',
  manual: 'ajoute',
};

const OTHER_KEY = 'autres';

/** Construit/maj l'ensemble des lignes « en cours d'animation » de bascule. */
function useToggle(customCategories: CustomCategory[]) {
  const [pending, startTransition] = useTransition();
  const [animating, setAnimating] = useState<Set<string>>(new Set());

  function toggle(line: SLine, checked: boolean) {
    setAnimating((s) => new Set(s).add(line.key));
    startTransition(async () => {
      const fd = new FormData();
      fd.set('checked', String(checked));
      if (line.source === 'manual') {
        fd.set('id', line.manualId ?? '');
        await toggleManualCheckAction(fd);
      } else {
        fd.set('item_key', line.key);
        await toggleCheckAction(fd);
      }
      setAnimating((s) => {
        const n = new Set(s);
        n.delete(line.key);
        return n;
      });
    });
  }

  // customCategories n'est utilisé que par les lignes (Row) ; passé pour cohérence.
  void customCategories;
  return { pending, animating, toggle };
}

/** Ligne d'article (active ou « déjà pris »), avec coche/décoche animée. */
function Row({
  line,
  customCategories,
  mode,
  animating,
  pending,
  onToggle,
  dragHandle,
}: {
  line: SLine;
  customCategories: CustomCategory[];
  mode: 'active' | 'done';
  animating: boolean;
  pending: boolean;
  onToggle: () => void;
  dragHandle?: React.ReactNode;
}) {
  const v = catView(line.category, customCategories);
  const tint = v?.tint ?? 'var(--color-sage-tint)';
  const ink = v?.ink ?? 'var(--color-sage-deep)';
  const done = mode === 'done';
  // Pendant l'animation, on montre l'état CIBLE (coché si on coche, vide si on décoche).
  const filled = animating ? mode === 'active' : done;

  // Édition de la quantité / unité (articles manuels uniquement).
  const editable = line.source === 'manual' && line.manualId != null;
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState('');
  const [u, setU] = useState('');
  const [savingQty, startSave] = useTransition();

  function openEdit() {
    setQ(line.quantity != null ? String(line.quantity) : '');
    setU(line.unit ?? '');
    setEditing(true);
  }
  function saveQty() {
    const n = q.trim() === '' ? null : Number(q);
    startSave(async () => {
      await updateManualItemAction({
        id: line.manualId as string,
        quantity: n != null && !Number.isNaN(n) ? n : null,
        unit: u || null,
      });
      setEditing(false);
    });
  }

  return (
    <li className={`flex items-center gap-3 py-2 transition-opacity duration-300 ${animating ? 'opacity-40' : ''}`}>
      <button type="button" aria-label={done ? 'Décocher' : 'Cocher'} onClick={onToggle} disabled={pending} className="block">
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-md border text-xs font-bold transition-colors ${
            filled ? 'border-green-strong bg-green-strong text-white' : 'border-line-strong bg-surface text-transparent'
          }`}
        >
          ✓
        </span>
      </button>

      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: tint, color: ink }}>
        <ProductIcon slug={line.iconSlug} size={20} />
      </span>

      <span className={`text-sm ${done ? 'text-ink-soft line-through' : ''}`}>{line.name}</span>

      <span className="ml-auto flex items-center gap-2.5">
        {!done && line.source === 'manual' && line.alreadyStocked && (
          <span
            className="rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{ background: 'var(--color-butter-tint)', color: '#8a6d1f' }}
            title="Tu as déjà cet article en stock"
          >
            déjà en stock{line.stockedLabel ? ` (${line.stockedLabel})` : ''}
          </span>
        )}
        <RangerButton
          label={line.name}
          foodId={line.foodId}
          currentCategory={line.category}
          currentIcon={line.iconSlug}
          customCategories={customCategories}
        />
        <ProvenanceBadge kind={SOURCE_TO_PROV[line.source]} />
        {editable ? (
          editing ? (
            <span className="flex items-center gap-1">
              <input
                type="number"
                step="any"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Qté"
                aria-label="Quantité"
                className="field-input w-16 px-2 py-1 text-sm"
              />
              <select
                value={u}
                onChange={(e) => setU(e.target.value)}
                aria-label="Unité"
                className="field-input w-[5.5rem] px-1 py-1 text-sm"
              >
                {UNIT_OPTIONS.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button type="button" onClick={saveQty} disabled={savingQty} aria-label="Enregistrer" title="Enregistrer" className="text-green-strong disabled:opacity-60">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={openEdit}
              title="Modifier la quantité / l'unité"
              className={`text-sm text-ink-soft hover:text-ink hover:underline ${done ? 'line-through' : ''}`}
            >
              {line.qty || '+ qté'}
            </button>
          )
        ) : (
          line.qty && <span className={`text-sm text-ink-soft ${done ? 'line-through' : ''}`}>{line.qty}</span>
        )}
        {line.source === 'manual' && line.manualId && <DeleteWithUndo kind="manual" id={line.manualId} label={line.name} />}
        {dragHandle}
      </span>
    </li>
  );
}

/**
 * Liste « À acheter » : coche animée + glisser-déposer d'un rayon à l'autre
 * (poignée ⠿, tuile fantôme qui suit le curseur/doigt, dépôt = déplacement mémorisé).
 */
export function ShoppingList({ groups, customCategories }: { groups: SGroup[]; customCategories: CustomCategory[] }) {
  const { pending, animating, toggle } = useToggle(customCategories);
  const [drag, setDrag] = useState<{ line: SLine; from: string } | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [overKey, setOverKey] = useState<string | null>(null);
  const overRef = useRef<string | null>(null);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      e.preventDefault();
      setPos({ x: e.clientX, y: e.clientY });
      const sec = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-rayon]') as HTMLElement | null;
      const k = sec?.dataset.rayon ?? null;
      overRef.current = k;
      setOverKey(k);
    };
    const onUp = () => {
      const target = overRef.current;
      const { line, from } = drag;
      setDrag(null);
      setOverKey(null);
      overRef.current = null;
      if (target && target !== from && target !== OTHER_KEY) {
        setFoodCategoryAction({ label: line.name, foodId: line.foodId, categoryKey: target, iconSlug: line.iconSlug });
      }
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [drag]);

  function startDrag(e: React.PointerEvent, line: SLine, from: string) {
    e.preventDefault();
    e.stopPropagation();
    overRef.current = null;
    setOverKey(null);
    setPos({ x: e.clientX, y: e.clientY });
    setDrag({ line, from });
  }

  return (
    <>
      {groups.map((g) => {
        const over = overKey === g.key && drag != null && drag.from !== g.key;
        return (
          <details
            key={g.key}
            open
            data-rayon={g.key}
            className={`rounded-lg border-t border-line first:border-t-0 ${over ? 'bg-sage-tint/40 ring-1 ring-green-strong' : ''}`}
          >
            <summary className="flex cursor-pointer list-none items-center gap-2 py-2 font-display text-sm font-semibold">
              <span className="flex h-5 w-5 items-center justify-center rounded-md text-[10px]" style={{ background: g.tint, color: g.ink }}>
                {g.iconSlug ? <ProductIcon slug={g.iconSlug} size={12} /> : '●'}
              </span>
              <span className="flex-1">{g.label}</span>
              <span className="text-xs font-normal text-ink-soft">{g.items.length}</span>
            </summary>
            <ul className="divide-y divide-line pl-1">
              {g.items.map((line) => (
                <Row
                  key={line.key}
                  line={line}
                  customCategories={customCategories}
                  mode="active"
                  animating={animating.has(line.key)}
                  pending={pending}
                  onToggle={() => toggle(line, true)}
                  dragHandle={
                    <button
                      type="button"
                      aria-label="Déplacer vers un rayon"
                      title="Glisser pour déplacer de rayon"
                      onPointerDown={(e) => startDrag(e, line, g.key)}
                      className="cursor-grab text-ink-soft/60 hover:text-ink-soft active:cursor-grabbing"
                      style={{ touchAction: 'none' }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <circle cx="9" cy="6" r="1.5" />
                        <circle cx="15" cy="6" r="1.5" />
                        <circle cx="9" cy="12" r="1.5" />
                        <circle cx="15" cy="12" r="1.5" />
                        <circle cx="9" cy="18" r="1.5" />
                        <circle cx="15" cy="18" r="1.5" />
                      </svg>
                    </button>
                  }
                />
              ))}
            </ul>
          </details>
        );
      })}

      {drag && (
        <div
          className="pointer-events-none fixed z-[60] flex items-center gap-2 rounded-xl border border-green-strong bg-surface px-3 py-2 text-sm font-semibold shadow-soft"
          style={{ left: pos.x + 12, top: pos.y - 8, transform: 'rotate(-2deg)' }}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: 'var(--color-sage-tint)', color: 'var(--color-sage-deep)' }}>
            <ProductIcon slug={drag.line.iconSlug} size={18} />
          </span>
          {drag.line.name}
        </div>
      )}
    </>
  );
}

/** Liste « Déjà pris » : décoche animée (la pastille se vide avant le retour). */
export function DoneList({ lines, customCategories }: { lines: SLine[]; customCategories: CustomCategory[] }) {
  const { pending, animating, toggle } = useToggle(customCategories);
  return (
    <ul className="divide-y divide-line">
      {lines.map((line) => (
        <Row
          key={line.key}
          line={line}
          customCategories={customCategories}
          mode="done"
          animating={animating.has(line.key)}
          pending={pending}
          onToggle={() => toggle(line, false)}
        />
      ))}
    </ul>
  );
}
