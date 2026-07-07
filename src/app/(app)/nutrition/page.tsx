import { getAuthContext } from '@/lib/auth';
import {
  aggregatePeriodNutrition,
  computeChildWeek,
  computeNutrientProvenance,
  countHabitOccurrences,
  getNutritionProfile,
  getNutritionSettings,
  getProfileHabits,
} from '@/lib/core';
import { addDays, isoDate, mondayOf } from '@/lib/dates';
import { NutritionDashboard } from './dashboard';
import { ActivationHero, NoPlanningState } from './states';
import { ChildNutrition } from './child';
import type { DayData, DayStatus, HabitCardData, NutrientCard, NutritionSnapshot } from './view-types';

const WEEKDAYS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
const MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

/** Statut d'une valeur vis-à-vis de sa zone (répliqué serveur, cf. ui.tsx). */
function statusOf(real: number, min: number | null, max: number | null): 'under' | 'in' | 'over' {
  if (max != null && real > max) return 'over';
  if (min != null && real < min) return 'under';
  return 'in';
}

export default async function NutritionPage() {
  const { supabase, userId, profile } = await getAuthContext();
  const householdId = profile?.household_id as string;
  const profileId = userId as string;

  const [nutritionProfile, settings, { data: allNutrientTypes }] = await Promise.all([
    getNutritionProfile(supabase, profileId),
    getNutritionSettings(supabase, profileId),
    // TOUS les types (base + étendus) : un nutriment de la longue traîne SUIVI doit
    // avoir sa carte ; les non suivis restent cachés (filtre plus bas).
    supabase.from('nutrient_type').select('code, name, unit, category, is_base'),
  ]);

  // Non activé → hero d'activation (jamais un tableau de zéros).
  if (!nutritionProfile?.onboardedAt) {
    return <ActivationHero />;
  }

  const childMode = nutritionProfile.isChild;

  // 7 agrégations quotidiennes EN PARALLÈLE ; la semaine = somme des jours (pas
  // d'appel supplémentaire), le détail par jour est disponible gratuitement.
  const monday = mondayOf();
  const dayDates = Array.from({ length: 7 }, (_, i) => isoDate(addDays(monday, i)));
  const dailyAggs = await Promise.all(
    dayDates.map((d) => aggregatePeriodNutrition(supabase, { householdId, profileId, from: d, to: d })),
  );

  const weekReal: Record<string, number> = {};
  const weekPlanned: Record<string, number> = {};
  const coverage = { mealsCovered: 0, mealsTotal: 0, ingredientsWithData: 0, ingredientsTotal: 0 };
  for (const agg of dailyAggs) {
    for (const [k, v] of Object.entries(agg.real)) weekReal[k] = (weekReal[k] ?? 0) + v;
    for (const [k, v] of Object.entries(agg.planned)) weekPlanned[k] = (weekPlanned[k] ?? 0) + v;
    coverage.mealsCovered += agg.coverage.mealsCovered;
    coverage.mealsTotal += agg.coverage.mealsTotal;
    coverage.ingredientsWithData += agg.coverage.ingredientsWithData;
    coverage.ingredientsTotal += agg.coverage.ingredientsTotal;
  }

  // Rien de planifié cette semaine → invitation vers le planning.
  if (coverage.mealsTotal === 0) {
    return <NoPlanningState />;
  }

  // Nutriments suivis → cartes. Avec objectif = jauge, sinon = observation.
  const goalByCode = new Map(settings.goals.map((g) => [g.code, g]));
  const order = ['energy', 'macro', 'micro'];
  const allTypes = (allNutrientTypes ?? [])
    .slice()
    .sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
  const trackedSet = new Set(settings.tracked);
  const cards: NutrientCard[] = allTypes
    // Suivis explicites (base OU étendus) ; sans aucun suivi → les nutriments de base.
    .filter((t) => (trackedSet.size > 0 ? trackedSet.has(t.code) : t.is_base))
    .filter((t) => !(childMode && t.code === 'energy_kcal'))
    .map((t) => {
      const g = goalByCode.get(t.code);
      const hasZone = g != null && (g.min != null || g.max != null);
      return {
        code: t.code,
        name: t.name,
        unit: t.unit,
        category: t.category,
        min: g?.min ?? null,
        max: g?.max ?? null,
        kind: hasZone ? 'gauge' : 'observation',
      } satisfies NutrientCard;
    });

  const gaugeCards = cards.filter((c) => c.kind === 'gauge');
  const todayIso = isoDate(new Date());

  const days: DayData[] = dailyAggs.map((agg, i) => {
    const hasMeals = agg.coverage.mealsTotal > 0;
    let status: DayStatus = 'empty';
    if (hasMeals) {
      const evals = gaugeCards.map((c) => statusOf(agg.real[c.code] ?? 0, c.min, c.max));
      status = evals.includes('over') ? 'over' : evals.every((s) => s === 'in') ? 'in' : 'under';
    }
    return {
      date: dayDates[i],
      weekdayShort: WEEKDAYS[i],
      dayNum: addDays(monday, i).getDate(),
      hasMeals,
      status,
      real: agg.real,
      planned: agg.planned,
    };
  });

  // Cartes d'HABITUDE réelles : occurrences comptées depuis le planning (hors enfant,
  // qui a sa propre vue de variété).
  let habitCards: HabitCardData[] = [];
  if (!childMode) {
    const profileHabits = (await getProfileHabits(supabase, profileId)).filter((h) => h.enabled);
    if (profileHabits.length > 0) {
      const counts = await countHabitOccurrences(supabase, {
        householdId,
        profileId,
        weekStart: dayDates[0],
        weekEnd: dayDates[6],
        today: todayIso,
        habits: profileHabits.map((h) => ({
          key: h.id,
          matchTags: h.matchTags,
          matchFoodIds: h.matchFoodIds,
          distinctMode: h.distinctMode,
        })),
      });
      habitCards = profileHabits.map((h) => {
        const c = counts.get(h.id);
        const done = h.period === 'day' ? (c?.todayDone ?? 0) : (c?.weekDone ?? 0);
        const upcoming = h.period === 'day' ? 0 : (c?.weekUpcoming ?? 0);
        return {
          habitId: h.id,
          name: h.label,
          code: h.habitKey ?? 'custom',
          direction: h.direction,
          target: h.targetCount,
          period: h.period,
          done,
          upcoming,
          coveragePct: 100,
          upcomingLabel: c?.nextLabel ?? undefined,
        } satisfies HabitCardData;
      });
    }
  }

  // Provenance : le nutriment « vedette » = protéines si suivies en jauge, sinon la
  // première jauge. Contributions réelles par recette de la semaine (jamais de démo).
  let provenance = null;
  const starCard = gaugeCards.find((c) => c.code === 'protein') ?? gaugeCards[0];
  if (!childMode && starCard) {
    const items = await computeNutrientProvenance(supabase, {
      householdId,
      profileId,
      from: dayDates[0],
      to: dayDates[6],
      nutrientCode: starCard.code,
    });
    if (items.length > 0) provenance = { code: starCard.code, name: starCard.name, unit: starCard.unit, items };
  }

  const weekEnd = addDays(monday, 6);
  const weekLabel =
    monday.getMonth() === weekEnd.getMonth()
      ? `${monday.getDate()} – ${weekEnd.getDate()} ${MONTHS[weekEnd.getMonth()]}`
      : `${monday.getDate()} ${MONTHS[monday.getMonth()]} – ${weekEnd.getDate()} ${MONTHS[weekEnd.getMonth()]}`;

  const snapshot: NutritionSnapshot = {
    weekLabel,
    today: todayIso,
    todayIndex: dayDates.indexOf(todayIso),
    days,
    weekReal,
    weekPlanned,
    cards,
    habitCards,
    provenance,
    coverage: {
      // Honnêteté (handoff) : le % est basé sur les INGRÉDIENTS avec données —
      // « 100 % des repas ont un chiffre » masquerait des fiches très incomplètes.
      pct:
        coverage.ingredientsTotal > 0
          ? Math.round((coverage.ingredientsWithData / coverage.ingredientsTotal) * 100)
          : coverage.mealsTotal > 0
            ? Math.round((coverage.mealsCovered / coverage.mealsTotal) * 100)
            : null,
      ...coverage,
    },
    daysInZone: days.filter((d) => d.status === 'in').length,
    daysWithMeals: days.filter((d) => d.hasMeals).length,
    childMode,
  };

  if (childMode) {
    // Vue enfant RÉELLE : variété/découverte/familles depuis le planning + tags.
    const [week, habits] = await Promise.all([
      computeChildWeek(supabase, { householdId, profileId, from: dayDates[0], to: dayDates[6], today: todayIso }),
      getProfileHabits(supabase, profileId),
    ]);
    const variety = habits.find((h) => h.habitKey === 'variete_legumes' && h.enabled);
    return (
      <ChildNutrition childName={profile?.display_name ?? null} week={week} varietyTarget={variety?.targetCount ?? 4} />
    );
  }

  return <NutritionDashboard snapshot={snapshot} />;
}
