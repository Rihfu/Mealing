import { notFound, redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth';
import { computeProductStats, getFoodNutrition } from '@/lib/core';
import { categoryDef, categoryLabel, ProductIcon } from '@/lib/product-assets';
import { NutritionSection, TipsSection, ConservationSection } from './sections';
import { FicheTransition, FicheBackButton } from './fiche-transition';

const eur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
const DATE_FMT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' });
const fmtDate = (iso: string) => DATE_FMT.format(new Date(iso));

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
      <div className="font-display text-lg font-semibold">{value}</div>
      <div className="text-xs text-ink-soft">{label}</div>
    </div>
  );
}

/** Courbe d'évolution du prix (SVG). */
function PriceChart({ points }: { points: { date: string; price: number }[] }) {
  const W = 600, H = 150, padX = 8, padY = 14;
  const prices = points.map((p) => p.price);
  const min = Math.min(...prices), max = Math.max(...prices);
  const span = max - min || 1;
  const innerW = W - padX * 2, innerH = H - padY * 2;
  const xy = points.map((p, i) => {
    const x = padX + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const y = padY + innerH - ((p.price - min) / span) * innerH;
    return { x, y };
  });
  const line = xy.map((p) => `${p.x},${p.y}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={line} fill="none" stroke="var(--color-green-strong)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {xy.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="var(--color-green-strong)" />
      ))}
    </svg>
  );
}

const PROV = {
  repas: { label: 'Repas', color: 'var(--color-sage-deep)' },
  essentiel: { label: 'Essentiels', color: '#c79a3a' },
  manual: { label: 'Ajoutés', color: '#c2774f' },
};

export default async function ProduitPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { supabase, profile, userId } = await getAuthContext();
  if (!userId) redirect('/login');
  if (!profile?.household_id) redirect('/onboarding');
  const householdId = profile.household_id;
  const { id } = await params;

  const product = await computeProductStats(supabase, householdId, id);
  if (!product) notFound();

  const nutrition = await getFoodNutrition(supabase, id);
  const def = categoryDef(product.category);
  const prov = product.provenance;

  // Retour vers la page d'origine (où on a cliqué). On n'accepte qu'un chemin interne
  // (sécurité : pas d'open-redirect via «//host»). Le repère ?viewed=<foodId>
  // (surbrillance au retour) n'est utilisé que par la liste de courses. Repli sur les
  // Statistiques si l'origine est inconnue.
  const sp = await searchParams;
  const rawFrom = typeof sp.from === 'string' ? sp.from : '';
  const from = /^\/(?!\/)/.test(rawFrom) ? rawFrom : null;
  // Libellé du bouton retour selon l'origine (du plus spécifique au plus général).
  const BACK_LABELS: ReadonlyArray<readonly [string, string]> = [
    ['/courses/historique/stats', 'Statistiques'],
    ['/courses/historique', 'Historique'],
    ['/courses/magasin', 'En magasin'],
    ['/courses', 'Liste de courses'],
    ['/stock', 'Stock'],
    ['/recettes', 'Recette'],
    ['/planning', 'Planning'],
    ['/nutrition', 'Nutrition'],
  ];
  const backLabel = from ? (BACK_LABELS.find(([p]) => from.startsWith(p))?.[1] ?? 'Retour') : 'Statistiques';
  const backHref = from ? (from === '/courses' ? `${from}?viewed=${id}` : from) : '/courses/historique/stats';

  return (
    <FicheTransition backHref={backHref}>
      <div>
        <FicheBackButton label={backLabel} />
        <div className="mt-2 flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ background: def?.tint ?? 'var(--color-sage-tint)', color: def?.ink ?? 'var(--color-sage-deep)' }}>
            <ProductIcon slug={product.iconSlug} size={28} />
          </span>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">{product.name}</h1>
            {categoryLabel(product.category) && <p className="text-sm text-ink-soft">{categoryLabel(product.category)}</p>}
          </div>
        </div>
      </div>

      {/* Évolution du prix */}
      <Card title="Évolution du prix" hint="d'après tes courses">
        {product.priceHistory.length >= 2 ? (
          <>
            <PriceChart points={product.priceHistory} />
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric value={product.lastPrice != null ? eur(product.lastPrice) : '—'} label="dernier" />
              <Metric value={product.avgPrice != null ? eur(product.avgPrice) : '—'} label="moyen" />
              <Metric value={product.minPrice != null ? eur(product.minPrice) : '—'} label="le moins cher" />
              <Metric value={product.maxPrice != null ? eur(product.maxPrice) : '—'} label="le plus cher" />
            </div>
            <p className="mt-2 text-xs text-ink-soft">
              De {fmtDate(product.priceHistory[0].date)} à {fmtDate(product.priceHistory[product.priceHistory.length - 1].date)}.
            </p>
          </>
        ) : product.priceHistory.length === 1 ? (
          <p className="text-sm text-ink-soft">Un seul prix relevé ({eur(product.priceHistory[0].price)}). Saisis le prix à tes prochains achats pour voir l’évolution.</p>
        ) : (
          <p className="text-sm text-ink-soft">Aucun prix encore. Renseigne le prix au moment de « J’ai fait mes courses » pour suivre l’évolution.</p>
        )}
      </Card>

      {/* Habitudes */}
      <Card title="Tes habitudes" hint="sur ce produit">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric value={`${product.count}×`} label="acheté" />
          <Metric value={product.medianIntervalDays != null ? `~${Math.round(product.medianIntervalDays)} j` : '—'} label="entre 2 achats" />
          <Metric value={product.daysSinceLast != null ? (product.daysSinceLast === 0 ? "aujourd'hui" : `il y a ${product.daysSinceLast} j`) : '—'} label="dernier achat" />
          <Metric value={product.avgQuantity != null ? `${product.avgQuantity} ${product.unit ?? ''}`.trim() : '—'} label="quantité type" />
        </div>
        {prov.total > 0 && (
          <div className="mt-4">
            <div className="flex h-3 overflow-hidden rounded-full">
              {(['repas', 'essentiel', 'manual'] as const).map((k) =>
                prov[k] > 0 ? <span key={k} style={{ width: `${(prov[k] / prov.total) * 100}%`, background: PROV[k].color }} /> : null,
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
              {(['repas', 'essentiel', 'manual'] as const).map((k) =>
                prov[k] > 0 ? (
                  <span key={k} className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: PROV[k].color }} />
                    {PROV[k].label} · {Math.round((prov[k] / prov.total) * 100)}%
                  </span>
                ) : null,
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Nutrition (fournisseur, à la demande) */}
      <Card title="Nutrition" hint="source USDA / Open Food Facts">
        <NutritionSection foodId={id} initial={nutrition} />
      </Card>

      {/* Conservation par lieu de stockage (estimation IA, usages FR, indicatif) */}
      <Card title="Conservation" hint="par lieu de stockage">
        <ConservationSection foodId={id} />
      </Card>

      {/* Conseils IA (à la demande) */}
      <Card title="Conseils" hint="indicatifs">
        <TipsSection foodId={id} />
      </Card>
    </FicheTransition>
  );
}
