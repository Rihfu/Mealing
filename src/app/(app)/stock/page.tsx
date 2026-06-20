import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth';
import { getStockWithExpiry, listStorageLocations, loadLocationOrder } from '@/lib/core';
import { FoodLink } from '@/components/food-link';
import { groupByLocation, orderedLocationKeys, locationView } from './locations';
import { StockList, type SItem } from './stock-list';
import { AddStock } from './add-stock';
import { EstimateButton } from './stock-tools';
import { ManageLocations } from './locations-manager';
import { MealReconcile } from './meal-reconcile';
import { UndoToastHost } from '../courses/undo-toast';

interface StockRow {
  id: string;
  label: string | null;
  tracking_mode: string;
  quantity: number | null;
  unit: string | null;
  present: boolean;
  storage_location: string | null;
  date_ouverture: string | null;
  printed_expiry: string | null;
  food_id: string | null;
  food: { name: string; external_id: string | null } | { name: string; external_id: string | null }[] | null;
}

function foodOf(f: StockRow['food']) {
  return Array.isArray(f) ? (f[0] ?? null) : f;
}

export default async function StockPage() {
  const { supabase, profile, userId } = await getAuthContext();
  if (!userId) redirect('/login');
  if (!profile?.household_id) redirect('/onboarding');
  const householdId = profile.household_id as string;

  const [{ data: stock }, expiries, customLocations, orderMap] = await Promise.all([
    supabase
      .from('stock')
      .select(
        'id, label, tracking_mode, quantity, unit, present, storage_location, date_ouverture, printed_expiry, food_id, food:food_id(name, external_id)',
      )
      .eq('household_id', householdId)
      .order('created_at', { ascending: false }),
    getStockWithExpiry(supabase, householdId),
    listStorageLocations(supabase, householdId),
    loadLocationOrder(supabase, householdId),
  ]);

  const expById = new Map(expiries.map((e) => [e.id, e]));
  const items: SItem[] = ((stock ?? []) as StockRow[]).map((r) => {
    const f = foodOf(r.food);
    const e = expById.get(r.id);
    return {
      id: r.id,
      name: f?.name ?? r.label ?? '(article)',
      foodId: r.food_id,
      iconSlug: f?.external_id ?? null,
      trackingMode: r.tracking_mode === 'quantity' ? 'quantity' : 'presence',
      quantity: r.quantity,
      unit: r.unit,
      present: r.present,
      storageLocation: r.storage_location,
      opened: r.date_ouverture != null,
      printedExpiry: r.printed_expiry,
      daysRemaining: e?.daysRemaining ?? null,
      expirySource: e?.expirySource ?? null,
    };
  });

  const groups = groupByLocation(items, customLocations, orderMap);
  const priority = expiries.filter((e) => e.daysRemaining != null && (e.daysRemaining as number) <= 3);

  // Lieux dans l'ordre du foyer (pour les pickers + le gestionnaire).
  const customById = new Map(customLocations.map((c) => [c.id, c.label]));
  const customKeys = new Set(customLocations.map((c) => c.id));
  const orderedKeys = orderedLocationKeys(customLocations, orderMap);
  const locationOptions = orderedKeys.map((k) => ({ key: k, label: locationView(k, customById).label }));
  const orderedLocations = orderedKeys.map((k) => ({ key: k, label: locationView(k, customById).label, isCustom: customKeys.has(k) }));

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <div className="flex flex-wrap items-start justify-between gap-3 lg:col-span-2">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Stock</h1>
          <p className="font-hand mt-0.5 text-lg text-green-strong">rangé par lieu — la péremption s’estime toute seule</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ManageLocations ordered={orderedLocations} />
          <EstimateButton />
        </div>
      </div>

      <MealReconcile />

      {priority.length > 0 && (
        <section className="rounded-2xl border border-clay bg-clay-tint p-3.5 lg:col-start-1">
          <h2 className="mb-2 font-display text-base font-semibold">À consommer en priorité</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {priority.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-clay/40 bg-surface/70 px-3 py-2">
                <FoodLink foodId={e.foodId} from="/stock" className="text-sm font-medium">
                  {e.name}
                </FoodLink>
                {(e.daysRemaining as number) < 0 ? (
                  <span className="pill bg-red text-white">périmé ({-(e.daysRemaining as number)} j)</span>
                ) : (
                  <span className="pill bg-orange text-white">à consommer · {e.daysRemaining} j</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-line bg-surface p-3.5 shadow-soft lg:sticky lg:top-24 lg:col-start-2 lg:row-start-2">
        <h2 className="mb-3 font-display text-base font-semibold">Ajouter un article</h2>
        <AddStock locationOptions={locationOptions} />
      </section>

      <div className="lg:col-start-1">
        <StockList groups={groups} locationOptions={locationOptions} />
      </div>

      <UndoToastHost />
    </div>
  );
}
