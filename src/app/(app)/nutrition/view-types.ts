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

/** Carte de suivi d'HABITUDE (occurrences comptées depuis le planning). */
export interface HabitCardData {
  /** Id du suivi (profile_habit_tracking) — pour les suggestions actionnables (N3). */
  habitId?: string;
  name: string;
  /** Clé pour l'icône (habitKey ou code) + provenance. */
  code: string;
  direction: 'min' | 'max';
  target: number;
  period: 'week' | 'day';
  done: number;
  upcoming: number;
  coveragePct: number | null;
  upcomingLabel?: string;
  doneLabel?: string;
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
  habitCards: HabitCardData[];
  coverage: CoverageInfo;
  daysInZone: number;
  daysWithMeals: number;
  childMode: boolean;
}
