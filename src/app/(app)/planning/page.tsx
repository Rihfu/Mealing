import Link from 'next/link';
import { getAuthContext } from '@/lib/auth';
import { addDays, isoDate, mondayOf, SLOTS } from '@/lib/dates';
import { addMealAction, deleteMealAction, markDayOffAction, recordDeviationAction } from './actions';

interface Meal {
  id: string;
  meal_date: string;
  slot: string;
  recipe_id: string | null;
  free_text: string | null;
}

const DAYS_ABBR = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
const MONTHS = [
  'janv.', 'févr.', 'mars', 'avril', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
];
const SLOT_DOT: Record<string, string> = {
  breakfast: 'bg-butter',
  lunch: 'bg-sage',
  dinner: 'bg-clay',
  snack: 'bg-sage-deep',
};

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

  const { data: consumptions } = await supabase
    .from('real_consumption')
    .select('planned_meal_id, status')
    .in('planned_meal_id', mealList.map((m) => m.id).length ? mealList.map((m) => m.id) : ['']);
  const statusByMeal = new Map(
    (consumptions ?? []).filter((c) => c.planned_meal_id).map((c) => [c.planned_meal_id as string, c.status]),
  );

  const prevWeek = isoDate(addDays(weekStart, -7));
  const nextWeek = isoDate(addDays(weekStart, 7));
  const weekLabel = `${weekStart.getDate()} – ${weekEnd.getDate()} ${MONTHS[weekEnd.getMonth()]}`;
  const slotLabel = (s: string) => SLOTS.find((x) => x.key === s)?.label ?? s;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Planning</h1>
        <div className="flex items-center gap-1 rounded-full border border-line bg-surface px-1.5 py-1 text-sm">
          <Link href={`/planning?week=${prevWeek}`} aria-label="Semaine précédente" className="flex h-6 w-6 items-center justify-center rounded-full text-ink hover:bg-sage-tint">‹</Link>
          <span className="whitespace-nowrap px-1 text-xs font-bold">{weekLabel}</span>
          <Link href={`/planning?week=${nextWeek}`} aria-label="Semaine suivante" className="flex h-6 w-6 items-center justify-center rounded-full text-ink hover:bg-sage-tint">›</Link>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {DAYS_ABBR.map((abbr, i) => {
          const d = addDays(weekStart, i);
          const date = isoDate(d);
          const dateLabel = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
          const isOff = offSet.has(date);
          const dayMeals = mealList.filter((m) => m.meal_date === date);

          if (isOff) {
            return (
              <section key={date} className="rounded-2xl border border-butter bg-butter-tint p-3.5">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-base font-semibold">
                    {abbr} <span className="text-ink-soft">{dateLabel}</span>
                  </h2>
                  <span className="pill bg-butter text-[#7a5e12]">journée hors-plan</span>
                </div>
                <p className="mt-1.5 text-xs text-ink-soft">Aucun suivi ce jour-là — on profite.</p>
              </section>
            );
          }

          return (
            <section key={date} className="rounded-2xl border border-line bg-surface p-3.5 shadow-soft">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-display text-base font-semibold">
                  {abbr} <span className="text-ink-soft">{dateLabel}</span>
                </h2>
                <form action={markDayOffAction}>
                  <input type="hidden" name="date" value={date} />
                  <button type="submit" className="text-xs text-ink-soft hover:underline">
                    hors-plan
                  </button>
                </form>
              </div>

              {dayMeals.map((m, idx) => {
                const status = statusByMeal.get(m.id);
                return (
                  <div key={m.id}>
                    {idx > 0 && <div className="h-px bg-line" />}
                    <div className="flex items-center gap-2.5 py-1.5">
                      <span className={`h-2.5 w-2.5 flex-none rounded-full ${SLOT_DOT[m.slot] ?? 'bg-sage'}`} />
                      <span className="w-16 flex-none text-xs text-ink-soft">{slotLabel(m.slot)}</span>
                      <span className={`flex-1 text-sm font-medium ${status === 'skipped' ? 'text-ink-soft line-through' : ''}`}>
                        {m.recipe_id ? recipeName.get(m.recipe_id) : m.free_text}
                      </span>
                      {status === 'skipped' && <span className="pill bg-red text-white">sauté</span>}
                      {status === 'different' && <span className="pill bg-orange text-white">différent</span>}
                      {!status && (
                        <span className="flex gap-1.5 text-xs">
                          <form action={recordDeviationAction}>
                            <input type="hidden" name="meal_id" value={m.id} />
                            <input type="hidden" name="status" value="skipped" />
                            <button className="text-ink-soft hover:underline">sauté</button>
                          </form>
                          <form action={recordDeviationAction}>
                            <input type="hidden" name="meal_id" value={m.id} />
                            <input type="hidden" name="status" value="different" />
                            <button className="text-ink-soft hover:underline">différent</button>
                          </form>
                        </span>
                      )}
                      <form action={deleteMealAction}>
                        <input type="hidden" name="meal_id" value={m.id} />
                        <button aria-label="Supprimer" className="text-xs text-ink-soft hover:text-red-strong">✕</button>
                      </form>
                    </div>
                  </div>
                );
              })}

              <details className="mt-1 text-sm [&[open]>summary]:hidden">
                <summary className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong py-2 text-xs font-bold text-sage-deep">
                  + Ajouter un repas
                </summary>
                <form action={addMealAction} className="mt-2 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="date" value={date} />
                  <select name="slot" className="field-input py-1.5 text-sm">
                    {SLOTS.map((s) => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                  <select name="recipe_id" className="field-input py-1.5 text-sm">
                    <option value="">— recette —</option>
                    {(recipes ?? []).map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                  <input name="free_text" placeholder="ou repas libre" className="field-input flex-1 py-1.5 text-sm" />
                  <button type="submit" className="btn-primary px-3 py-1.5">Ajouter</button>
                </form>
              </details>
            </section>
          );
        })}
      </div>
    </div>
  );
}
