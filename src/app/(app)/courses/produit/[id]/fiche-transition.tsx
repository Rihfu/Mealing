'use client';

import { createContext, useContext, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';

/**
 * Animation d'apparition / disparition de la fiche produit (Framer Motion).
 *
 * La fiche est une vraie page (route). À l'arrivée, le contenu apparaît en fondu +
 * léger glissement vers le haut. Au retour, le bouton « retour » déclenche d'abord
 * l'animation de sortie (fondu + glissement vers le haut) PUIS la navigation
 * (`onExitComplete`) — sinon la page disparaîtrait sèchement au changement de route.
 *
 * Le déclencheur de sortie est exposé via un contexte pour que le bouton retour
 * (rendu dans les children, côté page serveur) puisse le commander.
 */
const ExitContext = createContext<() => void>(() => {});

/** Bouton « retour » qui joue la sortie avant de naviguer. */
export function useFicheExit() {
  return useContext(ExitContext);
}

export function FicheTransition({ backHref, children }: { backHref: string; children: React.ReactNode }) {
  const router = useRouter();
  const [present, setPresent] = useState(true);

  return (
    <AnimatePresence onExitComplete={() => router.push(backHref)}>
      {present && (
        <motion.div
          key="fiche"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col gap-5"
        >
          <ExitContext.Provider value={() => setPresent(false)}>{children}</ExitContext.Provider>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Lien de retour : déclenche la sortie animée puis la navigation. */
export function FicheBackButton({ label }: { label: string }) {
  const exit = useFicheExit();
  return (
    <button
      type="button"
      onClick={exit}
      className="flex w-fit items-center gap-1.5 text-sm font-bold text-sage-deep hover:underline"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m15 18-6-6 6-6" />
      </svg>
      {label}
    </button>
  );
}
