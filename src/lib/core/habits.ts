import type { DB } from './types';
import { unwrap } from './types';

/**
 * N1.5 Nutrition — suivis d'HABITUDES : comptage d'occurrences depuis le PLANNING.
 *
 * Une occurrence = un repas planifié contenant ≥ 1 ingrédient taggé (food_tag).
 * Zéro donnée nutritionnelle requise (le collagène, absent de toute base, devient
 * suivable). Approximation assumée (principe n°2) : affiché comme repère, pas vérité.
 * Comptée sur les repas PLANIFIÉS (n°1 : planifié = mangé) — « à venir » distingué.
 */

export interface HabitTypeDef {
  key: string;
  label: string;
  description: string | null;
  target_count: number;
  period: 'day' | 'week';
  match_tags: string[];
  distinct_mode: boolean;
  ordre: number;
}

export interface ProfileHabit {
  id: string;
  habitKey: string | null;
  label: string;
  direction: 'min' | 'max';
  targetCount: number;
  period: 'day' | 'week';
  matchTags: string[];
  matchFoodIds: string[];
  distinctMode: boolean;
  enabled: boolean;
}

/** Référentiel des habitudes proposables. */
export async function listHabitTypes(db: DB): Promise<HabitTypeDef[]> {
  return (unwrap(
    await db
      .from('habit_type')
      .select('key, label, description, target_count, period, match_tags, distinct_mode, ordre')
      .order('ordre'),
  ) ?? []) as HabitTypeDef[];
}

/** Habitudes suivies par un profil (résolues avec le référentiel pour les libellés/repères). */
export async function getProfileHabits(db: DB, profileId: string): Promise<ProfileHabit[]> {
  const [rowsRes, typesRes] = await Promise.all([
    db
      .from('profile_habit_tracking')
      .select('id, habit_key, custom_label, direction, target_count, period, match_tags, match_food_ids, distinct_mode, enabled')
      .eq('profile_id', profileId),
    listHabitTypes(db),
  ]);
  const types = new Map((typesRes as HabitTypeDef[]).map((t) => [t.key, t]));
  const rows = (unwrap(rowsRes) ?? []) as Array<{
    id: string;
    habit_key: string | null;
    custom_label: string | null;
    direction: 'min' | 'max';
    target_count: number;
    period: 'day' | 'week';
    match_tags: string[];
    match_food_ids: string[];
    distinct_mode: boolean;
    enabled: boolean;
  }>;
  return rows.map((r) => {
    const def = r.habit_key ? types.get(r.habit_key) : undefined;
    return {
      id: r.id,
      habitKey: r.habit_key,
      label: r.custom_label ?? def?.label ?? 'Habitude',
      direction: r.direction,
      targetCount: r.target_count,
      period: r.period,
      // Un suivi référencé hérite des tags du référentiel ; un custom porte les siens.
      matchTags: r.habit_key ? (def?.match_tags ?? r.match_tags) : r.match_tags,
      matchFoodIds: r.match_food_ids,
      distinctMode: r.habit_key ? (def?.distinct_mode ?? r.distinct_mode) : r.distinct_mode,
      enabled: r.enabled,
    };
  });
}

/** Ajoute un suivi d'habitude référencé (idempotent par habit_key). */
export async function addProfileHabit(db: DB, profileId: string, habitKey: string): Promise<void> {
  const def = (
    (unwrap(await db.from('habit_type').select('target_count, period').eq('key', habitKey).limit(1)) ?? []) as Array<{
      target_count: number;
      period: 'day' | 'week';
    }>
  )[0];
  const ins = await db.from('profile_habit_tracking').insert({
    profile_id: profileId,
    habit_key: habitKey,
    direction: 'min',
    target_count: def?.target_count ?? 1,
    period: def?.period ?? 'week',
  });
  // 23505 = doublon (déjà suivi) : non bloquant.
  if (ins.error && ins.error.code !== '23505') throw new Error(ins.error.message);
}

