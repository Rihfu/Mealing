'use client';

/**
 * N3 — boucle actionnable : sous une carte « en dessous » (jauge) ou une habitude
 * incomplète, un bouton révèle des idées de RECETTES dérivées (riches en X par
 * portion, ou contenant un aliment taggé), annotées de leur réalisabilité stock,
 * avec liens vers la recette et le planning. Rien d'inventé : tout vient de la base.
 */

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { CalendarDays, ChevronDown, ChevronUp, Lightbulb } from 'lucide-react';
import { suggestForGapAction, suggestForHabitAction } from './actions';
import type { RecipeSuggestion } from '@/lib/core/nutrition-suggest';

export function GapIdeas({
  kind,
  code,
  habitId,
  unit,
}: {
  kind: 'nutrient' | 'habit';
  /** Code nutriment (kind=nutrient). */
  code?: string;
  /** Id du suivi d'habitude (kind=habit). */
  habitId?: string;
  unit?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [items, setItems] = useState<RecipeSuggestion[]>([]);
  const [pending, start] = useTransition();

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded) {
      start(async () => {
        const res =
          kind === 'nutrient' && code
            ? await suggestForGapAction(code)
            : habitId
              ? await suggestForHabitAction(habitId)
              : [];
        setItems(res);
        setLoaded(true);
      });
    }
  };

  return (
    <div className="mt-2.5">
      <button
        type="button"
        onClick={toggle}
        className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-sage-deep hover:text-green-strong"
      >
        <Lightbulb className="h-3.5 w-3.5" strokeWidth={1.75} />
        Des idées de recettes
        {open ? <ChevronUp className="h-3.5 w-3.5" strokeWidth={1.75} /> : <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.75} />}
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-1.5">
          {pending && <p className="text-xs text-ink-soft">Je regarde tes recettes…</p>}
          {!pending && loaded && items.length === 0 && (
            <p className="text-xs leading-snug text-ink-soft">
              Aucune recette de ta bibliothèque ne correspond — l’assistant peut t’en inventer une.
            </p>
          )}
          {items.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-[10px] border border-line bg-paper px-2.5 py-2">
              <div className="min-w-0 flex-1">
                <Link href={`/recettes/${s.id}`} className="block truncate text-[12.5px] font-bold text-ink hover:text-green-strong">
                  {s.name}
                </Link>
                <div className="text-[11px] font-semibold text-ink-soft">
                  {s.amountPerServing != null && `+${s.amountPerServing} ${unit ?? ''} / portion · `}
                  {s.matchedFoods && s.matchedFoods.length > 0 && `contient : ${s.matchedFoods.join(', ')} · `}
                  réalisable à {s.stockPct} % avec ton stock
                </div>
              </div>
              <Link
                href="/planning"
                aria-label="Ouvrir le planning"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-sage text-sage-deep hover:bg-sage-tint/50"
              >
                <CalendarDays className="h-4 w-4" strokeWidth={1.75} />
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
