import { headers } from 'next/headers';
import { getAuthContext } from '@/lib/auth';
import { cancelInvitationAction, inviteAction, toggleNutritionShareAction } from './actions';

export default async function FoyerPage() {
  const { supabase, userId, profile } = await getAuthContext();
  const householdId = profile?.household_id as string;
  const me = userId as string;

  const [{ data: household }, { data: members }, { data: shares }, { data: invitations }] =
    await Promise.all([
      supabase.from('household').select('name').eq('id', householdId).maybeSingle(),
      supabase.from('profile').select('id, display_name').eq('household_id', householdId),
      supabase.from('nutrition_share').select('viewer_profile_id').eq('owner_profile_id', me),
      supabase
        .from('household_invitation')
        .select('id, email, token, status')
        .eq('household_id', householdId)
        .eq('status', 'pending'),
    ]);

  const sharedWith = new Set((shares ?? []).map((s) => s.viewer_profile_id));

  const h = await headers();
  const host = h.get('host') ?? 'localhost:3000';
  const proto = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https';
  const baseUrl = `${proto}://${host}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Foyer — {household?.name}</h1>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-soft">
          Stock, courses et repas planifiés sont partagés. Les données nutritionnelles restent privées
          par défaut : tu choisis avec qui les partager.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
          <h2 className="mb-3 font-display text-lg font-semibold">Membres</h2>
          <ul className="divide-y divide-line">
            {(members ?? []).map((m) => {
              const isMe = m.id === me;
              const shared = sharedWith.has(m.id);
              return (
                <li key={m.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sage-tint text-sm font-extrabold text-sage-deep">
                      {(m.display_name?.trim()[0] || '?').toUpperCase()}
                    </span>
                    <span>
                      <span className="font-semibold">{m.display_name || '(sans nom)'}</span>
                      {isMe && <span className="text-ink-soft"> — moi</span>}
                    </span>
                  </div>
                  {!isMe && (
                    <form action={toggleNutritionShareAction}>
                      <input type="hidden" name="viewer_id" value={m.id} />
                      <input type="hidden" name="share" value={(!shared).toString()} />
                      <button
                        className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                          shared ? 'bg-sage-tint text-green-strong' : 'border border-line text-ink-soft'
                        }`}
                      >
                        {shared ? 'nutrition partagée' : 'partager ma nutrition'}
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-4 rounded-xl border border-butter bg-butter-tint p-3 text-xs leading-relaxed text-ink-soft">
            Les données partagées du foyer restent communes ; la nutrition personnelle reste privée tant
            qu’elle n’est pas partagée explicitement.
          </p>
        </section>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
          <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
            <h2 className="mb-3 font-display text-lg font-semibold">Inviter quelqu’un</h2>
            <form action={inviteAction} className="flex flex-col gap-2.5 text-sm">
              <input name="email" type="email" required placeholder="email@exemple.com" className="field-input" />
              <button className="btn-primary py-2.5">Inviter</button>
            </form>
            <p className="mt-3 text-xs leading-relaxed text-ink-soft">
              L’envoi automatique d’email n’est pas encore configuré : transmets le lien généré.
            </p>
          </section>

          {(invitations ?? []).length > 0 && (
            <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
              <h2 className="mb-3 font-display text-lg font-semibold">Invitations en attente</h2>
              <ul className="flex flex-col gap-3 text-sm">
                {(invitations ?? []).map((inv) => (
                  <li key={inv.id} className="rounded-xl border border-line bg-paper/60 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold">{inv.email}</span>
                      <form action={cancelInvitationAction}>
                        <input type="hidden" name="id" value={inv.id} />
                        <button className="text-xs font-bold text-red-strong">annuler</button>
                      </form>
                    </div>
                    <p className="mt-2 break-all text-xs text-ink-soft">
                      {baseUrl}/invitations/accept?token={inv.token}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