/** Ajoute un suivi d'habitude 100 % CUSTOM (constructeur — sa règle, comptée contre le planning). */
export async function addCustomHabit(
  db: DB,
  profileId: string,
  input: { label: string; direction: 'min' | 'max'; targetCount: number; period: 'day' | 'week'; matchTags: string[]; matchFoodIds?: string[] },
): Promise<void> {
  const ins = await db.from('profile_habit_tracking').insert({
    profile_id: profileId,
    habit_key: null,
    custom_label: input.label,
    direction: input.direction,
    target_count: input.targetCount,
    period: input.period,
    match_tags: input.matchTags,
    match_food_ids: input.matchFoodIds ?? [],
  });
  if (ins.error) throw new Error(ins.error.message);
}

/** Supprime un suivi d'habitude (par id). */
export async function removeProfileHabit(db: DB, profileId: string, id: string): Promise<void> {
  const del = await db.from('profile_habit_tracking').delete().eq('id', id).eq('profile_id', profileId);
  if (del.error) throw new Error(del.error.message);
}

/* --------------------------- Comptage --------------------------- */

export interface HabitCount {
  /** Occurrences (repas) déjà passées cette semaine. */
  weekDone: number;
  /** Occurrences planifiées mais pas encore passées. */
  weekUpcoming: number;
  /** Occurrences le jour « today » (pour les habitudes par jour). */
  todayDone: number;
  /** Aliments DISTINCTS déjà consommés (mode variété). */
  distinctPast: string[];
  /** Aliments DISTINCTS encore à venir (pas déjà vus) — « et bientôt… ». */
  distinctUpcoming: string[];
  /** Libellé de la prochaine occurrence à venir (« saumon, vendredi »). */
  nextLabel: string | null;
}

interface CountParams {
  householdId: string;
  profileId: string;
  weekStart: string;
  weekEnd: string;
  today: string;
  habits: Array<{ key: string; matchTags: string[]; matchFoodIds: string[]; distinctMode: boolean }>;
}

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/**
 * Compte les occurrences de chaque habitude sur la semaine, en distinguant passé /
 * à venir. Une occurrence = un repas planifié contenant un aliment taggé.
 */
/** Repas pertinent d'une période, avec sa recette EFFECTIVE (reste → recette source). */
export interface RelevantMeal {
  id: string;
  mealDate: string;
  /** Recette effective (celle du repas, ou celle du repas-source pour un reste). */
  recipeId: string | null;
  isIndividual: boolean;
  servings: number | null;
}

/**
 * Charge les repas PERTINENTS d'un profil sur une période : jours hors-plan exclus,
 * repas individuels d'autres profils exclus, recette des RESTES résolue vers le
 * repas source (même logique qu'aggregatePeriodNutrition). Partagé entre le
 * comptage d'habitudes, la provenance et le mode enfant.
 */
export async function loadRelevantWeekMeals(
  db: DB,
  p: { householdId: string; profileId: string; from: string; to: string },
): Promise<RelevantMeal[]> {
  const [mealsRes, offRes] = await Promise.all([
    db
      .from('planned_meal')
      .select('id, meal_date, recipe_id, leftover_source_meal_id, is_individual, individual_profile_id, servings')
      .eq('household_id', p.householdId)
      .gte('meal_date', p.from)
      .lte('meal_date', p.to),
    db.from('day_off_plan').select('off_date, scope, profile_id').gte('off_date', p.from).lte('off_date', p.to),
  ]);
  type Meal = {
    id: string;
    meal_date: string;
    recipe_id: string | null;
    leftover_source_meal_id: string | null;
    is_individual: boolean;
    individual_profile_id: string | null;
    servings: number | null;
  };
  const meals = (unwrap(mealsRes) ?? []) as Meal[];
  const offDays = (unwrap(offRes) ?? []) as Array<{ off_date: string; scope: string; profile_id: string | null }>;
  const offDates = new Set(
    offDays.filter((o) => o.scope === 'household' || o.profile_id === p.profileId).map((o) => o.off_date),
  );
  const relevant = meals.filter(
    (m) => !offDates.has(m.meal_date) && (!m.is_individual || m.individual_profile_id === p.profileId),
  );
  if (relevant.length === 0) return [];

  // Recette effective (recette propre, sinon celle de la source du reste).
  const recipeBySourceMeal = new Map<string, string | null>(meals.map((m) => [m.id, m.recipe_id]));
  const missingSources = Array.from(
    new Set(
      relevant
        .filter((m) => !m.recipe_id && m.leftover_source_meal_id && !recipeBySourceMeal.has(m.leftover_source_meal_id))
        .map((m) => m.leftover_source_meal_id as string),
    ),
  );
  if (missingSources.length > 0) {
    const src = (unwrap(await db.from('planned_meal').select('id, recipe_id').in('id', missingSources)) ?? []) as Array<{
      id: string;
      recipe_id: string | null;
    }>;
    for (const s of src) recipeBySourceMeal.set(s.id, s.recipe_id);
  }

  return relevant.map((m) => ({
    id: m.id,
    mealDate: m.meal_date,
    recipeId: m.recipe_id ?? (m.leftover_source_meal_id ? (recipeBySourceMeal.get(m.leftover_source_meal_id) ?? null) : null),
    isIndividual: m.is_individual,
    servings: m.servings,
  }));
}

