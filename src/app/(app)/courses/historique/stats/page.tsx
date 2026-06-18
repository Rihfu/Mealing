import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth';
import { computeShoppingStats, purgeOldShoppingTrips, listHouseholdCategories } from '@/lib/core';
import { categoryDef, categoryLabel, ProductIcon } from '@/lib/product-assets';
import { HistoriqueTabs } from '../tabs';
import { DueSoon, type DueItem } from './due-soon';

const eur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
const PROV = {
  repas: { label: 'Repas', color: 'var(--color-sage-deep)' },
  essentiel: { label: 'Essentiels', color: '#c79a3a' },
  manual: { label: 'Ajoutés', color: '#c2774f' },
};

/** Carte de section. */
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

/** Grosse valeur + libellé. */
function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl bg-paper px-3 py-2.5 text-center">
      <div className="font-display text-xl font-semibold">{value}</div>
      <div className="text-xs text-ink-soft">{label}</div>
    </div>
  );
}

/** Barre horizontale (rayon, produit, semaine…). */
function Bar({ label, value, max, tint, suffix }: { label: string; value: number; max: number; tint: string; suffix?: string }) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="w-28 shrink-0 truncate text-sm">{label}</span>
      <span className="h-3 flex-1 overflow-hidden rounded-full bg-line">
        <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: tint }} />
      </span>
      <span className="w-16 shrink-0 text-right text-xs font-semibold text-ink-soft">{suffix ?? value}</span>
    </div>
  );
}

