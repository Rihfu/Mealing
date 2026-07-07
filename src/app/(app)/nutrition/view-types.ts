/**
 * Types sérialisables partagés entre la page serveur Nutrition et la vue client.
 * (Client-safe : aucun import serveur.)
 */

export type DayStatus = 'in' | 'over' | 'under' | 'empty';

export interface DayData {
  date: string;
  /** « lun », « mar »… */
  weekdayShort: string;
  dayNum: number;
  hasMeals: boolean;
  status: DayStatus;
  real: Record<string, number>;
  planned: Record<string, number>;
}

/** Un nutriment suivi, prêt à rendre en carte (jauge ou observation). */
export interface NutrientCard {
  code: string;
  name: string;
  unit: string;
  category: string;
  /** Zone cible QUOTIDIENNE (null si non ciblé → observation). */
  min: number | null;
  max: number | null;
  kind: 'gauge' | 'observation';
}

export interface CoverageInfo {
  pct: number | null;
  mealsCovered: number;
  mealsTotal: number;
  ingredientsWithData: number;
  ingredientsTotal: number;
}

export interface NutritionSnapshot {
  weekLabel: string;
  today: string;
  /** Index (0–6) d'aujourd'hui dans `days`, -1 si hors semaine courante. */
  todayIndex: number;
  days: DayData[];
  weekReal: Record<string, number>;
  weekPlanned: Record<string, number>;
  cards: NutrientCard[];
  coverage: CoverageInfo;
  daysInZone: number;
  daysWithMeals: number;
  childMode: boolean;
}