export async function countHabitOccurrences(db: DB, p: CountParams): Promise<Map<string, HabitCount>> {
  const empty = (): HabitCount => ({ weekDone: 0, weekUpcoming: 0, todayDone: 0, distinctPast: [], distinctUpcoming: [], nextLabel: null });
  const result = new Map<string, HabitCount>(p.habits.map((h) => [h.key, empty()]));
  if (p.habits.length === 0) return result;

  const relevant = await loadRelevantWeekMeals(db, {
    householdId: p.householdId,
    profileId: p.profileId,
    from: p.weekStart,
    to: p.weekEnd,
  });
  if (relevant.length === 0) return result;

  const recipeIds = Array.from(new Set(relevant.map((m) => m.recipeId).filter((x): x is string => !!x)));
  if (recipeIds.length === 0) return result;

  const ings = (unwrap(
    await db.from('recipe_ingredient').select('recipe_id, food_id').in('recipe_id', recipeIds).not('food_id', 'is', null),
  ) ?? []) as Array<{ recipe_id: string; food_id: string }>;
  const foodIds = Array.from(new Set(ings.map((i) => i.food_id)));
  if (foodIds.length === 0) return result;

  const [tagsRes, foodsRes] = await Promise.all([
    db.from('food_tag').select('food_id, tag').in('food_id', foodIds),
    db.from('food').select('id, name').in('id', foodIds),
  ]);
  const tagsByFood = new Map<string, Set<string>>();
  for (const t of (unwrap(tagsRes) ?? []) as Array<{ food_id: string; tag: string }>) {
    if (!tagsByFood.has(t.food_id)) tagsByFood.set(t.food_id, new Set());
    tagsByFood.get(t.food_id)!.add(t.tag);
  }
  const foodName = new Map(((unwrap(foodsRes) ?? []) as Array<{ id: string; name: string }>).map((f) => [f.id, f.name]));

  // recipe_id -> liste de food_ids
  const foodsByRecipe = new Map<string, string[]>();
  for (const i of ings) {
    if (!foodsByRecipe.has(i.recipe_id)) foodsByRecipe.set(i.recipe_id, []);
    foodsByRecipe.get(i.recipe_id)!.push(i.food_id);
  }

  const dayLabel = (iso: string) => WEEKDAYS[new Date(iso + 'T00:00:00').getDay()];

  for (const habit of p.habits) {
    const acc = result.get(habit.key)!;
    const tagSet = new Set(habit.matchTags);
    const foodSet = new Set(habit.matchFoodIds);
    const seenPast = new Map<string, string>(); // foodId -> name (variété passée)
    const seenUpcoming = new Map<string, string>();

    // Repas triés par date pour un « nextLabel » cohérent.
    const sorted = [...relevant].sort((a, b) => a.mealDate.localeCompare(b.mealDate));
    for (const m of sorted) {
      if (!m.recipeId) continue;
      const mealFoods = foodsByRecipe.get(m.recipeId) ?? [];
      const matchingFoods = mealFoods.filter((fid) => {
        const ftags = tagsByFood.get(fid);
        return foodSet.has(fid) || (ftags && [...ftags].some((t) => tagSet.has(t)));
      });
      if (matchingFoods.length === 0) continue;
      const past = m.mealDate <= p.today;

      if (habit.distinctMode) {
        for (const fid of matchingFoods) {
          if (past) seenPast.set(fid, foodName.get(fid) ?? '');
          else if (!seenPast.has(fid)) seenUpcoming.set(fid, foodName.get(fid) ?? '');
        }
      } else {
        if (past) acc.weekDone += 1;
        else {
          acc.weekUpcoming += 1;
          if (!acc.nextLabel) {
            const nm = foodName.get(matchingFoods[0]) ?? '';
            acc.nextLabel = `${nm.toLowerCase()}, ${dayLabel(m.mealDate)}`;
          }
        }
        if (m.mealDate === p.today) acc.todayDone += 1;
      }
    }

    if (habit.distinctMode) {
      acc.distinctPast = Array.from(seenPast.values()).filter(Boolean);
      acc.distinctUpcoming = Array.from(seenUpcoming.values()).filter(Boolean);
      acc.weekDone = acc.distinctPast.length;
      acc.weekUpcoming = acc.distinctUpcoming.length;
    }
  }

  return result;
}

