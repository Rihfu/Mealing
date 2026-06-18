import { getAuthContext } from '@/lib/auth';
import { getStockWithExpiry, type StockExpiry } from '@/lib/core';
import { FoodLink } from '@/components/food-link';
import {
  addStockAction,
  decrementStockAction,
  deleteStockAction,
  setConservationAction,
  toggleStockPresenceAction,
} from './actions';

interface StockRow {
  id: string;
  label: string | null;
  tracking_mode: string;
  quantity: number | null;
  unit: string | null;
  present: boolean;
  conservation_rule_id: string | null;
  food_id: string | null;
  food: { name: string } | { name: string }[] | null;
}

function foodName(food: StockRow['food']): string | null {
  const f = Array.isArray(food) ? food[0] : food;
  return f?.name ?? null;
}

function expiryPill(e: StockExpiry | undefined) {
  if (!e || e.daysRemaining == null) return null;
  const d = e.daysRemaining;
  if (d < 0) return <span className="pill bg-red text-white">périmé ({-d} j)</span>;
  if (d <= 3) return <span className="pill bg-orange text-white">{d} j</span>;
  return <span className="pill bg-sage-tint text-green-strong">frais</span>;
}

export default async function StockPage() {
  const { supabase, profile } = await getAuthContext();
  const householdId = profile?.household_id as string;

  const [{ data: stock }, { data: foods }, { data: rules }, expiries] = await Promise.all([
    supabase
      .from('stock')
      .select('id, label, tracking_mode, quantity, unit, present, conservation_rule_id, food_id, food:food_id(name)')
      .order('created_at', { ascending: false }),
    supabase.from('food').select('id, name').order('name', { ascending: true }).limit(500),
    supabase.from('conservation_rule').select('id, food_category').order('food_category'),
    getStockWithExpiry(supabase, householdId),
  ]);

  const rows = (stock ?? []) as StockRow[];
  const expiryById = new Map(expiries.map((e) => [e.id, e]));
  const ruleOptions = rules ?? [];
  const priority = expiries.filter((e) => e.daysRemaining != null && (e.daysRemaining as number) <= 3);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <h1 className="font-display text-2xl font-semibold tracking-tight lg:col-span-2">Stock</h1>

      {priority.length > 0 && (
        <section className="rounded-2xl border border-clay bg-clay-tint p-3.5 lg:col-start-1">
          <h2 className="mb-2 font-display text-base font-semibold">À consommer en priorité</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {priority.map((e, i) => (
              <div key={e.id} className="rounded-xl border border-clay/40 bg-surface/70 px-3 py-2">
                {i > 0 && <div className="hidden h-px bg-clay/40" />}
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <FoodLink foodId={e.foodId} from="/stock" className="text-sm font-medium">{e.name}</FoodLink>
                    {e.category && <div className="text-xs text-ink-soft">{e.category}</div>}
                  </div>
                  {(e.daysRemaining as number) < 0 ? (
                    <span className="pill bg-red text-white">périmé ({-(e.daysRemaining as number)} j)</span>
                  ) : (
                    <span className="pill bg-orange text-white">à consommer · {e.daysRemaining} j</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-line bg-surface p-3.5 shadow-soft lg:sticky lg:top-24 lg:col-start-2 lg:row-start-2">
        <h2 className="mb-3 font-display text-base font-semibold">Ajouter un article</h2>
        <form action={addStockAction} className="flex flex-col gap-2.5 text-sm">
          <select name="food_id" className="field-input">
            <option value="">— aliment lié —</option>
            {(foods ?? []).map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <input name="label" placeholder="…ou un libellé libre" className="field-input" />
          <select name="conservation_rule_id" className="field-input">
            <option value="">Catégorie de conservation</option>
            {ruleOptions.map((r) => (
              <option key={r.id} value={r.id}>{r.food_category}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <select name="tracking_mode" className="field-input flex-1">
              <option value="presence">Suivi : présence</option>
              <option value="quantity">Suivi : quantité</option>
            </select>
            <input name="quantity" type="number" step="any" placeholder="Qté" className="field-input w-20" />
            <input name="unit" placeholder="Unité" className="field-input w-20" />
          </div>
          <button type="submit" className="btn-primary py-2.5">Ajouter au stock</button>
        </form>
      </section>

      <div className="lg:col-start-1">
        <div className="mb-2 text-xs font-extrabold uppercase tracking-wider text-ink-soft">Tout le stock</div>
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-soft">
          {rows.map((s, i) => {
            const e = expiryById.get(s.id);
            const expired = e?.daysRemaining != null && e.daysRemaining < 0;
            return (
              <div key={s.id}>
                {i > 0 && <div className="h-px bg-line" />}
                <div className={`flex flex-wrap items-center gap-2.5 px-3.5 py-3 ${expired ? 'bg-red/5' : ''}`}>
                  <div className="min-w-0 flex-1">
                    <FoodLink foodId={s.food_id} from="/stock" className="block truncate text-sm font-medium">
                      {foodName(s.food) ?? s.label}
                    </FoodLink>
                    <div className="text-xs text-sage-deep">{e?.category ?? (s.tracking_mode === 'presence' ? 'Suivi : présence' : 'Suivi : quantité')}</div>
                  </div>

                  {s.tracking_mode === 'quantity' ? (
                    <form action={decrementStockAction} className="flex items-center gap-1">
                      <span className="text-sm font-bold">{s.quantity ?? 0} {s.unit ?? ''}</span>
                      <input type="hidden" name="stock_id" value={s.id} />
                      <input name="amount" type="number" step="any" placeholder="−" className="field-input w-14 px-1.5 py-1 text-xs" />
                      <button className="text-xs text-ink-soft hover:underline">retirer</button>
                    </form>
                  ) : (
                    <form action={toggleStockPresenceAction}>
                      <input type="hidden" name="stock_id" value={s.id} />
                      <input type="hidden" name="present" value={(!s.present).toString()} />
                      <button className={`pill ${s.present ? 'bg-sage-tint text-green-strong' : 'bg-line text-ink-soft'}`}>
                        {s.present ? 'présent' : 'absent'}
                      </button>
                    </form>
                  )}

                  {expiryPill(e)}

                  <form action={setConservationAction} className="flex items-center gap-1">
                    <input type="hidden" name="stock_id" value={s.id} />
                    <select name="conservation_rule_id" defaultValue={s.conservation_rule_id ?? ''} className="field-input px-1.5 py-1 text-xs">
                      <option value="">conservation…</option>
                      {ruleOptions.map((r) => (
                        <option key={r.id} value={r.id}>{r.food_category}</option>
                      ))}
                    </select>
                    <button className="text-xs text-green-strong hover:underline">ok</button>
                  </form>

                  <form action={deleteStockAction}>
                    <input type="hidden" name="stock_id" value={s.id} />
                    <button aria-label="Supprimer" className="text-ink-soft hover:text-red-strong">✕</button>
                  </form>
                </div>
              </div>
            );
          })}
          {rows.length === 0 && <div className="px-3.5 py-6 text-center text-sm text-ink-soft">Stock vide.</div>}
        </div>
      </div>
    </div>
  );
}
