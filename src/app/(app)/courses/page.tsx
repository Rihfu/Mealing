import { getAuthContext } from '@/lib/auth';
import { generateShoppingList, type ShoppingLine } from '@/lib/core';
import { addDays, isoDate } from '@/lib/dates';
import {
  addManualAction,
  addRecurringAction,
  clearCheckedAction,
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

function CheckMark({ checked }: { checked: boolean }) {
  return (
    <span
      className={`flex h-5 w-5 items-center justify-center rounded-md border text-xs font-bold ${
        checked ? 'border-green-strong bg-green-strong text-white' : 'border-line-strong bg-surface text-transparent'
      }`}
    >
      ✓
    </span>
  );
}

function LineRow({ line }: { line: ShoppingLine }) {
  const qty = line.quantity != null ? `${line.quantity} ${line.unit ?? ''}`.trim() : '';
  const content = (
    <span className={`text-sm ${line.checked ? 'text-ink-soft line-through' : ''}`}>
      {line.name} {qty && <span className="text-ink-soft">· {qty}</span>}
    </span>
  );

  if (line.source === 'manual') {
    return (
      <li className="flex items-center gap-3 py-2">
        <form action={toggleManualCheckAction}>
          <input type="hidden" name="id" value={line.manualId} />
          <input type="hidden" name="checked" value={(!line.checked).toString()} />
          <button aria-label="Cocher" className="block">
            <CheckMark checked={line.checked} />
          </button>
        </form>
        {content}
        <form action={deleteManualAction} className="ml-auto">
          <input type="hidden" name="id" value={line.manualId} />
          <button className="text-xs font-bold text-red-strong">supprimer</button>
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 py-2">
      <form action={toggleCheckAction}>
        <input type="hidden" name="item_key" value={line.key} />
        <input type="hidden" name="checked" value={(!line.checked).toString()} />
        <button aria-label="Cocher" className="block">
          <CheckMark checked={line.checked} />
        </button>
      </form>
      {content}
    </li>
  );
}

export default async function CoursesPage() {
  const { supabase, profile } = await getAuthContext();
  const householdId = profile?.household_id as string;

  const from = isoDate(new Date());
  const to = isoDate(addDays(new Date(), 13));

  const [lines, { data: recurring }, { data: foods }] = await Promise.all([
    generateShoppingList(supabase, { householdId, from, to }),
    supabase
      .from('shopping_recurring_item')
      .select('id, label, food:food_id(name)')
      .eq('household_id', householdId),
    supabase.from('food').select('id, name').order('name', { ascending: true }).limit(500),
  ]);

  // Lignes actives (à acheter) par source ; lignes cochées regroupées en « déjà pris ».
  const active: Record<string, ShoppingLine[]> = { recipe: [], recurring: [], manual: [] };
  const done: ShoppingLine[] = [];
  for (const l of lines) {
    if (l.checked) done.push(l);
    else active[l.source].push(l);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Liste de courses</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Calculée pour les 2 prochaines semaines : besoins des repas moins le stock, plus les récurrents
          et ajouts manuels.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="flex flex-col gap-4">
          {(['recipe', 'recurring', 'manual'] as const).map((src) => (
            <section key={src} className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
              <h2 className="mb-2 font-display text-lg font-semibold">{SOURCE_LABEL[src]}</h2>
              <ul className="divide-y divide-line">
                {active[src].map((l) => (
                  <LineRow key={l.key + l.source} line={l} />
                ))}
                {active[src].length === 0 && <li className="py-2 text-sm text-ink-soft">Rien.</li>}
              </ul>
            </section>
          ))}

          {done.length > 0 && (
            <details className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
              <summary className="flex cursor-pointer list-none items-center justify-between font-display text-lg font-semibold">
                <span>Déjà pris ({done.length})</span>
                <span className="text-sm font-normal text-ink-soft">afficher / masquer</span>
              </summary>
              <div className="mt-2">
                <form action={clearCheckedAction} className="mb-2 flex justify-end">
                  <button className="text-xs font-bold text-green-strong">Tout décocher</button>
                </form>
                <ul className="divide-y divide-line">
                  {done.map((l) => (
                    <LineRow key={l.key + l.source} line={l} />
                  ))}
                </ul>
              </div>
            </details>
          )}
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
          <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
            <h2 className="mb-3 font-display text-lg font-semibold">Ajouter un article</h2>
            <form action={addManualAction} className="flex flex-col gap-2.5 text-sm">
              <input name="label" placeholder="Article" required className="field-input" />
              <div className="grid grid-cols-2 gap-2">
                <input name="quantity" type="number" step="any" placeholder="Qté" className="field-input" />
                <input name="unit" placeholder="Unité" className="field-input" />
              </div>
              <button className="btn-primary py-2.5">Ajouter</button>
            </form>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
            <h2 className="mb-3 font-display text-lg font-semibold">Produits récurrents</h2>
            <ul className="mb-3 divide-y divide-line text-sm">
              {(recurring ?? []).map((r) => {
                const f = Array.isArray(r.food) ? r.food[0] : r.food;
                return (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                    <span>{f?.name ?? r.label}</span>
                    <form action={deleteRecurringAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className="text-xs font-bold text-red-strong">supprimer</button>
                    </form>
                  </li>
                );
              })}
              {(!recurring || recurring.length === 0) && (
                <li className="py-2 text-sm text-ink-soft">Aucun produit récurrent.</li>
              )}
            </ul>
            <form action={addRecurringAction} className="flex flex-col gap-2.5 text-sm">
              <select name="food_id" className="field-input">
                <option value="">— libellé libre —</option>
                {(foods ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <input name="label" placeholder="ou libellé" className="field-input" />
              <button className="btn-secondary py-2.5">Ajouter aux récurrents</button>
            </form>
          </section>
        </aside>
      </div>
    </div>
  );
}