/* --------------------------- Mode enfant --------------------------- */

export interface ChildWeekData {
  /** Légumes DISTINCTS déjà passés (noms) et à venir (nom + jour). */
  vegetablesPast: string[];
  vegetablesUpcoming: Array<{ name: string; day: string }>;
  /** Découverte : aliment (légume/fruit) de la semaine jamais vu sur ~8 semaines. */
  discovery: { name: string; day: string } | null;
  /** Familles d'aliments : part des repas de la semaine en contenant ≥ 1 (0-1). */
  families: Array<{ label: string; share: number }>;
  mealsTotal: number;
}

const CHILD_WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/**
 * Données RÉELLES de la vue enfant : variété de légumes (aliments distincts du
 * planning), découverte de la semaine, familles d'aliments — JAMAIS de chiffres
 * nutritionnels (éthique). Tout est dérivé des tags/rayons du catalogue (n°2).
 */
export async function computeChildWeek(
  db: DB,
  p: { householdId: string; profileId: string; from: string; to: string; today: string },
): Promise<ChildWeekData> {
  const empty: ChildWeekData = { vegetablesPast: [], vegetablesUpcoming: [], discovery: null, families: [], mealsTotal: 0 };
  const meals = await loadRelevantWeekMeals(db, p);
  if (meals.length === 0) return empty;
  const recipeIds = Array.from(new Set(meals.map((m) => m.recipeId).filter((x): x is string => !!x)));
  if (recipeIds.length === 0) return { ...empty, mealsTotal: meals.length };

  const ings = (unwrap(
    await db.from('recipe_ingredient').select('recipe_id, food_id').in('recipe_id', recipeIds).not('food_id', 'is', null),
  ) ?? []) as Array<{ recipe_id: string; food_id: string }>;
  const foodIds = Array.from(new Set(ings.map((i) => i.food_id)));
  if (foodIds.length === 0) return { ...empty, mealsTotal: meals.length };

  const [tagsRes, foodsRes] = await Promise.all([
    db.from('food_tag').select('food_id, tag').in('food_id', foodIds),
    db.from('food').select('id, name, category').in('id', foodIds),
  ]);
  const tagsByFood = new Map<string, Set<string>>();
  for (const t of (unwrap(tagsRes) ?? []) as Array<{ food_id: string; tag: string }>) {
    if (!tagsByFood.has(t.food_id)) tagsByFood.set(t.food_id, new Set());
    tagsByFood.get(t.food_id)!.add(t.tag);
  }
  const foods = new Map(
    ((unwrap(foodsRes) ?? []) as Array<{ id: string; name: string; category: string | null }>).map((f) => [f.id, f]),
  );
  const foodsByRecipe = new Map<string, string[]>();
  for (const i of ings) {
    const list = foodsByRecipe.get(i.recipe_id) ?? [];
    list.push(i.food_id);
    foodsByRecipe.set(i.recipe_id, list);
  }

  const dayLabel = (iso: string) => CHILD_WEEKDAYS[new Date(iso + 'T00:00:00').getDay()];
  const isFamily = (fid: string, family: 'legume' | 'fruit' | 'proteines' | 'cremerie'): boolean => {
    if (family === 'legume' || family === 'fruit') return tagsByFood.get(fid)?.has(family) ?? false;
    return foods.get(fid)?.category === family;
  };

  // Variété de légumes (distincts, passé / à venir) + comptage des familles par repas.
  const vegPast = new Map<string, string>();
  const vegUpcoming = new Map<string, { name: string; day: string }>();
  const familyMeals: Record<string, number> = { legume: 0, fruit: 0, proteines: 0, cremerie: 0 };
  const weekFoodDays = new Map<string, string>(); // 1ʳᵉ apparition d'un aliment (découverte)
  const sorted = [...meals].sort((a, b) => a.mealDate.localeCompare(b.mealDate));
  for (const m of sorted) {
    if (!m.recipeId) continue;
    const mealFoods = foodsByRecipe.get(m.recipeId) ?? [];
    for (const fam of ['legume', 'fruit', 'proteines', 'cremerie'] as const) {
      if (mealFoods.some((fid) => isFamily(fid, fam))) familyMeals[fam] += 1;
    }
    for (const fid of mealFoods) {
      const name = foods.get(fid)?.name;
      if (!name) continue;
      if (!weekFoodDays.has(fid) && (isFamily(fid, 'legume') || isFamily(fid, 'fruit'))) {
        weekFoodDays.set(fid, m.mealDate);
      }
      if (!isFamily(fid, 'legume')) continue;
      if (m.mealDate <= p.today) {
        vegPast.set(fid, name);
        vegUpcoming.delete(fid);
      } else if (!vegPast.has(fid) && !vegUpcoming.has(fid)) {
        vegUpcoming.set(fid, { name, day: dayLabel(m.mealDate) });
      }
    }
  }

  // Découverte : un légume/fruit de la semaine ABSENT des ~8 semaines précédentes.
  let discovery: ChildWeekData['discovery'] = null;
  if (weekFoodDays.size > 0) {
    const prevFrom = new Date(p.from + 'T00:00:00');
    prevFrom.setDate(prevFrom.getDate() - 56);
    const prevTo = new Date(p.from + 'T00:00:00');
    prevTo.setDate(prevTo.getDate() - 1);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const prevMeals = await loadRelevantWeekMeals(db, {
      householdId: p.householdId,
      profileId: p.profileId,
      from: iso(prevFrom),
      to: iso(prevTo),
    });
    const prevRecipeIds = Array.from(new Set(prevMeals.map((m) => m.recipeId).filter((x): x is string => !!x)));
    const prevFoods = new Set<string>();
    if (prevRecipeIds.length > 0) {
      const prevIngs = (unwrap(
        await db.from('recipe_ingredient').select('food_id').in('recipe_id', prevRecipeIds).not('food_id', 'is', null),
      ) ?? []) as Array<{ food_id: string }>;
      for (const i of prevIngs) prevFoods.add(i.food_id);
    }
    for (const [fid, date] of weekFoodDays) {
      if (date > p.today) continue; // découverte = déjà goûté (passé)
      if (!prevFoods.has(fid)) {
        discovery = { name: foods.get(fid)?.name ?? '', day: dayLabel(date) };
        break;
      }
    }
  }

  const familyLabel: Record<string, string> = { legume: 'Légumes', fruit: 'Fruits', proteines: 'Protéines', cremerie: 'Laitages' };
  return {
    vegetablesPast: Array.from(vegPast.values()),
    vegetablesUpcoming: Array.from(vegUpcoming.values()),
    discovery,
    families: (['legume', 'fruit', 'proteines', 'cremerie'] as const).map((f) => ({
      label: familyLabel[f],
      share: meals.length > 0 ? familyMeals[f] / meals.length : 0,
    })),
    mealsTotal: meals.length,
  };
}
