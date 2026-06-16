import Link from 'next/link';
import { getAuthContext } from '@/lib/auth';
import { addDays, DAY_LABELS, isoDate, mondayOf, SLOTS } from '@/lib/dates';
import { addMealAction, deleteMealAction, markDayOffAction, recordDeviationAction } from './actions';

interface Meal {
  id: string;
  meal_date: string;
  slot: string;
  recipe_id: string | null;
  free_text: string | null;
}

export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const { supabase } = await getAuthContext();

  const weekStart = mondayOf(week);
  const weekEnd = addDays(weekStart, 6);
  const fromIso = isoDate(weekStart);
  const toIso = isoDate(weekEnd);

  const [{ data: meals }, { data: offDays }, { data: recipes }] = await Promise.all([
    supabase
      .from('planned_meal')
      .select('id, meal_date, slot, recipe_id, free_text')
      .gte('meal_date', fromIso)
      .lte('meal_date', toIso),
    supabase.from('day_off_plan').select('off_date').gte('off_date', fromIso).lte('off_date', toIso),
    supabase.from('recipe').select('id, name').order('name', { ascending: true }),
  ]);

  const mealList = (meals ?? []) as Meal[];
  const recipeName = new Map((recipes ?? []).map((r) => [r.id, r.name]));
  const offSet = new Set((offDays ?? []).map((o) => o.off_date));

  // Statuts d'écart enregistrés par l'utilisateur courant pour ces repas.
  const { data: consumptions } = await supabase
    .from('real_consumption')
    .select('planned_meal_id, status')
    .in('planned_meal_id', mealList.map((m) => m.id).length ? mealList.map((m) => m.id) : ['']);
  const statusByMeal = new Map(
    (consumptions ?? [])
      .filter((c) => c.planned_meal_id)
      .map((c) => [c.planned_meal_id as string, c.status]),
  );

  const prevWeek = isoDate(addDays(weekStart, -7));
  const nextWeek = isoDate(addDays(weekStart, 7));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Planning</h1>
        <div className="flex items-center gap-3 text-sm">
          <Link href={`/planning?week=${prevWeek}`} className="underline">
            ← Semaine préc.
          </Link>
          <Link href={`/planning?week=${nextWeek}`} className="underline">
            Semaine suiv. →
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {DAY_LABELS.map((label, i) => {
          const date = isoDate(addDays(weekStart, i));
          const isOff = offSet.has(date);
          const dayMeals = mealList.filter((m) => m.meal_date === date);

          return (
            <section key={date} className="rounded border border-line p-3 dark:border-gray-800">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold">
                  {label} <span className="text-ink-soft">{date}</span>
                  {isOff && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                      journée hors-plan
                    </span>
                  )}
                </h2>
                {!isOff && (
                  <form action={markDayOffAction}>
                    <input type="hidden" name="date" value={date} />
                    <button type="submit" className="text-xs text-ink-soft underline">
                      Marquer hors-plan
                    </button>
                  </form>
                )}
              </div>

              <ul className="mb-2 flex flex-col gap-1">
                {dayMeals.map((m) => {
                  const status = statusByMeal.get(m.id);
                  return (
                    <li key={m.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="rounded bg-sage-tint px-1.5 py-0.5 text-xs dark:bg-gray-800">
                        {SLOTS.find((s) => s.key === m.slot)?.label ?? m.slot}
                      </span>
                      <span>{m.recipe_id ? recipeName.get(m.recipe_id) : m.free_text}</span>
                      {status === 'skipped' && <span className="text-xs text-red-strong">sauté</span>}
                      {status === 'different' && (
                        <span className="text-xs text-amber-600">différent</span>
                      )}
                      {!status && (
                        <span className="flex gap-1 text-xs">
                          <form action={recordDeviationAction}>
                            <input type="hidden" name="meal_id" value={m.id} />
                            <input type="hidden" name="status" value="skipped" />
                            <button className="text-ink-soft underline">sauté</button>
                          </form>
                          <form action={recordDeviationAction}>
                            <input type="hidden" name="meal_id" value={m.id} />
                            <input type="hidden" name="status" value="different" />
                            <button className="text-ink-soft underline">différent</button>
                          </form>
                        </span>
                      )}
                      <form action={deleteMealAction} className="ml-auto">
                        <input type="hidden" name="meal_id" value={m.id} />
                        <button className="text-xs text-red-strong">✕</button>
                      </form>
                    </li>
                  );
                })}
                {dayMeals.length === 0 && (
                  <li className="text-xs text-ink-soft">Aucun repas planifié.</li>
                )}
              </ul>

              <details className="text-sm">
                <summary className="cursor-pointer text-green-strong">+ Ajouter un repas</summary>
                <form action={addMealAction} className="mt-2 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="date" value={date} />
                  <select
                    name="slot"
                    className="rounded border border-line-strong px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
                  >
                    {SLOTS.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <select
                    name="recipe_id"
                    className="rounded border border-line-strong px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
                  >
                    <option value="">— recette —</option>
                    {(recipes ?? []).map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  <input
                    name="free_text"
                    placeholder="ou repas libre"
                    className="rounded border border-line-strong px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
                  />
                  <button
                    type="submit"
                    className="rounded bg-green-strong px-3 py-1.5 text-sm text-white dark:bg-white dark:text-black"
                  >
                    Ajouter
                  </button>
                </form>
              </details>
            </section>
          );
        })}
      </div>
    </div>
  );
}
