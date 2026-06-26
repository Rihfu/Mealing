'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useCachedResource } from '@/lib/offline/cache';
import { getCoursesSnapshotAction, type CoursesSnapshot } from './snapshot';
import { CoursesRefreshProvider } from './courses-refresh';
import { AddArticle } from './add-article';
import { VoiceCapture } from '@/components/voice-capture';
import { transcribeTextAction, parseDictationAction } from '../voice-actions';
import { addManualBulkAction } from './voice-actions';
import { PurchaseCheckout } from './purchase-checkout';

const COURSES_VOICE_TEXTS = {
  trigger: 'Dicter mes courses',
  title: 'Dicter mes courses',
  intro: 'Cite ce que tu veux acheter — « du lait, des œufs, un paquet de pâtes, des tomates… ».',
};
import { ManageAislesButton } from './category-controls';
import { PrepareOffline } from './prepare-offline';
import { EssentialsManager } from './essentials-manager';
import { ShoppingList, DoneList } from './shopping-list';
import { clearCheckedAction } from './actions';
import { UndoToastHost } from './undo-toast';

/** « Tout décocher » : remet les cochés en « à acheter » puis rafraîchit l'instantané. */
function ClearCheckedButton({ refresh }: { refresh: () => Promise<void> }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await clearCheckedAction();
          await refresh();
        })
      }
      className="text-xs font-bold text-green-strong disabled:opacity-60"
    >
      Tout décocher
    </button>
  );
}

/**
 * Liste de courses en CACHE-FIRST (Phase 2 PWA) : affichage instantané depuis IndexedDB
 * puis revalidation réseau en arrière-plan. Les mutations restent optimistes ; après
 * coup, chaque composant appelle `useCoursesRefresh()` (fourni ici) pour re-télécharger
 * l'instantané et réécrire le cache — `revalidatePath` ne suffit plus puisque la page
 * n'est plus rendue par le serveur à chaque navigation.
 */
export function CoursesView() {
  const { data, loading, refresh } = useCachedResource<CoursesSnapshot | null>(
    'courses:snapshot',
    getCoursesSnapshotAction,
  );

  if (loading && !data) {
    return <p className="py-16 text-center text-sm text-ink-soft">Chargement de ta liste…</p>;
  }
  if (!data) {
    return <p className="py-16 text-center text-sm text-ink-soft">Liste indisponible.</p>;
  }

  const { activeGroups, doneLines, customCats, rayonOrder, essentials, onListRefs, inStockRefs, checkoutItems, activeCount, doneCount } = data;

  return (
    <CoursesRefreshProvider value={refresh}>
      <div className="flex flex-col gap-6">
        <div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight">Liste de courses</h1>
              <p className="font-hand mt-0.5 text-lg text-green-strong">
                une seule liste, triée par rayon — coche au pouce, range au retour
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/courses/historique" className="btn-secondary flex items-center gap-2 py-2 text-sm" title="Tes courses passées, par date">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 3v5h5" />
                  <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
                  <path d="M12 7v5l4 2" />
                </svg>
                Historique
              </Link>
              {activeCount > 0 && (
                <>
                  <PrepareOffline />
                  <Link href="/courses/magasin" className="btn-secondary flex items-center gap-2 py-2 text-sm" title="Vue plein écran, gros boutons — pour cocher en magasin">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 5h2l2.2 11.2a1.5 1.5 0 0 0 1.5 1.2h7.6a1.5 1.5 0 0 0 1.5-1.2L21 8H7" />
                      <circle cx="10" cy="20" r="1.4" />
                      <circle cx="18" cy="20" r="1.4" />
                    </svg>
                    Mode magasin
                  </Link>
                </>
              )}
            </div>
          </div>
          <p className="mt-2 max-w-xl text-sm text-ink-soft">
            Ta liste se met à jour toute seule : on part de tes repas, on retire ce que tu as déjà en stock, et tu
            ajoutes ce que tu veux. Coche au fur et à mesure de tes courses.
          </p>
        </div>

        <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <section className="order-1 rounded-2xl border border-line bg-surface p-4 shadow-soft lg:order-none lg:col-start-2 lg:row-start-1 lg:sticky lg:top-24">
            <h2 className="mb-3 font-display text-lg font-semibold">Ajouter un article</h2>
            <AddArticle onList={onListRefs} inStock={inStockRefs} />
            <VoiceCapture
              transcribeChunk={transcribeTextAction}
              parse={parseDictationAction}
              onAdd={addManualBulkAction}
              refresh={refresh}
              texts={COURSES_VOICE_TEXTS}
            />
          </section>

          <div className="order-2 flex flex-col gap-4 lg:order-none lg:col-start-1 lg:row-start-1 lg:row-span-2">
            <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="font-display text-lg font-semibold">À acheter</h2>
                {doneCount > 0 && <span className="text-sm text-ink-soft">{doneCount} déjà pris</span>}
              </div>

              <div className="mb-2">
                <ManageAislesButton customCategories={customCats} rayonOrder={rayonOrder} />
              </div>

              {activeCount === 0 ? (
                <p className="py-6 text-center text-sm text-ink-soft">
                  Rien à acheter pour l’instant. Ta liste se remplit toute seule dès que tu planifies des repas ou
                  qu’un essentiel vient à manquer.
                </p>
              ) : (
                <ShoppingList groups={activeGroups} customCategories={customCats} rayonOrder={rayonOrder} />
              )}
            </section>

            {doneCount > 0 && (
              <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
                <details open className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between font-display text-lg font-semibold">
                    <span>Déjà pris ({doneCount})</span>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-ink-soft transition-transform group-open:rotate-180">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </summary>
                  <div className="mt-2">
                    <div className="mb-2 flex justify-end">
                      <ClearCheckedButton refresh={refresh} />
                    </div>
                    <DoneList lines={doneLines} customCategories={customCats} />
                  </div>
                </details>
                <div className="mt-3 border-t border-line pt-3">
                  <PurchaseCheckout fullWidth items={checkoutItems} onDone={refresh} />
                </div>
              </section>
            )}
          </div>

          <section className="order-3 rounded-2xl border border-line bg-surface p-4 shadow-soft lg:order-none lg:col-start-2 lg:row-start-2">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 className="font-display text-lg font-semibold">Mes essentiels</h2>
              <Link href="/courses/historique/stats" className="text-xs font-semibold text-green-strong hover:underline">
                Gérer
              </Link>
            </div>
            <p className="mb-2 text-xs text-ink-soft">Tes basiques — ils reviennent tout seuls dans la liste.</p>
            <EssentialsManager items={essentials} />
          </section>
        </div>

        <UndoToastHost />
      </div>
    </CoursesRefreshProvider>
  );
}
