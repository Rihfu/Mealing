import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth';
import { addDays, isoDate, mondayOf } from '@/lib/dates';
import { loadRecipeImagePaths, signRecipeImageUrls } from '@/lib/core';
import { PlanningBoard, type MealView, type RecipeOption, type ProfileOption } from './planning-board';

/** Créneaux BDD → clés du design. */
const SLOT_DB_TO_DESIGN: Record<string, string> = {
  breakfast: 'petitDej',
  lunch: 'dejeuner',
  dinner: 'diner',
  snack: 'collation',
};

export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; planRecipe?: string; planD?: string; planSlot?: string }>;
}) {
  const { week, planRecipe, planD, planSlot } = await searchParams;
  const { supabase, profile } = await getAuthContext();
  if (!profile?.household_id) redirect('/onboarding');
  const householdId = profile.household_id as string;

  const weekStart = mondayOf(week);
  const weekEnd = addDays(weekStart, 6);
  const fromIso = isoDate(weekStart);
  const toIso = isoDate(weekEnd);

  const [{ data: meals }, { data: offDays }, { data: recipes }, { data: profiles }, imagePaths] = await Promise.all([
    supabase
      .from('planned_meal')
      .select('id, meal_date, slot, recipe_id, free_text, servings, produces_leftover, leftover_source_meal_id, is_individual, individual_profile_id')
      .gte('meal_date', fromIso)
      .lte('meal_date', toIso),
    supabase.from('day_off_plan').select('off_date').eq('scope', 'household').gte('off_date', fromIso).lte('off_date', toIso),
    supabase.from('recipe').select('id, name, servings, prep_time_min, cook_time_min').order('name', { ascending: true }),
    supabase.from('profile').select('id, display_name').eq('household_id', householdId),
    loadRecipeImagePaths(supabase, householdId),
  ]);

  const mealRows = meals ?? [];
  const recipeRows = recipes ?? [];
  const recipeName = new Map(recipeRows.map((r) => [r.id, r.name]));
  const recipeServings = new Map(recipeRows.map((r) => [r.id, Number(r.servings) || 1]));
  const profileName = new Map((profiles ?? []).map((p) => [p.id, p.display_name || 'Profil']));

  // Photos de recettes (URLs signées) pour le sélecteur + les cartes.
  const signed = await signRecipeImageUrls(supabase, [...imagePaths.values()]);
  const recipeImage = new Map<string, string>();
  for (const [rid, path] of imagePaths) {
    const url = signed.get(path);
    if (url) recipeImage.set(rid, url);
  }

  // Tags par recette (filtre du sélecteur).
  const tagsByRecipe = new Map<string, string[]>();
  if (recipeRows.length > 0) {
    const { data: tagRows } = await supabase.from('recipe_tag').select('recipe_id, tag').in('recipe_id', recipeRows.map((r) => r.id));
    for (const t of tagRows ?? []) {
      const list = tagsByRecipe.get(t.recipe_id) ?? [];
      list.push(t.tag);
      tagsByRecipe.set(t.recipe_id, list);
    }
  }

  // Écarts de consommation.
  const mealIds = mealRows.map((m) => m.id);
  const { data: consumptions } = await supabase
    .from('real_consumption')
    .select('planned_meal_id, status, actual_free_text')
    .in('planned_meal_id', mealIds.length ? mealIds : ['']);
  const consByMeal = new Map(
    (consumptions ?? []).filter((c) => c.planned_meal_id).map((c) => [c.planned_meal_id as string, c]),
  );

  // Nom du repas-source d'un reste (peut être hors semaine) + nb de restes replanifiés.
  const sourceIds = [...new Set(mealRows.map((m) => m.leftover_source_meal_id).filter((x): x is string => !!x))];
  const sourceName = new Map<string, string>();
  if (sourceIds.length > 0) {
    const { data: sources } = await supabase.from('planned_meal').select('id, recipe_id, free_text').in('id', sourceIds);
    for (const s of sources ?? []) sourceName.set(s.id, s.recipe_id ? recipeName.get(s.recipe_id) ?? 'Recette' : s.free_text ?? 'Repas');
  }
  const replannedCount = new Map<string, number>();
  if (mealIds.length > 0) {
    const { data: rep } = await supabase.from('planned_meal').select('leftover_source_meal_id').in('leftover_source_meal_id', mealIds);
    for (const r of rep ?? []) {
      const sid = r.leftover_source_meal_id as string | null;
      if (sid) replannedCount.set(sid, (replannedCount.get(sid) ?? 0) + 1);
    }
  }

  // Index jour (0=lundi … 6=dimanche) à partir de la date.
  const dayIndexOf = (dateIso: string) => {
    const diff = Math.round((new Date(`${dateIso}T00:00:00`).getTime() - weekStart.getTime()) / 86_400_000);
    return diff;
  };

  const mealViews: MealView[] = mealRows
    .map((m) => {
      const cons = consByMeal.get(m.id);
      const di = dayIndexOf(m.meal_date);
      const status = cons?.status === 'skipped' ? 'skipped' : cons?.status === 'different' ? 'different' : null;
      const isLeftover = !!m.leftover_source_meal_id;
      const srcName = isLeftover ? sourceName.get(m.leftover_source_meal_id as string) ?? null : null;
      // Nom : recette > plat improvisé (free_text) > « Reste : <source> » > « Repas libre ».
      const name = m.recipe_id
        ? recipeName.get(m.recipe_id) ?? 'Recette'
        : m.free_text
          ? m.free_text
          : isLeftover
            ? `Reste : ${srcName ?? 'repas'}`
            : 'Repas libre';
      return {
        id: m.id,
        dayIndex: di,
        slot: SLOT_DB_TO_DESIGN[m.slot] ?? 'dejeuner',
        recipeId: m.recipe_id,
        name,
        serves: m.servings != null ? Number(m.servings) : m.recipe_id ? recipeServings.get(m.recipe_id) ?? 1 : 1,
        imageUrl: m.recipe_id ? recipeImage.get(m.recipe_id) ?? null : null,
        leftover: !!m.produces_leftover,
        fromLeftover: isLeftover,
        leftoverSourceName: srcName,
        replannedCount: replannedCount.get(m.id) ?? 0,
        individual: m.individual_profile_id ? profileName.get(m.individual_profile_id) ?? null : null,
        status: status as MealView['status'],
        diff: cons?.actual_free_text ?? null,
      };
    })
    .filter((m) => m.dayIndex >= 0 && m.dayIndex <= 6);

  const recipeOptions: RecipeOption[] = recipeRows.map((r) => ({
    id: r.id,
    name: r.name,
    time: (r.prep_time_min ?? 0) + (r.cook_time_min ?? 0),
    tags: (tagsByRecipe.get(r.id) ?? []).sort((a, b) => a.localeCompare(b)),
    serves: Number(r.servings) || 1,
    imageUrl: recipeImage.get(r.id) ?? null,
  }));

  const profileOptions: ProfileOption[] = (profiles ?? []).map((p) => ({ id: p.id, name: p.display_name || 'Profil' }));

  const MONTHS = ['janv.', 'févr.', 'mars', 'avril', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const dayDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const dates = dayDates.map((d) => d.getDate());
  const dateLabels = dayDates.map((d) => `${d.getDate()} ${MONTHS[d.getMonth()]}`);
  const weekLabel = `${weekStart.getDate()} – ${weekEnd.getDate()} ${MONTHS[weekEnd.getMonth()]}`;
  const todayIso = isoDate(new Date());
  const todayIndex = dayIndexOf(todayIso);

  return (
    <PlanningBoard
      weekStart={fromIso}
      weekLabel={weekLabel}
      dates={dates}
      dateLabels={dateLabels}
      todayIndex={todayIndex >= 0 && todayIndex <= 6 ? todayIndex : -1}
      prevWeek={isoDate(addDays(weekStart, -7))}
      nextWeek={isoDate(addDays(weekStart, 7))}
      thisWeek={todayIso}
      meals={mealViews}
      offDates={(offDays ?? []).map((o) => dayIndexOf(o.off_date)).filter((i) => i >= 0 && i <= 6)}
      recipes={recipeOptions}
      profiles={profileOptions}
      pending={
        planRecipe && planD != null && planSlot
          ? { recipeId: planRecipe, d: Number(planD), slot: planSlot }
          : null
      }
    />
  );
}
