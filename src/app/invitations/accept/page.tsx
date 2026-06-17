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
    <main className="flex min-h-screen w-full items-center justify-center bg-paper px-4 py-8 sm:px-6">
      <section className="w-full max-w-md rounded-3xl border border-line bg-surface p-6 text-center shadow-card sm:p-8">
        {!token ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" width={64} height={64} className="mx-auto" aria-hidden="true" />
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink">Invitation introuvable</h1>
            <p className="mt-3 text-sm text-red-strong">Lien d’invitation invalide (jeton manquant).</p>
          </>
        ) : !userId ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="Mealing" width={64} height={64} className="mx-auto" />
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink">Rejoindre un foyer</h1>
            <p className="mx-auto mt-3 max-w-xs text-sm text-ink-soft">
              Connecte-toi ou crée un compte, puis rouvre ce lien pour rejoindre le foyer.
            </p>
            <Link href="/login" className="btn-primary mt-7 inline-flex px-6 py-3">
              Se connecter
            </Link>
          </>
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" width={64} height={64} className="mx-auto" aria-hidden="true" />
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink">Rejoindre le foyer</h1>
            <p className="mx-auto mt-3 max-w-xs text-sm text-ink">
              Tu as été invité·e à rejoindre un foyer sur Mealing.
            </p>
            <p className="mt-1 text-xs text-ink-soft">Vous partagerez planning, stock et courses.</p>
            {error && (
              <p className="mt-4 rounded-2xl bg-red-soft px-4 py-3 text-sm text-red-strong">
                Cette invitation n’est plus valide (déjà utilisée ou expirée).
              </p>
            )}
            <form action={acceptInvitationAction} className="mt-7">
              <input type="hidden" name="token" value={token} />
              <button className="btn-primary w-full py-3">Rejoindre le foyer</button>
            </form>
            <Link href="/planning" className="mt-4 inline-flex text-xs text-ink-soft hover:underline">
              Ce n’est pas moi
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
