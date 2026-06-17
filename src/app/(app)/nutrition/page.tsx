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
    supabase.from('nutrient_type').select('code, name, unit, category').eq('is_base', true),
    supabase
      .from('profile_goal')
      .select('target_max, nutrient_type:nutrient_type_id(code)')
      .eq('profile_id', profileId)
      .eq('period', 'daily'),
  ]);

  const order = ['energy', 'macro', 'micro'];
  const types = (baseTypes ?? []).slice().sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));

  const goalByCode = new Map<string, number>();
  for (const g of goals ?? []) {
    const nt = Array.isArray(g.nutrient_type) ? g.nutrient_type[0] : g.nutrient_type;
    if (nt?.code && g.target_max != null) goalByCode.set(nt.code, g.target_max);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Nutrition</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Planifié, réel estimé et objectifs personnels. Ton suivi reste privé par défaut.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-1">
          <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
            <div className="mb-3">
              <h2 className="font-display text-lg font-semibold">Aujourd’hui</h2>
              <p className="text-xs text-ink-soft">{today} · tient compte des écarts signalés.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-xs font-extrabold uppercase tracking-wide text-ink-soft">
                    <th className="py-2">Nutriment</th>
                    <th className="py-2 text-right">Planifié</th>
                    <th className="py-2 text-right">Réel estimé</th>
                    <th className="py-2 text-right">Objectif/j</th>
                  </tr>
                </thead>
                <tbody>
                  {types.map((t) => {
                    const planned = dayAgg.planned[t.code] ?? 0;
                    const real = dayAgg.real[t.code] ?? 0;
                    const goal = goalByCode.get(t.code);
                    const over = goal != null && real > goal;
                    return (
                      <tr key={t.code} className="border-t border-line">
                        <td className="py-2">
                          {t.name} <span className="text-ink-soft">({t.unit})</span>
                        </td>
                        <td className="py-2 text-right text-ink-soft">{r1(planned)}</td>
                        <td className={`py-2 text-right font-bold ${over ? 'text-red-strong' : ''}`}>{r1(real)}</td>
                        <td className="py-2 text-right text-ink-soft">{goal != null ? goal : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
            <div className="mb-3">
              <h2 className="font-display text-lg font-semibold">Cette semaine</h2>
              <p className="text-xs text-ink-soft">
                {weekStart} → {weekEnd}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[460px] text-sm">
                <thead>
                  <tr className="text-left text-xs font-extrabold uppercase tracking-wide text-ink-soft">
                    <th className="py-2">Nutriment</th>
                    <th className="py-2 text-right">Planifié</th>
                    <th className="py-2 text-right">Réel estimé</th>
                  </tr>
                </thead>
                <tbody>
                  {types.map((t) => (
                    <tr key={t.code} className="border-t border-line">
                      <td className="py-2">
                        {t.name} <span className="text-ink-soft">({t.unit})</span>
                      </td>
                      <td className="py-2 text-right text-ink-soft">{r1(weekAgg.planned[t.code] ?? 0)}</td>
                      <td className="py-2 text-right font-bold">{r1(weekAgg.real[t.code] ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft xl:sticky xl:top-24">
          <h2 className="mb-3 font-display text-lg font-semibold">Objectifs quotidiens</h2>
          <form action={setGoalsAction} className="flex flex-col gap-2">
            {types.map((t) => (
              <label key={t.code} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  {t.name} <span className="text-ink-soft">({t.unit})</span>
                </span>
                <input
                  name={`goal_${t.code}`}
                  type="number"
                  step="any"
                  min="0"
                  defaultValue={goalByCode.get(t.code) ?? ''}
                  className="field-input w-24 py-1.5 text-right"
                />
              </label>
            ))}
            <button type="submit" className="btn-primary mt-3 py-2.5">
              Enregistrer
            </button>
          </form>
          <p className="mt-4 text-xs leading-relaxed text-ink-soft">
            Les objectifs et consommations ne sont visibles par les autres membres que si tu les partages.
          </p>
        </section>
      </div>
    </div>
  );
}
