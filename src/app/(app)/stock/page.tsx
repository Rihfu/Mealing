import { getAuthContext } from '@/lib/auth';
import {
  addStockAction,
  decrementStockAction,
  deleteStockAction,
  toggleStockPresenceAction,
} from './actions';

interface StockRow {
  id: string;
  label: string | null;
  tracking_mode: string;
  quantity: number | null;
  unit: string | null;
  present: boolean;
  date_ouverture: string | null;
  food: { name: string } | { name: string }[] | null;
}

function foodName(food: StockRow['food']): string | null {
  const f = Array.isArray(food) ? food[0] : food;
  return f?.name ?? null;
}

export default async function StockPage() {
  const { supabase } = await getAuthContext();

  const [{ data: stock }, { data: foods }] = await Promise.all([
    supabase
      .from('stock')
      .select('id, label, tracking_mode, quantity, unit, present, date_ouverture, food:food_id(name)')
      .order('created_at', { ascending: false }),
    supabase.from('food').select('id, name').order('name', { ascending: true }).limit(500),
  ]);

  const rows = (stock ?? []) as StockRow[];

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-bold">Stock</h1>

      <section className="rounded border border-gray-200 p-3 dark:border-gray-800">
        <h2 className="mb-2 text-sm font-semibold">Ajouter un article</h2>
        <form action={addStockAction} className="flex flex-wrap items-end gap-2 text-sm">
          <label className="flex flex-col gap-1">
            Aliment
            <select name="food_id" className="rounded border border-gray-300 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-900">
              <option value="">— libellé libre —</option>
              {(foods ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            ou libellé
            <input name="label" className="rounded border border-gray-300 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-900" />
          </label>
          <label className="flex flex-col gap-1">
            Suivi
            <select name="tracking_mode" className="rounded border border-gray-300 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-900">
              <option value="presence">Présence</option>
              <option value="quantity">Quantité</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Qté
            <input name="quantity" type="number" step="any" className="w-20 rounded border border-gray-300 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-900" />
          </label>
          <label className="flex flex-col gap-1">
            Unité
            <input name="unit" className="w-20 rounded border border-gray-300 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-900" />
          </label>
          <button type="submit" className="rounded bg-black px-3 py-1.5 text-white dark:bg-white dark:text-black">
            Ajouter
          </button>
        </form>
        <p className="mt-2 text-xs text-gray-500">
          « Présence » pour les produits courants à faible enjeu ; « Quantité » pour les denrées
          coûteuses ou peu rachetées. Le stock se décrémente à la consommation réelle.
        </p>
      </section>

      <ul className="flex flex-col divide-y divide-gray-200 text-sm dark:divide-gray-800">
        {rows.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
            <span className="font-medium">{foodName(s.food) ?? s.label}</span>
            {s.tracking_mode === 'quantity' ? (
              <>
                <span className="text-gray-500">
                  {s.quantity ?? 0} {s.unit ?? ''}
                </span>
                <form action={decrementStockAction} className="flex items-center gap-1">
                  <input type="hidden" name="stock_id" value={s.id} />
                  <input name="amount" type="number" step="any" placeholder="−" className="w-16 rounded border border-gray-300 px-1.5 py-1 dark:border-gray-700 dark:bg-gray-900" />
                  <button className="text-gray-500 underline">retirer</button>
                </form>
              </>
            ) : (
              <form action={toggleStockPresenceAction}>
                <input type="hidden" name="stock_id" value={s.id} />
                <input type="hidden" name="present" value={(!s.present).toString()} />
                <button className={s.present ? 'text-green-600 underline' : 'text-gray-400 underline'}>
                  {s.present ? 'présent' : 'absent'}
                </button>
              </form>
            )}
            {s.date_ouverture && (
              <span className="text-xs text-amber-600">ouvert</span>
            )}
            <form action={deleteStockAction} className="ml-auto">
              <input type="hidden" name="stock_id" value={s.id} />
              <button className="text-xs text-red-500">✕</button>
            </form>
          </li>
        ))}
        {rows.length === 0 && <li className="py-2 text-gray-500">Stock vide.</li>}
      </ul>
    </div>
  );
}
