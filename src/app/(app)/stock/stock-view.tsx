'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useCachedResource } from '@/lib/offline/cache';
import { FoodLink } from '@/components/food-link';
import { ProductIcon } from '@/lib/product-assets';
import type { LowStockItem } from '@/lib/core';
import { getStockSnapshotAction, type StockPageSnapshot } from './snapshot';
import { StockRefreshProvider, useStockRefresh } from './stock-refresh';
import { StockList } from './stock-list';
import { AddStock } from './add-stock';
import { VoiceCapture } from '@/components/voice-capture';
import { transcribeDictationAction } from '../voice-actions';
import { addStockBulkAction } from './voice-actions';
import { ManageLocations } from './locations-manager';

const STOCK_VOICE_TEXTS = {
  trigger: 'Dicter ma liste',
  hero: 'Remplis ton stock en parlant',
  title: 'Dicter mon stock',
  intro: 'Cite ce que tu as chez toi — « lait, six œufs, deux kilos de farine, des pommes au frigo… ». On le rangera après.',
};
import { MealReconcile } from './meal-reconcile';
import { addRestockToShoppingAction } from './actions';
import { UndoToastHost } from '../courses/undo-toast';

/** Section « À racheter (stock bas) » : aliments sous leur seuil de réappro → ajout courses.
 *  Enfant du StockRefreshProvider (utilise useStockRefresh pour réconcilier après ajout). */
function RestockSection({ items }: { items: LowStockItem[] }) {
  const refresh = useStockRefresh();
  const [pending, start] = useTransition();
  const [added, setAdded] = useState<Set<string>>(new Set());
  if (items.length === 0) return null;

  function add(it: LowStockItem) {
    start(async () => {
      await addRestockToShoppingAction(it.foodId, it.shortfall, it.unit);
      setAdded((s) => new Set(s).add(it.foodId));
      await refresh();
    });
  }

  const qty = (n: number, u: string | null) => `${n}${u ? ` ${u}` : ''}`;

  return (
    <section className="rounded-2xl border border-orange/40 bg-[#fdf0e3] p-3.5">
      <h2 className="mb-2 font-display text-base font-semibold">À racheter (stock bas)</h2>
      <div className="grid gap-2 md:grid-cols-2">
        {items.map((it) => (
          <div key={it.foodId} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sage-tint text-sage-deep">
                <ProductIcon slug={it.iconSlug} size={18} />
              </span>
              <div className="min-w-0">
                <FoodLink foodId={it.foodId} from="/stock" className="block truncate text-sm font-medium">{it.label}</FoodLink>
                <span className="text-xs text-ink-soft">{qty(it.current, it.unit)} / seuil {qty(it.threshold, it.unit)}</span>
              </div>
            </div>
            {added.has(it.foodId) ? (
              <span className="pill flex-none bg-sage-tint text-green-strong">ajouté ✓</span>
            ) : (
              <button type="button" onClick={() => add(it)} disabled={pending} className="btn-secondary flex-none px-2.5 py-1.5 text-xs disabled:opacity-60">
                + Courses
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Stock en CACHE-FIRST (Phase 2 PWA, parité Courses) : affichage instantané depuis
 * IndexedDB puis revalidation réseau en arrière-plan. Les mutations restent optimistes ;
 * après coup, chaque composant appelle `useStockRefresh()` (fourni ici) pour re-télécharger
 * l'instantané et réécrire le cache — `revalidatePath` ne suffit plus puisque la page
 * n'est plus rendue par le serveur à chaque navigation.
 */
export function StockView() {
  const { data, loading, refresh } = useCachedResource<StockPageSnapshot | null>(
    'stock:snapshot',
    getStockSnapshotAction,
  );

  if (loading && !data) {
    return <p className="py-16 text-center text-sm text-ink-soft">Chargement de ton stock…</p>;
  }
  if (!data) {
    return <p className="py-16 text-center text-sm text-ink-soft">Stock indisponible.</p>;
  }

  const { groups, priority, lowStock, locationOptions, orderedLocations } = data;
  const itemCount = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <StockRefreshProvider value={refresh}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Stock</h1>
            <p className="font-hand mt-0.5 text-lg text-green-strong">rangé par lieu — la péremption s’estime toute seule</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/stock/stats" className="btn-secondary flex items-center gap-2 py-2 text-sm" title="Gaspillage, consommation, évolution">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 3v18h18" /><rect x="7" y="11" width="3" height="6" rx="0.5" /><rect x="13" y="7" width="3" height="10" rx="0.5" />
              </svg>
              Statistiques
            </Link>
          </div>
        </div>

        <MealReconcile />

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          {/* Colonne gauche : priorité + liste, empilées serré (un seul cellule de grille
              → ne s'étire plus à la hauteur du panneau d'ajout). */}
          <div className="flex flex-col gap-5">
            {itemCount === 0 && (
              <section className="rounded-2xl border border-green-strong/40 bg-sage-tint/40 p-4">
                <h2 className="font-display text-base font-semibold">Ton stock est vide</h2>
                <p className="mb-3 mt-0.5 text-sm text-ink-soft">
                  Le plus rapide pour démarrer : énumère ce que tu as à voix haute, on s’occupe du rangement.
                </p>
                <VoiceCapture
                  transcribe={transcribeDictationAction}
                  onAdd={addStockBulkAction}
                  refresh={refresh}
                  texts={STOCK_VOICE_TEXTS}
                  withLocation
                  locationOptions={locationOptions}
                  variant="hero"
                />
              </section>
            )}
            {priority.length > 0 && (
              <section className="rounded-2xl border border-clay bg-clay-tint p-3.5">
                <h2 className="mb-2 font-display text-base font-semibold">À consommer en priorité</h2>
                <div className="grid gap-2 md:grid-cols-2">
                  {priority.map((e) => (
                    <div key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-clay/40 bg-surface/70 px-3 py-2">
                      <FoodLink foodId={e.foodId} from="/stock" className="text-sm font-medium">
                        {e.name}
                      </FoodLink>
                      {e.daysRemaining < 0 ? (
                        <span className="pill bg-red text-white">périmé ({-e.daysRemaining} j)</span>
                      ) : (
                        <span className="pill bg-orange text-white">à consommer · {e.daysRemaining} j</span>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <RestockSection items={lowStock} />

            <div>
              <ManageLocations ordered={orderedLocations} />
              <div className="mt-2">
                <StockList groups={groups} locationOptions={locationOptions} />
              </div>
            </div>
          </div>

          {/* Colonne droite : ajout (sticky). */}
          <section className="rounded-2xl border border-line bg-surface p-3.5 shadow-soft lg:sticky lg:top-24">
            <h2 className="mb-3 font-display text-base font-semibold">Ajouter un article</h2>
            <AddStock locationOptions={locationOptions} />
            <VoiceCapture
              transcribe={transcribeDictationAction}
              onAdd={addStockBulkAction}
              refresh={refresh}
              texts={STOCK_VOICE_TEXTS}
              withLocation
              locationOptions={locationOptions}
            />
          </section>
        </div>

        <UndoToastHost />
      </div>
    </StockRefreshProvider>
  );
}
