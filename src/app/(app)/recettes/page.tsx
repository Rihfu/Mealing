import Link from 'next/link';
import { getAuthContext } from '@/lib/auth';

export default async function RecettesPage() {
  const { supabase } = await getAuthContext();
  const { data: recipes } = await supabase
    .from('recipe')
    .select('id, name, prep_time_min, cook_time_min, servings')
    .order('name', { ascending: true });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Recettes</h1>
          <p className="mt-1 text-sm text-ink-soft">La bibliotheque de recettes du foyer.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/recettes/generer" className="btn-secondary">
            Generer (IA)
          </Link>
          <Link href="/recettes/nouvelle" className="btn-primary">
            + Nouvelle
          </Link>
        </div>
      </div>

      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(recipes ?? []).map((r) => {
          const totalTime = (r.prep_time_min ?? 0) + (r.cook_time_min ?? 0);
          return (
            <li key={r.id}>
              <Link
                href={`/recettes/${r.id}`}
                className="block h-full rounded-2xl border border-line bg-surface p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-card"
              >
                <h2 className="font-display text-lg font-semibold leading-tight text-ink">{r.name}</h2>
                <p className="mt-2 text-sm text-ink-soft">
                  {totalTime} min · {r.servings} portion(s)
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  <span className="pill bg-sage-tint text-sage-deep">fait maison</span>
                  {totalTime <= 20 && <span className="pill bg-butter-tint text-[#7a5e12]">rapide</span>}
                </div>
              </Link>
            </li>
          );
        })}
        {(!recipes || recipes.length === 0) && (
          <li className="rounded-2xl border border-dashed border-line-strong bg-surface p-6 text-center text-sm text-ink-soft md:col-span-2 xl:col-span-3">
            Aucune recette. Creez-en une pour commencer.
          </li>
        )}
      </ul>
    </div>
  );
}
