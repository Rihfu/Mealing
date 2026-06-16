import { headers } from 'next/headers';
import { getAuthContext } from '@/lib/auth';
import { cancelInvitationAction, inviteAction, toggleNutritionShareAction } from './actions';

export default async function FoyerPage() {
  const { supabase, userId, profile } = await getAuthContext();
  const householdId = profile?.household_id as string;
  const me = userId as string; // garanti non-null par le layout (app)

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
        <h1 className="text-xl font-bold">Foyer — {household?.name}</h1>
        <p className="text-sm text-gray-500">
          Stock, courses et repas planifiés sont partagés. Vos données nutritionnelles restent
          privées par défaut : choisissez avec qui les partager.
        </p>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Membres</h2>
        <ul className="flex flex-col divide-y divide-gray-200 text-sm dark:divide-gray-800">
          {(members ?? []).map((m) => {
            const isMe = m.id === me;
            const shared = sharedWith.has(m.id);
            return (
              <li key={m.id} className="flex items-center justify-between py-2">
                <span>
                  {m.display_name || '(sans nom)'} {isMe && <span className="text-gray-400">— moi</span>}
                </span>
                {!isMe && (
                  <form action={toggleNutritionShareAction}>
                    <input type="hidden" name="viewer_id" value={m.id} />
                    <input type="hidden" name="share" value={(!shared).toString()} />
                    <button className={`text-xs underline ${shared ? 'text-green-600' : 'text-gray-500'}`}>
                      {shared ? 'nutrition partagée ✓' : 'partager ma nutrition'}
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Inviter quelqu’un</h2>
        <form action={inviteAction} className="flex flex-wrap items-end gap-2 text-sm">
          <input
            name="email"
            type="email"
            required
            placeholder="email@exemple.com"
            className="flex-1 rounded border border-gray-300 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-900"
          />
          <button className="rounded bg-black px-3 py-1.5 text-white dark:bg-white dark:text-black">
            Inviter
          </button>
        </form>

        {(invitations ?? []).length > 0 && (
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {(invitations ?? []).map((inv) => (
              <li key={inv.id} className="rounded border border-gray-200 p-2 dark:border-gray-800">
                <div className="flex items-center justify-between">
                  <span>{inv.email}</span>
                  <form action={cancelInvitationAction}>
                    <input type="hidden" name="id" value={inv.id} />
                    <button className="text-xs text-red-500">annuler</button>
                  </form>
                </div>
                <p className="mt-1 break-all text-xs text-gray-500">
                  Lien d’invitation (à transmettre) : {baseUrl}/invitations/accept?token={inv.token}
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-gray-500">
          L’envoi automatique d’email n’est pas encore configuré : transmettez le lien ci-dessus à la
          personne. Elle l’ouvre une fois connectée pour rejoindre le foyer.
        </p>
      </section>
    </div>
  );
}