/** Mini courbe (nb d'articles par relevé). */
function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const w = 240, h = 36, max = Math.max(...data), min = Math.min(...data);
  const span = max - min || 1;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / span) * (h - 6) - 3}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-full" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke="var(--color-green-strong)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default async function StatsPage() {
  const { supabase, profile, userId } = await getAuthContext();
  if (!userId) redirect('/login');
  if (!profile?.household_id) redirect('/onboarding');
  const householdId = profile.household_id;

  await purgeOldShoppingTrips(supabase, householdId);
  const [stats, customCats] = await Promise.all([
    computeShoppingStats(supabase, householdId),
    listHouseholdCategories(supabase, householdId),
  ]);

  const catMap = new Map(customCats.map((c) => [c.id, c]));
  const rayonLabel = (k: string) => (k === '__other__' ? 'Autres' : categoryLabel(k) ?? catMap.get(k)?.label ?? 'Autres');
  const rayonTint = (k: string) => categoryDef(k)?.tint ?? catMap.get(k)?.tint ?? 'var(--color-sage-tint)';

  const daysSinceLast = stats.daysSinceLast;

  const header = (
    <div>
      <Link href="/courses" className="flex w-fit items-center gap-1.5 text-sm font-bold text-sage-deep hover:underline">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        Liste de courses
      </Link>
      <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight">Historique des courses</h1>
      <p className="font-hand mt-0.5 text-lg text-green-strong">tes habitudes d’achat, en un coup d’œil</p>
      <div className="mt-3"><HistoriqueTabs active="stats" /></div>
    </div>
  );

  // Trop peu de données pour des stats parlantes.
  if (stats.totalTrips < 2) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <section className="rounded-2xl border border-line bg-surface p-8 text-center shadow-soft">
          <p className="text-sm text-ink-soft">
            Encore un peu de patience — tes statistiques s’affineront après quelques « J’ai fait mes courses ».
            {stats.totalTrips === 1 && ' Tu as déjà 1 relevé enregistré.'}
          </p>
          <Link href="/courses/historique" className="btn-secondary mt-3 inline-block py-2 text-sm">Voir l’historique</Link>
        </section>
      </div>
    );
  }

  const maxRayon = Math.max(...stats.rayons.map((r) => r.count), 1);
  const maxWeek = Math.max(...stats.weeks.map((w) => w.trips), 1);
  const maxSpendRayon = Math.max(...stats.spendByRayon.map((r) => r.spend ?? 0), 1);
  const dueItems: DueItem[] = stats.dueSoon.map((p) => ({
    key: p.key, label: p.label, foodId: p.foodId, unit: p.unit,
    avgQuantity: p.avgQuantity, medianIntervalDays: p.medianIntervalDays, dueInDays: p.dueInDays, iconSlug: p.iconSlug,
  }));

  return (
    <div className="flex flex-col gap-5">
      {header}

      {/* Cadence + panier */}
      <Card title="Ta cadence">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric value={stats.tripsPerWeek != null ? stats.tripsPerWeek.toFixed(1) : '—'} label="courses / semaine" />
          <Metric value={stats.avgDaysBetween != null ? `${Math.round(stats.avgDaysBetween)} j` : '—'} label="entre deux courses" />
          <Metric value={stats.avgItemsPerTrip != null ? String(stats.avgItemsPerTrip) : '—'} label="articles / course" />
          <Metric value={daysSinceLast != null ? (daysSinceLast === 0 ? "aujourd'hui" : `il y a ${daysSinceLast} j`) : '—'} label="dernière course" />
        </div>
        {stats.basketSeries.length >= 2 && (
          <div className="mt-4">
            <p className="mb-1 text-xs text-ink-soft">Taille de panier au fil des courses</p>
            <Sparkline data={stats.basketSeries} />
          </div>
        )}
      </Card>

      {/* À racheter bientôt (actionnable) */}
      {dueItems.length > 0 && (
        <Card title="À racheter bientôt" hint="ajoute en un clic">
          <DueSoon items={dueItems} />
        </Card>
      )}

      {/* Dépenses (si prix saisis) */}
      {stats.hasPrices && (
        <Card title="Dépenses" hint="sur les articles avec prix">
          <div className="grid grid-cols-2 gap-2">
            <Metric value={stats.totalSpend != null ? eur(stats.totalSpend) : '—'} label="total dépensé" />
            <Metric value={stats.avgBasketSpend != null ? eur(stats.avgBasketSpend) : '—'} label="panier moyen" />
          </div>
          {stats.spendByRayon.length > 0 && (
            <div className="mt-4">
              <p className="mb-1 text-xs text-ink-soft">Dépense par rayon</p>
              {stats.spendByRayon.map((r) => (
                <Bar key={r.key} label={rayonLabel(r.key)} value={r.spend ?? 0} max={maxSpendRayon} tint={rayonTint(r.key)} suffix={eur(r.spend ?? 0)} />
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Top produits */}
      <Card title="Tes incontournables" hint="les plus rachetés">
        {stats.topProducts.map((p) => (
          <div key={p.key} className="flex items-center gap-3 py-1.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sage-tint text-sage-deep">
              <ProductIcon slug={p.iconSlug} size={18} />
            </span>
            <span className="flex-1 truncate text-sm">{p.label}</span>
            {p.avgQuantity != null && <span className="text-xs text-ink-soft">~{p.avgQuantity} {p.unit ?? ''}</span>}
            <span className="w-20 text-right text-xs font-semibold text-ink-soft">{p.count}× acheté</span>
          </div>
        ))}
      </Card>

      {/* Répartition par rayon */}
      <Card title="Où va ton panier" hint="part des articles par rayon">
        {stats.rayons.map((r) => (
          <Bar key={r.key} label={rayonLabel(r.key)} value={r.count} max={maxRayon} tint={rayonTint(r.key)} suffix={`${r.count}`} />
        ))}
      </Card>

      {/* Provenance */}
      <Card title="D’où viennent tes courses">
        <div className="flex h-4 overflow-hidden rounded-full">
          {(['repas', 'essentiel', 'manual'] as const).map((k) =>
            stats.provenance[k] > 0 ? (
              <span key={k} style={{ width: `${(stats.provenance[k] / stats.provenance.total) * 100}%`, background: PROV[k].color }} />
            ) : null,
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
          {(['repas', 'essentiel', 'manual'] as const).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: PROV[k].color }} />
              {PROV[k].label} · {Math.round((stats.provenance[k] / stats.provenance.total) * 100)}%
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-soft">
          Plus tu planifies de repas, plus ta liste se remplit toute seule depuis « repas ».
        </p>
      </Card>

      {/* Évolution */}
      {stats.weeks.length >= 2 && (
        <Card title="Tes courses dans le temps" hint="par semaine">
          {stats.weeks.map((w) => (
            <Bar key={w.start} label={w.label} value={w.trips} max={maxWeek} tint="var(--color-sage-deep)" suffix={`${w.trips}`} />
          ))}
        </Card>
      )}

      {/* One-shots */}
      {stats.oneShots.length > 0 && (
        <Card title="Achetés une seule fois" hint="essais ou achats ponctuels">
          <div className="flex flex-wrap gap-2">
            {stats.oneShots.map((p) => (
              <span key={p.key} className="rounded-full border border-line px-3 py-1 text-xs">{p.label}</span>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
