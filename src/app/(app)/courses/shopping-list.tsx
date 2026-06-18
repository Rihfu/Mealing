'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { ProductIcon, ProvenanceBadge, type ProvenanceKey } from '@/lib/product-assets';
import { RangerButton, type CustomCategory } from './category-controls';
import { toggleCheckAction, toggleManualCheckAction, setFoodCategoryAction } from './actions';

export interface SLine {
  key: string;
  name: string;
  qty: string;
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

interface DragState {
  line: SLine;
  from: string;
}

/**
 * Liste « À acheter » interactive :
 *  - clic sur la pastille = coche (la pastille se remplit en vert puis la ligne
 *    bascule en « Déjà pris ») ;
 *  - poignée ⠿ = glisser-déposer une tuile d'un rayon à l'autre (la tuile suit le
 *    curseur/doigt ; déposer sur un rayon mémorise le classement via la préf foyer).
 * Coche et déplacement passent par les server actions (logique en core/).
 */
export function ShoppingList({
  groups,
  customCategories,
}: {
  groups: SGroup[];
  customCategories: CustomCategory[];
}) {
  const [pending, startTransition] = useTransition();
  // Pastilles en cours de coche (animation de remplissage avant disparition).
  const [checking, setChecking] = useState<Set<string>>(new Set());
  // Glisser-déposer.
  const [drag, setDrag] = useState<DragState | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [overKey, setOverKey] = useState<string | null>(null);
  const overRef = useRef<string | null>(null);

  // Écouteurs globaux pendant un glissé (souris + tactile via Pointer Events).
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
        startTransition(async () => {
          await setFoodCategoryAction({
            label: line.name,
            foodId: line.foodId,
            categoryKey: target,
            iconSlug: line.iconSlug,
          });
        });
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
  }, [drag, startTransition]);

  function startDrag(e: React.PointerEvent, line: SLine, from: string) {
    e.preventDefault();
    e.stopPropagation();
    overRef.current = null;
    setOverKey(null);
    setPos({ x: e.clientX, y: e.clientY });
    setDrag({ line, from });
  }

  function check(line: SLine) {
    setChecking((s) => new Set(s).add(line.key));
    startTransition(async () => {
      const fd = new FormData();
      fd.set('checked', 'true');
      if (line.source === 'manual') {
        fd.set('id', line.manualId ?? '');
        await toggleManualCheckAction(fd);
      } else {
        fd.set('item_key', line.key);
        await toggleCheckAction(fd);
      }
      setChecking((s) => {
        const n = new Set(s);
        n.delete(line.key);
        return n;
      });
    });
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
            className={`rounded-lg border-t border-line first:border-t-0 ${
              over ? 'bg-sage-tint/40 ring-1 ring-green-strong' : ''
            }`}
          >
            <summary className="flex cursor-pointer list-none items-center gap-2 py-2 font-display text-sm font-semibold">
              <span
                className="flex h-5 w-5 items-center justify-center rounded-md text-[10px]"
                style={{ background: g.tint, color: g.ink }}
              >
                {g.iconSlug ? <ProductIcon slug={g.iconSlug} size={12} /> : '●'}
              </span>
              <span className="flex-1">{g.label}</span>
              <span className="text-xs font-normal text-ink-soft">{g.items.length}</span>
            </summary>
            <ul className="divide-y divide-line pl-1">
              {g.items.map((line) => {
                const isChecking = checking.has(line.key);
                return (
                  <li
                    key={line.key}
                    className={`flex items-center gap-3 py-2 transition-opacity duration-300 ${
                      isChecking ? 'opacity-40' : ''
                    }`}
                  >
                    <button type="button" aria-label="Cocher" onClick={() => check(line)} disabled={pending} className="block">
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-md border text-xs font-bold transition-colors ${
                          isChecking
                            ? 'border-green-strong bg-green-strong text-white'
                            : 'border-line-strong bg-surface text-transparent'
                        }`}
                      >
                        ✓
                      </span>
                    </button>

                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: g.tint, color: g.ink }}
                    >
                      <ProductIcon slug={line.iconSlug} size={20} />
                    </span>

                    <span className="text-sm">{line.name}</span>

                    <span className="ml-auto flex items-center gap-2.5">
                      {line.source === 'manual' && line.alreadyStocked && (
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
                      {line.qty && <span className="text-sm text-ink-soft">{line.qty}</span>}
                      {/* Poignée de glisser-déposer (souris + tactile). */}
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
                    </span>
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}

      {/* Tuile fantôme qui suit le curseur / le doigt pendant le glissé. */}
      {drag && (
        <div
          className="pointer-events-none fixed z-[60] flex items-center gap-2 rounded-xl border border-green-strong bg-surface px-3 py-2 text-sm font-semibold shadow-soft"
          style={{ left: pos.x + 12, top: pos.y - 8, transform: 'rotate(-2deg)' }}
        >
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ background: 'var(--color-sage-tint)', color: 'var(--color-sage-deep)' }}
          >
            <ProductIcon slug={drag.line.iconSlug} size={18} />
          </span>
          {drag.line.name}
        </div>
      )}
    </>
  );
}
