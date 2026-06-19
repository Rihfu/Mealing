import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth';
import { generateShoppingListAutoSorted, getShoppingWindow, listHouseholdCategories, listRecurringItems, getLastKnownPrices, loadRayonOrder, essentialKey, type ShoppingLine } from '@/lib/core';
import { categoryLabel } from '@/lib/product-assets';
import { groupByRayon, orderRayonKeys } from './rayons';
import { AddArticle } from './add-article';
import { PurchaseCheckout } from './purchase-checkout';
import { ManageAislesButton } from './category-controls';
import { EssentialsManager } from './essentials-manager';
import { ShoppingList, DoneList, type SGroup, type SLine } from './shopping-list';
import { clearCheckedAction } from './actions';
import { UndoToastHost } from './undo-toast';

/** ShoppingLine (serveur) → SLine (sérialisable pour les listes client). */
function toSLine(l: ShoppingLine): SLine {
  return {
    key: l.key,
    name: l.name,
    qty: l.quantity != null ? `${l.quantity} ${l.unit ?? ''}`.trim() : '',
    quantity: l.quantity ?? null,
    unit: l.unit ?? null,
    sources: l.sources,
    manualId: l.manualId ?? null,
    manualIds: l.manualIds ?? [],
    manualOnly: !!l.manualOnly,
    foodId: l.foodId ?? null,
    category: l.category ?? null,
    iconSlug: l.iconSlug ?? null,
    checked: l.checked,
    alreadyStocked: !!l.alreadyStocked,
    stockedLabel: l.stockedLabel ?? null,
  };
}

