import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth';
import { generateShoppingList, getShoppingWindow, listHouseholdCategories, type ShoppingLine } from '@/lib/core';
import { groupByRayon } from '../rayons';
import { PurchaseCheckout } from '../purchase-checkout';
import { toggleCheckAction } from '../actions';

/** Grosse case à cocher (mode magasin). */
function BigCheck({ checked }: { checked: boolean }) {
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 ${
        checked ? 'border-green-strong bg-green-strong text-white' : 'border-line-strong text-transparent'
      }`}
    >
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>
  );
}

/** Ligne « gros bouton » : taper n'importe où coche/décoche l'article. */
function StoreRow({ line }: { line: ShoppingLine }) {
  const qty = line.quantity != null ? `${line.quantity} ${line.unit ?? ''}`.trim() : '';

  return (
    // État coché unifié par clé d'identité (cf. fusion inter-sources).
    <form action={toggleCheckAction}>
      <input type="hidden" name="item_key" value={line.key} />
      <input type="hidden" name="checked" value={(!line.checked).toString()} />
      <button
        className={`flex w-full items-center gap-3.5 rounded-2xl border px-4 text-left ${
          line.checked
            ? 'border-line bg-paper'
            : 'border-line bg-surface shadow-soft'
        }`}
        style={{ minHeight: 64 }}
      >
        <BigCheck checked={line.checked} />
        <span className={`flex-1 text-[17px] font-semibold ${line.checked ? 'text-ink-soft line-through' : ''}`}>
          {line.name}
        </span>
        {qty && (
          <span className={`text-sm text-ink-soft ${line.checked ? 'line-through' : ''}`}>{qty}</span>
        )}
      </button>
    </form>
  );
}

export default async function MagasinPage() {
  const { supabase, profile, userId } = await getAuthContext();
  if (!userId) redirect('/login');
  if (!profile?.household_id) redirect('/onboarding');
  const householdId = profile.household_id;

  const { from, to } = await getShoppingWindow(supabase, householdId);
  const [lines, customCats] = await Promise.all([
    generateShoppingList(supabase, { householdId, from, to }),
    listHouseholdCategories(supabase, householdId),
  ]);

  // En magasin : tout reste visible dans son rayon (coché = barré sur place).
  const groups = groupByRayon(lines, customCats);
  const done = lines.filter((l) => l.checked);
  const total = lines.length;
  const pct = total > 0 ? Math.round((done.length / total) * 100) : 0;

  return (
    <div className="mx-auto w-full max-w-md pb-28">
      {/* En-tête : retour + titre + progression */}
      <div className="flex items-center justify-between gap-3">
        <Link href="/courses" className="flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Liste
        </Link>
        <h1 className="font-display text-2xl font-semibold">En magasin</h1>
        <span className="w-12" />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-green-strong transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="whitespace-nowrap text-sm font-bold">
          {done.length} / {total}
        </span>
      </div>

      {total === 0 ? (
        <p className="mt-10 text-center text-sm text-ink-soft">
          Rien à acheter pour l’instant.{' '}
          <Link href="/courses" className="font-semibold text-green-strong">
            Retour à la liste
          </Link>
        </p>
      ) : (
        <div className="mt-5 flex flex-col gap-5">
          {groups.map(({ key, view, items }) => (
            <div key={key}>
              <h2 className="mb-2 px-1 font-display text-[15px] font-semibold text-sage-deep">
                {view?.label ?? 'Autres'}
              </h2>
              <div className="flex flex-col gap-2.5">
                {items.map((l) => (
                  <StoreRow key={l.key} line={l} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CTA collant : ranger les achats cochés au stock. */}
      {done.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20">
          <div className="mx-auto max-w-md px-4 pb-6 pt-4" style={{ background: 'linear-gradient(to top, var(--color-paper) 72%, transparent)' }}>
            <PurchaseCheckout
              fullWidth
              items={done.map((l) => ({
                name: l.name,
                qty: l.quantity != null ? `${l.quantity} ${l.unit ?? ''}`.trim() : '',
                category: null,
              }))}
            />
          </div>
        </div>
      )}
    </div>
  );
}
