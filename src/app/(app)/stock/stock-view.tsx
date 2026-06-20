'use client';

import { useCachedResource } from '@/lib/offline/cache';
import { FoodLink } from '@/components/food-link';
import { getStockSnapshotAction, type StockPageSnapshot } from './snapshot';
import { StockRefreshProvider } from './stock-refresh';
import { StockList } from './stock-list';
import { AddStock } from './add-stock';
import { EstimateButton } from './stock-tools';
import { ManageLocations } from './locations-manager';
import { MealReconcile } from './meal-reconcile';
import { UndoToastHost } from '../courses/undo-toast';

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

  const { groups, priority, locationOptions, orderedLocations } = data;

  return (
    <StockRefreshProvider value={refresh}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Stock</h1>
            <p className="font-hand mt-0.5 text-lg text-green-strong">rangé par lieu — la péremption s’estime toute seule</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <EstimateButton />
          </div>
        </div>

        <MealReconcile />

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          {/* Colonne gauche : priorité + liste, empilées serré (un seul cellule de grille
              → ne s'étire plus à la hauteur du panneau d'ajout). */}
          <div className="flex flex-col gap-5">
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
          </section>
        </div>

        <UndoToastHost />
      </div>
    </StockRefreshProvider>
  );
}
