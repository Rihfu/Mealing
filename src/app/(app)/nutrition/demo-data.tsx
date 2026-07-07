'use client';

/**
 * Données de DÉMONSTRATION pour la refonte graphique Nutrition.
 *
 * ⚠️ TEMPORAIRE — à remplacer par le backend « facettes → règles curées →
 * suivis d'habitudes » (chantier N1.5, cf. docs/nutrition-suivis-personnalises-design.md).
 * Ces constantes servent uniquement à rendre les écrans du handoff fidèlement en
 * attendant les vraies tables (facet/profile_facet/habit_type/tracking_rule…).
 *
 * Tout ce qui est branché sur de vraies données (jauges des nutriments, couverture,
 * score hebdo, profil/objectifs) ne passe PAS par ce fichier.
 */

import {
  Armchair,
  BatteryLow,
  Bean,
  Bike,
  Bone,
  BookOpen,
  Brain,
  Dumbbell,
  Fish,
  Footprints,
  HardHat,
  HeartPulse,
  Leaf,
  Milk,
  Salad,
  Scale,
  Shield,
  Sprout,
  Trophy,
  Wheat,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { HabitCardData } from './ui';

export interface Facet {
  id: string;
  label: string;
  Icon: LucideIcon;
}

export interface FacetGroup {
  key: string;
  title: string;
  facets: Facet[];
}

/** Groupes de facettes de l'onboarding (chips multi-sélection, tout optionnel). */
export const FACET_GROUPS: FacetGroup[] = [
  {
    key: 'activites',
    title: 'Tes activités',
    facets: [
      { id: 'muscu', label: 'Muscu / force', Icon: Dumbbell },
      { id: 'course', label: 'Course & impact', Icon: Footprints },
      { id: 'endurance', label: 'Endurance', Icon: Bike },
      { id: 'etudes', label: 'Études / travail intellectuel', Icon: BookOpen },
      { id: 'physique', label: 'Métier physique', Icon: HardHat },
      { id: 'sedentaire', label: 'Plutôt sédentaire', Icon: Armchair },
      { id: 'fatigue', label: 'Souvent fatigué·e', Icon: BatteryLow },
    ],
  },
  {
    key: 'alimentation',
    title: 'Ton alimentation',
    facets: [
      { id: 'vegetarien', label: 'Végétarien·ne', Icon: Leaf },
      { id: 'vegan', label: 'Végan·e', Icon: Sprout },
      { id: 'peu_poisson', label: 'Peu de poisson', Icon: Fish },
      { id: 'peu_laitages', label: 'Peu de laitages', Icon: Milk },
    ],
  },
  {
    key: 'objectifs',
    title: 'Ce qui compte pour toi',
    facets: [
      { id: 'equilibre', label: 'Équilibre', Icon: Salad },
      { id: 'poids', label: 'Perte de poids douce', Icon: Scale },
      { id: 'muscle', label: 'Muscle / perf', Icon: Trophy },
      { id: 'articulations', label: 'Articulations', Icon: Bone },
      { id: 'memoire', label: 'Mémoire & concentration', Icon: Brain },
      { id: 'energie', label: 'Énergie', Icon: Zap },
      { id: 'immunite', label: 'Immunité', Icon: Shield },
      { id: 'vieillir', label: 'Vieillir en forme', Icon: HeartPulse },
    ],
  },
];

/** Facettes pré-cochées dans la démo (course & impact + articulations → collagène). */
export const DEMO_SELECTED_FACETS = new Set(['course', 'articulations']);

/** Habitudes de démo affichées sur la page principale (état 4). */
export const DEMO_HABITS: HabitCardData[] = [
  {
    name: 'Poisson gras',
    code: 'fish',
    direction: 'min',
    target: 2,
    period: 'week',
    done: 1,
    upcoming: 1,
    coveragePct: 100,
    upcomingLabel: 'saumon rôti, vendredi soir',
  },
  {
    name: 'Viande rouge',
    code: 'protein',
    direction: 'max',
    target: 2,
    period: 'week',
    done: 2,
    upcoming: 0,
    coveragePct: 100,
    doneLabel: 'pile sur le repère — tout va bien',
  },
];

/** Une recommandation expliquée de l'onboarding B. */
export interface Recommendation {
  id: string;
  name: string;
  Icon: LucideIcon;
  tint: 'sage' | 'butter' | 'clay';
  badge: string;
  because: string[];
  reason: string;
  /** Repère chiffré éditable (zone quotidienne) plutôt qu'une habitude. */
  zone?: { min: number; max: number; unit: string };
}

export const DEMO_RECOMMENDATIONS: Recommendation[] = [
  {
    id: 'collagene',
    name: 'Sources de collagène',
    Icon: Bean,
    tint: 'clay',
    badge: '1× / semaine',
    because: ['course & impact', 'articulations'],
    reason:
      'Les sports à impact sollicitent tendons et cartilages ; certains sportifs veillent à leurs sources de collagène (bouillons, plats mijotés gélatineux…).',
  },
  {
    id: 'proteines',
    name: 'Protéines',
    Icon: Trophy,
    tint: 'sage',
    badge: 'zone quotidienne',
    because: ['course & impact'],
    reason: 'Courir régulièrement augmente les besoins de réparation musculaire.',
    zone: { min: 110, max: 150, unit: 'g / jour' },
  },
  {
    id: 'poisson_gras',
    name: 'Poisson gras',
    Icon: Fish,
    tint: 'butter',
    badge: '2× / semaine',
    because: ['articulations'],
    reason: 'Repère officiel français : du poisson deux fois par semaine, dont un gras.',
  },
];

/** Repères proposés au catalogue de « Mes suivis ». */
export interface CatalogueEntry {
  id: string;
  name: string;
  Icon: LucideIcon;
  tint: 'sage' | 'butter' | 'clay';
  description: string;
  recommended?: boolean;
}

export const DEMO_CATALOGUE: CatalogueEntry[] = [
  {
    id: 'legumineuses',
    name: 'Légumineuses',
    Icon: Bean,
    tint: 'sage',
    description: 'Repère officiel : au moins 2× / semaine. Fibres et protéines végétales.',
    recommended: true,
  },
  {
    id: 'cereales',
    name: 'Céréales complètes',
    Icon: Wheat,
    tint: 'butter',
    description: 'À privilégier au quotidien. Source : repères alimentaires français.',
  },
];

/** « Ce qui compte » proposé dans le constructeur d'habitude. */
export const DEMO_BUILDER_TOPICS = ['Fermentés', 'Légumes verts', 'Fruits à coque', 'Fait maison'];
