import { getAuthContext } from '@/lib/auth';
import { generateShoppingList, type ShoppingLine } from '@/lib/core';
import { addDays, isoDate } from '@/lib/dates';
import {
  addManualAction,
  addRecurringAction,
  deleteManualAction,
  deleteRecurringAction,
  toggleCheckAction,
  toggleManualCheckAction,
} from './actions';

const SOURCE_LABEL: Record<string, string> = {
  recipe: 'Repas à venir',
  recurring: 'Récurrents',
  manual: 'Ajouts manuels',
};

function LineRow({ line }: { line: ShoppingLine }) {
  const qty = line.quantity != null ? `${line.quantity} ${line.unit ?? ''}`.trim() : '';
  if (line.source === 'manual') {
    return (
      <li className="flex items-center gap-2 py-1">
        <form action={toggleManualCheckAction}>
          <input type="hidden" name="id" value={line.manualId} />
          <input type="hidden" name="checked" value={(!line.checked).toString()} />
          <button className="text-sm">{line.checked ? '☑' : '☐'}</button>
        </form>
        <span className={`text-sm ${line.checked ? 'text-ink-soft line-through' : ''}`}>
          {line.name} {qty && <span className="text-ink-soft">· {qty}</span>}
        </span>
        <form action={deleteManualAction} className="ml-auto">
          <input type="hidden" name="id" value={line.manualId} />
          <button className="text-xs text-red-strong">✕</button>
        </form>
      </li>
    );
  }
  return (
    <li className="flex items-center gap-2 py-1">
      <form action={toggleCheckAction}>
        <input type="hidden" name="item_key" value={line.key} />
        <input type="hidden" name="checked" value={(!line.checked).toString()} />
        <button className="text-sm">{line.checked ? '☑' : '☐'}</button>
      </form>
      <span className={`text-sm ${line.checked ? 'text-ink-soft line-through' : ''}`}>
        {line.name} {qty && <span className="text-ink-soft">· {qty}</span>}
      </span>
    </li>
  );
}

export default async function CoursesPage() {
  const { supabase, profile } = await getAuthContext();
  const householdId = profile?.household_id as string;

  const from = isoDate(new Date());
  const to = isoDate(addDays(new Date(), 13)); // 2 semaines à venir

  const [lines, { data: recurring }, { data: foods }] = await Promise.all([
    generateShoppingList(supabase, { householdId, from, to }),
    supabase
      .from('shopping_recurring_item')
      .select('id, label, food:food_id(name)')
      .eq('household_id', householdId),
    supabase.from('food').select('id, name').order('name', { ascending: true }).limit(500),
  ]);

  const grouped: Record<string, ShoppingLine[]> = { recipe: [], recurring: [], manual: [] };
  for (const l of lines) grouped[l.source].push(l);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold">Liste de courses</h1>
        <p className="text-sm text-ink-soft">
          Calculée pour les 2 prochaines semaines : besoins des repas planifiés moins le stock, plus
          vos récurrents et ajouts manuels.
        </p>
      </div>

      {(['recipe', 'recurring', 'manual'] as const).map((src) => (
        <section key={src}>
          <h2 className="mb-1 text-sm font-semibold text-gray-600">{SOURCE_LABEL[src]}</h2>
          <ul className="flex flex-col divide-y divide-line dark:divide-gray-800">
            {grouped[src].map((l) => (
              <LineRow key={l.key + l.source} line={l} />
            ))}
            {grouped[src].length === 0 && <li className="py-1 text-xs text-ink-soft">Rien.</li>}
          </ul>
        </section>
      ))}

      <section className="rounded border border-line p-3 dark:border-gray-800">
        <h2 className="mb-2 text-sm font-semibold">Ajouter un article manuel</h2>
        <form action={addManualAction} className="flex flex-wrap items-end gap-2 text-sm">
          <input name="label" placeholder="Article" required className="flex-1 rounded border border-line-strong px-2 py-1.5 dark:border-gray-700 dark:bg-gray-900" />
          <input name="quantity" type="number" step="any" placeholder="qté" className="w-20 rounded border border-line-strong px-2 py-1.5 dark:border-gray-700 dark:bg-gray-900" />
          <input name="unit" placeholder="unité" className="w-20 rounded border border-line-strong px-2 py-1.5 dark:border-gray-700 dark:bg-gray-900" />
          <button className="rounded bg-green-strong px-3 py-1.5 text-white dark:bg-white dark:text-black">Ajouter</button>
        </form>
      </section>

      <section className="rounded border border-line p-3 dark:border-gray-800">
        <h2 className="mb-2 text-sm font-semibold">Produits récurrents (café, lait…)</h2>
        <ul className="mb-2 flex flex-col divide-y divide-line text-sm dark:divide-gray-800">
          {(recurring ?? []).map((r) => {
            const f = Array.isArray(r.food) ? r.food[0] : r.food;
            return (
              <li key={r.id} className="flex items-center justify-between py-1">
                <span>{f?.name ?? r.label}</span>
                <form action={deleteRecurringAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="text-xs text-red-strong">✕</button>
                </form>
              </li>
            );
          })}
          {(!recurring || recurring.length === 0) && (
            <li className="py-1 text-xs text-ink-soft">Aucun produit récurrent.</li>
          )}
        </ul>
        <form action={addRecurringAction} className="flex flex-wrap items-end gap-2 text-sm">
          <select name="food_id" className="rounded border border-line-strong px-2 py-1.5 dark:border-gray-700 dark:bg-gray-900">
            <option value="">— libellé libre —</option>
            {(foods ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <input name="label" placeholder="ou libellé" className="rounded border border-line-strong px-2 py-1.5 dark:border-gray-700 dark:bg-gray-900" />
          <button className="rounded bg-green-strong px-3 py-1.5 text-white dark:bg-white dark:text-black">Ajouter</button>
        </form>
      </section>
    </div>
  );
}
