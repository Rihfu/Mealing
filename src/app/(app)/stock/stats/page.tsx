import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth';
import { computeStockStats, type StockStatRow, type StockMove } from '@/lib/core';
import { ProductIcon } from '@/lib/product-assets';
import { FoodLink } from '@/components/food-link';

/** Carte de section (même style que les stats Courses). */
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

function Metric({ value, label, tone }: { value: string; label: string; tone?: 'warn' | 'danger' }) {
  const color = tone === 'danger' ? '#c2774f' : tone === 'warn' ? 'var(--color-orange)' : undefined;
  return (
    <div className="rounded-xl bg-paper px-3 py-2.5 text-center">
      <div className="font-display text-xl font-semibold" style={color ? { color } : undefined}>{value}</div>
      <div className="text-xs text-ink-soft">{label}</div>
    </div>
  );
}

function Bar({ label, value, max, tint }: { label: string; value: number; max: number; tint: string }) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="w-28 shrink-0 truncate text-sm">{label}</span>
      <span className="h-3 flex-1 overflow-hidden rounded-full bg-line">
        <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: tint }} />
      </span>
      <span className="w-10 shrink-0 text-right text-xs font-semibold text-ink-soft">{value}</span>
    </div>
  );
}

const KIND: Record<string, { label: string; color: string }> = {
  in: { label: 'acheté', color: 'var(--color-sage-deep)' },
  out: { label: 'consommé', color: 'var(--color-green-strong)' },
  discard: { label: 'jeté', color: '#c2774f' },
  adjust: { label: 'ajusté', color: 'var(--color-ink-soft)' },
};

/** Ligne aliment (icône + nom cliquable + valeur à droite). */
function FoodRow({ row, suffix }: { row: StockStatRow; suffix: string }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sage-tint text-sage-deep">
        <ProductIcon slug={row.iconSlug} size={18} />
      </span>
      <FoodLink foodId={row.foodId} from="/stock/stats" className="flex-1 truncate text-sm font-medium">{row.label}</FoodLink>
      <span className="w-20 text-right text-xs font-semibold text-ink-soft">{suffix}</span>
    </div>
  );
}

function relTime(iso: string): string {
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return "aujourd'hui";
  if (d === 1) return 'hier';
  return `il y a ${d} j`;
}

export default async function StockStatsPage() {
  const { supabase, profile, userId } = await getAuthContext();
  if (!userId) redirect('/login');
  if (!profile?.household_id) redirect('/onboarding');

  const stats = await computeStockStats(supabase, profile.household_id);

  const header = (
    <div>
      <Link href="/stock" className="flex w-fit items-center gap-1.5 text-sm font-bold text-sage-deep hover:underline">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        Stock
      </Link>
      <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight">Statistiques du stock</h1>
      <p className="font-hand mt-0.5 text-lg text-green-strong">gaspillage, consommation, ce qui bouge</p>
    </div>
  );

  if (stats.inStock === 0 && stats.totalMoves === 0) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <section className="rounded-2xl border border-line bg-surface p-8 text-center shadow-soft">
          <p className="text-sm text-ink-soft">
            Tes statistiques se rempliront à l’usage — dès que tu ajoutes des articles, fais tes courses, consommes ou
            jettes des aliments, tout est historisé ici.
          </p>
          <Link href="/stock" className="btn-secondary mt-3 inline-block py-2 text-sm">Aller au stock</Link>
        </section>
      </div>
    );
  }

  const maxLoc = Math.max(...stats.byLocation.map((l) => l.count), 1);
  const wastePct = stats.wasteRate != null ? Math.round(stats.wasteRate * 100) : null;

  return (
    <div className="flex flex-col gap-5">
      {header}

      <Card title="Vue d’ensemble">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric value={String(stats.inStock)} label="articles en stock" />
          <Metric value={String(stats.dueSoon)} label="à consommer bientôt" tone={stats.dueSoon > 0 ? 'warn' : undefined} />
          <Metric value={String(stats.expired)} label="périmés" tone={stats.expired > 0 ? 'danger' : undefined} />
          <Metric value={String(stats.totalMoves)} label="mouvements" />
        </div>
      </Card>

      {stats.byLocation.length > 0 && (
        <Card title="Répartition par lieu" hint="articles actuellement rangés">
          {stats.byLocation.map((l) => (
            <Bar key={l.key || 'unsorted'} label={l.label} value={l.count} max={maxLoc} tint="var(--color-sage-deep)" />
          ))}
        </Card>
      )}

      <Card title="Gaspillage" hint="aliments jetés / périmés">
        <div className="grid grid-cols-2 gap-2">
          <Metric value={String(stats.wasteCount)} label="aliments jetés" tone={stats.wasteCount > 0 ? 'danger' : undefined} />
          <Metric value={wastePct != null ? `${wastePct} %` : '—'} label="taux de gaspillage" tone={wastePct != null && wastePct >= 20 ? 'danger' : undefined} />
        </div>
        {stats.topDiscarded.length > 0 ? (
          <div className="mt-3">
            <p className="mb-1 text-xs text-ink-soft">Les plus jetés</p>
            {stats.topDiscarded.map((r) => (
              <FoodRow key={r.foodId ?? r.label} row={r} suffix={`${r.count}× jeté`} />
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-soft">Aucun aliment jeté pour l’instant — bravo, zéro gaspillage. 🌱</p>
        )}
      </Card>

      {stats.topConsumed.length > 0 && (
        <Card title="Ce que tu consommes le plus" hint="aliments sortis du stock">
          {stats.topConsumed.map((r) => (
            <FoodRow key={r.foodId ?? r.label} row={r} suffix={`${r.count}× consommé`} />
          ))}
        </Card>
      )}

      {stats.topStocked.length > 0 && (
        <Card title="Ce que tu stockes le plus" hint="entrées (courses, ajouts)">
          {stats.topStocked.map((r) => (
            <FoodRow key={r.foodId ?? r.label} row={r} suffix={`${r.count}× ajouté`} />
          ))}
        </Card>
      )}

      {stats.recent.length > 0 && (
        <Card title="Activité récente">
          <ul className="divide-y divide-line">
            {stats.recent.map((m: StockMove, i: number) => {
              const k = KIND[m.kind] ?? KIND.adjust;
              return (
                <li key={i} className="flex items-center gap-3 py-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sage-tint text-sage-deep">
                    <ProductIcon slug={m.iconSlug} size={16} />
                  </span>
                  <FoodLink foodId={m.foodId} from="/stock/stats" className="flex-1 truncate text-sm">{m.label}</FoodLink>
                  <span className="rounded-full px-2 py-0.5 text-xs font-semibold text-white" style={{ background: k.color }}>{k.label}</span>
                  {m.quantity != null && <span className="text-xs text-ink-soft">{m.quantity} {m.unit ?? ''}</span>}
                  <span className="w-20 shrink-0 text-right text-xs text-ink-soft">{relTime(m.occurredAt)}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
