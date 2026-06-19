'use client';

import { createContext, useContext } from 'react';

/**
 * Rafraîchissement de l'instantané « liste de courses » (cache-first). Comme la liste
 * n'est plus rendue par le serveur à chaque navigation, `revalidatePath('/courses')`
 * ne suffit plus à mettre à jour l'affichage : après chaque mutation, le composant
 * concerné appelle `useCoursesRefresh()` pour re-télécharger l'instantané et réécrire
 * le cache. La promesse est `await`-able → les états optimistes se réconcilient sans
 * clignotement (on attend les données fraîches avant de clore la transition).
 */
const CoursesRefreshContext = createContext<() => Promise<void>>(async () => {});

export const CoursesRefreshProvider = CoursesRefreshContext.Provider;

export function useCoursesRefresh() {
  return useContext(CoursesRefreshContext);
}
