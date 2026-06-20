'use client';

import { MouseSensor, TouchSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

/**
 * Capteurs de glisser-déposer UNIFORMES pour toute l'app (Stock, Courses…) — un seul
 * geste à apprendre. Basé sur @dnd-kit :
 * - souris : démarre après 6 px de mouvement (ne gêne pas les clics) ;
 * - tactile : APPUI LONG ~220 ms (le défilement normal reste possible) ;
 * - clavier : accessibilité (Espace pour saisir, flèches pour déplacer).
 */
export function useDndSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

/** Animation de « repose » uniforme quand on lâche une tuile (léger fondu de position). */
export const dropAnimationConfig = {
  duration: 200,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
};