export default async function CoursesPage() {
  const { supabase, profile, userId } = await getAuthContext();
  // Garde-fou (la session peut expirer en cours de route) : on évite que la page
  // s'exécute sans foyer, ce qui ferait planter getShoppingWindow.
  if (!userId) redirect('/login');
  if (!profile?.household_id) redirect('/onboarding');
  const householdId = profile.household_id;

  const { from, to } = await getShoppingWindow(supabase, householdId);

  const [lines, customCats, essentials, lastPrices, orderMap, { data: stock }] = await Promise.all([
    generateShoppingListAutoSorted(supabase, { householdId, from, to }),
    listHouseholdCategories(supabase, householdId),
    listRecurringItems(supabase, householdId),
    getLastKnownPrices(supabase, householdId),
    loadRayonOrder(supabase, householdId),
    supabase.from('stock').select('food_id, label, quantity, unit, present').eq('household_id', householdId),
  ]);

  // Ordre des rayons choisi par le foyer (liste + mode magasin) → univers ordonné
  // pour le gestionnaire de rayons (réordonnancement).
  const rayonOrder = orderRayonKeys(customCats, orderMap);

  // Actif (à acheter) groupé par rayon ; coché → « Déjà pris ».
  const active = lines.filter((l) => !l.checked);
  const done = lines.filter((l) => l.checked);

  // Contexte anti-doublon / anti-surplus (G) pour le formulaire d'ajout.
  const onListRefs = active.map((l) => ({
    foodId: l.foodId ?? null,
    name: l.name,
    qty: l.quantity != null ? `${l.quantity} ${l.unit ?? ''}`.trim() : '',
  }));
  const inStockRefs = (stock ?? []).map((s) => ({
    foodId: s.food_id ?? null,
    label: s.label ?? null,
    qty: s.quantity != null ? `${s.quantity} ${s.unit ?? ''}`.trim() : '',
    present: s.present,
  }));

  // Données sérialisables pour les listes interactives (client) : coche/décoche + DnD.
  const activeGroups: SGroup[] = groupByRayon(active, customCats, orderMap).map((g) => ({
    key: g.key,
    label: g.view?.label ?? 'Autres',
    tint: g.view?.tint ?? 'var(--color-line)',
    ink: g.view?.ink ?? 'var(--color-ink-soft)',
    iconSlug: g.view?.isCustom ? (g.view.iconSlug ?? null) : null,
    items: g.items.map(toSLine),
  }));
  const doneLines: SLine[] = done.map(toSLine);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Liste de courses</h1>
            <p className="font-hand mt-0.5 text-lg text-green-strong">
              une seule liste, triée par rayon — coche au pouce, range au retour
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/courses/historique"
              className="btn-secondary flex items-center gap-2 py-2 text-sm"
              title="Tes courses passées, par date"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 3v5h5" />
                <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
                <path d="M12 7v5l4 2" />
              </svg>
              Historique
            </Link>
            {active.length > 0 && (
              <Link
                href="/courses/magasin"
                className="btn-secondary flex items-center gap-2 py-2 text-sm"
                title="Vue plein écran, gros boutons — pour cocher en magasin"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 5h2l2.2 11.2a1.5 1.5 0 0 0 1.5 1.2h7.6a1.5 1.5 0 0 0 1.5-1.2L21 8H7" />
                  <circle cx="10" cy="20" r="1.4" />
                  <circle cx="18" cy="20" r="1.4" />
                </svg>
                Mode magasin
              </Link>
            )}
          </div>
        </div>
        <p className="mt-2 max-w-xl text-sm text-ink-soft">
          Ta liste se met à jour toute seule : on part de tes repas, on retire ce que tu as déjà en stock, et tu
          ajoutes ce que tu veux. Coche au fur et à mesure de tes courses.
        </p>
      </div>

      {/* Sur mobile (flex), l'ordre est : Ajouter un article → À acheter → Mes essentiels
          (saisie en haut = plus intuitif). Sur desktop (grid), placement explicite :
          liste à gauche (pleine hauteur), ajout + essentiels à droite. */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <section className="order-1 rounded-2xl border border-line bg-surface p-4 shadow-soft lg:order-none lg:col-start-2 lg:row-start-1 lg:sticky lg:top-24">
          <h2 className="mb-3 font-display text-lg font-semibold">Ajouter un article</h2>
          <AddArticle onList={onListRefs} inStock={inStockRefs} />
        </section>

        <div className="order-2 flex flex-col gap-4 lg:order-none lg:col-start-1 lg:row-start-1 lg:row-span-2">
          <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-semibold">À acheter</h2>
              {done.length > 0 && <span className="text-sm text-ink-soft">{done.length} déjà pris</span>}
            </div>

            <div className="mb-2">
              <ManageAislesButton customCategories={customCats} rayonOrder={rayonOrder} />
            </div>

            {active.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-soft">
                Rien à acheter pour l’instant. Ta liste se remplit toute seule dès que tu planifies des repas ou
                qu’un essentiel vient à manquer.
              </p>
            ) : (
              <ShoppingList groups={activeGroups} customCategories={customCats} rayonOrder={rayonOrder} />
            )}
          </section>

          {done.length > 0 && (
            <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
              <details open className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between font-display text-lg font-semibold">
                  <span>Déjà pris ({done.length})</span>
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="text-ink-soft transition-transform group-open:rotate-180"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </summary>
                <div className="mt-2">
                  <form action={clearCheckedAction} className="mb-2 flex justify-end">
                    <button className="text-xs font-bold text-green-strong">Tout décocher</button>
                  </form>
                  <DoneList lines={doneLines} customCategories={customCats} />
                </div>
              </details>
              <div className="mt-3 border-t border-line pt-3">
                <PurchaseCheckout
                  fullWidth
                  items={done.map((l) => ({
                    key: l.key,
                    name: l.name,
                    qty: l.quantity != null ? `${l.quantity} ${l.unit ?? ''}`.trim() : '',
                    category: categoryLabel(l.category),
                    suggestedPrice: lastPrices[essentialKey({ foodId: l.foodId ?? null, label: l.name })] ?? null,
                  }))}
                />
              </div>
            </section>
          )}
        </div>

        <section className="order-3 rounded-2xl border border-line bg-surface p-4 shadow-soft lg:order-none lg:col-start-2 lg:row-start-2">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">Mes essentiels</h2>
            <Link href="/courses/historique/stats" className="text-xs font-semibold text-green-strong hover:underline">
              Gérer
            </Link>
          </div>
          <p className="mb-2 text-xs text-ink-soft">Tes basiques — ils reviennent tout seuls dans la liste.</p>
          <EssentialsManager items={essentials.map((e) => ({ id: e.id, label: e.label }))} />
        </section>
      </div>

      <UndoToastHost />
    </div>
  );
}
