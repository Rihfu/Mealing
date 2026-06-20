'use client';

import { createContext, useContext } from 'react';

/**
 * Rafraîchissement de l'instantané « Stock » (cache-first). Comme la page n'est plus
 * rendue par le serveur à chaque navigation, `revalidatePath('/stock')` ne suffit plus
 * à mettre à jour l'affichage : après chaque mutation, le composant concerné appelle
 * `useStockRefresh()` pour re-télécharger l'instantané et réécrire le cache. La promesse
 * est `await`-able → les états optimistes (useOptimistic) se réconcilient sans
 * clignotement (on attend les données fraîches avant de clore la transition).
 * Parité avec `courses/courses-refresh.tsx`.
 */
const StockRefreshContext = createContext<() => Promise<void>>(async () => {});

export const StockRefreshProvider = StockRefreshContext.Provider;

export function useStockRefresh() {
  return useContext(StockRefreshContext);
}
