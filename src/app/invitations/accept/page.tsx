import Link from 'next/link';
import { getAuthContext } from '@/lib/auth';
import { acceptInvitationAction } from './actions';

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  const { userId } = await getAuthContext();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-4 p-6">
      {!token ? (
        <p className="text-center text-sm text-red-strong">Lien d’invitation invalide (jeton manquant).</p>
      ) : !userId ? (
        <div className="flex flex-col items-center gap-4 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Mealing" width={52} height={52} />
          <p className="text-sm text-ink-soft">
            Connecte-toi ou crée un compte, puis rouvre ce lien pour rejoindre le foyer.
          </p>
          <Link href="/login" className="btn-primary px-5 py-3">
            Se connecter
          </Link>
        </div>
      ) : (
        <>
          {error && (
            <p className="text-center text-sm text-red-strong">
              Cette invitation n’est plus valide (déjà utilisée ou expirée).
            </p>
          )}
          <div className="rounded-3xl bg-sage-tint p-6 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" width={52} height={52} className="mx-auto mb-2" aria-hidden="true" />
            <h1 className="font-display text-2xl font-semibold tracking-tight">Rejoindre le foyer</h1>
            <p className="mt-2 text-sm text-ink">
              Tu as été invité·e à rejoindre un foyer sur Mealing.
            </p>
            <p className="mt-1 text-xs text-ink-soft">Vous partagerez planning, stock et courses.</p>
          </div>
          <form action={acceptInvitationAction}>
            <input type="hidden" name="token" value={token} />
            <button className="btn-primary w-full py-3">Rejoindre le foyer</button>
          </form>
          <Link href="/planning" className="text-center text-xs text-ink-soft hover:underline">
            Ce n’est pas moi
          </Link>
        </>
      )}
    </main>
  );
}
