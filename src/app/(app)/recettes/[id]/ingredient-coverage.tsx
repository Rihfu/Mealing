import { FoodLink } from '@/components/food-link';
import type { RecipeIngredientCoverage } from '@/lib/core';

/** Code couleur de disponibilité d'un ingrédient au regard du stock du foyer. */
const STYLE = {
  ok: { dot: 'bg-green-strong', pill: 'bg-sage-tint text-green-strong' },
  partial: { dot: 'bg-orange', pill: 'bg-butter-tint text-[#7a5e12]' },
  none: { dot: 'bg-[#c2774f]', pill: 'bg-clay-tint text-[#c2774f]' },
} as const;

function stockText(it: RecipeIngredientCoverage): string {
  if (it.status === 'none') return 'pas en stock';
  if (it.inStockQty != null) return `en stock : ${it.inStockQty}${it.inStockUnit ? ` ${it.inStockUnit}` : ''}`;
  return 'en stock';
}

/**
 * Liste d'ingrédients avec code couleur stock (vert = suffisant, orange = insuffisant,
 * argile = absent) + quantité en stock à côté de la quantité requise. Aide à décider
 * de cuisiner ou non (« ai-je assez d'œufs ? »). Server-rendu (statique).
 */
export function IngredientCoverageList({ items, recipeId }: { items: RecipeIngredientCoverage[]; recipeId: string }) {
  if (items.length === 0) {
    return <p className="rounded-2xl border border-line bg-surface px-4 py-6 text-center text-sm text-ink-soft">Aucun ingrédient.</p>;
  }
  return (
    <>
      <ul className="overflow-hidden rounded-2xl border border-line bg-surface px-4 shadow-soft">
        {items.map((it, i) => {
          const s = STYLE[it.status];
          return (
            <li key={i} className="flex items-center justify-between gap-4 border-b border-line py-3 last:border-b-0">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.dot}`} title={it.status === 'ok' ? 'en stock' : it.status === 'partial' ? 'insuffisant' : 'absent'} aria-hidden="true" />
                <FoodLink foodId={it.foodId} from={`/recettes/${recipeId}`} className="truncate text-sm font-medium">
                  {it.name}
                </FoodLink>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="whitespace-nowrap text-sm font-bold">
                  {it.requiredQty ?? ''} {it.requiredUnit ?? ''}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.pill}`}>{stockText(it)}</span>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex flex-wrap gap-3 px-1 text-[11px] text-ink-soft">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-strong" /> en stock</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange" /> insuffisant</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#c2774f]" /> absent</span>
      </div>
    </>
  );
}
