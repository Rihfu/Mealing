import type { DB } from './types';
import { aggregatePeriodNutrition } from './nutrition';
import { getNutritionSettings } from './nutrition-profile';
import { getProfileHabits, countHabitOccurrences, computeChildWeek, type ChildWeekData } from './habits';
import { addDays, isoDate, mondayOf } from '@/lib/dates';

/**
 * Résumé LECTURE SEULE de la semaine nutrition d'un membre qui M'A partagé sa
 * nutrition (décision Foyer n°4, docs/foyer-section-design.md).
 *
 * Tout passe sous la RLS du lecteur : les policies `can_view_profile_nutrition`
 * (0002 + 0037) filtrent réellement — si le partage n'existe pas, les requêtes
 * reviennent vides et on renvoie `none`. Aucune valeur n'est calculée ici :
 * mêmes agrégats que la page Nutrition (principe n°3).
 *
 * Profil ENFANT : jamais de kcal ni de chiffres — on renvoie la vue variété
 * (même dérivation que la page enfant). Le drapeau vient de la fonction DEFINER
 * `shared_nutrition_flags` (la table nutrition_profile n'est PAS ouverte au
 * lecteur : poids/taille/année de naissance restent privés).
 */

export interface SharedNutrientLine {
  code: string;
  name: string;
  unit: string;
  planned: number;
  real: number;
  min: number | null;
  max: number | null;
  status: 'under' | 'in' | 'over' | null;
}

export interface SharedHabitLine {
  label: string;
  objective: string;
  done: number;
  upcoming: number;
  reached: boolean;
}

export type SharedNutritionWeek =
  | { kind: 'none' }
  | { kind: 'child'; week: ChildWeekData }
  | { kind: 'adult'; from: string; to: string; nutrients: SharedNutrientLine[]; habits: SharedHabitLine[]; coveragePct: number | null };

export async function getSharedNutritionWeek(
  db: DB,
  params: { householdId: string; ownerProfileId: string },
): Promise<SharedNutritionWeek> {
  const { householdId, ownerProfileId } = params;

  const { data: flagRows, error } = await db.rpc('shared_nutrition_flags', { target: ownerProfileId });
  if (error) throw new Error(error.message);
  const flags = (flagRows as Array<{ is_child: boolean; onboarded: boolean }> | null)?.[0];
  if (!flags?.onboarded) return { kind: 'none' };

  const monday = mondayOf();
  const from = isoDate(monday);
  const to = isoDate(addDays(monday, 6));
  const today = isoDate(new Date());

  if (flags.is_child) {
    const week = await computeChildWeek(db, { householdId, profileId: ownerProfileId, from, to, today });
    return { kind: 'child', week };
  }

  const [agg, settings, habits, typesRes] = await Promise.all([
    aggregatePeriodNutrition(db, { householdId, profileId: ownerProfileId, from, to }),
    getNutritionSettings(db, ownerProfileId),
    getProfileHabits(db, ownerProfileId),
    db.from('nutrient_type').select('code, name, unit, is_base'),
  ]);

  const types = (typesRes.data ?? []) as Array<{ code: string; name: string; unit: string; is_base: boolean }>;
  const trackedSet = new Set(settings.tracked);
  const goalByCode = new Map(settings.goals.map((g) => [g.code, g]));
  const r1 = (n: number) => Math.round(n * 10) / 10;

  const nutrients: SharedNutrientLine[] = types
    .filter((t) => (trackedSet.size > 0 ? trackedSet.has(t.code) : t.is_base))
    .map((t) => {
      const g = goalByCode.get(t.code);
      const real = agg.real[t.code] ?? 0;
      const status =
        g == null || (g.min == null && g.max == null)
          ? null
          : g.max != null && real > g.max
            ? ('over' as const)
            : g.min != null && real < g.min
              ? ('under' as const)
              : ('in' as const);
      return {
        code: t.code,
        name: t.name,
        unit: t.unit,
        planned: r1(agg.planned[t.code] ?? 0),
        real: r1(real),
        min: g?.min ?? null,
        max: g?.max ?? null,
        status,
      };
    });

  const enabledHabits = habits.filter((h) => h.enabled);
  let habitLines: SharedHabitLine[] = [];
  if (enabledHabits.length > 0) {
    const counts = await countHabitOccurrences(db, {
      householdId,
      profileId: ownerProfileId,
      weekStart: from,
      weekEnd: to,
      today,
      habits: enabledHabits.map((h) => ({ key: h.id, matchTags: h.matchTags, matchFoodIds: h.matchFoodIds, distinctMode: h.distinctMode })),
    });
    habitLines = enabledHabits.map((h) => {
      const c = counts.get(h.id);
      const done = h.period === 'day' ? (c?.todayDone ?? 0) : (c?.weekDone ?? 0);
      return {
        label: h.label,
        objective: `${h.direction === 'min' ? 'au moins' : 'au plus'} ${h.targetCount}×/${h.period === 'week' ? 'semaine' : 'jour'}`,
        done,
        upcoming: h.period === 'day' ? 0 : (c?.weekUpcoming ?? 0),
        reached: h.direction === 'min' ? done >= h.targetCount : done <= h.targetCount,
      };
    });
  }

  const cov = agg.coverage;
  return {
    kind: 'adult',
    from,
    to,
    nutrients,
    habits: habitLines,
    coveragePct:
      cov.ingredientsTotal > 0
        ? Math.round((cov.ingredientsWithData / cov.ingredientsTotal) * 100)
        : cov.mealsTotal > 0
          ? Math.round((cov.mealsCovered / cov.mealsTotal) * 100)
          : null,
  };
}
