import { getAuthContext } from '@/lib/auth';
import { aggregatePeriodNutrition, getNutritionProfile, getNutritionSettings, personaById } from '@/lib/core';
import { addDays, isoDate, mondayOf } from '@/lib/dates';
import { CoverageCard } from './coverage-card';
import { ProfilePanel } from './setup-wizard';

const r1 = (n: number) => Math.round(n * 10) / 10;

export default async function NutritionPage() {
  const { supabase, userId, profile } = await getAuthContext();
  const householdId = profile?.household_id as string;
  const profileId = userId as string;

  const today = isoDate(new Date());
  const weekStart = isoDate(mondayOf());
  const weekEnd = isoDate(addDays(mondayOf(), 6));

  const [dayAgg, weekAgg, { data: baseTypes }, nutritionProfile, settings] = await Promise.all([
    aggregatePeriodNutrition(supabase, { householdId, profileId, from: today, to: today }),
    aggregatePeriodNutrition(supabase, { householdId, profileId, from: weekStart, to: weekEnd }),
    supabase.from('nutrient_type').select('code, name, unit, category').eq('is_base', true),
    getNutritionProfile(supabase, profileId),
    getNutritionSettings(supabase, profileId),
  ]);

  const persona = personaById(nutritionProfile?.persona);
  const childMode = persona?.child === true;

  const order = ['energy', 'macro', 'micro'];
  const allTypes = (baseTypes ?? []).slice().sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
  // Nutriments AFFICHÉS : les suivis quand ils existent (profile_nutrient_tracking,
  // enfin branchée), sinon tous les nutriments de base. Mode enfant : JAMAIS l'énergie.
  const trackedSet = new Set(settings.tracked);
  const types = allTypes
    .filter((t) => (trackedSet.size > 0 ? trackedSet.has(t.code) : true))
    .filter((t) => !(childMode && t.code === 'energy_kcal'));

  const goalByCode = new Map(settings.goals.map((g) => [g.code, g]));
  const zoneLabel = (code: string) => {
    const g = goalByCode.get(code);
    if (!g) return '—';
    if (g.min != null && g.max != null) return `${g.min}–${g.max}`;
    if (g.min != null) return `≥ ${g.min}`;
    if (g.max != null) return `≤ ${g.max}`;
    return '—';
  };
  const overMax = (code: string, value: number) => {
    const g = goalByCode.get(code);
    return g?.max != null && value > g.max;
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Nutrition</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {childMode
            ? 'Variété et équilibre au fil du planning — sans comptage de calories.'
            : 'Planifié, réel estimé et objectifs personnels. Ton suivi reste privé par défaut.'}
        </p>
      </div>

      <CoverageCard coverage={weekAgg.coverage} />

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
                    const over = overMax(t.code, real);
                    return (
                      <tr key={t.code} className="border-t border-line">
                        <td className="py-2">
                          {t.name} <span className="text-ink-soft">({t.unit})</span>
                        </td>
                        <td className="py-2 text-right text-ink-soft">{r1(planned)}</td>
                        <td className={`py-2 text-right font-bold ${over ? 'text-red-strong' : ''}`}>{r1(real)}</td>
                        <td className="py-2 text-right text-ink-soft">{zoneLabel(t.code)}</td>
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

        <ProfilePanel
          profile={nutritionProfile}
          goals={settings.goals}
          tracked={settings.tracked}
          types={allTypes.filter((t) => !(childMode && t.code === 'energy_kcal'))}
        />
      </div>
    </div>
  );
}
