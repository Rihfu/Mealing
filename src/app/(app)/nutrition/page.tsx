import { getAuthContext } from '@/lib/auth';
import { aggregatePeriodNutrition } from '@/lib/core';
import { addDays, isoDate, mondayOf } from '@/lib/dates';
import { setGoalsAction } from './actions';

const r1 = (n: number) => Math.round(n * 10) / 10;

export default async function NutritionPage() {
  const { supabase, userId, profile } = await getAuthContext();
  const householdId = profile?.household_id as string;
  const profileId = userId as string;

  const today = isoDate(new Date());
  const weekStart = isoDate(mondayOf());
  const weekEnd = isoDate(addDays(mondayOf(), 6));

  const [dayAgg, weekAgg, { data: baseTypes }, { data: goals }] = await Promise.all([
    aggregatePeriodNutrition(supabase, { householdId, profileId, from: today, to: today }),
    aggregatePeriodNutrition(supabase, { householdId, profileId, from: weekStart, to: weekEnd }),
    supabase
      .from('nutrient_type')
      .select('code, name, unit, category')
      .eq('is_base', true),
    supabase
      .from('profile_goal')
      .select('target_max, nutrient_type:nutrient_type_id(code)')
      .eq('profile_id', profileId)
      .eq('period', 'daily'),
  ]);

  // Ordre d'affichage : énergie, macros, micros.
  const order = ['energy', 'macro', 'micro'];
  const types = (baseTypes ?? []).slice().sort(
    (a, b) => order.indexOf(a.category) - order.indexOf(b.category),
  );

  const goalByCode = new Map<string, number>();
  for (const g of goals ?? []) {
    const nt = Array.isArray(g.nutrient_type) ? g.nutrient_type[0] : g.nutrient_type;
    if (nt?.code && g.target_max != null) goalByCode.set(nt.code, g.target_max);
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Nutrition</h1>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Aujourd’hui ({today})</h2>
        <p className="mb-2 text-xs text-ink-soft">
          Estimation sur la base d’une portion par repas planifié. « Réel estimé » tient compte des
          écarts signalés (sauté / différent).
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-soft">
              <th className="py-1">Nutriment</th>
              <th className="py-1 text-right">Planifié</th>
              <th className="py-1 text-right">Réel estimé</th>
              <th className="py-1 text-right">Objectif/j</th>
            </tr>
          </thead>
          <tbody>
            {types.map((t) => {
              const planned = dayAgg.planned[t.code] ?? 0;
              const real = dayAgg.real[t.code] ?? 0;
              const goal = goalByCode.get(t.code);
              const over = goal != null && real > goal;
              return (
                <tr key={t.code} className="border-t border-line dark:border-gray-800">
                  <td className="py-1">
                    {t.name} <span className="text-ink-soft">({t.unit})</span>
                  </td>
                  <td className="py-1 text-right text-ink-soft">{r1(planned)}</td>
                  <td className={`py-1 text-right font-medium ${over ? 'text-red-strong' : ''}`}>
                    {r1(real)}
                  </td>
                  <td className="py-1 text-right text-ink-soft">{goal != null ? goal : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">
          Cette semaine ({weekStart} → {weekEnd})
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-soft">
              <th className="py-1">Nutriment</th>
              <th className="py-1 text-right">Planifié</th>
              <th className="py-1 text-right">Réel estimé</th>
            </tr>
          </thead>
          <tbody>
            {types.map((t) => (
              <tr key={t.code} className="border-t border-line dark:border-gray-800">
                <td className="py-1">
                  {t.name} <span className="text-ink-soft">({t.unit})</span>
                </td>
                <td className="py-1 text-right text-ink-soft">{r1(weekAgg.planned[t.code] ?? 0)}</td>
                <td className="py-1 text-right font-medium">{r1(weekAgg.real[t.code] ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Mes objectifs quotidiens</h2>
        <form action={setGoalsAction} className="flex flex-col gap-2">
          {types.map((t) => (
            <label key={t.code} className="flex items-center justify-between gap-2 text-sm">
              <span>
                {t.name} <span className="text-ink-soft">({t.unit})</span>
              </span>
              <input
                name={`goal_${t.code}`}
                type="number"
                step="any"
                min="0"
                defaultValue={goalByCode.get(t.code) ?? ''}
                className="w-28 rounded border border-line-strong px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
          ))}
          <button
            type="submit"
            className="self-start rounded bg-green-strong px-3 py-1.5 text-sm text-white dark:bg-white dark:text-black"
          >
            Enregistrer mes objectifs
          </button>
        </form>
      </section>
    </div>
  );
}
