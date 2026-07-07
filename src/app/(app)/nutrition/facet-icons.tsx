'use client';

/** Icône Lucide par clé de facette (le référentiel `facet` ne porte pas d'icône). */
import {
  Armchair,
  BatteryLow,
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
  Zap,
  type LucideIcon,
} from 'lucide-react';

export const FACET_ICON: Record<string, LucideIcon> = {
  sport_force: Dumbbell,
  sport_impact: Footprints,
  sport_endurance: Bike,
  travail_cognitif: BookOpen,
  metier_physique: HardHat,
  sedentaire: Armchair,
  fatigue: BatteryLow,
  vegetarien: Leaf,
  vegan: Sprout,
  peu_poisson: Fish,
  peu_laitages: Milk,
  obj_equilibre: Salad,
  obj_poids: Scale,
  obj_muscle: Trophy,
  obj_articulations: Bone,
  obj_memoire: Brain,
  obj_energie: Zap,
  obj_immunite: Shield,
  obj_longevite: HeartPulse,
};

export const GROUP_TITLE: Record<string, string> = {
  activite: 'Tes activités',
  alimentation: 'Ton alimentation',
  objectif: 'Ce qui compte pour toi',
};

export interface FacetOption {
  key: string;
  label: string;
  groupe: string;
}
