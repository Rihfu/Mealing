import { getAuthContext } from '@/lib/auth';
import { generateShoppingList, type ShoppingLine } from '@/lib/core';
import { addDays, isoDate } from '@/lib/dates';
import { CATEGORIES, ProductIcon, ProvenanceBadge, type ProvenanceKey } from '@/lib/product-assets';
import { AddArticle } from './add-article';
import { PurchaseCheckout } from './purchase-checkout';
import {
  addRecurringAction,
  clearCheckedAction,
  deleteManualAction,
  deleteRecurringAction,
  toggleCheckAction,
  toggleManualCheckAction,
} from './actions';

const SOURCE_TO_PROV: Record<ShoppingLine['source'], ProvenanceKey> = {
  recipe: 'repas',
  recurring: 'essentiel',
  manual: 'ajoute',
};

// Ordre d'affichage des rayons + lookup teinte/encre par libellé.
const RAYON_ORDER = Object.values(CATEGORIES).map((c) => c.label);
const RAYON_BY_LABEL = new Map(Object.values(CATEGORIES).map((c) => [c.label, c]));
const OTHER_RAYON = 'Autres';

function tileStyle(category?: string | null) {
  const def = category ? RAYON_BY_LABEL.get(category) : undefined;
  return { background: def?.tint ?? 'var(--color-sage-tint)', color: def?.ink ?? 'var(--color-sage-deep)' };
}

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
  const isManual = line.source === 'manual';
  const toggle = isManual ? toggleManualCheckAction : toggleCheckAction;
  const toggleField = isManual
    ? { name: 'id', value: line.manualId ?? '' }
    : { name: 'item_key', value: line.key };

  return (
    <li className="flex items-center gap-3 py-2">
      <form action={toggle}>
        <input type="hidden" name={toggleField.name} value={toggleField.value} />
        <input type="hidden" name="checked" value={(!line.checked).toString()} />
        <button aria-label="Cocher" className="block">
          <CheckMark checked={line.checked} />
        </button>
      </form>

      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={tileStyle(line.category)}
      >
        <ProductIcon slug={line.iconSlug} size={20} />
      </span>

      <span className={`text-sm ${line.checked ? 'text-ink-soft line-through' : ''}`}>{line.name}</span>

      <span className="ml-auto flex items-center gap-3">
        <ProvenanceBadge kind={SOURCE_TO_PROV[line.source]} />
        {qty && <span className="text-sm text-ink-soft">{qty}</span>}
        {isManual && (
          <form action={deleteManualAction}>
            <input type="hidden" name="id" value={line.manualId} />
            <button className="text-xs font-bold text-red-strong">supprimer</button>
          </form>
        )}
      </span>
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
    supabase.from('shopping_recurring_item').select('id, label, food:food_id(name)').eq('household_id', householdId),
    supabase.from('food').select('id, name').order('name', { ascending: true }).limit(500),
  ]);

  // Actif (à acheter) groupé par rayon ; coché → « Déjà pris ».
  const active = lines.filter((l) => !l.checked);
  const done = lines.filter((l) => l.checked);

  const byRayon = new Map<string, ShoppingLine[]>();
  for (const l of active) {
    const r = l.category && RAYON_BY_LABEL.has(l.category) ? l.category : OTHER_RAYON;
    (byRayon.get(r) ?? byRayon.set(r, []).get(r)!).push(l);
  }
  const rayonsToShow = [...RAYON_ORDER, OTHER_RAYON].filter((r) => byRayon.has(r));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Liste de courses</h1>
        <p className="font-hand mt-0.5 text-lg text-green-strong">
          une seule liste, triée par rayon — coche au pouce, range au retour
        </p>
        <p className="mt-2 max-w-xl text-sm text-ink-soft">
          Ta liste se met à jour toute seule : on part de tes repas, on retire ce que tu as déjà en stock, et tu
          ajoutes ce que tu veux. Coche au fur et à mesure de tes courses.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="flex flex-col gap-4">
          <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-semibold">À acheter</h2>
              {done.length > 0 && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-ink-soft">{done.length} déjà pris</span>
                  <PurchaseCheckout
                    items={done.map((l) => ({
                      name: l.name,
                      qty: l.quantity != null ? `${l.quantity} ${l.unit ?? ''}`.trim() : '',
                      category: l.category ?? null,
                    }))}
                  />
                </div>
              )}
            </div>

            {active.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-soft">
                Rien à acheter pour l’instant. Ta liste se remplit toute seule dès que tu planifies des repas ou
                qu’un essentiel vient à manquer.
              </p>
            ) : (
              rayonsToShow.map((rayon) => {
                const items = byRayon.get(rayon)!;
                const def = RAYON_BY_LABEL.get(rayon);
                return (
                  <details key={rayon} open className="border-t border-line first:border-t-0">
                    <summary className="flex cursor-pointer list-none items-center gap-2 py-2 font-display text-sm font-semibold">
                      <span
                        className="flex h-5 w-5 items-center justify-center rounded-md text-[10px]"
                        style={{ background: def?.tint ?? 'var(--color-line)', color: def?.ink ?? 'var(--color-ink-soft)' }}
                      >
                        ●
                      </span>
                      <span className="flex-1">{rayon}</span>
                      <span className="text-xs font-normal text-ink-soft">{items.length}</span>
                    </summary>
                    <ul className="divide-y divide-line pl-1">
                      {items.map((l) => (
                        <LineRow key={l.key + l.source} line={l} />
                      ))}
                    </ul>
                  </details>
                );
              })
            )}
          </section>

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
            <AddArticle />
          </section>

          <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
            <h2 className="mb-3 font-display text-lg font-semibold">Mes essentiels</h2>
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
                <li className="py-2 text-sm text-ink-soft">Aucun essentiel pour l’instant.</li>
              )}
            </ul>
            <form action={addRecurringAction} className="flex flex-col gap-2.5 text-sm">
              <select name="food_id" className="field-input">
                <option value="">— choisir un aliment —</option>
                {(foods ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <input name="label" placeholder="ou un libellé libre" className="field-input" />
              <button className="btn-secondary py-2.5">Ajouter aux essentiels</button>
            </form>
          </section>
        </aside>
      </div>
    </div>
  );
}
