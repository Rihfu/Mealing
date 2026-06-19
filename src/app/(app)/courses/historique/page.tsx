import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth';
import { listShoppingTrips, purgeOldShoppingTrips, listHouseholdCategories } from '@/lib/core';
import { TripCard, type HTrip, type HCustomCat } from './trip-card';
import { HistoriqueTabs } from './tabs';

const DATE_FMT = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export default async function HistoriquePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; trip?: string }>;
}) {
  const { supabase, profile, userId } = await getAuthContext();
  if (!userId) redirect('/login');
  if (!profile?.household_id) redirect('/onboarding');
  const householdId = profile.household_id;

  // Purge auto des relevés non favoris de +1 mois (à l'ouverture de l'historique).
  await purgeOldShoppingTrips(supabase, householdId);

  const sp = await searchParams;
  const openTripId = typeof sp.trip === 'string' ? sp.trip : null; // relevé à ré-ouvrir au retour de fiche
  const requestedPage = Math.max(0, (Number(sp.page) || 1) - 1); // URL 1-indexée → interne 0-indexée
  const [{ trips, page, pageCount, total }, customCats] = await Promise.all([
    listShoppingTrips(supabase, householdId, requestedPage),
    listHouseholdCategories(supabase, householdId),
  ]);
  const customCatsView: HCustomCat[] = customCats.map((c) => ({ id: c.id, label: c.label, tint: c.tint }));

  // Date formatée côté serveur (évite tout écart d'hydratation client).
  const cards: HTrip[] = trips.map((t) => ({
    id: t.id,
    dateLabel: DATE_FMT.format(new Date(t.purchasedAt)),
    isFavorite: t.isFavorite,
    name: t.name,
    items: t.items.map((i) => ({
      id: i.id,
      label: i.label,
      quantity: i.quantity,
      unit: i.unit,
      price: i.price,
      categoryKey: i.categoryKey,
      foodId: i.foodId,
      iconSlug: i.iconSlug,
      source: i.source,
    })),
  }));

  const current = page + 1; // pour l'affichage 1-indexé

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/courses" className="flex w-fit items-center gap-1.5 text-sm font-bold text-sage-deep hover:underline">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Liste de courses
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight">Historique des courses</h1>
        <p className="font-hand mt-0.5 text-lg text-green-strong">tes courses passées, par date</p>
        <p className="mt-2 max-w-xl text-sm text-ink-soft">
          Chaque « J’ai fait mes courses » est archivé ici. Déplie un relevé pour revoir ce que tu avais pris, épingle
          ⭐ ceux à garder, ou reconduis une liste pour la remettre dans tes courses.
        </p>
        <div className="mt-3"><HistoriqueTabs active="list" /></div>
      </div>

      {total === 0 ? (
        <section className="rounded-2xl border border-line bg-surface p-8 text-center shadow-soft">
          <p className="text-sm text-ink-soft">
            Pas encore d’historique. Il se remplira après ton premier « J’ai fait mes courses ».
          </p>
          <Link href="/courses" className="btn-secondary mt-3 inline-block py-2 text-sm">
            Aller à ma liste
          </Link>
        </section>
      ) : (
        <div className="flex flex-col gap-3">
          {cards.map((t) => (
            <TripCard key={t.id} trip={t} customCats={customCatsView} defaultOpen={t.id === openTripId} />
          ))}

          {pageCount > 1 && (
            <div className="mt-1 flex items-center justify-center gap-4">
              {page > 0 ? (
                <Link href={`/courses/historique?page=${current - 1}`} className="btn-secondary py-2 text-sm">
                  ← Précédent
                </Link>
              ) : (
                <span className="cursor-not-allowed rounded-full border border-line px-4 py-2 text-sm text-ink-soft opacity-50">
                  ← Précédent
                </span>
              )}
              <span className="text-sm text-ink-soft">
                Page {current} / {pageCount}
              </span>
              {page < pageCount - 1 ? (
                <Link href={`/courses/historique?page=${current + 1}`} className="btn-secondary py-2 text-sm">
                  Suivant →
                </Link>
              ) : (
                <span className="cursor-not-allowed rounded-full border border-line px-4 py-2 text-sm text-ink-soft opacity-50">
                  Suivant →
                </span>
              )}
            </div>
          )}

          <p className="mt-1 text-center text-xs text-ink-soft">
            Les courses de plus d’un mois sont effacées automatiquement — épingle ⭐ celles à garder.
          </p>
        </div>
      )}
    </div>
  );
}
