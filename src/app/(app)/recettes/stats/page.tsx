import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth';
import { computeRecipeStats, type RecipeStatRow } from '@/lib/core';

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        {hint && <span className="text-xs text-ink-soft">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl bg-paper px-3 py-2.5 text-center">
      <div className="font-display text-xl font-semibold">{value}</div>
      <div className="text-xs text-ink-soft">{label}</div>
    </div>
  );
}

/** Ligne de classement : nom (cliquable vers la fiche) + barre + valeur. */
function RankRow({ row, max, suffix, tint }: { row: RecipeStatRow; max: number; suffix: string; tint: string }) {
  const pct = max > 0 ? Math.max(4, Math.round((row.value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <Link href={`/recettes/${row.recipeId}`} className="w-40 shrink-0 truncate text-sm font-medium hover:text-sage-deep">
        {row.name}
      </Link>
      <span className="h-3 flex-1 overflow-hidden rounded-full bg-line">
        <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: tint }} />
      </span>
      <span className="w-24 shrink-0 text-right text-xs font-semibold text-ink-soft">{suffix}</span>
    </div>
  );
}

export default async function RecettesStatsPage() {
  const { supabase, profile, userId } = await getAuthContext();
  if (!userId) redirect('/login');
  if (!profile?.household_id) redirect('/onboarding');

  const stats = await computeRecipeStats(supabase, profile.household_id);

  const header = (
    <div>
      <Link href="/recettes" className="flex w-fit items-center gap-1.5 text-sm font-bold text-sage-deep hover:underline">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        Recettes
      </Link>
      <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight">Statistiques des recettes</h1>
      <p className="font-hand mt-0.5 text-lg text-green-strong">tes recettes fétiches, les plus rapides, ce que tu peux cuisiner</p>
    </div>
  );

  if (stats.totalRecipes === 0) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <section className="rounded-2xl border border-line bg-surface p-8 text-center shadow-soft">
          <p className="text-sm text-ink-soft">
            Crée des recettes et planifie des repas — tes statistiques (recettes les plus reconduites, les plus rapides…)
            se rempliront à l’usage.
          </p>
          <Link href="/recettes" className="btn-secondary mt-3 inline-block py-2 text-sm">Aller aux recettes</Link>
        </section>
      </div>
    );
  }

  const maxPlanned = Math.max(...stats.mostPlanned.map((r) => r.value), 1);
  const maxFast = Math.max(...stats.fastest.map((r) => r.value), 1);
  const maxTag = Math.max(...stats.tagDistribution.map((t) => t.count), 1);

  return (
    <div className="flex flex-col gap-5">
      {header}

      <Card title="Vue d’ensemble">
        <div className="grid grid-cols-3 gap-2">
          <Metric value={String(stats.totalRecipes)} label="recettes" />
          <Metric value={String(stats.totalPlanned)} label="repas planifiés" />
          <Metric value={String(stats.withTags)} label="recettes taguées" />
        </div>
      </Card>

      <Card title="Les plus reconduites" hint="d’après le planning">
        {stats.mostPlanned.length > 0 ? (
          stats.mostPlanned.map((r) => (
            <RankRow key={r.recipeId} row={r} max={maxPlanned} suffix={`${r.value}× planifiée${r.value > 1 ? 's' : ''}`} tint="var(--color-sage-deep)" />
          ))
        ) : (
          <p className="text-sm text-ink-soft">Aucune recette planifiée pour l’instant — ça se remplira via le planning.</p>
        )}
      </Card>

      <Card title="Réalisable avec ton stock" hint="% d’ingrédients couverts">
        {stats.realizable.length > 0 ? (
          stats.realizable.map((r) => (
            <RankRow key={r.recipeId} row={r} max={100} suffix={`${r.value} %`} tint="var(--color-green-strong)" />
          ))
        ) : (
          <p className="text-sm text-ink-soft">Lie les ingrédients au catalogue et garnis ton stock pour voir ce que tu peux cuisiner.</p>
        )}
      </Card>

      <Card title="Les plus rapides" hint="prépa + cuisson">
        {stats.fastest.length > 0 ? (
          stats.fastest.map((r) => (
            <RankRow key={r.recipeId} row={r} max={maxFast} suffix={`${r.value} min`} tint="var(--color-orange)" />
          ))
        ) : (
          <p className="text-sm text-ink-soft">Renseigne les temps de prépa/cuisson de tes recettes.</p>
        )}
      </Card>

      {stats.tagDistribution.length > 0 && (
        <Card title="Répartition par tag">
          {stats.tagDistribution.map((t) => (
            <div key={t.tag} className="flex items-center gap-3 py-1">
              <span className="w-40 shrink-0 truncate text-sm">{t.tag}</span>
              <span className="h-3 flex-1 overflow-hidden rounded-full bg-line">
                <span className="block h-full rounded-full" style={{ width: `${Math.max(4, Math.round((t.count / maxTag) * 100))}%`, background: 'var(--color-sage-deep)' }} />
              </span>
              <span className="w-10 shrink-0 text-right text-xs font-semibold text-ink-soft">{t.count}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
